const express = require('express');
const cors = require('cors');
const path = require('path');

const { allowedOrigins } = require('./config');
const { notFoundApi, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const friendsRoutes = require('./routes/friends');
const postsRoutes = require('./routes/posts');
const groupsRoutes = require('./routes/groups');
const booksRoutes = require('./routes/books');
const activityRoutes = require('./routes/activity');
const gamesRoutes = require('./routes/games');
const achievementsRoutes = require('./routes/achievements');
const adminRoutes = require('./routes/admin');
const floveeRoutes = require('./routes/flovee');
const fitcheckRoutes = require('./routes/fitcheck');
const collabRoutes = require('./routes/collab');
const chatRoutes = require('./routes/chat');
const healthRoutes = require('./routes/health');

const app = express();

const corsOptions = {
  origin: allowedOrigins.length > 0
    ? (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      }
    : true,
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// ─── Content Security Policy ──────────────────────────────
// Enforced policy is intentionally permissive for now: lifestyle.html and
// other pages still carry inline <script> blocks and onclick= attributes,
// so removing 'unsafe-inline' from script-src today would break the app.
// A strict Report-Only policy runs alongside it to surface everything that
// would need to move before we can tighten the enforced policy. Once every
// inline script and onclick is migrated to /js/*.js + addEventListener,
// drop 'unsafe-inline' from the enforced policy and delete the report-only
// header.
app.use((req, res, next) => {
  const enforced = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  const reportOnly = [
    "default-src 'self'",
    "script-src 'self'",            // no unsafe-inline, no unsafe-eval
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  res.setHeader('Content-Security-Policy', enforced);
  res.setHeader('Content-Security-Policy-Report-Only', reportOnly);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/flovee', floveeRoutes);
app.use('/api/fitcheck', fitcheckRoutes);
app.use('/api/collab', collabRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/health', healthRoutes);

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    // HTML must always revalidate so deploys propagate immediately.
    if (ext === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
      return;
    }
    // Fonts and images rarely change — long-lived cache.
    if (['.woff', '.woff2', '.ttf', '.otf', '.eot',
         '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.avif'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return;
    }
    // CSS / JS: cache for a day, then revalidate via ETag. Once asset URLs
    // are content-hashed (or include ?v=… version strings), bump this to
    // `public, max-age=31536000, immutable`.
    if (ext === '.css' || ext === '.js' || ext === '.mjs') {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return;
    }
  },
}));

app.all('/api/*', notFoundApi);

app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  const filePath = path.join(publicDir, req.path);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.sendFile(path.join(publicDir, 'index.html'), (err2) => {
        if (err2 && !res.headersSent) res.status(404).end();
      });
    }
  });
});

app.use(errorHandler);

module.exports = app;
