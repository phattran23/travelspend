-- D1 schema for TravelSpend. Apply with: npx wrangler d1 execute travelspend --remote --file=worker/schema.sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, destination TEXT NOT NULL DEFAULT '', budget INTEGER NOT NULL DEFAULT 0,
  start_date TEXT, end_date TEXT, cat_budgets TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS travelers (
  id INTEGER PRIMARY KEY, trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY, trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL, category TEXT NOT NULL, date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '', paid_by INTEGER NOT NULL REFERENCES travelers(id),
  receipt_file TEXT, receipt_name TEXT, receipt_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS expense_splits (
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  traveler_id INTEGER NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
  PRIMARY KEY (expense_id, traveler_id));
CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id);
CREATE INDEX IF NOT EXISTS idx_exp_trip ON expenses(trip_id);
