CREATE TABLE IF NOT EXISTS revision_export_links (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES project_revisions(id) ON DELETE CASCADE,
  compile_job_id uuid REFERENCES compile_jobs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('source', 'pdf', 'log')),
  created_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revision_export_links_job_check CHECK (
    (kind = 'source' AND compile_job_id IS NULL) OR
    (kind IN ('pdf', 'log') AND compile_job_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS revision_export_links_expiry_idx ON revision_export_links (expires_at);
