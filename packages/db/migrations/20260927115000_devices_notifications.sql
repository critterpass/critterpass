-- Devices, push tokens and the notification router's tables (docs/data-model.md §3.11).
-- Every table here is RLS class O (owner rows only) with FORCE RLS; app_system writes on the
-- router's and the worker's behalf. No role gets DELETE except app_system, which needs it for merge
-- conflict resolution (packages/db/src/merge-rules.ts) and the retention purge.

-- devices: one row per app install. `id` is the install id the app generates once and keeps in its
-- keychain/keystore (the command envelope's `device.id`), so a reinstall is a new device and a
-- sign-in on the same install moves the existing row to the new uid.
CREATE TABLE devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id),
  platform text NOT NULL,
  os_version text,
  app_version text NOT NULL,
  locale text NOT NULL,
  tz text NOT NULL,
  permission_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  attribution jsonb,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  la_enabled boolean NOT NULL DEFAULT false,
  la_frequent boolean NOT NULL DEFAULT false,
  -- Last reported app state: the router holds "only if backgrounded" notifications while true.
  foreground boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE devices ADD CONSTRAINT devices_platform_check CHECK (platform IN ('ios', 'android'));
ALTER TABLE devices ADD CONSTRAINT devices_tz_check CHECK (app.valid_tz(tz));
CREATE INDEX devices_user_id_idx ON devices (user_id);
CREATE TRIGGER devices_touch_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices FORCE ROW LEVEL SECURITY;
CREATE POLICY devices_self ON devices FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY devices_system ON devices FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON devices TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON devices TO app_system;

-- push_tokens: the provider token(s) of one device. Unique per (kind, token): a token that shows up
-- on another device (reinstall, or another uid signing in) is moved there, which detaches it from
-- the previous owner. Readable by the device's owner; written only by app_system (register_device
-- runs its token upsert as app_system because the conflicting row may belong to another uid).
CREATE TABLE push_tokens (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  device_id uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  kind text NOT NULL,
  token text NOT NULL,
  env text NOT NULL,
  invalid_at timestamptz,
  invalid_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_kind_check CHECK (kind IN ('apns_alert', 'fcm'));
ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_env_check CHECK (env IN ('sandbox', 'prod'));
CREATE UNIQUE INDEX push_tokens_kind_token_key ON push_tokens (kind, token);
CREATE INDEX push_tokens_device_id_idx ON push_tokens (device_id);
CREATE TRIGGER push_tokens_touch_updated_at BEFORE UPDATE ON push_tokens
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY push_tokens_owner_read ON push_tokens FOR SELECT TO app_user
  USING (device_id IN (SELECT id FROM devices WHERE user_id = app.uid()));
CREATE POLICY push_tokens_system ON push_tokens FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON push_tokens TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_tokens TO app_system;

-- notifications: one row per (recipient, dedupe key), written by the router (`notify.route`).
-- `key` is the semantic catalogue key (packages/domain/src/notifications.ts); `class` is the
-- class the router resolved for this delivery (catalogue variants collapse to one of these).
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  crew_id uuid REFERENCES crews (id),
  trip_id uuid REFERENCES trips (id),
  event_id uuid,
  key text NOT NULL,
  category text NOT NULL,
  class text NOT NULL,
  sender jsonb NOT NULL,
  template_id text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  items jsonb,
  ctx jsonb,
  deep_link text,
  collapse_key text,
  thread_id text,
  dedupe_key text NOT NULL,
  is_private boolean NOT NULL DEFAULT false,
  needs_you boolean NOT NULL DEFAULT false,
  llm_generated boolean NOT NULL DEFAULT false,
  local_date date NOT NULL,
  not_before timestamptz,
  expires_at timestamptz,
  state text NOT NULL DEFAULT 'queued',
  drop_reason text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications ADD CONSTRAINT notifications_class_check
  CHECK (class IN ('always', 'budgeted', 'roundup_only', 'silent', 'local'));
ALTER TABLE notifications ADD CONSTRAINT notifications_state_check
  CHECK (state IN ('queued', 'sent', 'rolled_into_roundup', 'dropped', 'failed'));
CREATE UNIQUE INDEX notifications_user_dedupe_key ON notifications (user_id, dedupe_key);
CREATE INDEX notifications_state_not_before_idx ON notifications (state, not_before);
CREATE INDEX notifications_user_local_date_idx ON notifications (user_id, local_date);
CREATE INDEX notifications_crew_id_idx ON notifications (crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX notifications_trip_id_idx ON notifications (trip_id) WHERE trip_id IS NOT NULL;
CREATE TRIGGER notifications_touch_updated_at BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_owner_read ON notifications FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY notifications_system ON notifications FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON notifications TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO app_system;

-- notification_prefs: one row per user (defaults apply while it does not exist yet).
CREATE TABLE notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES users (id),
  budget_per_day integer NOT NULL DEFAULT 5,
  roundup_time time NOT NULL DEFAULT '20:00',
  roundup_tz text NOT NULL DEFAULT 'trip',
  quiet_from time NOT NULL DEFAULT '22:00',
  quiet_to time NOT NULL DEFAULT '07:00',
  guide_tips boolean NOT NULL DEFAULT true,
  money boolean NOT NULL DEFAULT true,
  critters_nearby boolean NOT NULL DEFAULT true,
  crew_chat_mode text NOT NULL DEFAULT 'all',
  leave_by_dnd boolean NOT NULL DEFAULT true,
  per_category jsonb NOT NULL DEFAULT '{}'::jsonb,
  voice_readout boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notification_prefs ADD CONSTRAINT notification_prefs_budget_check
  CHECK (budget_per_day BETWEEN 1 AND 10);
ALTER TABLE notification_prefs ADD CONSTRAINT notification_prefs_roundup_tz_check
  CHECK (roundup_tz IN ('trip', 'device'));
ALTER TABLE notification_prefs ADD CONSTRAINT notification_prefs_crew_chat_mode_check
  CHECK (crew_chat_mode IN ('all', 'mentions', 'off'));
CREATE TRIGGER notification_prefs_touch_updated_at BEFORE UPDATE ON notification_prefs
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_prefs FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_prefs_self ON notification_prefs FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY notification_prefs_system ON notification_prefs FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON notification_prefs TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_prefs TO app_system;

-- ping_ledger: what reached the user per local date. `sent_budgeted` is what the daily budget
-- counts; `queued` is overflow rolled into the roundup; `paywall_sent` feeds the paywall governor;
-- `sent_always`/`sent_local` record ALWAYS pushes and app-scheduled local notifications.
CREATE TABLE ping_ledger (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  local_date date NOT NULL,
  sent_budgeted integer NOT NULL DEFAULT 0,
  sent_always integer NOT NULL DEFAULT 0,
  sent_local integer NOT NULL DEFAULT 0,
  paywall_sent integer NOT NULL DEFAULT 0,
  queued integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ping_ledger_user_local_date_key ON ping_ledger (user_id, local_date);
CREATE TRIGGER ping_ledger_touch_updated_at BEFORE UPDATE ON ping_ledger
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE ping_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE ping_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY ping_ledger_owner_read ON ping_ledger FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY ping_ledger_system ON ping_ledger FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON ping_ledger TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ping_ledger TO app_system;

-- roundups: at most one evening roundup per user per local date.
CREATE TABLE roundups (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  local_date date NOT NULL,
  tz text NOT NULL,
  guide_id uuid REFERENCES guides (id),
  notification_ids uuid[] NOT NULL DEFAULT '{}',
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_at timestamptz,
  fallback_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE roundups ADD CONSTRAINT roundups_tz_check CHECK (app.valid_tz(tz));
CREATE UNIQUE INDEX roundups_user_local_date_key ON roundups (user_id, local_date);
CREATE TRIGGER roundups_touch_updated_at BEFORE UPDATE ON roundups
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE roundups ENABLE ROW LEVEL SECURITY;
ALTER TABLE roundups FORCE ROW LEVEL SECURITY;
CREATE POLICY roundups_owner_read ON roundups FOR SELECT TO app_user USING (user_id = app.uid());
CREATE POLICY roundups_system ON roundups FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON roundups TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON roundups TO app_system;

-- inbox_items: created by the system; the owner may only resolve (column grant).
CREATE TABLE inbox_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  crew_id uuid REFERENCES crews (id),
  trip_id uuid REFERENCES trips (id),
  notification_id uuid REFERENCES notifications (id),
  kind text NOT NULL,
  needs_you boolean NOT NULL DEFAULT false,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  deep_link text,
  expires_at timestamptz,
  undo_until timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inbox_items_user_resolved_idx ON inbox_items (user_id, resolved_at);
CREATE INDEX inbox_items_notification_id_idx ON inbox_items (notification_id)
  WHERE notification_id IS NOT NULL;
CREATE TRIGGER inbox_items_touch_updated_at BEFORE UPDATE ON inbox_items
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_items FORCE ROW LEVEL SECURITY;
CREATE POLICY inbox_items_self ON inbox_items FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY inbox_items_system ON inbox_items FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON inbox_items TO app_user;
GRANT UPDATE (resolved_at) ON inbox_items TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON inbox_items TO app_system;

-- scheduled_deliveries: user-requested later sends ("resend at 9", "ask me later", nudges). The
-- wall-clock request is kept (`send_at_local`, `tz`) next to the instant it resolves to (`due_at`).
CREATE TABLE scheduled_deliveries (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  kind text NOT NULL,
  target_ref text NOT NULL,
  send_at_local text NOT NULL,
  tz text NOT NULL,
  due_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE scheduled_deliveries ADD CONSTRAINT scheduled_deliveries_kind_check
  CHECK (kind IN ('resend', 'ask_later', 'nudge'));
ALTER TABLE scheduled_deliveries ADD CONSTRAINT scheduled_deliveries_status_check
  CHECK (status IN ('pending', 'sent', 'cancelled'));
ALTER TABLE scheduled_deliveries ADD CONSTRAINT scheduled_deliveries_tz_check CHECK (app.valid_tz(tz));
ALTER TABLE scheduled_deliveries ADD CONSTRAINT scheduled_deliveries_local_check
  CHECK (send_at_local ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$');
CREATE INDEX scheduled_deliveries_status_due_idx ON scheduled_deliveries (status, due_at);
CREATE INDEX scheduled_deliveries_user_id_idx ON scheduled_deliveries (user_id);
CREATE TRIGGER scheduled_deliveries_touch_updated_at BEFORE UPDATE ON scheduled_deliveries
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE scheduled_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY scheduled_deliveries_self ON scheduled_deliveries FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY scheduled_deliveries_system ON scheduled_deliveries FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON scheduled_deliveries TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON scheduled_deliveries TO app_system;

-- The router reads the one event it is routing. domain_events has no grant to any role (its
-- readers go through SECURITY DEFINER functions, like the purge), so this is the worker's way in.
CREATE OR REPLACE FUNCTION app.domain_event_for_routing(p_id uuid)
RETURNS TABLE (
  id uuid, type text, payload jsonb, crew_id uuid, trip_id uuid, actor_id uuid, occurred_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT e.id, e.type, e.payload, e.crew_id, e.trip_id, e.actor_id, e.occurred_at
  FROM public.domain_events e WHERE e.id = p_id
$$;
REVOKE EXECUTE ON FUNCTION app.domain_event_for_routing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.domain_event_for_routing(uuid) TO app_system;

-- Stream `me` additions (infra/powersync/streams/notifications.yaml). push_tokens stays out of the
-- publication (API-only, packages/db/src/publication.ts exceptions); everything else here is
-- synced to its owner. Same guarded, idempotent ADD TABLE pattern as earlier migrations.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'devices', 'notifications', 'notification_prefs', 'ping_ledger', 'roundups', 'inbox_items',
    'scheduled_deliveries'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
    EXECUTE format('GRANT SELECT ON %I TO powersync_repl', t);
  END LOOP;
END
$$;
