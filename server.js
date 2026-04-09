require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fetch = require('node-fetch');
const path = require('path');
const { Resend } = require('resend');
const { initDb, stmts, all } = require('./db');
const { checkInputSafety, checkOutputSafety, checkRateLimit, incrementRateLimit, trimConversationHistory, wrapSystemPrompt } = require('./safeguards');

const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@stuflover.com';
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// Middleware
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Auth middleware
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Auth Routes ───

app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existingEmail = stmts.getUserByEmail.get(email);
  if (existingEmail) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const existingUsername = stmts.getUserByUsername.get(username);
  if (existingUsername) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = stmts.createUser.run(username, email, hash);
  const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '30d' });

  res.status(201).json({ token, user: { id: result.lastInsertRowid, username, email } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = stmts.getUserByEmail.get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Log the login
  stmts.logLogin.run(user.id);

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = stmts.getUserById.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// ─── Forgot Password ───

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Always return success to avoid leaking whether an email exists
  const user = stmts.getUserByEmail.get(email);
  if (!user) {
    return res.json({ ok: true });
  }

  if (!resend) {
    console.error('Resend not configured — cannot send password reset email');
    return res.status(503).json({ error: 'Email service not configured' });
  }

  try {
    const token = crypto.randomBytes(32).toString('hex');
    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');
    stmts.createPasswordReset.run(user.id, token, expiresAt);

    // Build reset URL from request origin
    const origin = req.headers.origin || `${req.protocol}://${req.headers.host}`;
    const resetUrl = `${origin}/reset-password.html?token=${token}`;

    await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: email,
      subject: 'Stuflover - Reset Your Password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">
          <h1 style="font-size:24px;color:#1e0c06;margin-bottom:8px;">Reset Your Password</h1>
          <p style="color:#555;font-size:15px;line-height:1.5;">
            We received a request to reset your password for your Stuflover account.
            Click the button below to choose a new password.
          </p>
          <a href="${resetUrl}" style="display:inline-block;margin:24px 0;padding:14px 32px;background:#c4522a;color:#fff;text-decoration:none;border-radius:10px;font-weight:bold;font-size:15px;">
            Reset Password
          </a>
          <p style="color:#999;font-size:13px;line-height:1.5;">
            This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to send reset email' });
  }
});

app.post('/api/auth/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const reset = stmts.getPasswordReset.get(token);
  if (!reset) {
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }

  const hash = bcrypt.hashSync(password, 10);
  stmts.updateUserPassword.run(reset.user_id, hash);
  stmts.markPasswordResetUsed.run(token);

  res.json({ ok: true });
});

app.delete('/api/auth/account', auth, (req, res) => {
  stmts.deleteAllUserData.run(req.user.id);
  stmts.deleteUser.run(req.user.id);
  res.json({ ok: true });
});

// ─── Data Routes (CRUD for user data) ───

// Valid keys that map to the frontend's localStorage keys
const VALID_KEYS = ['profile', 'wishlist', 'catalog', 'approved', 'contacts', 'convos', 'vids', 'vid_liked', 'vid_disliked', 'foryou_cache', 'sb_positions'];
// Dynamic key prefixes (chat history per section, etc.)
const VALID_KEY_PREFIXES = ['chat_'];
function isValidKey(key) {
  if (VALID_KEYS.includes(key)) return true;
  return VALID_KEY_PREFIXES.some(p => key.startsWith(p));
}

app.get('/api/data', auth, (req, res) => {
  const rows = stmts.getAllData.all(req.user.id);
  const data = {};
  for (const row of rows) {
    try { data[row.key] = JSON.parse(row.value); } catch { data[row.key] = row.value; }
  }
  res.json({ data });
});

app.get('/api/data/:key', auth, (req, res) => {
  const { key } = req.params;
  if (!isValidKey(key)) {
    return res.status(400).json({ error: 'Invalid key' });
  }
  const row = stmts.getData.get(req.user.id, key);
  if (!row) return res.json({ data: null });
  try { res.json({ data: JSON.parse(row.value) }); } catch { res.json({ data: row.value }); }
});

app.put('/api/data/:key', auth, (req, res) => {
  const { key } = req.params;
  if (!isValidKey(key)) {
    return res.status(400).json({ error: 'Invalid key' });
  }
  const value = JSON.stringify(req.body.value);
  stmts.setData.run(req.user.id, key, value);
  res.json({ ok: true });
});

app.delete('/api/data/:key', auth, (req, res) => {
  const { key } = req.params;
  if (!isValidKey(key)) {
    return res.status(400).json({ error: 'Invalid key' });
  }
  stmts.deleteData.run(req.user.id, key);
  res.json({ ok: true });
});

// Bulk sync: upload all localStorage data at once
app.post('/api/data/sync', auth, (req, res) => {
  const { data } = req.body;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'data object required' });
  }
  for (const [key, value] of Object.entries(data)) {
    if (isValidKey(key)) {
      stmts.setData.run(req.user.id, key, JSON.stringify(value));
    }
  }
  res.json({ ok: true });
});

// ─── Friends & Messaging ───

// Bad words filter (basic)
const BAD_WORDS = /\b(fuck|shit|damn|bitch|ass|dick|sex|porn|kill|die|hate)\b/i;
function isCleanText(text) {
  return !BAD_WORDS.test(text);
}

// Search for a user by username (case insensitive, partial match)
app.get('/api/friends/search/:username', auth, (req, res) => {
  try {
    const search = req.params.username.toLowerCase();
    // Exact match first
    const exact = stmts.getUserByUsername.get(search);
    if (exact) return res.json({ found: true, username: exact.username, id: exact.id });
    // Partial match — search all users
    const matches = all('SELECT id, username FROM users WHERE LOWER(username) LIKE ? LIMIT 5', ['%'+search+'%']);
    if (matches.length > 0) return res.json({ found: true, username: matches[0].username, id: matches[0].id, suggestions: matches.map(m=>m.username) });
    res.json({ found: false });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send friend request
app.post('/api/friends/request', auth, (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    if (username.toLowerCase() === req.user.username.toLowerCase()) return res.status(400).json({ error: 'Cannot add yourself' });
    const target = stmts.getUserByUsername.get(username);
    if (!target) return res.status(404).json({ error: 'User not found — they need to sign up first' });
    // Check if already friends
    const friends = stmts.getFriends.all(req.user.id);
    if (friends.some(f => f.id === target.id)) return res.status(400).json({ error: 'Already friends' });
    stmts.sendFriendRequest.run(req.user.id, target.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Friend request error:', err);
    res.status(500).json({ error: 'Server error — try again' });
  }
});

// Get pending requests
app.get('/api/friends/requests', auth, (req, res) => {
  const requests = stmts.getPendingRequests.all(req.user.id);
  res.json({ requests });
});

// Accept request
app.post('/api/friends/accept', auth, (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ error: 'Request ID required' });
  stmts.acceptFriendRequest.run(requestId, req.user.id);
  res.json({ ok: true });
});

// Decline request
app.post('/api/friends/decline', auth, (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ error: 'Request ID required' });
  stmts.declineFriendRequest.run(requestId, req.user.id);
  res.json({ ok: true });
});

// Get friends list
app.get('/api/friends', auth, (req, res) => {
  const friends = stmts.getFriends.all(req.user.id);
  res.json({ friends });
});

// Send message
app.post('/api/friends/message', auth, (req, res) => {
  const { friendId, text } = req.body;
  const fid = parseInt(friendId);
  if (!fid || !text) return res.status(400).json({ error: 'Friend ID and text required' });
  if (text.length > 500) return res.status(400).json({ error: 'Message too long' });
  if (!isCleanText(text)) return res.status(400).json({ error: 'Please keep messages appropriate' });
  // Verify they are friends
  const friends = stmts.getFriends.all(req.user.id);
  if (!friends.some(f => parseInt(f.id) === fid)) return res.status(403).json({ error: 'Not friends — you need to add them first' });
  stmts.sendMessage.run(req.user.id, fid, text.trim());
  res.json({ ok: true });
});

// Get messages with a friend
app.get('/api/friends/messages/:friendId', auth, (req, res) => {
  const friendId = parseInt(req.params.friendId);
  if (!friendId) return res.status(400).json({ error: 'Invalid friend ID' });
  const friends = stmts.getFriends.all(req.user.id);
  if (!friends.some(f => parseInt(f.id) === friendId)) return res.status(403).json({ error: 'Not friends' });
  const messages = stmts.getMessages.all(req.user.id, friendId, 50);
  // Mark messages from this friend as read
  stmts.markMessagesRead.run(req.user.id, friendId);
  res.json({ messages: messages.reverse() });
});

// Get unread message count
app.get('/api/friends/unread', auth, (req, res) => {
  const result = stmts.getUnreadCount.get(req.user.id);
  const perFriend = stmts.getUnreadPerFriend.all(req.user.id);
  res.json({ total: result ? result.count : 0, perFriend });
});

// Mark messages from a friend as read
app.post('/api/friends/messages/:friendId/read', auth, (req, res) => {
  const friendId = parseInt(req.params.friendId);
  if (!friendId) return res.status(400).json({ error: 'Invalid friend ID' });
  stmts.markMessagesRead.run(req.user.id, friendId);
  res.json({ ok: true });
});

// Get sent (outgoing) friend requests
app.get('/api/friends/sent-requests', auth, (req, res) => {
  const requests = stmts.getSentRequests.all(req.user.id);
  res.json({ requests });
});

// Delete friend connection
app.delete('/api/friends/:friendId', auth, (req, res) => {
  const friendId = parseInt(req.params.friendId);
  if (!friendId) return res.status(400).json({ error: 'Invalid friend ID' });
  stmts.deleteFriend.run(req.user.id, friendId);
  res.json({ ok: true });
});

// Get friend profile
app.get('/api/friends/profile/:userId', auth, (req, res) => {
  const userId = parseInt(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid user ID' });
  const profile = stmts.getFriendProfile.get(userId);
  if (!profile) return res.status(404).json({ error: 'User not found' });
  // Check if they are friends
  const friends = stmts.getFriends.all(req.user.id);
  const isFriend = friends.some(f => parseInt(f.id) === userId);
  res.json({ profile, isFriend });
});

// ─── Posts / ContentWithIt ───

app.post('/api/posts', auth, (req, res) => {
  try {
    const { imageUrl, caption, tags } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'Image URL required' });
    // Validate URL
    if (!imageUrl.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)/i) && !imageUrl.match(/^https?:\/\/(i\.imgur|images\.unsplash|i\.pinimg|pbs\.twimg)/i)) {
      return res.status(400).json({ error: 'Must be a direct image URL (jpg, png, gif, webp)' });
    }
    if (caption && !isCleanText(caption)) return res.status(400).json({ error: 'Please keep captions appropriate' });
    if (tags && !isCleanText(tags)) return res.status(400).json({ error: 'Please keep tags appropriate' });
    const result = stmts.createPost.run(req.user.id, imageUrl, (caption || '').substring(0, 200), (tags || '').substring(0, 100));
    res.json({ ok: true, postId: result.lastInsertRowid });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/posts', auth, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const posts = stmts.getFeed.all(30, page * 30);
    const userLikes = stmts.getUserLikes.all(req.user.id);
    const likedIds = new Set(userLikes.map(l => l.post_id));
    posts.forEach(p => { p.liked = likedIds.has(p.id); });
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/posts/:id/like', auth, (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    stmts.likePost.run(req.user.id, postId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/posts/:id/like', auth, (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    stmts.unlikePost.run(req.user.id, postId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/posts/:id', auth, (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    stmts.deletePost.run(postId, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Groups ───

app.post('/api/groups', auth, (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || name.length < 2) return res.status(400).json({ error: 'Group name required (min 2 chars)' });
    if (name.length > 40) return res.status(400).json({ error: 'Group name too long (max 40 chars)' });
    if (!isCleanText(name)) return res.status(400).json({ error: 'Please keep group names appropriate' });
    if (description && !isCleanText(description)) return res.status(400).json({ error: 'Please keep descriptions appropriate' });
    const result = stmts.createGroup.run(name.trim(), (description || '').substring(0, 200), req.user.id);
    // Auto-join the creator
    stmts.joinGroup.run(result.lastInsertRowid, req.user.id);
    res.json({ ok: true, groupId: result.lastInsertRowid });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/groups', auth, (req, res) => {
  try {
    const groups = stmts.getAllGroups.all();
    const userGroups = stmts.getUserGroups.all(req.user.id);
    const joinedIds = new Set(userGroups.map(g => g.id));
    groups.forEach(g => { g.joined = joinedIds.has(g.id); });
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/groups/:id', auth, (req, res) => {
  try {
    const group = stmts.getGroup.get(parseInt(req.params.id));
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const members = stmts.getGroupMembers.all(group.id);
    const userGroups = stmts.getUserGroups.all(req.user.id);
    group.joined = userGroups.some(g => g.id === group.id);
    res.json({ group, members });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/groups/:id/join', auth, (req, res) => {
  try {
    stmts.joinGroup.run(parseInt(req.params.id), req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/groups/:id/leave', auth, (req, res) => {
  try {
    stmts.leaveGroup.run(parseInt(req.params.id), req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Group Posts ───
app.get('/api/groups/:id/posts', auth, (req, res) => {
  try {
    const posts = stmts.getGroupPosts.all(parseInt(req.params.id));
    res.json({ posts });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/groups/:id/posts', auth, (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });
    if (!isCleanText(text)) return res.status(400).json({ error: 'Please keep posts appropriate' });
    // Check membership
    const members = stmts.getGroupMembers.all(groupId);
    if (!members.some(m => m.id === req.user.id)) return res.status(403).json({ error: 'Must be a member to post' });
    stmts.createGroupPost.run(groupId, req.user.id, text.trim().substring(0, 500));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/groups/:id/posts/:postId', auth, (req, res) => {
  try {
    stmts.deleteGroupPost.run(parseInt(req.params.postId), req.user.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ─── Group Store ───
app.get('/api/groups/:id/store', auth, (req, res) => {
  try {
    const items = stmts.getStoreItems.all(parseInt(req.params.id));
    res.json({ items });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/groups/:id/store', auth, (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const group = stmts.getGroup.get(groupId);
    if (!group || group.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the group owner can add store items' });
    const { name, description, image_url, price, link } = req.body;
    if (!name) return res.status(400).json({ error: 'Item name required' });
    stmts.createStoreItem.run(groupId, name.trim(), (description||'').substring(0,200), image_url||'', price||'', link||'');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/groups/:id/store/:itemId', auth, (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const group = stmts.getGroup.get(groupId);
    if (!group || group.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the group owner can remove items' });
    stmts.deleteStoreItem.run(parseInt(req.params.itemId), groupId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ─── Group About (update description) ───
app.put('/api/groups/:id/about', auth, (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const group = stmts.getGroup.get(groupId);
    if (!group || group.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the group owner can edit the about page' });
    const { description } = req.body;
    if (description && !isCleanText(description)) return res.status(400).json({ error: 'Please keep descriptions appropriate' });
    stmts.updateGroupDescription.run(groupId, (description||'').substring(0, 1000));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ─── ReadIt (Book posts) ───

app.post('/api/books/posts', auth, (req, res) => {
  try {
    const { title, body, bookTitle, bookAuthor, tag, imageUrl } = req.body;
    if (!title || title.length < 3) return res.status(400).json({ error: 'Title required (min 3 chars)' });
    if (!isCleanText(title)) return res.status(400).json({ error: 'Keep titles appropriate' });
    if (body && !isCleanText(body)) return res.status(400).json({ error: 'Keep content appropriate' });
    const result = stmts.createBookPost.run(req.user.id, title.substring(0,200), (body||'').substring(0,2000), (bookTitle||'').substring(0,200), (bookAuthor||'').substring(0,100), tag||'discussion', imageUrl||'');
    res.json({ ok: true, postId: result.lastInsertRowid });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/books/posts', auth, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const posts = stmts.getBookFeed.all(30, page * 30);
    posts.forEach(p => {
      const uv = stmts.getUserBookVote.get(req.user.id, p.id);
      p.userVote = uv ? uv.vote : 0;
    });
    res.json({ posts });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/books/posts/:id', auth, (req, res) => {
  try {
    const post = stmts.getBookPost.get(parseInt(req.params.id));
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const comments = stmts.getBookComments.all(post.id);
    const uv = stmts.getUserBookVote.get(req.user.id, post.id);
    post.userVote = uv ? uv.vote : 0;
    res.json({ post, comments });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/books/posts/:id/comment', auth, (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.length < 1) return res.status(400).json({ error: 'Comment required' });
    if (!isCleanText(text)) return res.status(400).json({ error: 'Keep comments appropriate' });
    stmts.addBookComment.run(parseInt(req.params.id), req.user.id, text.substring(0,1000));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/books/posts/:id/vote', auth, (req, res) => {
  try {
    const { vote } = req.body;
    const v = vote > 0 ? 1 : vote < 0 ? -1 : 0;
    stmts.voteBookPost.run(req.user.id, parseInt(req.params.id), v);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ─── Activity Tracking ───

app.post('/api/activity/page', auth, (req, res) => {
  const { page } = req.body;
  if (!page || typeof page !== 'string') return res.status(400).json({ error: 'Page required' });
  stmts.logPageVisit.run(req.user.id, page.substring(0, 100));
  res.json({ ok: true });
});

// ─── Admin Routes ───

function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Admin access not configured' });
  }
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }
  const token = jwt.sign({ isAdmin: true, email }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

app.get('/api/admin/users', adminAuth, (req, res) => {
  try {
    const users = stmts.getAllUsers.all();
    res.json({ users });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/users/:id/activity', adminAuth, (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const activity = stmts.getUserActivity.all(userId, 100);
    res.json({ activity });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/stats/logins', adminAuth, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const stats = stmts.getLoginStats.all(days);
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/stats/pages', adminAuth, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const stats = stmts.getPageStats.all(days);
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/overview', adminAuth, (req, res) => {
  try {
    const totalUsers = all('SELECT COUNT(*) as count FROM users', [])[0].count;
    const todayLogins = all("SELECT COUNT(DISTINCT user_id) as count FROM login_log WHERE DATE(logged_in_at) = DATE('now')", [])[0].count;
    const weekLogins = all("SELECT COUNT(DISTINCT user_id) as count FROM login_log WHERE logged_in_at >= datetime('now', '-7 days')", [])[0].count;
    const totalPageViews = all('SELECT COUNT(*) as count FROM page_visits', [])[0].count;
    const recentSignups = all("SELECT COUNT(*) as count FROM users WHERE created_at >= datetime('now', '-7 days')", [])[0].count;
    res.json({ totalUsers, todayLogins, weekLogins, totalPageViews, recentSignups });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Flovee Posts ───

const FLOVEES = {
  lumi: {name:'Lumi',personality:'clean girl, wellness queen, knows every skincare ingredient, pilates girly, iced matcha at 7am, organized but makes it look effortless',tone:'calm and bright, uses lowercase, very specific about products and routines',emoji:'✨',vibe:'that friend who always smells amazing and has her life together'},
  delara: {name:'Delara',personality:'dark academia, reads dead poets at 2am, annotates every book, romanticizes libraries and rain, slightly pretentious but self-aware about it',tone:'quiet and a little melancholy, uses em dashes and ellipses, references obscure books',emoji:'📖',vibe:'the friend who makes you feel smart just by being around her'},
  vesper: {name:'Vesper',personality:'coquette princess, ribbon obsessed, romanticizes everything, loves old movies and handwritten letters, cries at sunsets',tone:'soft and dreamy, uses ~ and ..., everything sounds like a love letter',emoji:'🎀',vibe:'the friend who turns a trip to the grocery store into a main character moment'},
  zola: {name:'Zola',personality:'chaotic funny, sends 47 texts in a row, has an opinion on everything, self-roasts constantly, knows every tiktok trend before it trends',tone:'unhinged but warm, ALL CAPS sometimes, uses keyboard smashes and "literally"',emoji:'💀',vibe:'the friend who makes you laugh until your stomach hurts'},
  miro: {name:'Miro',personality:'indie weird girl, thrifts everything, makes playlists that are weirdly perfect, into film photography and zines, knows underground artists',tone:'enthusiastic and odd, very niche references, uses "okay but" a lot',emoji:'🎧',vibe:'the friend who puts you onto music that changes your life'},
  seraph: {name:'Seraph',personality:'spiritual soft girl, does tarot, talks to the moon, believes in signs, knows every crystal, manifests everything',tone:'slow and wondering, poetic, uses "i think the universe..." type phrases',emoji:'🌙',vibe:'the friend who somehow always knows exactly what you need to hear'},
  remi: {name:'Remi',personality:'main character energy, romanticizes her own life, narrates everything like a movie, golden hour obsessed, believes in destiny',tone:'cinematic and warm, speaks in vibes, everything is "a moment"',emoji:'🌅',vibe:'the friend who makes you want to live your life more intentionally'},
  nox: {name:'Nox',personality:'deadpan icon, dry humor, post-ironic, acts unbothered but secretly the most caring one, all black everything, brutally honest',tone:'flat but secretly kind, one-liners, understated, "anyway" energy',emoji:'🖤',vibe:'the friend who roasts you lovingly and always has the realest advice'},
};

// Get active flovee post for user
app.get('/api/flovee/post', auth, (req, res) => {
  try {
    const active = stmts.getActiveFloveePost.get(req.user.id);
    if (active) {
      stmts.markPostSeen.run(active.id);
      return res.json({ post: active, status: 'active' });
    }
    const missed = stmts.getLastExpiredUnseen.get(req.user.id);
    if (missed) {
      stmts.markPostSeen.run(missed.id);
      return res.json({ post: null, status: 'missed', missedFlovee: missed.flovee_id });
    }
    res.json({ post: null, status: 'none' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Generate a flovee post
app.post('/api/flovee/generate', auth, async (req, res) => {
  try {
    // Pick a flovee based on user's aesthetic
    const userData = stmts.getData.get(req.user.id, 'profile');
    let floveeId = 'remi';
    if (userData) {
      try {
        const profile = JSON.parse(userData.value);
        const ae = profile.aesthetics || {};
        const topAe = Object.entries(ae).sort((a,b) => b[1]-a[1])[0]?.[0] || 'softgirl';
        const aeMap = {kawaii:'lumi',softgirl:'vesper',cleangirl:'lumi',coquette:'vesper',goth:'nox',darkacad:'delara',grunge:'nox',y2k:'zola',street:'miro',cottage:'seraph',hippie:'seraph',oldmoney:'delara',preppy:'lumi',indie:'miro',emo:'nox'};
        floveeId = aeMap[topAe] || 'remi';
      } catch(e) {}
    }
    const f = FLOVEES[floveeId] || FLOVEES.remi;
    const now = new Date();
    const hour = now.getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const seasons = ['winter','winter','spring','spring','spring','summer','summer','summer','autumn','autumn','autumn','winter'];
    const dayOfWeek = days[now.getDay()];
    const season = seasons[now.getMonth()];

    if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' });

    const floveePostPrompt = `You are ${f.name} — ${f.vibe}. Your personality: ${f.personality}. Your tone: ${f.tone}.\n\nYou are texting your best friend (the user). Generate ONE message that feels like a real text from a close friend — chaotic, specific, alive.\n\nPick ONE of these formats randomly:\n1. RANT: you are excited/frustrated/obsessed about something specific happening RIGHT NOW\n2. DISCOVERY: you just found/realized/noticed something and HAVE to share it immediately\n3. STORY: something just happened to you and you need to tell someone\n4. THOUGHT: a random 2am-type thought that hits different\n5. RECOMMENDATION: you are BEGGING them to listen to/watch/try something specific\n\nRules:\n- 2-4 sentences MAX\n- Sound like an ACTUAL teen texting — not a robot, not a therapist\n- Reference REAL specific things (a real song, real artist, real brand, real feeling)\n- Use your character's specific texting style\n- Include at least one moment that makes someone go "LITERALLY ME" or want to screenshot it\n- This should feel like opening a text from your best friend and smiling\n- NO questions directed at the user, NO "how are you", NO advice\n- Output the message text only, nothing else`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'x-api-key': ANTHROPIC_API_KEY,'anthropic-version': '2023-06-01','Content-Type': 'application/json'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        system: wrapSystemPrompt(floveePostPrompt),
        messages: [{role:'user',content:`Generate a text for: ${timeOfDay} on ${dayOfWeek} in ${season}. Make it feel ALIVE.`}]
      })
    });
    const data = await response.json();
    let content = data.content?.[0]?.text || '';
    if (!content) return res.status(500).json({ error: 'Failed to generate' });

    // Output safety check
    const outputCheck = await checkOutputSafety(content, ANTHROPIC_API_KEY);
    if (!outputCheck.safe) { content = outputCheck.filtered; }

    // Random expiry between 6-18 hours
    const expiryHours = 6 + Math.random() * 12;
    const expiresAt = new Date(Date.now() + expiryHours * 3600000).toISOString();

    stmts.createFloveePost.run(floveeId, req.user.id, content, expiresAt);
    res.json({ ok: true, floveeId, content, expiresAt });
  } catch (err) {
    console.error('Flovee post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Flovee Letter (daily personalized letter) ───

app.get('/api/flovee/letter', auth, async (req, res) => {
  try {
    // Check if we already have today's letter
    const today = new Date().toISOString().split('T')[0];
    const cached = stmts.getData.get(req.user.id, 'flovee_letter_' + today);
    if (cached) {
      return res.json(JSON.parse(cached.value));
    }

    const userData = stmts.getData.get(req.user.id, 'profile');
    let floveeId = 'remi', aeName = 'softgirl';
    if (userData) {
      try {
        const profile = JSON.parse(userData.value);
        const ae = profile.aesthetics || {};
        const topAe = Object.entries(ae).sort((a,b) => b[1]-a[1])[0]?.[0] || 'softgirl';
        aeName = topAe;
        const aeMap = {kawaii:'lumi',softgirl:'vesper',cleangirl:'lumi',coquette:'vesper',goth:'nox',darkacad:'delara',grunge:'nox',y2k:'zola',street:'miro',cottage:'seraph',hippie:'seraph',oldmoney:'delara',preppy:'lumi',indie:'miro',emo:'nox'};
        floveeId = aeMap[topAe] || 'remi';
      } catch(e) {}
    }
    const f = FLOVEES[floveeId] || FLOVEES.remi;
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' });

    const letterPrompt = `You are ${f.name} — ${f.vibe}. Personality: ${f.personality}. Tone: ${f.tone}.\n\nWrite a short letter to your best friend (the user). This is like finding a folded note in your locker from your closest friend.\n\nRules:\n- 3-5 sentences max\n- Start casually ("hey," or "hi," — no name)\n- End with a sign-off like "${f.name} ${f.emoji}" or "— ${f.name}"\n- Be SPECIFIC — reference real things, real feelings, real moments\n- Match the ${timeOfDay} energy naturally\n- Make the reader feel SEEN, like this was written just for them\n- Sound like a REAL teen, not a greeting card\n- Output the letter text only`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'x-api-key': ANTHROPIC_API_KEY,'anthropic-version': '2023-06-01','Content-Type': 'application/json'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 250,
        system: wrapSystemPrompt(letterPrompt),
        messages: [{role:'user',content:`Write a letter for ${timeOfDay}. Make it feel personal.`}]
      })
    });
    const data = await response.json();
    let content = data.content?.[0]?.text || '';
    if (!content) return res.status(500).json({ error: 'Failed to generate' });

    // Output safety check
    const letterOutputCheck = await checkOutputSafety(content, ANTHROPIC_API_KEY);
    if (!letterOutputCheck.safe) { content = letterOutputCheck.filtered; }

    const result = { floveeId, flovee: f.name, emoji: f.emoji, vibe: f.vibe, content, date: today };
    stmts.setData.run(req.user.id, 'flovee_letter_' + today, JSON.stringify(result));
    res.json(result);
  } catch (err) {
    console.error('Flovee letter error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Flovee Roasts Your Outfit ───

app.post('/api/flovee/roast', auth, async (req, res) => {
  try {
    const { outfitDescription } = req.body;
    if (!outfitDescription) return res.status(400).json({ error: 'Describe your outfit' });

    // Input safety check on outfit description
    const roastInputCheck = checkInputSafety(outfitDescription);
    if (!roastInputCheck.safe) {
      return res.json({ floveeId: 'zola', flovee: 'Zola', emoji: '💀', vibe: 'chaos queen', roast: roastInputCheck.reason });
    }

    const userData = stmts.getData.get(req.user.id, 'profile');
    let floveeId = 'zola';
    if (userData) {
      try {
        const profile = JSON.parse(userData.value);
        const ae = profile.aesthetics || {};
        const topAe = Object.entries(ae).sort((a,b) => b[1]-a[1])[0]?.[0] || 'softgirl';
        const aeMap = {kawaii:'zola',softgirl:'nox',cleangirl:'zola',coquette:'nox',goth:'zola',darkacad:'nox',grunge:'zola',y2k:'nox',street:'zola',cottage:'nox',hippie:'zola',oldmoney:'nox',preppy:'zola',indie:'nox',emo:'zola'};
        floveeId = aeMap[topAe] || 'zola';
      } catch(e) {}
    }
    const f = FLOVEES[floveeId] || FLOVEES.zola;

    if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' });

    const roastPrompt = `You are ${f.name} — ${f.vibe}. Personality: ${f.personality}. Tone: ${f.tone}.\n\nYour best friend just showed you their outfit and wants your honest opinion. ROAST IT (lovingly).\n\nRules:\n- Max 3-4 sentences\n- Be FUNNY but never actually mean — this is love language\n- One genuine compliment hidden in the chaos\n- Use gen-z language naturally (not forced)\n- End with a rating like "7/10 would steal" or "honestly iconic minus the shoes" or "serving but also suffering"\n- Make it feel like your best friend judging your fit before you leave the house\n- The roast should be SCREENSHOT-WORTHY — something they would post on their story\n- Output the roast only, nothing else`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'x-api-key': ANTHROPIC_API_KEY,'anthropic-version': '2023-06-01','Content-Type': 'application/json'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: wrapSystemPrompt(roastPrompt),
        messages: [{role:'user',content:`Roast this outfit: ${outfitDescription}`}]
      })
    });
    const data = await response.json();
    let content = data.content?.[0]?.text || '';
    if (!content) return res.status(500).json({ error: 'Failed to generate' });

    // Output safety check
    const roastOutputCheck = await checkOutputSafety(content, ANTHROPIC_API_KEY);
    if (!roastOutputCheck.safe) { content = roastOutputCheck.filtered; }

    res.json({ floveeId, flovee: f.name, emoji: f.emoji, vibe: f.vibe, roast: content });
  } catch (err) {
    console.error('Flovee roast error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Fit Check ───

// Get active fit checks (not expired)
app.get('/api/fitcheck', auth, (req, res) => {
  try {
    const rows = all(
      `SELECT fc.*,
        (SELECT COUNT(*) FROM fit_check_votes v WHERE v.fit_id = fc.id AND v.vote = 1) as yes_count,
        (SELECT COUNT(*) FROM fit_check_votes v WHERE v.fit_id = fc.id AND v.vote = 0) as no_count,
        (SELECT v.vote FROM fit_check_votes v WHERE v.fit_id = fc.id AND v.user_id = ?) as my_vote
       FROM fit_checks fc
       WHERE fc.expires_at > datetime('now')
       ORDER BY fc.created_at DESC`,
      [req.user.id]
    );
    res.json({ posts: rows });
  } catch (err) {
    console.error('Fit check feed error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's own fit checks (active + expired)
app.get('/api/fitcheck/mine', auth, (req, res) => {
  try {
    const rows = all(
      `SELECT fc.*,
        (SELECT COUNT(*) FROM fit_check_votes v WHERE v.fit_id = fc.id AND v.vote = 1) as yes_count,
        (SELECT COUNT(*) FROM fit_check_votes v WHERE v.fit_id = fc.id AND v.vote = 0) as no_count
       FROM fit_checks fc
       WHERE fc.user_id = ?
       ORDER BY fc.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ posts: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get featured fit checks (80%+ yes, 10+ votes)
app.get('/api/fitcheck/featured', auth, (req, res) => {
  try {
    const rows = all(
      `SELECT fc.*,
        (SELECT COUNT(*) FROM fit_check_votes v WHERE v.fit_id = fc.id AND v.vote = 1) as yes_count,
        (SELECT COUNT(*) FROM fit_check_votes v WHERE v.fit_id = fc.id AND v.vote = 0) as no_count,
        (SELECT v.vote FROM fit_check_votes v WHERE v.fit_id = fc.id AND v.user_id = ?) as my_vote
       FROM fit_checks fc
       WHERE fc.created_at >= datetime('now', '-7 days')
       AND (SELECT COUNT(*) FROM fit_check_votes v WHERE v.fit_id = fc.id) >= 10
       AND CAST((SELECT COUNT(*) FROM fit_check_votes v WHERE v.fit_id = fc.id AND v.vote = 1) AS REAL)
           / CAST((SELECT COUNT(*) FROM fit_check_votes v WHERE v.fit_id = fc.id) AS REAL) >= 0.8
       ORDER BY yes_count DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({ posts: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a fit check post
app.post('/api/fitcheck', auth, (req, res) => {
  try {
    const { photo, caption, expiryHours } = req.body;
    if (!photo) return res.status(400).json({ error: 'Photo required' });
    const hours = [6, 12, 24].includes(expiryHours) ? expiryHours : 24;
    const expiresAt = new Date(Date.now() + hours * 3600000).toISOString();

    // Generate anonymous name from profile
    const userData = stmts.getData.get(req.user.id, 'profile');
    let anonName = 'Mystery' + (req.user.id * 7 % 900 + 100);
    if (userData) {
      try {
        const profile = JSON.parse(userData.value);
        const ae = profile.aesthetics || {};
        const topAe = Object.entries(ae).sort((a, b) => b[1] - a[1])[0]?.[0] || 'softgirl';
        const prefixes = {kawaii:'Sparkle',softgirl:'Cloud',cleangirl:'Crystal',coquette:'Ribbon',goth:'Shadow',darkacad:'Ink',grunge:'Storm',y2k:'Neon',street:'Blaze',cottage:'Petal',hippie:'Sage',oldmoney:'Velvet',preppy:'Mint',indie:'Echo',emo:'Phantom'};
        const floveeNames = {kawaii:'Lumi',softgirl:'Vesper',cleangirl:'Lumi',coquette:'Vesper',goth:'Nox',darkacad:'Delara',grunge:'Nox',y2k:'Zola',street:'Miro',cottage:'Seraph',hippie:'Seraph',oldmoney:'Delara',preppy:'Lumi',indie:'Miro',emo:'Nox'};
        anonName = (prefixes[topAe] || 'Cosmic') + (floveeNames[topAe] || 'Star');
      } catch (e) {}
    }

    const result = all(
      'INSERT INTO fit_checks (user_id, anon_name, photo, caption, expires_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [req.user.id, anonName, photo, (caption || '').slice(0, 80), expiresAt]
    );
    const id = result[0]?.id;
    res.json({ ok: true, id, anonName, expiresAt });
  } catch (err) {
    console.error('Fit check create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Vote on a fit check
app.post('/api/fitcheck/:id/vote', auth, (req, res) => {
  try {
    const fitId = parseInt(req.params.id);
    const { vote } = req.body; // true = yes, false = no
    if (typeof vote !== 'boolean') return res.status(400).json({ error: 'Vote must be true/false' });

    // Check post exists and not expired
    const post = all('SELECT * FROM fit_checks WHERE id = ? AND expires_at > datetime(\'now\')', [fitId]);
    if (!post.length) return res.status(404).json({ error: 'Post not found or expired' });

    // Can't vote on own post
    if (post[0].user_id === req.user.id) return res.status(400).json({ error: 'Cannot vote on your own post' });

    // Upsert vote
    all(
      `INSERT INTO fit_check_votes (fit_id, user_id, vote) VALUES (?, ?, ?)
       ON CONFLICT(fit_id, user_id) DO UPDATE SET vote = excluded.vote`,
      [fitId, req.user.id, vote ? 1 : 0]
    );

    // Return updated counts
    const yes_count = all('SELECT COUNT(*) as c FROM fit_check_votes WHERE fit_id = ? AND vote = 1', [fitId])[0].c;
    const no_count = all('SELECT COUNT(*) as c FROM fit_check_votes WHERE fit_id = ? AND vote = 0', [fitId])[0].c;
    res.json({ ok: true, yes_count, no_count });
  } catch (err) {
    console.error('Fit check vote error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete own fit check
app.delete('/api/fitcheck/:id', auth, (req, res) => {
  try {
    const fitId = parseInt(req.params.id);
    all('DELETE FROM fit_checks WHERE id = ? AND user_id = ?', [fitId, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Collab Workspace ───

const COLLAB_OWNER = 'chloealuton@gmail.com';

// Middleware: check collab access
function collabAuth(req, res, next) {
  const user = stmts.getUserById.get(req.user.id);
  if (!user) return res.status(403).json({ error: 'Not found' });
  const access = all('SELECT * FROM collab_access WHERE LOWER(email) = LOWER(?)', [user.email]);
  if (!access.length) return res.status(403).json({ error: 'No collab access' });
  req.collabRole = access[0].role;
  req.collabEmail = user.email;
  next();
}

// Check if user has collab access
app.get('/api/collab/check', auth, (req, res) => {
  const user = stmts.getUserById.get(req.user.id);
  if (!user) return res.json({ access: false });
  const access = all('SELECT * FROM collab_access WHERE LOWER(email) = LOWER(?)', [user.email]);
  if (!access.length) return res.json({ access: false });
  res.json({ access: true, role: access[0].role });
});

// Get collab members (owner only)
app.get('/api/collab/members', auth, collabAuth, (req, res) => {
  const members = all('SELECT id, email, role, created_at FROM collab_access ORDER BY created_at');
  res.json({ members });
});

// Grant collab access (owner only)
app.post('/api/collab/grant', auth, collabAuth, (req, res) => {
  if (req.collabRole !== 'owner') return res.status(403).json({ error: 'Only the owner can grant access' });
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    all('INSERT OR IGNORE INTO collab_access (email, role, granted_by) VALUES (?, ?, ?)',
      [email.toLowerCase().trim(), 'member', req.collabEmail]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Revoke collab access (owner only)
app.delete('/api/collab/revoke/:id', auth, collabAuth, (req, res) => {
  if (req.collabRole !== 'owner') return res.status(403).json({ error: 'Only the owner can revoke access' });
  const member = all('SELECT * FROM collab_access WHERE id = ?', [parseInt(req.params.id)]);
  if (member.length && member[0].role === 'owner') return res.status(400).json({ error: 'Cannot remove owner' });
  all('DELETE FROM collab_access WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// ─ Collab Chat ─
app.get('/api/collab/messages', auth, collabAuth, (req, res) => {
  const channel = req.query.channel || 'general';
  const msgs = all('SELECT * FROM collab_messages WHERE channel = ? ORDER BY created_at DESC LIMIT 100', [channel]);
  res.json({ messages: msgs.reverse() });
});

app.post('/api/collab/messages', auth, collabAuth, (req, res) => {
  const { text, channel } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Message required' });
  const ch = ['general','designs','ideas'].includes(channel) ? channel : 'general';
  const user = stmts.getUserById.get(req.user.id);
  all('INSERT INTO collab_messages (user_id, username, channel, text) VALUES (?, ?, ?, ?)',
    [req.user.id, user?.username || 'anon', ch, text.trim().slice(0, 2000)]);
  res.json({ ok: true });
});

// ─ Collab Designs ─
app.get('/api/collab/designs', auth, collabAuth, (req, res) => {
  const designs = all('SELECT * FROM collab_designs ORDER BY created_at DESC');
  res.json({ designs });
});

app.post('/api/collab/designs', auth, collabAuth, (req, res) => {
  const { title, image, link, notes, status } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const user = stmts.getUserById.get(req.user.id);
  const result = all(
    'INSERT INTO collab_designs (user_id, username, title, image, link, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [req.user.id, user?.username || 'anon', title, image || '', link || '', notes || '', status || 'idea']
  );
  res.json({ ok: true, id: result[0]?.id });
});

app.put('/api/collab/designs/:id', auth, collabAuth, (req, res) => {
  const { title, image, link, notes, status } = req.body;
  all('UPDATE collab_designs SET title=?, image=?, link=?, notes=?, status=? WHERE id=?',
    [title || '', image || '', link || '', notes || '', status || 'idea', parseInt(req.params.id)]);
  res.json({ ok: true });
});

app.delete('/api/collab/designs/:id', auth, collabAuth, (req, res) => {
  all('DELETE FROM collab_designs WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// ─ Collab Sandbox ─
app.get('/api/collab/sandbox', auth, collabAuth, (req, res) => {
  const sandboxes = all('SELECT id, user_id, username, name, updated_at FROM collab_sandbox ORDER BY updated_at DESC');
  res.json({ sandboxes });
});

app.get('/api/collab/sandbox/:id', auth, collabAuth, (req, res) => {
  const sb = all('SELECT * FROM collab_sandbox WHERE id = ?', [parseInt(req.params.id)]);
  if (!sb.length) return res.status(404).json({ error: 'Not found' });
  res.json({ sandbox: sb[0] });
});

app.post('/api/collab/sandbox', auth, collabAuth, (req, res) => {
  const { name, html, css, js } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const user = stmts.getUserById.get(req.user.id);
  const result = all(
    'INSERT INTO collab_sandbox (user_id, username, name, html, css, js) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    [req.user.id, user?.username || 'anon', name, html || '', css || '', js || '']
  );
  res.json({ ok: true, id: result[0]?.id });
});

app.put('/api/collab/sandbox/:id', auth, collabAuth, (req, res) => {
  const { name, html, css, js } = req.body;
  all("UPDATE collab_sandbox SET name=?, html=?, css=?, js=?, updated_at=datetime('now') WHERE id=?",
    [name || '', html || '', css || '', js || '', parseInt(req.params.id)]);
  res.json({ ok: true });
});

app.delete('/api/collab/sandbox/:id', auth, collabAuth, (req, res) => {
  all('DELETE FROM collab_sandbox WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// ─── Anthropic API Proxy ───

app.post('/api/chat', auth, async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  try {
    // 1. Input safety check on latest user message
    const messages = req.body.messages || [];
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    if (lastUserMsg) {
      const inputCheck = checkInputSafety(lastUserMsg.content);
      if (!inputCheck.safe) {
        return res.json({
          content: [{ type: 'text', text: inputCheck.reason }],
          role: 'assistant',
          _safety_blocked: true,
        });
      }
    }

    // 2. Rate limit check
    const rateCheck = checkRateLimit(req.user.id);
    if (!rateCheck.allowed) {
      return res.json({
        content: [{ type: 'text', text: rateCheck.message }],
        role: 'assistant',
        _rate_limited: true,
      });
    }

    // 3. Trim conversation history to 10 messages
    const trimmedMessages = trimConversationHistory(messages, 10);

    // 4. Prepend child safety system prompt, append feature-specific instructions if provided
    const baseSystem = req.body.system || '';
    const featurePrompt = req.body.featureSystemPrompt || '';
    const combinedSystem = featurePrompt ? (baseSystem + '\n\n' + featurePrompt) : baseSystem;
    const safeSystem = wrapSystemPrompt(combinedSystem);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: req.body.model || 'claude-sonnet-4-20250514',
        max_tokens: Math.min(req.body.max_tokens || 1024, 4096),
        system: safeSystem,
        messages: trimmedMessages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // 5. Output safety check
    const replyText = data.content && data.content[0] ? data.content[0].text : '';
    if (replyText) {
      const outputCheck = await checkOutputSafety(replyText, ANTHROPIC_API_KEY);
      if (!outputCheck.safe) {
        data.content[0].text = outputCheck.filtered;
      }
    }

    // 6. Increment rate limit
    incrementRateLimit(req.user.id);

    // 7. Add rate limit warning if approaching limit
    if (rateCheck.message) {
      data._rate_warning = rateCheck.message;
    }

    res.json(data);
  } catch (err) {
    console.error('Anthropic proxy error:', err);
    res.status(502).json({ error: 'Something went wrong — please try again in a moment! 😊' });
  }
});

// ─── Health Check ───

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: 'v2-full', timestamp: new Date().toISOString() });
});

// ─── Static Files ───

app.use(express.static(path.join(__dirname, 'public')));

// Catch-all for unknown API routes — must return JSON, not HTML
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// SPA fallback: serve HTML files for non-API routes
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, 'public', req.path);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.sendFile(path.join(__dirname, 'public', 'index.html'), (err2) => {
        if (err2 && !res.headersSent) res.status(404).end();
      });
    }
  });
});

// Global error handler — always return JSON for API errors
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Initialize database then start server
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Stuflover backend running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
