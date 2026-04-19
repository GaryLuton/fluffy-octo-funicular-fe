const express = require('express');
const { stmts } = require('../../db');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/page', auth, (req, res) => {
  const { page } = req.body;
  if (!page || typeof page !== 'string') return res.status(400).json({ error: 'Page required' });
  stmts.logPageVisit.run(req.user.id, page.substring(0, 100));
  res.json({ ok: true });
});

module.exports = router;
