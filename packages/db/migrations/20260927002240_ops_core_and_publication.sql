-- Ops-schema tables, the client-safe config projection, and the PowerSync publication allow-list
-- (docs/data-model.md §1 Conventions, §3.14, §3.16).

-- Schema-level USAGE is a prerequisite Postgres checks before any table grant inside it: app_system
-- stands in for the not-yet-built admin console (same convention as the table-level grants below).
GRANT USAGE ON SCHEMA ops TO app_system;

CREATE TABLE ops.admin_audit (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  admin_id uuid,
  action text NOT NULL,
  target_kind text NOT NULL,
  target_id uuid,
  reason text,
  at timestamptz NOT NULL DEFAULT now(),
  ip_hash text
);
ALTER TABLE ops.admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.admin_audit FORCE ROW LEVEL SECURITY;
-- RLS class S: back-office audit trail, no app_user grant at all. app_system stands in for the
-- admin console's own writer until a dedicated admin role/route exists (no console ships yet).
CREATE POLICY admin_audit_system ON ops.admin_audit FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON ops.admin_audit TO app_system;

CREATE TABLE ops.ops_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER ops_config_touch_updated_at BEFORE UPDATE ON ops.ops_config
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE ops.ops_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.ops_config FORCE ROW LEVEL SECURITY;
-- Authz "adm": no app_user grant at all; app_system stands in until an admin console exists (same
-- convention T4 used for the destinations/guides catalogue). Only the is_public subset is ever
-- client-visible, and only through client_config below.
CREATE POLICY ops_config_system ON ops.ops_config FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.ops_config TO app_system;

-- client_config: the public projection of ops_config's is_public rows (docs/data-model.md §3.14).
-- A real table, not a view: only base tables can enter a logical-replication publication
-- (docs/code-standards.md §13), and this table is what the PowerSync `catalog` stream carries.
-- app.sync_client_config (below) keeps it mirrored so a non-public config key can never leak
-- through it even if a future change to ops_config itself is written carelessly.
CREATE TABLE client_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE client_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_config FORCE ROW LEVEL SECURITY;
-- RLS "R": read-all authenticated, no app_user write.
CREATE POLICY client_config_select ON client_config FOR SELECT TO app_user USING (true);
CREATE POLICY client_config_system ON client_config FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON client_config TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON client_config TO app_system;

CREATE OR REPLACE FUNCTION app.sync_client_config() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM client_config WHERE key = OLD.key;
    RETURN OLD;
  END IF;

  IF NEW.is_public THEN
    INSERT INTO client_config (key, value) VALUES (NEW.key, NEW.value)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  ELSE
    DELETE FROM client_config WHERE key = NEW.key;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.sync_client_config() FROM PUBLIC;

CREATE TRIGGER ops_config_sync_client_config
  AFTER INSERT OR UPDATE OR DELETE ON ops.ops_config
  FOR EACH ROW EXECUTE FUNCTION app.sync_client_config();

-- cmd_results is the one per-command bookkeeping table an owner may read directly (RLS class O,
-- added by the command_and_event_log migration); data-model.md §3.18 and this phase's RLS-summary
-- table both put it on the `me` stream, unlike cmd_log/rt_outbox/domain_events (RLS class S, never
-- published). Recorded here, in the migration that owns the publication, rather than re-opening an
-- already-applied migration (docs/code-standards.md §13 forward-only rule).
COMMENT ON TABLE cmd_results IS 'RLS class O (owner read-only): published on the me stream, unlike cmd_log/rt_outbox/domain_events.';

-- PowerSync publication allow-list: every C0-C2 table whose RLS shape actually lets app_user read
-- it (packages/db/src/publication.ts#computePublicationAllowList is the source of truth this list
-- is hand-copied from; packages/db/test/publication.test.ts cross-checks the two never drift).
-- Idempotent and order-independent per table: a guarded ADD TABLE per name, never SET TABLE or
-- drop-and-recreate (docs/code-standards.md §13).
DO $$
DECLARE
  allow_listed text[] := ARRAY[
    'activity_events', 'change_sets', 'client_config', 'cmd_results', 'consents',
    'crew_members', 'crews', 'destinations', 'guide_actions', 'guides',
    'itinerary_versions', 'plan_days', 'plan_items', 'trip_participants', 'trips',
    'user_settings', 'users'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY allow_listed LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
    -- GRANT is itself idempotent (re-granting an already-held privilege is a no-op).
    EXECUTE format('GRANT SELECT ON %I TO powersync_repl', t);
  END LOOP;
END
$$;

-- guide_reader has no grant on the public schema at all (only llm.* views, arriving in phase 13);
-- no statement here grants it one. ops.* stays off the publication and off every non-system grant.
