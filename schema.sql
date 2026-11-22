PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, login TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('student','staff')), name TEXT NOT NULL,
 faculty TEXT NOT NULL, program TEXT NOT NULL, year INTEGER, "group" TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
 token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL,
 ai_enabled INTEGER NOT NULL DEFAULT 0, ai_version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS lessons (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
 date TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, subject TEXT NOT NULL,
 teacher TEXT NOT NULL, room TEXT NOT NULL, kind TEXT NOT NULL,
 old_date TEXT, old_start TEXT, old_room TEXT, changed_at TEXT
);
CREATE TABLE IF NOT EXISTS grades (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
 subject TEXT NOT NULL, grade TEXT, kind TEXT NOT NULL, status TEXT NOT NULL, due TEXT
);
CREATE TABLE IF NOT EXISTS items (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN ('note','task')), text TEXT NOT NULL,
 lesson_id INTEGER REFERENCES lessons(id), subject TEXT, due TEXT, done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS requests (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 assigned_to INTEGER NOT NULL REFERENCES users(id), type TEXT NOT NULL, subject TEXT NOT NULL,
 body TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES requests(id),
 author_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS history (
 id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES requests(id),
 status TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
 title TEXT NOT NULL, body TEXT NOT NULL, lesson_id INTEGER REFERENCES lessons(id),
 request_id INTEGER REFERENCES requests(id), read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_proposals (
 id TEXT PRIMARY KEY, session_token TEXT NOT NULL REFERENCES sessions(token) ON DELETE CASCADE,
 payload TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS item_reminders (
 item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
 notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS items_owner ON items(user_id);
CREATE INDEX IF NOT EXISTS requests_owner ON requests(user_id);
CREATE INDEX IF NOT EXISTS requests_assignee ON requests(assigned_to);
CREATE INDEX IF NOT EXISTS notifications_owner ON notifications(user_id);
CREATE INDEX IF NOT EXISTS messages_request ON messages(request_id);
CREATE INDEX IF NOT EXISTS history_request ON history(request_id);
