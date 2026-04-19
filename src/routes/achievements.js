const express = require('express');
const { stmts } = require('../../db');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/mine', auth, (req, res) => {
  const achievements = stmts.getUserAchievements.all(req.user.id);
  res.json({ achievements });
});

module.exports = router;
