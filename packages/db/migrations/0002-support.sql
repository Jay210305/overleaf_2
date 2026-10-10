-- S01-T09 Support and Collaboration SQL Migration

-- CRDT Updates
CREATE TABLE IF NOT EXISTS crdt_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES text_documents(file_id) ON DELETE CASCADE,
  seq BIGINT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload_bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crdt_updates_file_seq_key UNIQUE (file_id, seq),
  CONSTRAINT crdt_updates_seq_check CHECK (seq >= 0)
);

-- CRDT Snapshots
CREATE TABLE IF NOT EXISTS crdt_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES text_documents(file_id) ON DELETE CASCADE,
  upto_seq BIGINT NOT NULL,
  state_bytes BYTEA,
  blob_key TEXT,
  content_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crdt_snapshots_file_upto_seq_key UNIQUE (file_id, upto_seq),
  CONSTRAINT crdt_snapshots_upto_seq_check CHECK (upto_seq >= 0),
  CONSTRAINT crdt_snapshots_storage_check CHECK (
    (state_bytes IS NOT NULL AND blob_key IS NULL) OR
    (state_bytes IS NULL AND blob_key IS NOT NULL)
  )
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES project_nodes(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  anchor_start_json JSONB NOT NULL,
  anchor_end_json JSONB NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT comments_same_project_file_fk FOREIGN KEY (project_id, file_id)
    REFERENCES project_nodes(project_id, id) ON DELETE CASCADE,
  CONSTRAINT comments_status_check CHECK (status IN ('open', 'resolved', 'detached'))
);

CREATE INDEX IF NOT EXISTS comments_project_file_idx ON comments (project_id, file_id);

-- Comment Replies
CREATE TABLE IF NOT EXISTS comment_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS comment_replies_comment_time_idx ON comment_replies (comment_id, created_at);

-- Suggestions
CREATE TABLE IF NOT EXISTS suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES project_nodes(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  base_revision TEXT NOT NULL,
  anchor_json JSONB NOT NULL,
  old_text_hash TEXT NOT NULL,
  new_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_by TEXT,
  CONSTRAINT suggestions_same_project_file_fk FOREIGN KEY (project_id, file_id)
    REFERENCES project_nodes(project_id, id) ON DELETE CASCADE,
  CONSTRAINT suggestions_status_check CHECK (status IN ('pending', 'accepted', 'rejected', 'conflict'))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comments_same_project_file_fk'
  ) THEN
    ALTER TABLE comments
      ADD CONSTRAINT comments_same_project_file_fk
      FOREIGN KEY (project_id, file_id)
      REFERENCES project_nodes(project_id, id)
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suggestions_same_project_file_fk'
  ) THEN
    ALTER TABLE suggestions
      ADD CONSTRAINT suggestions_same_project_file_fk
      FOREIGN KEY (project_id, file_id)
      REFERENCES project_nodes(project_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS suggestions_project_file_status_idx ON suggestions (project_id, file_id, status);

-- Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS chat_messages_project_time_idx ON chat_messages (project_id, created_at);

-- External Connections
CREATE TABLE IF NOT EXISTS external_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  encrypted_credential_ref TEXT NOT NULL,
  scopes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Project Integrations
CREATE TABLE IF NOT EXISTS project_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES external_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  remote_ref TEXT NOT NULL,
  branch TEXT,
  last_synced_revision TEXT,
  sync_cursor TEXT,
  CONSTRAINT project_integrations_project_provider_remote_key UNIQUE (project_id, provider, remote_ref)
);

-- Templates
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  source_manifest_key TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  version TEXT NOT NULL DEFAULT '1.0.0'
);

-- Audit Events
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  metadata_redacted JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_events_project_time_idx ON audit_events (project_id, occurred_at);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_time_idx ON notifications (user_id, created_at);

-- Usage Quotas
CREATE TABLE IF NOT EXISTS usage_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  metric TEXT NOT NULL,
  max_value BIGINT NOT NULL,
  "window" TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT usage_quotas_subject_metric_window_key UNIQUE (subject_type, subject_id, metric, "window"),
  CONSTRAINT usage_quotas_max_value_check CHECK (max_value >= 0)
);

-- Feature Flags
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  scope TEXT NOT NULL DEFAULT 'global',
  configuration_json JSONB NOT NULL DEFAULT '{}'::jsonb
);
