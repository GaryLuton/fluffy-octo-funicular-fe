const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'stuflover.db');

let db;

// sql.js is async, so we need an init function
async function initDb() {
  const SQL = await initSqlJs();

  // Load existing database file if it exists
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS user_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, key)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user INTEGER NOT NULL,
      to_user INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (from_user) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_user) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(from_user, to_user)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user INTEGER NOT NULL,
      to_user INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (from_user) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_user) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      caption TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS post_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      UNIQUE(user_id, post_id)
    );
  `);

  save();
  return db;
}

// Persist database to disk
function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Helper: run a query and return all rows as objects
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: run a query and return first row as object, or null
function get(sql, params = []) {
  const rows = all(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Helper: run an insert/update/delete and return { changes, lastInsertRowid }
function run(sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified();
  const lastRow = get('SELECT last_insert_rowid() as id');
  const lastInsertRowid = lastRow ? lastRow.id : 0;
  save();
  return { changes, lastInsertRowid };
}

// Wrap the same interface as before
const stmts = {
  createUser: {
    run: (username, email, hash) => run(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, hash]
    ),
  },
  getUserByEmail: {
    get: (email) => get('SELECT * FROM users WHERE email = ?', [email]),
  },
  getUserByUsername: {
    get: (username) => get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]),
  },
  getUserById: {
    get: (id) => get('SELECT id, username, email, created_at FROM users WHERE id = ?', [id]),
  },
  getData: {
    get: (userId, key) => get('SELECT value FROM user_data WHERE user_id = ? AND key = ?', [userId, key]),
  },
  setData: {
    run: (userId, key, value) => run(
      `INSERT INTO user_data (user_id, key, value, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [userId, key, value]
    ),
  },
  getAllData: {
    all: (userId) => all('SELECT key, value FROM user_data WHERE user_id = ?', [userId]),
  },
  deleteData: {
    run: (userId, key) => run('DELETE FROM user_data WHERE user_id = ? AND key = ?', [userId, key]),
  },
  deleteAllUserData: {
    run: (userId) => run('DELETE FROM user_data WHERE user_id = ?', [userId]),
  },
  deleteUser: {
    run: (userId) => run('DELETE FROM users WHERE id = ?', [userId]),
  },
  // Friends
  sendFriendRequest: {
    run: (fromId, toId) => run(
      'INSERT OR IGNORE INTO friend_requests (from_user, to_user, status) VALUES (?, ?, \'pending\')',
      [fromId, toId]
    ),
  },
  getPendingRequests: {
    all: (userId) => all(
      `SELECT fr.id, fr.from_user, u.username, fr.created_at
       FROM friend_requests fr JOIN users u ON u.id = fr.from_user
       WHERE fr.to_user = ? AND fr.status = 'pending' ORDER BY fr.created_at DESC`, [userId]
    ),
  },
  acceptFriendRequest: {
    run: (requestId, userId) => run(
      'UPDATE friend_requests SET status = \'accepted\' WHERE id = ? AND to_user = ?',
      [requestId, userId]
    ),
  },
  declineFriendRequest: {
    run: (requestId, userId) => run(
      'DELETE FROM friend_requests WHERE id = ? AND to_user = ?',
      [requestId, userId]
    ),
  },
  getFriends: {
    all: (userId) => all(
      `SELECT u.id, u.username FROM users u WHERE u.id IN (
        SELECT CASE WHEN from_user = ? THEN to_user ELSE from_user END
        FROM friend_requests WHERE (from_user = ? OR to_user = ?) AND status = 'accepted'
      )`, [userId, userId, userId]
    ),
  },
  sendMessage: {
    run: (fromId, toId, text) => run(
      'INSERT INTO messages (from_user, to_user, text) VALUES (?, ?, ?)',
      [fromId, toId, text]
    ),
  },
  getMessages: {
    all: (userId, friendId, limit) => all(
      `SELECT m.id, m.from_user, m.to_user, m.text, m.created_at, u.username as sender_name
       FROM messages m JOIN users u ON u.id = m.from_user
       WHERE (m.from_user = ? AND m.to_user = ?) OR (m.from_user = ? AND m.to_user = ?)
       ORDER BY m.created_at DESC LIMIT ?`,
      [userId, friendId, friendId, userId, limit || 50]
    ),
  },
  // Posts
  createPost: {
    run: (userId, imageUrl, caption, tags) => run(
      'INSERT INTO posts (user_id, image_url, caption, tags) VALUES (?, ?, ?, ?)',
      [userId, imageUrl, caption, tags]
    ),
  },
  getFeed: {
    all: (limit, offset) => all(
      `SELECT p.id, p.image_url, p.caption, p.tags, p.created_at, u.username,
       (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes
       FROM posts p JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, [limit, offset]
    ),
  },
  getUserPosts: {
    all: (userId) => all(
      `SELECT p.id, p.image_url, p.caption, p.tags, p.created_at,
       (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes
       FROM posts p WHERE p.user_id = ? ORDER BY p.created_at DESC`, [userId]
    ),
  },
  likePost: {
    run: (userId, postId) => run(
      'INSERT OR IGNORE INTO post_likes (user_id, post_id) VALUES (?, ?)', [userId, postId]
    ),
  },
  unlikePost: {
    run: (userId, postId) => run(
      'DELETE FROM post_likes WHERE user_id = ? AND post_id = ?', [userId, postId]
    ),
  },
  getUserLikes: {
    all: (userId) => all(
      'SELECT post_id FROM post_likes WHERE user_id = ?', [userId]
    ),
  },
  deletePost: {
    run: (postId, userId) => run(
      'DELETE FROM posts WHERE id = ? AND user_id = ?', [postId, userId]
    ),
  },
};

module.exports = { initDb, stmts };
