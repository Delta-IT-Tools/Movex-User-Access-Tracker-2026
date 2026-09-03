-- Run this once, after schema.sql, only if you want to start
-- with this exact list instead of an empty tracker:
--   npx wrangler d1 execute manager-approval-tracker-db --remote --file=./seed.sql
--
-- If you'd rather start empty and add people yourself via the "Add a
-- manager" box in the tool, just skip this file.

INSERT OR IGNORE INTO managers (name, sent, sent_date) VALUES
  ('James Choi', 1, date('now')),
  ('Jiaqi Chen', 1, date('now')),
  ('Alice Hess', 1, date('now')),
  ('Diane Robinson', 1, date('now')),
  ('Katerina Suh', 1, date('now')),
  ('Ajit Patel', 1, date('now')),
  ('Paula Serafin', 1, date('now')),
  ('Dawn Flanders', 1, date('now')),
  ('Wayne Rooks', 1, date('now'));
