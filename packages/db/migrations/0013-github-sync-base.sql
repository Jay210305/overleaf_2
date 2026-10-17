-- S12-T03: record the last agreed local/remote file state for a linked GitHub
-- integration so later pulls can classify changes three-way instead of
-- conservatively. Null means no agreement has been recorded yet.
ALTER TABLE project_integrations
  ADD COLUMN IF NOT EXISTS sync_base_manifest jsonb;
