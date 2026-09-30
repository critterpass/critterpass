-- Help hub and crew SOS (docs/data-model.md §3.12 `help_sessions`, `help_session_private`,
-- `help_session_messages`).
--
-- Privacy: a session row (C1) is crew-visible and syncs on the `trip` stream so every crewmate's
-- app can take over the screen, even offline-first. Health notes are C3 and live in
-- `help_session_private`: readable only by the sender and the crewmates who said they are coming,
-- never published, never in `llm`, never readable by `guide_reader`, deleted after 90 days.
-- A `stale` SOS (a queued trigger that reached the server too late to alert anyone) is visible to
-- its sender alone, so the crew never sees an alarm nobody was told about.
--
-- The SOS location share uses the session's own id (`location_shares.id = help_sessions.id`), so
-- `POST /v1/loc`'s `sos:{share_id}` publications land on the incident's own `sos:{id}` channel.

-- ---------------------------------------------------------------------------------------------
-- help_sessions: one Help opening or SOS incident. `responder_ids` = crewmates coming (they read
-- the private notes); `responses` = everyone's latest answer (seen / coming / calling), the
-- walking ETA and arrival, keyed by uid; `steps` = the "guide's on it" card, keyed by step.
CREATE TABLE help_sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  preset text,
  body text,
  place_label text,
  summary text,
  summary_source text,
  responder_ids uuid[] NOT NULL DEFAULT '{}',
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  share_id uuid REFERENCES location_shares (id),
  alerted_count integer NOT NULL DEFAULT 0,
  escalated_at timestamptz,
  false_alarm boolean NOT NULL DEFAULT false,
  clinic_requested_at timestamptz,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE help_sessions ADD CONSTRAINT help_sessions_kind_check CHECK (kind IN ('help', 'sos'));
ALTER TABLE help_sessions ADD CONSTRAINT help_sessions_status_check
  CHECK (status IN ('open', 'responding', 'resolved', 'stale'));
ALTER TABLE help_sessions ADD CONSTRAINT help_sessions_preset_check
  CHECK (preset IS NULL OR preset IN ('fell', 'lost', 'need_ride'));
ALTER TABLE help_sessions ADD CONSTRAINT help_sessions_body_check
  CHECK (body IS NULL OR char_length(body) <= 280);
ALTER TABLE help_sessions ADD CONSTRAINT help_sessions_summary_check
  CHECK ((summary IS NULL) = (summary_source IS NULL)
    AND (summary_source IS NULL OR summary_source IN ('model', 'raw'))
    AND (summary IS NULL OR char_length(summary) <= 400));
ALTER TABLE help_sessions ADD CONSTRAINT help_sessions_json_check
  CHECK (jsonb_typeof(responses) = 'object' AND jsonb_typeof(steps) = 'object');
ALTER TABLE help_sessions ADD CONSTRAINT help_sessions_resolved_check
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL));
CREATE INDEX help_sessions_trip_status_idx ON help_sessions (trip_id, status);
CREATE INDEX help_sessions_user_id_idx ON help_sessions (user_id, opened_at DESC);
CREATE INDEX help_sessions_share_id_idx ON help_sessions (share_id);
CREATE INDEX help_sessions_resolved_by_idx ON help_sessions (resolved_by);
CREATE INDEX help_sessions_opened_at_idx ON help_sessions (opened_at);
CREATE TRIGGER help_sessions_touch_updated_at BEFORE UPDATE ON help_sessions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE help_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_sessions FORCE ROW LEVEL SECURITY;
-- RLS T: the trip's crew; a stale SOS only to its sender. Only the sender opens a session (as a
-- participant of the trip); every later change runs through the commands as app_system.
CREATE POLICY help_sessions_select ON help_sessions FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id) AND (status <> 'stale' OR user_id = app.uid()));
CREATE POLICY help_sessions_insert ON help_sessions FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.is_trip_participant(trip_id));
CREATE POLICY help_sessions_system ON help_sessions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON help_sessions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON help_sessions TO app_system;

-- Whether the caller is the sender of `session` or one of its responders, still in the crew.
CREATE OR REPLACE FUNCTION app.is_help_session_insider(session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM help_sessions s
    WHERE s.id = session
      AND (s.user_id = app.uid() OR app.uid() = ANY (s.responder_ids))
      AND app.is_trip_member(s.trip_id)
  )
$$;
REVOKE ALL ON FUNCTION app.is_help_session_insider(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_help_session_insider(uuid) TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- help_session_private: the sender's health notes, sealed with the field keyring (AES-256-GCM).
CREATE TABLE help_session_private (
  help_session_id uuid PRIMARY KEY REFERENCES help_sessions (id) ON DELETE CASCADE,
  health_notes_enc text NOT NULL CHECK (char_length(health_notes_enc) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX help_session_private_created_at_idx ON help_session_private (created_at);
CREATE TRIGGER help_session_private_touch_updated_at BEFORE UPDATE ON help_session_private
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE help_session_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_session_private FORCE ROW LEVEL SECURITY;
-- RLS X: sender and responders read; only the sender writes, once, on their own open session.
CREATE POLICY help_session_private_select ON help_session_private FOR SELECT TO app_user
  USING (app.is_help_session_insider(help_session_id));
CREATE POLICY help_session_private_insert ON help_session_private FOR INSERT TO app_user
  WITH CHECK (EXISTS (
    SELECT 1 FROM help_sessions s
    WHERE s.id = help_session_id AND s.user_id = app.uid() AND s.status <> 'resolved'
  ));
CREATE POLICY help_session_private_system ON help_session_private FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON help_session_private TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON help_session_private TO app_system;

-- ---------------------------------------------------------------------------------------------
-- help_session_messages: the SOS thread between the sender and the crew. The id is the client's
-- UUIDv7 so a replayed `send_sos_message` lands on one row.
CREATE TABLE help_session_messages (
  id uuid PRIMARY KEY,
  help_session_id uuid NOT NULL REFERENCES help_sessions (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  sender_id uuid NOT NULL REFERENCES users (id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX help_session_messages_session_at_idx ON help_session_messages (help_session_id, at);
CREATE INDEX help_session_messages_trip_id_idx ON help_session_messages (trip_id);
CREATE INDEX help_session_messages_sender_id_idx ON help_session_messages (sender_id);
CREATE INDEX help_session_messages_created_at_idx ON help_session_messages (created_at);
ALTER TABLE help_session_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_session_messages FORCE ROW LEVEL SECURITY;
-- RLS T: the trip's crew reads; a participant writes as themselves into a session of that trip.
CREATE POLICY help_session_messages_select ON help_session_messages FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY help_session_messages_insert ON help_session_messages FOR INSERT TO app_user
  WITH CHECK (
    sender_id = app.uid() AND app.is_trip_participant(trip_id)
    AND EXISTS (
      SELECT 1 FROM help_sessions s
      WHERE s.id = help_session_id AND s.trip_id = help_session_messages.trip_id
        AND s.status IN ('open', 'responding')
    )
  );
CREATE POLICY help_session_messages_system ON help_session_messages FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON help_session_messages TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON help_session_messages TO app_system;

-- ---------------------------------------------------------------------------------------------
-- A crewmate's command may publish on an incident's own `sos:{id}` channel (responses, messages,
-- steps, the all-clear); everything else about `app.enqueue_rt` is unchanged. Takeovers on other
-- members' `user:#uid` channels stay with the worker.
CREATE OR REPLACE FUNCTION app.enqueue_rt(channel text, payload jsonb, kind text DEFAULT 'publish') RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  caller_uid uuid := app.uid();
  new_id bigint;
BEGIN
  IF kind NOT IN ('publish', 'unsubscribe', 'disconnect') THEN
    RAISE EXCEPTION 'invalid rt_outbox kind: %', kind USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF kind <> 'publish' AND caller_uid IS NOT NULL THEN
    RAISE EXCEPTION 'only app_system or a trigger may enqueue kind %', kind USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF caller_uid IS NOT NULL THEN
    IF NOT (
      channel = app.channel_name('user', caller_uid::text)
      OR (channel LIKE 'crew%:%' AND app.is_crew_member(split_part(channel, ':', 2)::uuid))
      OR (channel LIKE 'trip%:%' AND app.is_trip_member(split_part(channel, ':', 2)::uuid))
      OR (channel LIKE 'poll:%' AND EXISTS (
        SELECT 1 FROM polls p
         WHERE p.id = split_part(channel, ':', 2)::uuid
           AND app.can_read_poll_scope(p.crew_id, p.trip_id)
      ))
      OR (channel LIKE 'sos:%' AND EXISTS (
        SELECT 1 FROM help_sessions s
         WHERE s.id = split_part(channel, ':', 2)::uuid AND app.is_trip_member(s.trip_id)
      ))
    ) THEN
      RAISE EXCEPTION 'not permitted to publish on channel %', channel USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  INSERT INTO rt_outbox (channel, payload, idem_key, kind)
  VALUES (channel, payload, gen_random_uuid(), kind)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- How old a queued `trigger_sos` may be on upload and still alert the crew (minutes), and whether
-- Android may use a full-screen intent for SOS (on only after Play approves the declaration).
-- The stale limit is read through this function: app_user holds no grant on ops.ops_config.
INSERT INTO ops.ops_config (key, value, is_public) VALUES
  ('sos.stale_after_min', '10'::jsonb, false),
  ('android_fsi_sos', 'false'::jsonb, true)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION app.sos_stale_after_min() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce(
    (SELECT (value #>> '{}')::integer FROM ops.ops_config WHERE key = 'sos.stale_after_min'),
    10
  )
$$;
REVOKE ALL ON FUNCTION app.sos_stale_after_min() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.sos_stale_after_min() TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- The Help share, SOS and clinic-call events join the catalogue
-- (packages/domain/src/safety/events.ts), added to whatever the constraint lists now.
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
      'help_share.started', 'help_share.stopped', 'help_share.extended', 'help_share.expired',
      'sos.triggered', 'sos.stale', 'sos.escalated', 'sos.responded', 'sos.message',
      'sos.resolved', 'help.clinic_requested'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList: the sessions and their thread.
-- `help_session_private` (C3) stays out.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['help_sessions', 'help_session_messages'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON help_sessions, help_session_messages TO powersync_repl;
