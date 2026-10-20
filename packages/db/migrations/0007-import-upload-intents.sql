-- S05-T12: a signed ZIP PUT only creates a private actor-scoped staging
-- object. A verified completion consumes this durable intent, reserves one
-- S05-T03 import job, and copies the bytes to the server-only archive key.
-- Expired staging objects are removed by cleanup after URL expiry; the
-- server-only job archive is owned by the import worker, never by cleanup.
CREATE TABLE IF NOT EXISTS import_upload_intents (
  id UUID PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expected_size BIGINT NOT NULL CHECK (expected_size > 0 AND expected_size <= 209715200),
  expected_sha256 TEXT NOT NULL CHECK (expected_sha256 ~ '^[a-f0-9]{64}$'),
  staging_key TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_job_id UUID REFERENCES import_jobs(id) ON DELETE SET NULL,
  completed_key_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT import_upload_completion_pair CHECK (
    (completed_job_id IS NULL AND completed_key_hash IS NULL) OR
    (completed_job_id IS NOT NULL AND completed_key_hash IS NOT NULL)
  ),
  CONSTRAINT import_upload_key_scope CHECK (staging_key LIKE 'imports/%/uploads/%')
);

ALTER TABLE import_upload_intents
  DROP CONSTRAINT IF EXISTS import_upload_intents_expected_size_check;
ALTER TABLE import_upload_intents
  ADD CONSTRAINT import_upload_intents_expected_size_check
  CHECK (expected_size > 0 AND expected_size <= 209715200);

CREATE INDEX IF NOT EXISTS import_upload_intents_actor_expiry_idx
  ON import_upload_intents (actor_id, expires_at)
  WHERE completed_job_id IS NULL;
