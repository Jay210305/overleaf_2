-- New revisions carry their own file metadata and canonical text bytes.
-- Historical rows remain nullable: they cannot safely be used for Git sync.
ALTER TABLE revision_items
  ADD COLUMN IF NOT EXISTS content_kind text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS mime text,
  ADD COLUMN IF NOT EXISTS text_bytes bytea;

ALTER TABLE project_revisions ADD COLUMN IF NOT EXISTS manifest_json jsonb;

-- A deleted node must not erase the history that refers to it.
ALTER TABLE revision_items DROP CONSTRAINT IF EXISTS revision_items_node_id_fkey;
