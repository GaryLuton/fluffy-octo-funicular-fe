function notFoundApi(req, res) {
  res.status(404).json({ error: 'Not found' });
}

function errorHandler(err, req, res, next) {
  console.error('Server error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { notFoundApi, errorHandler };
