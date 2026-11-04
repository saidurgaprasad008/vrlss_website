-- Adds scheduled publishing to the posts table. Run once (already-created databases only):
--   npx wrangler d1 execute vrlss --remote --file=worker/migrate-001-schedule.sql
ALTER TABLE posts ADD COLUMN publish_at TEXT NOT NULL DEFAULT '';
UPDATE posts SET publish_at = created_at WHERE publish_at = '';
CREATE INDEX IF NOT EXISTS p_live ON posts (published, publish_at);
