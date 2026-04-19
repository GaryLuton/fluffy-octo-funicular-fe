const express = require('express');
const { stmts } = require('../../db');
const auth = require('../middleware/auth');
const { isCleanText } = require('../utils/content');

const router = express.Router();

router.post('/', auth, (req, res) => {
  try {
    const { imageUrl, caption, tags } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'Image URL required' });
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

router.get('/', auth, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const posts = stmts.getFeed.all(30, page * 30);
    const userLikes = stmts.getUserLikes.all(req.user.id);
    const likedIds = new Set(userLikes.map((l) => l.post_id));
    posts.forEach((p) => { p.liked = likedIds.has(p.id); });
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/like', auth, (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    stmts.likePost.run(req.user.id, postId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/like', auth, (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    stmts.unlikePost.run(req.user.id, postId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', auth, (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    stmts.deletePost.run(postId, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
