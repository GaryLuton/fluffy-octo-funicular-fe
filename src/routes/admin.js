const express = require('express');
const jwt = require('jsonwebtoken');
const { stmts, all } = require('../../db');
const adminAuth = require('../middleware/adminAuth');
const { JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD } = require('../config');

const router = express.Router();

router.post('/login', (req, res) => {
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

router.get('/users', adminAuth, (req, res) => {
  try {
    const users = stmts.getAllUsers.all();
    res.json({ users });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/users/:id/activity', adminAuth, (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const activity = stmts.getUserActivity.all(userId, 100);
    res.json({ activity });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/stats/logins', adminAuth, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const stats = stmts.getLoginStats.all(days);
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/stats/pages', adminAuth, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const stats = stmts.getPageStats.all(days);
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/overview', adminAuth, (req, res) => {
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

module.exports = router;
