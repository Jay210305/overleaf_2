-- S05/S12: increase upload limits to 100 MiB per file and 200 MiB per ZIP archive.
ALTER TABLE pending_uploads
  DROP CONSTRAINT IF EXISTS pending_uploads_expected_size_check;
ALTER TABLE pending_uploads
  ADD CONSTRAINT pending_uploads_expected_size_check
  CHECK (expected_size > 0 AND expected_size <= 104857600);

ALTER TABLE import_jobs
  DROP CONSTRAINT IF EXISTS import_jobs_archive_size_check;
ALTER TABLE import_jobs
  ADD CONSTRAINT import_jobs_archive_size_check
  CHECK (archive_size > 0 AND archive_size <= 209715200);

ALTER TABLE import_upload_intents
  DROP CONSTRAINT IF EXISTS import_upload_intents_expected_size_check;
ALTER TABLE import_upload_intents
  ADD CONSTRAINT import_upload_intents_expected_size_check
  CHECK (expected_size > 0 AND expected_size <= 209715200);
