const express = require('express');
const { stmts, all } = require('../../db');
const auth = require('../middleware/auth');

const router = express.Router();

function collabAuth(req, res, next) {
  const user = stmts.getUserById.get(req.user.id);
  if (!user) return res.status(403).json({ error: 'Not found' });
  const access = all('SELECT * FROM collab_access WHERE LOWER(email) = LOWER(?)', [user.email]);
  if (!access.length) return res.status(403).json({ error: 'No collab access' });
  req.collabRole = access[0].role;
  req.collabEmail = user.email;
  next();
}

router.get('/check', auth, (req, res) => {
  const user = stmts.getUserById.get(req.user.id);
  if (!user) return res.json({ access: false });
  const access = all('SELECT * FROM collab_access WHERE LOWER(email) = LOWER(?)', [user.email]);
  if (!access.length) return res.json({ access: false });
  res.json({ access: true, role: access[0].role });
});

router.get('/members', auth, collabAuth, (req, res) => {
  const members = all('SELECT id, email, role, created_at FROM collab_access ORDER BY created_at');
  res.json({ members });
});

router.post('/grant', auth, collabAuth, (req, res) => {
  if (req.collabRole !== 'owner') return res.status(403).json({ error: 'Only the owner can grant access' });
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    all('INSERT OR IGNORE INTO collab_access (email, role, granted_by) VALUES (?, ?, ?)',
      [email.toLowerCase().trim(), 'member', req.collabEmail]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/revoke/:id', auth, collabAuth, (req, res) => {
  if (req.collabRole !== 'owner') return res.status(403).json({ error: 'Only the owner can revoke access' });
  const member = all('SELECT * FROM collab_access WHERE id = ?', [parseInt(req.params.id)]);
  if (member.length && member[0].role === 'owner') return res.status(400).json({ error: 'Cannot remove owner' });
  all('DELETE FROM collab_access WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

router.get('/messages', auth, collabAuth, (req, res) => {
  const channel = req.query.channel || 'general';
  const msgs = all('SELECT * FROM collab_messages WHERE channel = ? ORDER BY created_at DESC LIMIT 100', [channel]);
  res.json({ messages: msgs.reverse() });
});

router.post('/messages', auth, collabAuth, (req, res) => {
  const { text, channel } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Message required' });
  const ch = ['general', 'designs', 'ideas'].includes(channel) ? channel : 'general';
  const user = stmts.getUserById.get(req.user.id);
  all('INSERT INTO collab_messages (user_id, username, channel, text) VALUES (?, ?, ?, ?)',
    [req.user.id, user?.username || 'anon', ch, text.trim().slice(0, 2000)]);
  res.json({ ok: true });
});

router.get('/designs', auth, collabAuth, (req, res) => {
  const designs = all('SELECT * FROM collab_designs ORDER BY created_at DESC');
  res.json({ designs });
});

router.post('/designs', auth, collabAuth, (req, res) => {
  const { title, image, link, notes, status } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const user = stmts.getUserById.get(req.user.id);
  const result = all(
    'INSERT INTO collab_designs (user_id, username, title, image, link, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [req.user.id, user?.username || 'anon', title, image || '', link || '', notes || '', status || 'idea']
  );
  res.json({ ok: true, id: result[0]?.id });
});

router.put('/designs/:id', auth, collabAuth, (req, res) => {
  const { title, image, link, notes, status } = req.body;
  all('UPDATE collab_designs SET title=?, image=?, link=?, notes=?, status=? WHERE id=?',
    [title || '', image || '', link || '', notes || '', status || 'idea', parseInt(req.params.id)]);
  res.json({ ok: true });
});

router.delete('/designs/:id', auth, collabAuth, (req, res) => {
  all('DELETE FROM collab_designs WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

router.get('/sandbox', auth, collabAuth, (req, res) => {
  const sandboxes = all('SELECT id, user_id, username, name, updated_at FROM collab_sandbox ORDER BY updated_at DESC');
  res.json({ sandboxes });
});

router.get('/sandbox/:id', auth, collabAuth, (req, res) => {
  const sb = all('SELECT * FROM collab_sandbox WHERE id = ?', [parseInt(req.params.id)]);
  if (!sb.length) return res.status(404).json({ error: 'Not found' });
  res.json({ sandbox: sb[0] });
});

router.post('/sandbox', auth, collabAuth, (req, res) => {
  const { name, html, css, js } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const user = stmts.getUserById.get(req.user.id);
  const result = all(
    'INSERT INTO collab_sandbox (user_id, username, name, html, css, js) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    [req.user.id, user?.username || 'anon', name, html || '', css || '', js || '']
  );
  res.json({ ok: true, id: result[0]?.id });
});

router.put('/sandbox/:id', auth, collabAuth, (req, res) => {
  const { name, html, css, js } = req.body;
  all("UPDATE collab_sandbox SET name=?, html=?, css=?, js=?, updated_at=datetime('now') WHERE id=?",
    [name || '', html || '', css || '', js || '', parseInt(req.params.id)]);
  res.json({ ok: true });
});

router.delete('/sandbox/:id', auth, collabAuth, (req, res) => {
  all('DELETE FROM collab_sandbox WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

module.exports = router;
