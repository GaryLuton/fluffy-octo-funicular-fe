const express = require('express');
const { stmts } = require('../../db');
const auth = require('../middleware/auth');
const { isCleanText } = require('../utils/content');

const router = express.Router();

router.post('/posts', auth, (req, res) => {
  try {
    const { title, body, bookTitle, bookAuthor, tag, imageUrl } = req.body;
    if (!title || title.length < 3) return res.status(400).json({ error: 'Title required (min 3 chars)' });
    if (!isCleanText(title)) return res.status(400).json({ error: 'Keep titles appropriate' });
    if (body && !isCleanText(body)) return res.status(400).json({ error: 'Keep content appropriate' });
    const result = stmts.createBookPost.run(req.user.id, title.substring(0, 200), (body || '').substring(0, 2000), (bookTitle || '').substring(0, 200), (bookAuthor || '').substring(0, 100), tag || 'discussion', imageUrl || '');
    res.json({ ok: true, postId: result.lastInsertRowid });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/posts', auth, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const posts = stmts.getBookFeed.all(30, page * 30);
    posts.forEach((p) => {
      const uv = stmts.getUserBookVote.get(req.user.id, p.id);
      p.userVote = uv ? uv.vote : 0;
    });
    res.json({ posts });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/posts/:id', auth, (req, res) => {
  try {
    const post = stmts.getBookPost.get(parseInt(req.params.id));
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const comments = stmts.getBookComments.all(post.id);
    const uv = stmts.getUserBookVote.get(req.user.id, post.id);
    post.userVote = uv ? uv.vote : 0;
    res.json({ post, comments });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/posts/:id/comment', auth, (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.length < 1) return res.status(400).json({ error: 'Comment required' });
    if (!isCleanText(text)) return res.status(400).json({ error: 'Keep comments appropriate' });
    stmts.addBookComment.run(parseInt(req.params.id), req.user.id, text.substring(0, 1000));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/posts/:id/vote', auth, (req, res) => {
  try {
    const { vote } = req.body;
    const v = vote > 0 ? 1 : vote < 0 ? -1 : 0;
    stmts.voteBookPost.run(req.user.id, parseInt(req.params.id), v);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
