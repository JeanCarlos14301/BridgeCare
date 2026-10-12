-- Cases belong to the session that created them; deleting or expiring the session removes them.
CREATE TABLE cases (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    fixture_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('received', 'processing', 'needs_review', 'approved', 'rejected', 'failed')
    ),
    current_revision_id TEXT,
    failure_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX cases_session_id ON cases (session_id);

-- Revisions are immutable. content is canonical JSON; content_hash is its SHA-256.
CREATE TABLE revisions (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (case_id, number)
);

CREATE TABLE reviews (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
    revision_id TEXT NOT NULL REFERENCES revisions (id) ON DELETE CASCADE,
    content_hash TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
    resolution_note TEXT,
    reviewer_session_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX reviews_revision_id ON reviews (revision_id);
