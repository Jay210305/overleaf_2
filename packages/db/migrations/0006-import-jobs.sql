-- S05-T03: a validated archive is staged as one durable import job before
-- any project state exists. S05-T12 reserves the row and copies verified
-- bytes to the server-only archive key; the worker claims and validates;
-- S05-T10 later applies validated jobs to canonical project state.
CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key_hash TEXT NOT NULL CHECK (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  archive_sha256 TEXT NOT NULL CHECK (archive_sha256 ~ '^[a-f0-9]{64}$'),
  archive_size BIGINT NOT NULL CHECK (archive_size > 0 AND archive_size <= 209715200),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  archive_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'staging'
    CHECK (status IN ('staging', 'queued', 'validating', 'validated', 'failed', 'succeeded')),
  lease_expires_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  manifest JSONB,
  manifest_version INTEGER CHECK (manifest_version IS NULL OR manifest_version >= 1),
  error_code TEXT
    CHECK (error_code IS NULL OR error_code IN ('UNSAFE_PATH', 'LIMIT_EXCEEDED', 'INVALID_ARCHIVE')),
  archive_swept BOOLEAN NOT NULL DEFAULT FALSE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT import_jobs_actor_key_uidx UNIQUE (actor_id, idempotency_key_hash),
  CONSTRAINT import_jobs_archive_scope CHECK (archive_key LIKE 'imports/%/jobs/%/source.zip'),
  CONSTRAINT import_jobs_validated_pair CHECK (
    (status <> 'validated' AND manifest IS NULL AND manifest_version IS NULL) OR
    (status = 'validated' AND manifest IS NOT NULL AND manifest_version IS NOT NULL)
  ),
  CONSTRAINT import_jobs_failed_pair CHECK (
    (status <> 'failed' AND error_code IS NULL) OR
    (status = 'failed' AND error_code IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS import_jobs_claim_idx
  ON import_jobs (status, lease_expires_at, created_at)
  WHERE status IN ('queued', 'validating');

-- Correct databases where this migration was already applied before the
-- sweep flag existed: add the column with a safe default and drop the
-- superseded failed-only index before creating the sweep index.
ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS archive_swept BOOLEAN NOT NULL DEFAULT FALSE;
DROP INDEX IF EXISTS import_jobs_failed_idx;

CREATE INDEX IF NOT EXISTS import_jobs_sweep_idx
  ON import_jobs (created_at)
  WHERE status = 'failed' AND archive_swept = FALSE;

ALTER TABLE import_jobs
  DROP CONSTRAINT IF EXISTS import_jobs_archive_size_check;
ALTER TABLE import_jobs
  ADD CONSTRAINT import_jobs_archive_size_check
  CHECK (archive_size > 0 AND archive_size <= 209715200);
