const express = require('express');
const { stmts } = require('../../db');
const auth = require('../middleware/auth');

const router = express.Router();

const VALID_KEYS = ['profile', 'wishlist', 'catalog', 'approved', 'contacts', 'convos', 'vids', 'vid_liked', 'vid_disliked', 'foryou_cache', 'sb_positions'];
const VALID_KEY_PREFIXES = ['chat_'];

function isValidKey(key) {
  if (VALID_KEYS.includes(key)) return true;
  return VALID_KEY_PREFIXES.some((p) => key.startsWith(p));
}

router.get('/', auth, (req, res) => {
  const rows = stmts.getAllData.all(req.user.id);
  const data = {};
  for (const row of rows) {
    try { data[row.key] = JSON.parse(row.value); } catch { data[row.key] = row.value; }
  }
  res.json({ data });
});

router.get('/:key', auth, (req, res) => {
  const { key } = req.params;
  if (!isValidKey(key)) {
    return res.status(400).json({ error: 'Invalid key' });
  }
  const row = stmts.getData.get(req.user.id, key);
  if (!row) return res.json({ data: null });
  try { res.json({ data: JSON.parse(row.value) }); } catch { res.json({ data: row.value }); }
});

router.put('/:key', auth, (req, res) => {
  const { key } = req.params;
  if (!isValidKey(key)) {
    return res.status(400).json({ error: 'Invalid key' });
  }
  const value = JSON.stringify(req.body.value);
  stmts.setData.run(req.user.id, key, value);
  res.json({ ok: true });
});

router.delete('/:key', auth, (req, res) => {
  const { key } = req.params;
  if (!isValidKey(key)) {
    return res.status(400).json({ error: 'Invalid key' });
  }
  stmts.deleteData.run(req.user.id, key);
  res.json({ ok: true });
});

router.post('/sync', auth, (req, res) => {
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

module.exports = router;
