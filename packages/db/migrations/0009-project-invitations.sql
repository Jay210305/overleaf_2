-- S08-T01: one-use, deliverable project invitations with revocation and rejection.
ALTER TABLE project_invitations
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

ALTER TABLE project_invitations DROP CONSTRAINT IF EXISTS project_invitations_role_check;
ALTER TABLE project_invitations ADD CONSTRAINT project_invitations_role_check
  CHECK (role IN ('EDITOR', 'REVIEWER', 'VIEWER'));

CREATE UNIQUE INDEX IF NOT EXISTS project_invitations_pending_email_uidx
  ON project_invitations (project_id, email_normalized)
  WHERE accepted_at IS NULL AND rejected_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS project_invitations_project_created_idx
  ON project_invitations (project_id, created_at DESC, id DESC);
