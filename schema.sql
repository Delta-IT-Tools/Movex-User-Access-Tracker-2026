-- Run once when setting up the database:
--   npx wrangler d1 execute manager-approval-tracker-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS managers (
  name TEXT PRIMARY KEY,
  sent INTEGER NOT NULL DEFAULT 0,
  sent_date TEXT,
  received INTEGER NOT NULL DEFAULT 0,
  received_date TEXT,
  auditors INTEGER NOT NULL DEFAULT 0,
  auditors_date TEXT,
  review_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
