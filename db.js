const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'stuflover.db');

let db;

// sql.js is async, so we need an init function
async function initDb() {
  const SQL = await initSqlJs();

  // Load existing database file if it exists
  try {
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
      console.log('Loaded existing database from', dbPath);
    } else {
      db = new SQL.Database();
      console.log('Created new database');
    }
  } catch (err) {
    console.error('Database load error, creating fresh:', err.message);
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

  db.run(`
    CREATE TABLE IF NOT EXISTS groups_ (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      owner_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (group_id) REFERENCES groups_(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(group_id, user_id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS book_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      book_title TEXT DEFAULT '',
      book_author TEXT DEFAULT '',
      tag TEXT DEFAULT 'discussion',
      image_url TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS book_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES book_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS book_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      vote INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES book_posts(id) ON DELETE CASCADE,
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
  // Groups
  createGroup: {
    run: (name, desc, ownerId) => run(
      'INSERT INTO groups_ (name, description, owner_id) VALUES (?, ?, ?)', [name, desc, ownerId]
    ),
  },
  getAllGroups: {
    all: () => all(
      `SELECT g.id, g.name, g.description, g.owner_id, u.username as owner_name, g.created_at,
       (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
       FROM groups_ g JOIN users u ON u.id = g.owner_id ORDER BY member_count DESC, g.created_at DESC`
    ),
  },
  getGroup: {
    get: (groupId) => get(
      `SELECT g.id, g.name, g.description, g.owner_id, u.username as owner_name,
       (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
       FROM groups_ g JOIN users u ON u.id = g.owner_id WHERE g.id = ?`, [groupId]
    ),
  },
  joinGroup: {
    run: (groupId, userId) => run(
      'INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, userId]
    ),
  },
  leaveGroup: {
    run: (groupId, userId) => run(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]
    ),
  },
  getGroupMembers: {
    all: (groupId) => all(
      'SELECT u.id, u.username FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?', [groupId]
    ),
  },
  getUserGroups: {
    all: (userId) => all(
      `SELECT g.id, g.name, g.description,
       (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
       FROM group_members gm JOIN groups_ g ON g.id = gm.group_id WHERE gm.user_id = ?`, [userId]
    ),
  },
  deleteGroup: {
    run: (groupId, ownerId) => run(
      'DELETE FROM groups_ WHERE id = ? AND owner_id = ?', [groupId, ownerId]
    ),
  },
  // ReadIt (book posts)
  createBookPost: {
    run: (userId, title, body, bookTitle, bookAuthor, tag, imageUrl) => run(
      'INSERT INTO book_posts (user_id, title, body, book_title, book_author, tag, image_url) VALUES (?,?,?,?,?,?,?)',
      [userId, title, body, bookTitle, bookAuthor, tag, imageUrl||'']
    ),
  },
  getBookFeed: {
    all: (limit, offset) => all(
      `SELECT bp.id, bp.title, bp.body, bp.book_title, bp.book_author, bp.tag, bp.image_url, bp.created_at, u.username,
       (SELECT COALESCE(SUM(vote),0) FROM book_votes WHERE post_id=bp.id) as votes,
       (SELECT COUNT(*) FROM book_comments WHERE post_id=bp.id) as comment_count
       FROM book_posts bp JOIN users u ON u.id=bp.user_id ORDER BY bp.created_at DESC LIMIT ? OFFSET ?`, [limit, offset]
    ),
  },
  getBookPost: {
    get: (postId) => get(
      `SELECT bp.*, u.username,
       (SELECT COALESCE(SUM(vote),0) FROM book_votes WHERE post_id=bp.id) as votes,
       (SELECT COUNT(*) FROM book_comments WHERE post_id=bp.id) as comment_count
       FROM book_posts bp JOIN users u ON u.id=bp.user_id WHERE bp.id=?`, [postId]
    ),
  },
  getBookComments: {
    all: (postId) => all(
      'SELECT bc.*, u.username FROM book_comments bc JOIN users u ON u.id=bc.user_id WHERE bc.post_id=? ORDER BY bc.created_at ASC', [postId]
    ),
  },
  addBookComment: {
    run: (postId, userId, text) => run(
      'INSERT INTO book_comments (post_id, user_id, text) VALUES (?,?,?)', [postId, userId, text]
    ),
  },
  voteBookPost: {
    run: (userId, postId, vote) => run(
      `INSERT INTO book_votes (user_id, post_id, vote) VALUES (?,?,?)
       ON CONFLICT(user_id, post_id) DO UPDATE SET vote=excluded.vote`, [userId, postId, vote]
    ),
  },
  getUserBookVote: {
    get: (userId, postId) => get('SELECT vote FROM book_votes WHERE user_id=? AND post_id=?', [userId, postId]),
  },
};

module.exports = { initDb, stmts };
