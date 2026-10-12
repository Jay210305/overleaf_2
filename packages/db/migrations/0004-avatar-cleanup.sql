-- S02-T11 durable cleanup after an avatar reference is replaced.
CREATE TABLE IF NOT EXISTS avatar_cleanup_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Retain cleanup work when a later account-deletion flow removes the user row.
  user_id UUID NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  CONSTRAINT avatar_cleanup_key CHECK (object_key LIKE 'avatars/%')
);

-- Existing local fixtures may have created the earlier cascade version.
ALTER TABLE avatar_cleanup_jobs DROP CONSTRAINT IF EXISTS avatar_cleanup_jobs_user_id_fkey;

CREATE INDEX IF NOT EXISTS avatar_cleanup_pending_idx
  ON avatar_cleanup_jobs (scheduled_at, id) WHERE processed_at IS NULL;
