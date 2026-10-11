-- S02-T02: bound the lifetime of opaque sessions and persist only CSRF hashes.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS csrf_hash TEXT;
