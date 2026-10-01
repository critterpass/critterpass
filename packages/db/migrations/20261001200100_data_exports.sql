-- data_exports (docs/data-model.md §3.17): one row per "Download my data" request, built by the
-- `export.build` job into `exports/{uid}/{id}.zip` and fetched through a signed link that lapses
-- after seven days. RLS class O read / S write: the owner reads its own rows (stream `me`), only
-- the api's system step and the worker write. Privacy class C2 (a status and an object key).
CREATE TABLE data_exports (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'building', 'ready', 'expired', 'failed')),
  r2_key text CHECK (r2_key IS NULL OR r2_key ~ '^exports/[0-9a-f-]{36}/[0-9a-f-]{36}\.zip$'),
  bytes bigint CHECK (bytes IS NULL OR bytes >= 0),
  -- 0–100 while building; the app also listens on `user:#uid` for `job.progress`.
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error_code text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'ready') = (r2_key IS NOT NULL AND expires_at IS NOT NULL AND ready_at IS NOT NULL)
    OR status = 'expired')
);
-- At most one export in flight per user.
CREATE UNIQUE INDEX data_exports_one_active_key ON data_exports (user_id)
  WHERE status IN ('queued', 'building');
CREATE INDEX data_exports_user_requested_idx ON data_exports (user_id, requested_at DESC);
CREATE INDEX data_exports_expiring_idx ON data_exports (expires_at) WHERE status = 'ready';
CREATE TRIGGER data_exports_touch_updated_at BEFORE UPDATE ON data_exports
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE data_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_exports FORCE ROW LEVEL SECURITY;
CREATE POLICY data_exports_owner_read ON data_exports FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY data_exports_system ON data_exports FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON data_exports TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON data_exports TO app_system;
GRANT SELECT (bytes, created_at, error_code, expires_at, id, progress, r2_key, ready_at,
  requested_at, status, updated_at, user_id) ON data_exports TO admin_reader;
CREATE POLICY data_exports_admin_reader ON data_exports FOR SELECT TO admin_reader USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'data_exports'
  ) THEN
    EXECUTE 'ALTER PUBLICATION powersync ADD TABLE data_exports';
  END IF;
  GRANT SELECT ON data_exports TO powersync_repl;
END
$$;
