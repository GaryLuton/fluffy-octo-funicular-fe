const express = require('express');
const { stmts } = require('../../db');
const auth = require('../middleware/auth');
const { isCleanText } = require('../utils/content');

const router = express.Router();

router.post('/', auth, (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || name.length < 2) return res.status(400).json({ error: 'Group name required (min 2 chars)' });
    if (name.length > 40) return res.status(400).json({ error: 'Group name too long (max 40 chars)' });
    if (!isCleanText(name)) return res.status(400).json({ error: 'Please keep group names appropriate' });
    if (description && !isCleanText(description)) return res.status(400).json({ error: 'Please keep descriptions appropriate' });
    const result = stmts.createGroup.run(name.trim(), (description || '').substring(0, 200), req.user.id);
    stmts.joinGroup.run(result.lastInsertRowid, req.user.id);
    res.json({ ok: true, groupId: result.lastInsertRowid });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', auth, (req, res) => {
  try {
    const groups = stmts.getAllGroups.all();
    const userGroups = stmts.getUserGroups.all(req.user.id);
    const joinedIds = new Set(userGroups.map((g) => g.id));
    groups.forEach((g) => { g.joined = joinedIds.has(g.id); });
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', auth, (req, res) => {
  try {
    const group = stmts.getGroup.get(parseInt(req.params.id));
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const members = stmts.getGroupMembers.all(group.id);
    const userGroups = stmts.getUserGroups.all(req.user.id);
    group.joined = userGroups.some((g) => g.id === group.id);
    res.json({ group, members });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/join', auth, (req, res) => {
  try {
    stmts.joinGroup.run(parseInt(req.params.id), req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/leave', auth, (req, res) => {
  try {
    stmts.leaveGroup.run(parseInt(req.params.id), req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/posts', auth, (req, res) => {
  try {
    const posts = stmts.getGroupPosts.all(parseInt(req.params.id));
    res.json({ posts });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/:id/posts', auth, (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });
    if (!isCleanText(text)) return res.status(400).json({ error: 'Please keep posts appropriate' });
    const members = stmts.getGroupMembers.all(groupId);
    if (!members.some((m) => m.id === req.user.id)) return res.status(403).json({ error: 'Must be a member to post' });
    stmts.createGroupPost.run(groupId, req.user.id, text.trim().substring(0, 500));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id/posts/:postId', auth, (req, res) => {
  try {
    stmts.deleteGroupPost.run(parseInt(req.params.postId), req.user.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/:id/store', auth, (req, res) => {
  try {
    const items = stmts.getStoreItems.all(parseInt(req.params.id));
    res.json({ items });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/:id/store', auth, (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const group = stmts.getGroup.get(groupId);
    if (!group || group.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the group owner can add store items' });
    const { name, description, image_url, price, link } = req.body;
    if (!name) return res.status(400).json({ error: 'Item name required' });
    stmts.createStoreItem.run(groupId, name.trim(), (description || '').substring(0, 200), image_url || '', price || '', link || '');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id/store/:itemId', auth, (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const group = stmts.getGroup.get(groupId);
    if (!group || group.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the group owner can remove items' });
    stmts.deleteStoreItem.run(parseInt(req.params.itemId), groupId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id/about', auth, (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const group = stmts.getGroup.get(groupId);
    if (!group || group.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the group owner can edit the about page' });
    const { description } = req.body;
    if (description && !isCleanText(description)) return res.status(400).json({ error: 'Please keep descriptions appropriate' });
    stmts.updateGroupDescription.run(groupId, (description || '').substring(0, 1000));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
