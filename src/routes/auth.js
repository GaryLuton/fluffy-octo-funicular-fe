const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');
const { stmts } = require('../../db');
const auth = require('../middleware/auth');
const { JWT_SECRET, RESEND_API_KEY, RESEND_FROM_EMAIL } = require('../config');

const router = express.Router();
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

router.post('/register', (req, res) => {
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

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = stmts.getUserByEmail.get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  stmts.logLogin.run(user.id);

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
});

router.get('/me', auth, (req, res) => {
  const user = stmts.getUserById.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

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
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');
    stmts.createPasswordReset.run(user.id, token, expiresAt);

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

router.post('/reset-password', (req, res) => {
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

router.delete('/account', auth, (req, res) => {
  stmts.deleteAllUserData.run(req.user.id);
  stmts.deleteUser.run(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
