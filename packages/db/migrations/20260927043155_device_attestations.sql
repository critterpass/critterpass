-- device_attestations (docs/data-model.md §3.1, phase-9 F-029): one row per attested app install.
-- RLS class S (system-only) — no app_user policy at all, so app_user cannot see or write any row
-- regardless of grants; app_system is the sole reader/writer (services/api/src/abuse/attestation/).

CREATE TABLE device_attestations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  install_id uuid NOT NULL UNIQUE,
  platform text NOT NULL,
  key_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter integer NOT NULL DEFAULT 0,
  attested_at timestamptz NOT NULL DEFAULT now(),
  last_assertion_at timestamptz,
  verdict text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE device_attestations ADD CONSTRAINT device_attestations_platform_check CHECK (platform IN ('ios', 'android'));
CREATE TRIGGER device_attestations_touch_updated_at BEFORE UPDATE ON device_attestations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE device_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_attestations FORCE ROW LEVEL SECURITY;

-- Same convention as cmd_log/domain_events/rt_outbox (packages/db/migrations/*_command_and_event_
-- log.sql): app_system gets its own permissive policy rather than inheriting app_user's row scoping
-- (there is none to inherit — app_user has no policy on this table at all).
CREATE POLICY device_attestations_system ON device_attestations FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON device_attestations TO app_system;

-- No publication entry: unpublished by omission (never added to the powersync allow-list), matching
-- docs/data-model.md §3.1 "all RLS X/S, not published".
