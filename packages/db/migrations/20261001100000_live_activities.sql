-- Live Activities (docs/data-model.md §3.11, docs/api-contracts-async.md §3.1–3.2): the per-type
-- push-to-start tokens a phone registers, every activity the server knows a phone is showing (and
-- its update token), the APNs broadcast channel per shared object, and the orchestrator's last
-- frame per object. All C2; never replicated to a client (device-local truth plus the server).
--
-- `la_push_to_start_tokens` and `device_activities`: RLS class O (the owner may read their own
-- rows); every write goes through app_system on the owner's behalf, because a token that moves to
-- another install must detach from its previous owner. `broadcast_channels` and
-- `la_object_states` are server-only (class S).

-- ---------------------------------------------------------------------------------------------
CREATE TABLE la_push_to_start_tokens (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  device_id uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id),
  activity_type text NOT NULL CHECK (activity_type IN (
    'leave_by', 'meet_up', 'flight', 'vote', 'critter_nearby', 'storm', 'sos', 'ride'
  )),
  token text NOT NULL
    CHECK (token ~ '^[0-9a-f]+$' AND char_length(token) BETWEEN 16 AND 512),
  env text NOT NULL CHECK (env IN ('sandbox', 'prod')),
  invalid_at timestamptz,
  invalid_reason text CHECK (char_length(invalid_reason) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT la_push_to_start_tokens_device_type_key UNIQUE (device_id, activity_type)
);
CREATE INDEX la_push_to_start_tokens_user_idx ON la_push_to_start_tokens (user_id);
CREATE TRIGGER la_push_to_start_tokens_touch_updated_at BEFORE UPDATE ON la_push_to_start_tokens
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE la_push_to_start_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE la_push_to_start_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY la_push_to_start_tokens_self ON la_push_to_start_tokens FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY la_push_to_start_tokens_system ON la_push_to_start_tokens FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON la_push_to_start_tokens TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON la_push_to_start_tokens TO app_system;

-- ---------------------------------------------------------------------------------------------
-- One APNs broadcast channel per shared object (a leave-by, a meet-up, a poll) and build; the
-- channel id is null until the Channel Management API has created it.
CREATE TABLE broadcast_channels (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  kind text NOT NULL CHECK (kind IN ('leave_by', 'meet_up', 'vote')),
  ref_id uuid NOT NULL,
  env text NOT NULL CHECK (env IN ('sandbox', 'prod')),
  bundle_id text NOT NULL
    CHECK (bundle_id IN ('app.critterpass', 'app.critterpass.staging', 'app.critterpass.dev')),
  apns_channel_id text UNIQUE CHECK (char_length(apns_channel_id) BETWEEN 8 AND 128),
  storage_policy text NOT NULL DEFAULT 'no_storage'
    CHECK (storage_policy IN ('no_storage', 'most_recent')),
  delete_after timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broadcast_channels_object_key UNIQUE (kind, ref_id, env, bundle_id)
);
CREATE INDEX broadcast_channels_gc_idx ON broadcast_channels (delete_after)
  WHERE deleted_at IS NULL AND delete_after IS NOT NULL;
CREATE TRIGGER broadcast_channels_touch_updated_at BEFORE UPDATE ON broadcast_channels
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE broadcast_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_channels FORCE ROW LEVEL SECURITY;
CREATE POLICY broadcast_channels_system ON broadcast_channels FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON broadcast_channels TO app_system;

-- ---------------------------------------------------------------------------------------------
-- Every Live Activity on a phone the server knows of: started by a push-to-start it sent, or by
-- the app (locally or at a scheduled `startDate`) and reported. One live row per (device, kind,
-- object); ended rows are kept 7 days.
CREATE TABLE device_activities (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  device_id uuid NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id),
  trip_id uuid REFERENCES trips (id),
  kind text NOT NULL CHECK (kind IN (
    'leave_by', 'meet_up', 'flight', 'vote', 'critter_nearby', 'storm', 'sos', 'alarm', 'ride'
  )),
  ref_id uuid NOT NULL,
  os_activity_id text CHECK (char_length(os_activity_id) BETWEEN 8 AND 64),
  activity_push_token text CHECK (
    activity_push_token ~ '^[0-9a-f]+$' AND char_length(activity_push_token) BETWEEN 16 AND 512
  ),
  token_env text CHECK (token_env IN ('sandbox', 'prod')),
  broadcast_channel_id uuid REFERENCES broadcast_channels (id),
  started_via text NOT NULL CHECK (started_via IN ('local', 'scheduled', 'push_to_start')),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'active', 'stale', 'ended', 'dismissed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  stale_at timestamptz,
  ends_at timestamptz,
  ended_at timestamptz,
  end_reason text CHECK (char_length(end_reason) <= 40),
  restart_count smallint NOT NULL DEFAULT 0 CHECK (restart_count BETWEEN 0 AND 100),
  last_content_version integer NOT NULL DEFAULT 0 CHECK (last_content_version >= 0),
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state IN ('ended', 'dismissed')) = (ended_at IS NOT NULL))
);
CREATE UNIQUE INDEX device_activities_live_key ON device_activities (device_id, kind, ref_id)
  WHERE state IN ('pending', 'active', 'stale');
CREATE UNIQUE INDEX device_activities_os_id_key ON device_activities (device_id, os_activity_id)
  WHERE os_activity_id IS NOT NULL;
CREATE INDEX device_activities_state_ends_idx ON device_activities (state, ends_at);
CREATE INDEX device_activities_object_idx ON device_activities (kind, ref_id)
  WHERE state IN ('pending', 'active', 'stale');
CREATE INDEX device_activities_user_idx ON device_activities (user_id);
CREATE INDEX device_activities_trip_idx ON device_activities (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX device_activities_channel_idx ON device_activities (broadcast_channel_id)
  WHERE broadcast_channel_id IS NOT NULL;
CREATE TRIGGER device_activities_touch_updated_at BEFORE UPDATE ON device_activities
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE device_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY device_activities_self ON device_activities FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY device_activities_system ON device_activities FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON device_activities TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON device_activities TO app_system;

-- ---------------------------------------------------------------------------------------------
-- The orchestrator's last frame per object: the content version every device shares (so a
-- restart continues the same version), the phase, and the state last sent (a run that would send
-- the same frame again sends nothing).
CREATE TABLE la_object_states (
  kind text NOT NULL CHECK (kind IN (
    'leave_by', 'meet_up', 'flight', 'vote', 'critter_nearby', 'storm', 'sos', 'ride'
  )),
  ref_id uuid NOT NULL,
  trip_id uuid REFERENCES trips (id),
  seq integer NOT NULL DEFAULT 0 CHECK (seq >= 0),
  phase text NOT NULL DEFAULT 'live' CHECK (phase IN ('live', 'ended')),
  last_state jsonb CHECK (last_state IS NULL OR pg_column_size(last_state) <= 4096),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, ref_id)
);
CREATE INDEX la_object_states_live_idx ON la_object_states (phase) WHERE phase = 'live';
CREATE INDEX la_object_states_trip_idx ON la_object_states (trip_id) WHERE trip_id IS NOT NULL;
CREATE TRIGGER la_object_states_touch_updated_at BEFORE UPDATE ON la_object_states
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE la_object_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE la_object_states FORCE ROW LEVEL SECURITY;
CREATE POLICY la_object_states_system ON la_object_states FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON la_object_states TO app_system;

-- ---------------------------------------------------------------------------------------------
-- The Live Activity events join the catalogue (packages/domain/src/surfaces/la-events.ts), added
-- to whatever the constraint lists now.
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
      'la.token_registered', 'la.state_reported', 'la.crew_requested'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;
