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
    get: (username) => get('SELECT * FROM users WHERE username = ?', [username]),
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
};

module.exports = { initDb, stmts };
