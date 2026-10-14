-- S06-T01: Durable compile queue jobs with idempotency, status lifecycle,
-- lease-based worker claiming, and active compile quota enforcement.
ALTER TABLE compile_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key_hash TEXT,
  ADD COLUMN IF NOT EXISTS target_revision_id UUID REFERENCES project_revisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS force_clean BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pdf_available BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS compile_jobs_actor_key_uidx
  ON compile_jobs (requested_by, project_id, idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS compile_jobs_active_quota_idx
  ON compile_jobs (project_id, requested_by, status)
  WHERE status IN ('queued', 'running', 'cancel_requested');

CREATE INDEX IF NOT EXISTS compile_jobs_claim_idx
  ON compile_jobs (status, lease_expires_at, created_at)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS compile_jobs_project_created_idx
  ON compile_jobs (project_id, created_at DESC, id DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'compile_jobs_status_check'
  ) THEN
    ALTER TABLE compile_jobs
      ADD CONSTRAINT compile_jobs_status_check
      CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancel_requested', 'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'compile_jobs_engine_check'
  ) THEN
    ALTER TABLE compile_jobs
      ADD CONSTRAINT compile_jobs_engine_check
      CHECK (engine IN ('pdflatex', 'xelatex', 'lualatex', 'latex'));
  END IF;
END $$;
