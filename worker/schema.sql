-- worker/schema.sql — database tables for the blog and testimonials (Cloudflare D1).
-- Run once:  npx wrangler d1 execute vrlss --remote --file=worker/schema.sql
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 5,
  text TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS t_ip ON testimonials (ip_hash, created_at);
CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS la_ip ON login_attempts (ip_hash, at);
