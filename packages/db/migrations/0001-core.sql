-- S01-T02 Core SQL Migration

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT NOT NULL,
  password_hash TEXT,
  display_name TEXT NOT NULL,
  avatar_key TEXT,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disabled_at TIMESTAMPTZ,
  CONSTRAINT users_email_normalized_key UNIQUE (email_normalized)
);

-- User Preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  theme TEXT NOT NULL DEFAULT 'system',
  editor_settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  notification_settings_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  device_label TEXT NOT NULL,
  CONSTRAINT sessions_token_hash_key UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS sessions_user_expires_idx ON sessions (user_id, expires_at);

-- Auth Identities
CREATE TABLE IF NOT EXISTS auth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  CONSTRAINT auth_identities_provider_subject_key UNIQUE (provider, provider_subject)
);

-- Verification Tokens
CREATE TABLE IF NOT EXISTS verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  CONSTRAINT verification_tokens_token_hash_key UNIQUE (token_hash)
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  main_file_id UUID,
  compiler TEXT NOT NULL DEFAULT 'pdflatex',
  texlive_image_version TEXT NOT NULL DEFAULT '2024.1',
  status TEXT NOT NULL DEFAULT 'active',
  current_revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT projects_compiler_check CHECK (compiler IN ('pdflatex', 'xelatex', 'lualatex', 'latex')),
  CONSTRAINT projects_status_check CHECK (status IN ('active', 'archived', 'trashed')),
  CONSTRAINT projects_current_revision_check CHECK (current_revision >= 0)
);

CREATE INDEX IF NOT EXISTS projects_owner_status_idx ON projects (owner_id, status);
CREATE INDEX IF NOT EXISTS projects_updated_at_idx ON projects (updated_at);

-- Project Members
CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (project_id, user_id),
  CONSTRAINT project_members_role_check CHECK (role IN ('OWNER', 'EDITOR', 'REVIEWER', 'VIEWER'))
);

-- Project Invitations
CREATE TABLE IF NOT EXISTS project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email_normalized TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  invited_by TEXT NOT NULL,
  CONSTRAINT project_invitations_token_hash_key UNIQUE (token_hash),
  CONSTRAINT project_invitations_role_check CHECK (role IN ('OWNER', 'EDITOR', 'REVIEWER', 'VIEWER'))
);

-- Share Links
CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  max_uses BIGINT,
  use_count BIGINT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT share_links_token_hash_key UNIQUE (token_hash),
  CONSTRAINT share_links_role_check CHECK (role IN ('OWNER', 'EDITOR', 'REVIEWER', 'VIEWER')),
  CONSTRAINT share_links_use_count_check CHECK (use_count >= 0),
  CONSTRAINT share_links_max_uses_check CHECK (max_uses IS NULL OR max_uses >= 0)
);

-- Project Nodes
CREATE TABLE IF NOT EXISTS project_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  content_kind TEXT NOT NULL,
  blob_key TEXT,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT project_nodes_project_id_id_key UNIQUE (project_id, id),
  CONSTRAINT project_nodes_same_project_parent_fk FOREIGN KEY (project_id, parent_id)
    REFERENCES project_nodes(project_id, id) ON DELETE CASCADE,
  CONSTRAINT project_nodes_kind_check CHECK (kind IN ('FILE', 'FOLDER')),
  CONSTRAINT project_nodes_content_kind_check CHECK (content_kind IN ('TEXT', 'BINARY')),
  CONSTRAINT project_nodes_size_bytes_check CHECK (size_bytes >= 0)
);

-- Active root name uniqueness (parent_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS project_nodes_active_root_unique_idx
  ON project_nodes (project_id, name)
  WHERE parent_id IS NULL AND deleted_at IS NULL;

-- Active sibling name uniqueness (parent_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS project_nodes_active_sibling_unique_idx
  ON project_nodes (project_id, parent_id, name)
  WHERE parent_id IS NOT NULL AND deleted_at IS NULL;

-- Same-project active main file FK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_same_project_main_file_fk'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_same_project_main_file_fk
      FOREIGN KEY (id, main_file_id)
      REFERENCES project_nodes(project_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Project Tags
CREATE TABLE IF NOT EXISTS project_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  CONSTRAINT project_tags_user_name_key UNIQUE (user_id, name)
);

-- Project Tag Links
CREATE TABLE IF NOT EXISTS project_tag_links (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES project_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

-- Text Documents
CREATE TABLE IF NOT EXISTS text_documents (
  file_id UUID PRIMARY KEY REFERENCES project_nodes(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  latest_snapshot_id UUID,
  last_persisted_seq BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT text_documents_same_project_file_fk FOREIGN KEY (project_id, file_id)
    REFERENCES project_nodes(project_id, id) ON DELETE CASCADE,
  CONSTRAINT text_documents_last_persisted_seq_check CHECK (last_persisted_seq >= 0)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'text_documents_same_project_file_fk'
  ) THEN
    ALTER TABLE text_documents
      ADD CONSTRAINT text_documents_same_project_file_fk
      FOREIGN KEY (project_id, file_id)
      REFERENCES project_nodes(project_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Project Revisions
CREATE TABLE IF NOT EXISTS project_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision_no BIGINT NOT NULL,
  manifest_key TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  label TEXT,
  CONSTRAINT project_revisions_project_revision_no_key UNIQUE (project_id, revision_no),
  CONSTRAINT project_revisions_revision_no_check CHECK (revision_no >= 0)
);

-- Revision Items
CREATE TABLE IF NOT EXISTS revision_items (
  revision_id UUID NOT NULL REFERENCES project_revisions(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES project_nodes(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  blob_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (revision_id, path)
);

-- Compile Jobs
CREATE TABLE IF NOT EXISTS compile_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL,
  source_revision_id UUID NOT NULL REFERENCES project_revisions(id) ON DELETE RESTRICT,
  engine TEXT NOT NULL,
  options_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  queue_id UUID,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_code TEXT,
  artifact_set_id UUID
);

CREATE INDEX IF NOT EXISTS compile_jobs_project_time_idx ON compile_jobs (project_id, started_at);

-- Artifact Sets
CREATE TABLE IF NOT EXISTS artifact_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compile_job_id UUID NOT NULL UNIQUE REFERENCES compile_jobs(id) ON DELETE CASCADE,
  pdf_key TEXT,
  log_key TEXT,
  synctex_key TEXT,
  aux_manifest_key TEXT,
  source_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
