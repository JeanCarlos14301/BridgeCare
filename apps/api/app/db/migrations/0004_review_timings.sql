-- B-11: Review time measurement. Record when a reviewer first opens the current revision,
-- and the elapsed review duration (in milliseconds) once the decision is saved.

ALTER TABLE reviews ADD COLUMN opened_at TEXT;
ALTER TABLE reviews ADD COLUMN duration_ms REAL;

CREATE TABLE IF NOT EXISTS review_timers (
    revision_id TEXT PRIMARY KEY REFERENCES revisions (id) ON DELETE CASCADE,
    opened_at TEXT NOT NULL
);
