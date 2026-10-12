-- Server-side sessions. The cookie carries a random token; only its keyed hash is stored.
-- Phase B tables reference sessions(id) to scope every case to the session that created it.
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('visitor', 'reviewer')),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX sessions_expires_at ON sessions (expires_at);
