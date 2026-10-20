-- S05-T01: a signed PUT only creates a private staging object. A verified
-- completion consumes this durable intent before adding a project node.
CREATE TABLE IF NOT EXISTS pending_uploads (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  content_kind TEXT NOT NULL CHECK (content_kind IN ('TEXT', 'BINARY')),
  expected_size BIGINT NOT NULL CHECK (expected_size > 0 AND expected_size <= 104857600),
  expected_sha256 TEXT NOT NULL CHECK (expected_sha256 ~ '^[a-f0-9]{64}$'),
  staging_key TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_node_id UUID REFERENCES project_nodes(id) ON DELETE CASCADE,
  completed_key_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pending_upload_completion_pair CHECK (
    (completed_node_id IS NULL AND completed_key_hash IS NULL) OR
    (completed_node_id IS NOT NULL AND completed_key_hash IS NOT NULL)
  ),
  CONSTRAINT pending_upload_key_scope CHECK (staging_key LIKE 'projects/%/uploads/%')
);

-- Correct the earlier local draft of this migration when it was already
-- applied during development: SET NULL conflicts with the completion pair.
ALTER TABLE pending_uploads
  DROP CONSTRAINT IF EXISTS pending_uploads_completed_node_id_fkey;
ALTER TABLE pending_uploads
  ADD CONSTRAINT pending_uploads_completed_node_id_fkey
  FOREIGN KEY (completed_node_id) REFERENCES project_nodes(id) ON DELETE CASCADE;

ALTER TABLE pending_uploads
  DROP CONSTRAINT IF EXISTS pending_uploads_expected_size_check;
ALTER TABLE pending_uploads
  ADD CONSTRAINT pending_uploads_expected_size_check
  CHECK (expected_size > 0 AND expected_size <= 104857600);

CREATE INDEX IF NOT EXISTS pending_uploads_project_expiry_idx
  ON pending_uploads (project_id, expires_at)
  WHERE completed_node_id IS NULL;
