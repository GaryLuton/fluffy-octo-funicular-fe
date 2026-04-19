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
app.use(express.static(publicDir));

app.all('/api/*', notFoundApi);

app.get('*', (req, res) => {
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
