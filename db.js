const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'stuflover.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

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

// Prepared statements
const stmts = {
  createUser: db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  ),
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  getUserById: db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?'),

  getData: db.prepare('SELECT value FROM user_data WHERE user_id = ? AND key = ?'),
  setData: db.prepare(`
    INSERT INTO user_data (user_id, key, value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `),
  getAllData: db.prepare('SELECT key, value FROM user_data WHERE user_id = ?'),
  deleteData: db.prepare('DELETE FROM user_data WHERE user_id = ? AND key = ?'),
};

module.exports = { db, stmts };
