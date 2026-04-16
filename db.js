const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "barber.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    service TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(date, time)
  )
`);

try {
  db.exec("ALTER TABLE bookings ADD COLUMN status TEXT DEFAULT 'Confirme'");
} catch {
  // Column already exists.
}

module.exports = db;
