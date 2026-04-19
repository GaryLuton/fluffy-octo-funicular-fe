const express = require('express');
const { stmts, all } = require('../../db');
const auth = require('../middleware/auth');
const { isCleanText } = require('../utils/content');

const router = express.Router();

router.get('/search/:username', auth, (req, res) => {
  try {
    const search = req.params.username.toLowerCase();
    const exact = stmts.getUserByUsername.get(search);
    if (exact) return res.json({ found: true, username: exact.username, id: exact.id });
    const matches = all('SELECT id, username FROM users WHERE LOWER(username) LIKE ? LIMIT 5', ['%' + search + '%']);
    if (matches.length > 0) return res.json({ found: true, username: matches[0].username, id: matches[0].id, suggestions: matches.map((m) => m.username) });
    res.json({ found: false });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/request', auth, (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    if (username.toLowerCase() === req.user.username.toLowerCase()) return res.status(400).json({ error: 'Cannot add yourself' });
    const target = stmts.getUserByUsername.get(username);
    if (!target) return res.status(404).json({ error: 'User not found — they need to sign up first' });
    const friends = stmts.getFriends.all(req.user.id);
    if (friends.some((f) => f.id === target.id)) return res.status(400).json({ error: 'Already friends' });
    stmts.sendFriendRequest.run(req.user.id, target.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Friend request error:', err);
    res.status(500).json({ error: 'Server error — try again' });
  }
});

router.get('/requests', auth, (req, res) => {
  const requests = stmts.getPendingRequests.all(req.user.id);
  res.json({ requests });
});

router.post('/accept', auth, (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ error: 'Request ID required' });
  stmts.acceptFriendRequest.run(requestId, req.user.id);
  res.json({ ok: true });
});

router.post('/decline', auth, (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ error: 'Request ID required' });
  stmts.declineFriendRequest.run(requestId, req.user.id);
  res.json({ ok: true });
});

router.get('/', auth, (req, res) => {
  const friends = stmts.getFriends.all(req.user.id);
  res.json({ friends });
});

router.post('/message', auth, (req, res) => {
  const { friendId, text } = req.body;
  const fid = parseInt(friendId);
  if (!fid || !text) return res.status(400).json({ error: 'Friend ID and text required' });
  if (text.length > 500) return res.status(400).json({ error: 'Message too long' });
  if (!isCleanText(text)) return res.status(400).json({ error: 'Please keep messages appropriate' });
  const friends = stmts.getFriends.all(req.user.id);
  if (!friends.some((f) => parseInt(f.id) === fid)) return res.status(403).json({ error: 'Not friends — you need to add them first' });
  stmts.sendMessage.run(req.user.id, fid, text.trim());
  res.json({ ok: true });
});

router.get('/messages/:friendId', auth, (req, res) => {
  const friendId = parseInt(req.params.friendId);
  if (!friendId) return res.status(400).json({ error: 'Invalid friend ID' });
  const friends = stmts.getFriends.all(req.user.id);
  if (!friends.some((f) => parseInt(f.id) === friendId)) return res.status(403).json({ error: 'Not friends' });
  const messages = stmts.getMessages.all(req.user.id, friendId, 50);
  stmts.markMessagesRead.run(req.user.id, friendId);
  res.json({ messages: messages.reverse() });
});

router.get('/unread', auth, (req, res) => {
  const result = stmts.getUnreadCount.get(req.user.id);
  const perFriend = stmts.getUnreadPerFriend.all(req.user.id);
  res.json({ total: result ? result.count : 0, perFriend });
});

router.post('/messages/:friendId/read', auth, (req, res) => {
  const friendId = parseInt(req.params.friendId);
  if (!friendId) return res.status(400).json({ error: 'Invalid friend ID' });
  stmts.markMessagesRead.run(req.user.id, friendId);
  res.json({ ok: true });
});

router.get('/sent-requests', auth, (req, res) => {
  const requests = stmts.getSentRequests.all(req.user.id);
  res.json({ requests });
});

router.delete('/:friendId', auth, (req, res) => {
  const friendId = parseInt(req.params.friendId);
  if (!friendId) return res.status(400).json({ error: 'Invalid friend ID' });
  stmts.deleteFriend.run(req.user.id, friendId);
  res.json({ ok: true });
});

router.get('/profile/:userId', auth, (req, res) => {
  const userId = parseInt(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid user ID' });
  const profile = stmts.getFriendProfile.get(userId);
  if (!profile) return res.status(404).json({ error: 'User not found' });
  const friends = stmts.getFriends.all(req.user.id);
  const isFriend = friends.some((f) => parseInt(f.id) === userId);
  res.json({ profile, isFriend });
});

module.exports = router;
