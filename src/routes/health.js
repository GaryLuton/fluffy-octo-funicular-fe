const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ status: 'ok', version: 'v2-full', timestamp: new Date().toISOString() });
});

module.exports = router;
