-- D1 migration to backfill reveal workflow schema changes.
PRAGMA foreign_keys = ON;

-- Sessions table gained state management helpers for the reveal flow.
ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE sessions ADD COLUMN current_state TEXT;
ALTER TABLE sessions ADD COLUMN ended_at TEXT;

-- Reveals now track who triggered a reveal and when it was hidden again.
ALTER TABLE reveals ADD COLUMN actor_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE reveals ADD COLUMN hidden_at TEXT;

-- Session-specific marker overrides store additional presentation metadata.
ALTER TABLE session_markers ADD COLUMN marker_id TEXT REFERENCES markers(id) ON DELETE SET NULL;
ALTER TABLE session_markers ADD COLUMN label TEXT;
ALTER TABLE session_markers ADD COLUMN x REAL NOT NULL DEFAULT 0;
ALTER TABLE session_markers ADD COLUMN y REAL NOT NULL DEFAULT 0;
ALTER TABLE session_markers ADD COLUMN color TEXT;
ALTER TABLE session_markers ADD COLUMN icon_key TEXT;
ALTER TABLE session_markers ADD COLUMN metadata TEXT;
ALTER TABLE session_markers ADD COLUMN created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
ALTER TABLE session_markers ADD COLUMN updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Supporting indexes for reveal workflow lookups.
CREATE INDEX IF NOT EXISTS idx_sessions_campaign ON sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_reveals_session ON reveals(session_id);
CREATE INDEX IF NOT EXISTS idx_session_markers_session ON session_markers(session_id);
