-- Trip day (docs/data-model.md §3.11, §3.12): each member's morning briefing and its items, the
-- day's packing list, the leave-by computed for an early start with the crew's readiness, the
-- device alarms each phone mirrors back, and the per-day offline bundle manifest. Every table is
-- written by the server (app_system: the worker, or a command after its own authorisation), so
-- app_user only ever reads. Doc deltas: `leave_bys.buffer_min`, `leave_bys.guide_note`,
-- `briefing_items.dedupe_key` and `offline_bundles`.

-- ---------------------------------------------------------------------------------------------
-- briefings: RLS class O, C2. One per member, trip and local date; `fallback_used` marks a
-- briefing worded by the template because the model failed or answered out of bounds.
CREATE TABLE briefings (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  local_date date NOT NULL,
  tz text NOT NULL,
  agent_job_id uuid REFERENCES agent_jobs (id),
  status text NOT NULL DEFAULT 'ready',
  fallback_used boolean NOT NULL DEFAULT false,
  built_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT briefings_trip_user_date_key UNIQUE (trip_id, user_id, local_date)
);
ALTER TABLE briefings ADD CONSTRAINT briefings_status_check
  CHECK (status IN ('ready', 'empty', 'failed'));
ALTER TABLE briefings ADD CONSTRAINT briefings_tz_check CHECK (app.valid_tz(tz));
CREATE INDEX briefings_user_trip_idx ON briefings (user_id, trip_id);
CREATE TRIGGER briefings_touch_updated_at BEFORE UPDATE ON briefings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefings FORCE ROW LEVEL SECURITY;
CREATE POLICY briefings_select ON briefings FOR SELECT TO app_user USING (user_id = app.uid());
CREATE POLICY briefings_system ON briefings FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON briefings TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON briefings TO app_system;

-- ---------------------------------------------------------------------------------------------
-- briefing_items: RLS class O, C2. `user_id` and `trip_id` repeat the briefing's so the policy and
-- the trip_me stream need no join. `dedupe_key` is unique per briefing: an event-inserted item
-- (`source = 'event'`) keys on its source event, a daily item on its candidate. `facts` holds the
-- only numbers the text may carry.
CREATE TABLE briefing_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  briefing_id uuid NOT NULL REFERENCES briefings (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  position smallint NOT NULL DEFAULT 0,
  icon text NOT NULL,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 240),
  action text NOT NULL,
  target_user_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(target_user_ids) <= 16),
  deep_link text CHECK (deep_link IS NULL OR char_length(deep_link) <= 300),
  facts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(facts) = 'object'),
  status text NOT NULL DEFAULT 'open',
  source text NOT NULL DEFAULT 'daily_job',
  source_event_id uuid,
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 200),
  acted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT briefing_items_briefing_dedupe_key UNIQUE (briefing_id, dedupe_key)
);
ALTER TABLE briefing_items ADD CONSTRAINT briefing_items_action_check
  CHECK (action IN ('done', 'nudge', 'set', 'open'));
ALTER TABLE briefing_items ADD CONSTRAINT briefing_items_status_check
  CHECK (status IN ('open', 'done', 'nudged', 'set', 'opened'));
ALTER TABLE briefing_items ADD CONSTRAINT briefing_items_source_check
  CHECK (source IN ('daily_job', 'event'));
ALTER TABLE briefing_items ADD CONSTRAINT briefing_items_event_source_check
  CHECK (source = 'daily_job' OR source_event_id IS NOT NULL);
CREATE INDEX briefing_items_user_trip_idx ON briefing_items (user_id, trip_id);
CREATE INDEX briefing_items_trip_dedupe_idx ON briefing_items (trip_id, dedupe_key);
CREATE TRIGGER briefing_items_touch_updated_at BEFORE UPDATE ON briefing_items
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE briefing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefing_items FORCE ROW LEVEL SECURITY;
CREATE POLICY briefing_items_select ON briefing_items FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY briefing_items_system ON briefing_items FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON briefing_items TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON briefing_items TO app_system;

-- ---------------------------------------------------------------------------------------------
-- packing_items: RLS class T, C1. A shared row (`owner_id` null) is the crew's; a personal row is
-- its owner's alone. `day` null = the whole trip. Removed rows keep a tombstone for sync.
CREATE TABLE packing_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  day date,
  owner_id uuid REFERENCES users (id),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  checked boolean NOT NULL DEFAULT false,
  checked_by uuid REFERENCES users (id),
  checked_at timestamptz,
  suggested_by text NOT NULL DEFAULT 'user',
  created_by uuid REFERENCES users (id),
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE packing_items ADD CONSTRAINT packing_items_suggested_by_check
  CHECK (suggested_by IN ('user', 'guide'));
ALTER TABLE packing_items ADD CONSTRAINT packing_items_checked_check
  CHECK (checked = (checked_at IS NOT NULL));
CREATE INDEX packing_items_trip_day_idx ON packing_items (trip_id, day);
CREATE INDEX packing_items_owner_idx ON packing_items (owner_id) WHERE owner_id IS NOT NULL;
CREATE TRIGGER packing_items_touch_updated_at BEFORE UPDATE ON packing_items
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE packing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_items FORCE ROW LEVEL SECURITY;
CREATE POLICY packing_items_select ON packing_items FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id) AND (owner_id IS NULL OR owner_id = app.uid()));
CREATE POLICY packing_items_system ON packing_items FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON packing_items TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON packing_items TO app_system;

-- ---------------------------------------------------------------------------------------------
-- leave_bys: RLS class T, C1. One per early plan item (keyed by its stable id, which survives new
-- plan versions). `leave_at` = start (or pickup) - travel - buffer; `legs` records the route and
-- whether live traffic informed it; `participant_ids` are the members the item is for.
CREATE TABLE leave_bys (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  plan_item_id uuid NOT NULL REFERENCES plan_items (id),
  plan_item_stable_id uuid NOT NULL,
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  place_name text CHECK (place_name IS NULL OR char_length(place_name) <= 120),
  local_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  leave_at timestamptz NOT NULL,
  pickup_at timestamptz,
  tz text NOT NULL,
  legs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(legs) = 'array'),
  progress_mode text NOT NULL DEFAULT 'time',
  alarm_policy jsonb NOT NULL
    DEFAULT '{"lead_min": 10, "only_if_not_up": true, "snooze_limit": 1}'::jsonb
    CHECK (jsonb_typeof(alarm_policy) = 'object'),
  pickup jsonb CHECK (pickup IS NULL OR jsonb_typeof(pickup) = 'object'),
  buffer_min smallint NOT NULL DEFAULT 10 CHECK (buffer_min BETWEEN 0 AND 120),
  guide_note text CHECK (guide_note IS NULL OR char_length(guide_note) <= 240),
  participant_ids uuid[] NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'scheduled',
  version integer NOT NULL DEFAULT 1,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_bys_trip_item_key UNIQUE (trip_id, plan_item_stable_id)
);
ALTER TABLE leave_bys ADD CONSTRAINT leave_bys_state_check
  CHECK (state IN ('scheduled', 'window', 'alerting', 'departed', 'cancelled'));
ALTER TABLE leave_bys ADD CONSTRAINT leave_bys_progress_mode_check
  CHECK (progress_mode IN ('time', 'location'));
ALTER TABLE leave_bys ADD CONSTRAINT leave_bys_tz_check CHECK (app.valid_tz(tz));
ALTER TABLE leave_bys ADD CONSTRAINT leave_bys_order_check CHECK (leave_at <= starts_at);
CREATE INDEX leave_bys_trip_leave_at_idx ON leave_bys (trip_id, leave_at);
CREATE INDEX leave_bys_plan_item_idx ON leave_bys (plan_item_id);
CREATE TRIGGER leave_bys_touch_updated_at BEFORE UPDATE ON leave_bys
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE leave_bys ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_bys FORCE ROW LEVEL SECURITY;
CREATE POLICY leave_bys_select ON leave_bys FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY leave_bys_system ON leave_bys FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON leave_bys TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON leave_bys TO app_system;

-- ---------------------------------------------------------------------------------------------
-- readiness: RLS class T, C1. One row per member of a leave-by; written through `set_readiness`
-- and `snooze_leave_by` (the app, the alarm, the Live Activity or a widget with an action key).
-- `knock_sent_at` is set once, when the crew was asked to knock.
CREATE TABLE readiness (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  leave_by_id uuid NOT NULL REFERENCES leave_bys (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  state text NOT NULL DEFAULT 'not_up',
  source text,
  snooze_count smallint NOT NULL DEFAULT 0 CHECK (snooze_count BETWEEN 0 AND 100),
  knock_sent_at timestamptz,
  changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT readiness_leave_by_user_key UNIQUE (leave_by_id, user_id)
);
ALTER TABLE readiness ADD CONSTRAINT readiness_state_check
  CHECK (state IN ('not_up', 'up', 'ready', 'left'));
ALTER TABLE readiness ADD CONSTRAINT readiness_source_check
  CHECK (source IS NULL OR source IN ('la', 'alarm', 'app', 'widget', 'notification'));
CREATE INDEX readiness_trip_idx ON readiness (trip_id);
CREATE INDEX readiness_user_idx ON readiness (user_id);
CREATE TRIGGER readiness_touch_updated_at BEFORE UPDATE ON readiness
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE readiness ENABLE ROW LEVEL SECURITY;
ALTER TABLE readiness FORCE ROW LEVEL SECURITY;
CREATE POLICY readiness_select ON readiness FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY readiness_system ON readiness FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON readiness TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON readiness TO app_system;

-- ---------------------------------------------------------------------------------------------
-- alarms: RLS class O, C2. The device-authoritative mirror of each OS alarm (`mirror_alarm_state`):
-- the server reads it to decide whether a member needs the remote fallback push.
CREATE TABLE alarms (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  device_id uuid NOT NULL REFERENCES devices (id),
  leave_by_id uuid NOT NULL REFERENCES leave_bys (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  fire_at timestamptz NOT NULL,
  os_alarm_id text CHECK (os_alarm_id IS NULL OR char_length(os_alarm_id) <= 128),
  state text NOT NULL,
  sync_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alarms_device_leave_by_key UNIQUE (device_id, leave_by_id)
);
ALTER TABLE alarms ADD CONSTRAINT alarms_state_check
  CHECK (state IN ('scheduled', 'alerting', 'snoozed', 'stopped', 'cancelled'));
CREATE INDEX alarms_user_idx ON alarms (user_id);
CREATE INDEX alarms_leave_by_idx ON alarms (leave_by_id);
CREATE TRIGGER alarms_touch_updated_at BEFORE UPDATE ON alarms
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE alarms ENABLE ROW LEVEL SECURITY;
ALTER TABLE alarms FORCE ROW LEVEL SECURITY;
CREATE POLICY alarms_select ON alarms FOR SELECT TO app_user USING (user_id = app.uid());
CREATE POLICY alarms_system ON alarms FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON alarms TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON alarms TO app_system;

-- ---------------------------------------------------------------------------------------------
-- offline_bundles: RLS class T read / S write, C1 (doc delta). The manifest of what a trip day
-- needs offline; `version` bumps only when `content_hash` changes, so devices fetch deltas.
CREATE TABLE offline_bundles (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  local_date date NOT NULL,
  version integer NOT NULL DEFAULT 1,
  content_hash text NOT NULL,
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  built_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offline_bundles_trip_date_key UNIQUE (trip_id, local_date)
);
CREATE TRIGGER offline_bundles_touch_updated_at BEFORE UPDATE ON offline_bundles
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE offline_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_bundles FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_bundles_select ON offline_bundles FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY offline_bundles_system ON offline_bundles FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON offline_bundles TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON offline_bundles TO app_system;

-- ---------------------------------------------------------------------------------------------
-- Domain events the trip day appends, merged into the allow-list whatever else it holds by then.
DO $$
DECLARE
  current_values text[];
  merged text;
BEGIN
  SELECT array_agg(m[1] ORDER BY m[1]) INTO current_values
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = 'domain_events_type_check' AND c.conrelid = 'domain_events'::regclass;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_values || ARRAY[
      'leave_by.changed', 'leave_by.alarm_due', 'leave_by.snoozed', 'leave_by.knocked',
      'readiness.changed', 'packing.checked', 'briefing.built', 'briefing.item_acted',
      'member.running_late'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13): every trip-day table syncs.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'briefings', 'briefing_items', 'packing_items', 'leave_bys', 'readiness', 'alarms',
    'offline_bundles'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON briefings, briefing_items, packing_items, leave_bys, readiness, alarms,
  offline_bundles TO powersync_repl;
