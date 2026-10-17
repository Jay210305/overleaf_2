CREATE TABLE IF NOT EXISTS github_sync_requests (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  request_hash char(64) NOT NULL,
  result_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, actor_id, idempotency_key)
);
