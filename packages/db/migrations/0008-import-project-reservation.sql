-- S05-T10: reserve a stable project UUID before writing imported binary
-- objects. A failed pre-commit apply can retry the same deterministic keys.
ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS pending_project_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS import_jobs_pending_project_uidx
  ON import_jobs (pending_project_id)
  WHERE pending_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS import_jobs_apply_idx
  ON import_jobs (created_at)
  WHERE status = 'validated';

CREATE INDEX IF NOT EXISTS import_jobs_success_retention_idx
  ON import_jobs (updated_at)
  WHERE status = 'succeeded' AND archive_swept = FALSE;

-- Keep the validated manifest for the successfully applied job. Earlier
-- status pairing allowed it only while status = 'validated'.
ALTER TABLE import_jobs
  DROP CONSTRAINT IF EXISTS import_jobs_validated_pair;
ALTER TABLE import_jobs
  ADD CONSTRAINT import_jobs_validated_pair CHECK (
    (status NOT IN ('validated', 'succeeded') AND manifest IS NULL AND manifest_version IS NULL) OR
    (status IN ('validated', 'succeeded') AND manifest IS NOT NULL AND manifest_version IS NOT NULL)
  );
