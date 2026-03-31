require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const path = require('path');
const { initDb, stmts, all } = require('./db');

const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

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

app.delete('/api/auth/account', auth, (req, res) => {
  stmts.deleteAllUserData.run(req.user.id);
  stmts.deleteUser.run(req.user.id);
  res.json({ ok: true });
});

// ─── Data Routes (CRUD for user data) ───

// Valid keys that map to the frontend's localStorage keys
const VALID_KEYS = ['profile', 'wishlist', 'catalog', 'approved', 'contacts', 'convos', 'vids', 'vid_liked', 'vid_disliked'];
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
  if (!friendId || !text) return res.status(400).json({ error: 'Friend ID and text required' });
  if (text.length > 500) return res.status(400).json({ error: 'Message too long' });
  if (!isCleanText(text)) return res.status(400).json({ error: 'Please keep messages appropriate' });
  // Verify they are friends
  const friends = stmts.getFriends.all(req.user.id);
  if (!friends.some(f => f.id === friendId)) return res.status(403).json({ error: 'Not friends' });
  stmts.sendMessage.run(req.user.id, friendId, text.trim());
  res.json({ ok: true });
});

// Get messages with a friend
app.get('/api/friends/messages/:friendId', auth, (req, res) => {
  const friendId = parseInt(req.params.friendId);
  if (!friendId) return res.status(400).json({ error: 'Invalid friend ID' });
  const friends = stmts.getFriends.all(req.user.id);
  if (!friends.some(f => f.id === friendId)) return res.status(403).json({ error: 'Not friends' });
  const messages = stmts.getMessages.all(req.user.id, friendId, 50);
  res.json({ messages: messages.reverse() });
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

// ─── Anthropic API Proxy ───

app.post('/api/chat', auth, async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  try {
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
        system: req.body.system || undefined,
        messages: req.body.messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (err) {
    console.error('Anthropic proxy error:', err);
    res.status(502).json({ error: 'Failed to reach Anthropic API' });
  }
});

// ─── Health Check ───

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: 'v2-full', timestamp: new Date().toISOString() });
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
    if (err) res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
});

// Global error handler — always return JSON for API errors
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
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
