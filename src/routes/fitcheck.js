const express = require('express');
const { stmts, all } = require('../../db');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, (req, res) => {
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

router.get('/mine', auth, (req, res) => {
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

router.get('/featured', auth, (req, res) => {
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

router.post('/', auth, (req, res) => {
  try {
    const { photo, caption, expiryHours } = req.body;
    if (!photo) return res.status(400).json({ error: 'Photo required' });
    const hours = [6, 12, 24].includes(expiryHours) ? expiryHours : 24;
    const expiresAt = new Date(Date.now() + hours * 3600000).toISOString();

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

router.post('/:id/vote', auth, (req, res) => {
  try {
    const fitId = parseInt(req.params.id);
    const { vote } = req.body;
    if (typeof vote !== 'boolean') return res.status(400).json({ error: 'Vote must be true/false' });

    const post = all('SELECT * FROM fit_checks WHERE id = ? AND expires_at > datetime(\'now\')', [fitId]);
    if (!post.length) return res.status(404).json({ error: 'Post not found or expired' });

    if (post[0].user_id === req.user.id) return res.status(400).json({ error: 'Cannot vote on your own post' });

    all(
      `INSERT INTO fit_check_votes (fit_id, user_id, vote) VALUES (?, ?, ?)
       ON CONFLICT(fit_id, user_id) DO UPDATE SET vote = excluded.vote`,
      [fitId, req.user.id, vote ? 1 : 0]
    );

    const yes_count = all('SELECT COUNT(*) as c FROM fit_check_votes WHERE fit_id = ? AND vote = 1', [fitId])[0].c;
    const no_count = all('SELECT COUNT(*) as c FROM fit_check_votes WHERE fit_id = ? AND vote = 0', [fitId])[0].c;
    res.json({ ok: true, yes_count, no_count });
  } catch (err) {
    console.error('Fit check vote error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', auth, (req, res) => {
  try {
    const fitId = parseInt(req.params.id);
    all('DELETE FROM fit_checks WHERE id = ? AND user_id = ?', [fitId, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
