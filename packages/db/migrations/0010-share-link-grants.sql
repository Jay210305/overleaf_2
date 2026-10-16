-- S08-T02: bounded share links and memberships that remain tied to the link.
ALTER TABLE share_links
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE share_links DROP CONSTRAINT IF EXISTS share_links_role_check;
ALTER TABLE share_links ADD CONSTRAINT share_links_role_check
  CHECK (role IN ('EDITOR', 'REVIEWER', 'VIEWER'));
ALTER TABLE share_links DROP CONSTRAINT IF EXISTS share_links_max_uses_check;
ALTER TABLE share_links ADD CONSTRAINT share_links_max_uses_check
  CHECK (max_uses IS NULL OR (max_uses BETWEEN 1 AND 10000 AND use_count <= max_uses));
ALTER TABLE share_links DROP CONSTRAINT IF EXISTS share_links_expiry_check;
ALTER TABLE share_links ADD CONSTRAINT share_links_expiry_check
  CHECK (expires_at IS NOT NULL AND expires_at > created_at);
CREATE INDEX IF NOT EXISTS share_links_project_created_idx
  ON share_links (project_id, created_at DESC, id DESC);

ALTER TABLE project_members
  ADD COLUMN IF NOT EXISTS source_share_link_id UUID REFERENCES share_links(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS project_members_source_share_link_idx
  ON project_members (source_share_link_id) WHERE source_share_link_id IS NOT NULL;
ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_link_role_check;
ALTER TABLE project_members ADD CONSTRAINT project_members_link_role_check
  CHECK (source_share_link_id IS NULL OR role IN ('EDITOR', 'REVIEWER', 'VIEWER'));

-- All authorization reads use this view so an expired/revoked link cannot
-- leave a previously redeemed membership active until a cleanup job runs.
CREATE OR REPLACE VIEW active_project_members AS
  SELECT pm.* FROM project_members pm
  LEFT JOIN share_links sl ON sl.id = pm.source_share_link_id
  WHERE pm.revoked_at IS NULL
    AND (pm.source_share_link_id IS NULL OR (
      sl.project_id = pm.project_id AND sl.role = pm.role
      AND sl.revoked_at IS NULL AND sl.expires_at > NOW()
    ));
