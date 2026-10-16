-- S05-T10: reserve one project ID per validated job before any object
-- write or project row exists. The column carries no foreign key because
-- the referenced project is created later by the apply pass; a failed
-- pre-commit attempt must not claim that a project exists.
ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS pending_project_id UUID;
