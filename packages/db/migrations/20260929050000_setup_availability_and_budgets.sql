-- Trip setup, dates and budgets (docs/data-model.md §3.3, §3.4; docs/data-model-sync-and-privacy.md
-- §1): calendar sources and date-level days, private availability asks, per-date availability counts
-- and the window options derived from them, write-only budget maxes and defaults, the crew-level
-- budget aggregate and the locked budget plan.
--
-- Privacy is per table. calendar_sources, calendar_days, availability_asks, budget_max_private and
-- budget_defaults_private are C3: owner-only (an ask: its recipient only), never published, never
-- granted to guide_reader. budget_max_private has no SELECT for app_user at all, not even for its
-- owner; the owner reads their own value through app.my_budget_max. The crew sees only derived C1
-- rows: per-date counts, window options, and a budget aggregate whose band, dots, under-all and
-- infeasible fields a CHECK keeps empty below four maxes.

-- ---------------------------------------------------------------------------------------------
-- trips: the trip length the date windows slide over (the vote's length until dates are locked).
ALTER TABLE trips ADD COLUMN trip_length_days smallint
  CHECK (trip_length_days BETWEEN 1 AND 30);
GRANT SELECT (trip_length_days) ON trips TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- Who takes part in setup: the trip's active crew members, less anyone who said no to the trip
-- (a solo trip: its participants only). A caller outside the trip's crew gets nobody.
CREATE OR REPLACE FUNCTION app.setup_member_ids(p_trip uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  SELECT m.user_id
    FROM trips t
    JOIN crew_members m ON m.crew_id = t.crew_id AND m.status = 'active'
   WHERE t.id = p_trip
     AND (app.uid() IS NULL OR app.is_trip_member(p_trip))
     AND NOT EXISTS (
       SELECT 1 FROM trip_participants p
        WHERE p.trip_id = t.id AND p.user_id = m.user_id AND p.rsvp = 'out'
     )
     AND (NOT t.is_solo OR EXISTS (
       SELECT 1 FROM trip_participants p WHERE p.trip_id = t.id AND p.user_id = m.user_id
     ))
$$;
REVOKE EXECUTE ON FUNCTION app.setup_member_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.setup_member_ids(uuid) TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- calendar_sources: RLS class X. One row per member and kind; OAuth tokens are an AES-256-GCM
-- envelope the server alone writes and reads (app_user cannot even select the column).
CREATE TABLE calendar_sources (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('device', 'oauth_google', 'oauth_microsoft', 'manual')),
  oauth_tokens_enc text,
  token_expires_at timestamptz,
  consent_tentative boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disconnected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind),
  CHECK (oauth_tokens_enc IS NULL OR kind IN ('oauth_google', 'oauth_microsoft'))
);
CREATE TRIGGER calendar_sources_touch_updated_at BEFORE UPDATE ON calendar_sources
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE calendar_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY calendar_sources_owner_select ON calendar_sources FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY calendar_sources_owner_insert ON calendar_sources FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND kind IN ('device', 'manual'));
CREATE POLICY calendar_sources_owner_update ON calendar_sources FOR UPDATE TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY calendar_sources_system ON calendar_sources FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT (id, user_id, kind, consent_tentative, last_sync_at, status, created_at, updated_at)
  ON calendar_sources TO app_user;
GRANT INSERT (id, user_id, kind, consent_tentative, last_sync_at) ON calendar_sources TO app_user;
GRANT UPDATE (consent_tentative, last_sync_at) ON calendar_sources TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_sources TO app_system;

-- ---------------------------------------------------------------------------------------------
-- calendar_days: RLS class X. One date-level state per member and date, from any source; no
-- title, attendee or time exists anywhere. `guide_may_ask` marks a `maybe` day the guide may ask
-- about privately. Clearing a day sets it back to `unknown` (app_user never deletes).
CREATE TABLE calendar_days (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  trip_id uuid REFERENCES trips (id) ON DELETE SET NULL,
  date date NOT NULL,
  state text NOT NULL CHECK (state IN ('free', 'maybe', 'busy', 'unknown')),
  source text NOT NULL CHECK (source IN ('manual', 'device_cal', 'oauth')),
  guide_may_ask boolean NOT NULL DEFAULT false CHECK (NOT guide_may_ask OR state = 'maybe'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);
CREATE INDEX calendar_days_trip_id_idx ON calendar_days (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX calendar_days_date_idx ON calendar_days (date);
CREATE TRIGGER calendar_days_touch_updated_at BEFORE UPDATE ON calendar_days
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE calendar_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_days FORCE ROW LEVEL SECURITY;
CREATE POLICY calendar_days_owner ON calendar_days FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY calendar_days_system ON calendar_days FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON calendar_days TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_days TO app_system;

-- ---------------------------------------------------------------------------------------------
-- availability_summaries: RLS class T. Per trip and date, how many setup members are free,
-- maybe, busy or unknown. Written only by app.recompute_availability.
CREATE TABLE availability_summaries (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  date date NOT NULL,
  free_count smallint NOT NULL CHECK (free_count >= 0),
  maybe_count smallint NOT NULL DEFAULT 0 CHECK (maybe_count >= 0),
  busy_count smallint NOT NULL CHECK (busy_count >= 0),
  unknown_count smallint NOT NULL CHECK (unknown_count >= 0),
  member_count smallint NOT NULL CHECK (member_count >= 0),
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, date)
);
CREATE TRIGGER availability_summaries_touch_updated_at BEFORE UPDATE ON availability_summaries
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE availability_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_summaries FORCE ROW LEVEL SECURITY;
CREATE POLICY availability_summaries_select ON availability_summaries FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY availability_summaries_system ON availability_summaries FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON availability_summaries TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON availability_summaries TO app_system;

-- Per-date counts over the setup horizon (today to six months out) from every setup member's
-- reported days; members with no row for a date are the unknowns.
CREATE OR REPLACE FUNCTION app.availability_counts(p_trip uuid)
RETURNS TABLE (date date, free_count int, maybe_count int, busy_count int, member_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  WITH members AS (SELECT app.setup_member_ids(p_trip) AS user_id)
  SELECT d.date,
         (count(*) FILTER (WHERE d.state = 'free'))::int,
         (count(*) FILTER (WHERE d.state = 'maybe'))::int,
         (count(*) FILTER (WHERE d.state = 'busy'))::int,
         (SELECT count(*) FROM members)::int
    FROM calendar_days d
    JOIN members m ON m.user_id = d.user_id
   WHERE d.date BETWEEN current_date AND current_date + 183
     AND d.state <> 'unknown'
   GROUP BY d.date
$$;
REVOKE EXECUTE ON FUNCTION app.availability_counts(uuid) FROM PUBLIC;

-- Recounts a trip's per-date availability. Rows only change when a count does, and dates nobody
-- reports any more are dropped. Returns the number of dates kept.
CREATE OR REPLACE FUNCTION app.recompute_availability(p_trip uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  kept integer;
BEGIN
  INSERT INTO availability_summaries AS s
    (trip_id, date, free_count, maybe_count, busy_count, unknown_count, member_count, computed_at)
  SELECT p_trip, c.date, c.free_count, c.maybe_count, c.busy_count,
         greatest(0, c.member_count - c.free_count - c.maybe_count - c.busy_count),
         c.member_count, now()
    FROM app.availability_counts(p_trip) c
  ON CONFLICT (trip_id, date) DO UPDATE
    SET free_count = EXCLUDED.free_count, maybe_count = EXCLUDED.maybe_count,
        busy_count = EXCLUDED.busy_count, unknown_count = EXCLUDED.unknown_count,
        member_count = EXCLUDED.member_count, computed_at = EXCLUDED.computed_at
  WHERE (s.free_count, s.maybe_count, s.busy_count, s.unknown_count, s.member_count)
    IS DISTINCT FROM (EXCLUDED.free_count, EXCLUDED.maybe_count, EXCLUDED.busy_count,
                      EXCLUDED.unknown_count, EXCLUDED.member_count);

  DELETE FROM availability_summaries s
   WHERE s.trip_id = p_trip
     AND NOT EXISTS (SELECT 1 FROM app.availability_counts(p_trip) c WHERE c.date = s.date);

  SELECT count(*) INTO kept FROM availability_summaries s WHERE s.trip_id = p_trip;
  RETURN kept;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.recompute_availability(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.recompute_availability(uuid) TO app_system;

-- ---------------------------------------------------------------------------------------------
-- date_window_options: RLS class T. Up to four date windows for the trip (best, best partial,
-- full-crew alternative, ask-first), written by the window recompute job. `ask_user_id` is set only
-- when that member marked the blocking days as askable; `ask_status` is all the crew learns of it.
CREATE TABLE date_window_options (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 3),
  kind text NOT NULL CHECK (kind IN ('best', 'partial', 'full_crew', 'ask_first')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  free_count smallint NOT NULL CHECK (free_count >= 0),
  member_count smallint NOT NULL CHECK (member_count >= 0),
  missing_member_ids uuid[] NOT NULL DEFAULT '{}',
  missed_must_do_ids uuid[] NOT NULL DEFAULT '{}',
  ask_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  ask_status text CHECK (ask_status IN ('asked', 'freed', 'not_movable', 'timed_out')),
  price_delta_minor bigint,
  currency char(3),
  season_score smallint NOT NULL DEFAULT 0,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 60),
  is_pick boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, position),
  CHECK (start_date <= end_date),
  CHECK (ask_status IS NULL OR ask_user_id IS NOT NULL),
  CHECK ((price_delta_minor IS NULL) = (currency IS NULL))
);
CREATE INDEX date_window_options_ask_user_idx ON date_window_options (ask_user_id)
  WHERE ask_user_id IS NOT NULL;
CREATE TRIGGER date_window_options_touch_updated_at BEFORE UPDATE ON date_window_options
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE date_window_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE date_window_options FORCE ROW LEVEL SECURITY;
CREATE POLICY date_window_options_select ON date_window_options FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY date_window_options_system ON date_window_options FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON date_window_options TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON date_window_options TO app_system;

-- ---------------------------------------------------------------------------------------------
-- availability_asks: RLS class X (its recipient only). The guide's private "can you move this?"
-- to one member about their own `maybe` days. The organiser never reads it: the outcome reaches
-- the crew as the window option's `ask_status`, never the event.
CREATE TABLE availability_asks (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  asked_by_kind text NOT NULL DEFAULT 'guide' CHECK (asked_by_kind = 'guide'),
  requested_by uuid REFERENCES users (id) ON DELETE SET NULL,
  option_id uuid REFERENCES date_window_options (id) ON DELETE SET NULL,
  block_start date NOT NULL,
  block_end date NOT NULL,
  status text NOT NULL DEFAULT 'asked' CHECK (status IN ('asked', 'replied', 'timed_out')),
  intent text CHECK (intent IN ('freed', 'not_movable')),
  -- The guide's line to the member ({dates} filled in on delivery), and a written reply held only
  -- until its intent is read.
  ask_line text CHECK (char_length(ask_line) <= 400),
  reply_text text CHECK (char_length(reply_text) <= 500),
  expires_at timestamptz NOT NULL,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (block_start <= block_end),
  CHECK ((status = 'replied') = (intent IS NOT NULL))
);
CREATE UNIQUE INDEX availability_asks_open_uk ON availability_asks (trip_id, target_user_id)
  WHERE status = 'asked';
CREATE INDEX availability_asks_recipient_idx ON availability_asks (target_user_id);
CREATE INDEX availability_asks_option_idx ON availability_asks (option_id)
  WHERE option_id IS NOT NULL;
CREATE INDEX availability_asks_requested_by_idx ON availability_asks (requested_by)
  WHERE requested_by IS NOT NULL;
CREATE TRIGGER availability_asks_touch_updated_at BEFORE UPDATE ON availability_asks
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE availability_asks ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_asks FORCE ROW LEVEL SECURITY;
CREATE POLICY availability_asks_recipient ON availability_asks FOR SELECT TO app_user
  USING (target_user_id = app.uid());
CREATE POLICY availability_asks_system ON availability_asks FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON availability_asks TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON availability_asks TO app_system;

-- Settles an open ask with the member's answer: the ask is replied, its window option shows the
-- outcome, and a freed block turns the member's own `maybe` days in it into `free`. Returns what
-- the caller needs for the realtime hint and the recount; nothing when the ask was not open.
CREATE OR REPLACE FUNCTION app.resolve_availability_ask(p_ask uuid, p_intent text)
RETURNS TABLE (trip_id uuid, option_id uuid, target_user_id uuid, requested_by uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  ask availability_asks;
BEGIN
  IF p_intent NOT IN ('freed', 'not_movable') THEN
    RAISE EXCEPTION 'invalid ask intent: %', p_intent USING ERRCODE = 'invalid_parameter_value';
  END IF;
  UPDATE availability_asks a
     SET status = 'replied', intent = p_intent, replied_at = now(), reply_text = NULL
   WHERE a.id = p_ask AND a.status = 'asked'
  RETURNING * INTO ask;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE date_window_options o SET ask_status = p_intent
   WHERE o.id = ask.option_id AND o.ask_user_id = ask.target_user_id;
  IF p_intent = 'freed' THEN
    UPDATE calendar_days d SET state = 'free', guide_may_ask = false
     WHERE d.user_id = ask.target_user_id AND d.state = 'maybe'
       AND d.date BETWEEN ask.block_start AND ask.block_end;
  END IF;
  RETURN QUERY SELECT ask.trip_id, ask.option_id, ask.target_user_id, ask.requested_by;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.resolve_availability_ask(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_availability_ask(uuid, text) TO app_system;

-- ---------------------------------------------------------------------------------------------
-- budget_max_private: RLS class X, write-only. A member inserts and updates their own max for a
-- trip they belong to; app_user has no SELECT privilege and no SELECT policy, so not even the owner
-- reads it back through a query. `amount_trip_minor` is the same max in the trip currency,
-- converted server-side through the FX snapshot at submit time.
CREATE TABLE budget_max_private (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  amount_trip_minor bigint NOT NULL CHECK (amount_trip_minor > 0),
  trip_currency char(3) NOT NULL,
  fx_snapshot_id uuid REFERENCES fx_snapshots (id),
  source text NOT NULL DEFAULT 'entered' CHECK (source IN ('entered', 'profile_default')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id)
);
CREATE INDEX budget_max_private_user_id_idx ON budget_max_private (user_id);
CREATE INDEX budget_max_private_fx_idx ON budget_max_private (fx_snapshot_id)
  WHERE fx_snapshot_id IS NOT NULL;
CREATE TRIGGER budget_max_private_touch_updated_at BEFORE UPDATE ON budget_max_private
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE budget_max_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_max_private FORCE ROW LEVEL SECURITY;
CREATE POLICY budget_max_private_owner_insert ON budget_max_private FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.is_trip_member(trip_id));
CREATE POLICY budget_max_private_owner_update ON budget_max_private FOR UPDATE TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid() AND app.is_trip_member(trip_id));
CREATE POLICY budget_max_private_system ON budget_max_private FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT INSERT (id, trip_id, user_id, amount_minor, currency, amount_trip_minor, trip_currency,
  fx_snapshot_id, source) ON budget_max_private TO app_user;
GRANT UPDATE (amount_minor, currency, amount_trip_minor, trip_currency, fx_snapshot_id, source)
  ON budget_max_private TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON budget_max_private TO app_system;

-- The caller's own max for one trip, for their own device's private cache; nobody else's, ever.
CREATE OR REPLACE FUNCTION app.my_budget_max(p_trip uuid)
RETURNS TABLE (amount_minor bigint, currency char(3), source text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  SELECT b.amount_minor, b.currency, b.source, b.updated_at
    FROM budget_max_private b
   WHERE b.trip_id = p_trip AND app.uid() IS NOT NULL AND b.user_id = app.uid()
$$;
REVOKE EXECUTE ON FUNCTION app.my_budget_max(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.my_budget_max(uuid) TO app_user;

-- ---------------------------------------------------------------------------------------------
-- budget_defaults_private: RLS class X. The member's own default max, prefilled into each trip's
-- entry; never shown to anyone else, guides included.
CREATE TABLE budget_defaults_private (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER budget_defaults_private_touch_updated_at BEFORE UPDATE ON budget_defaults_private
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE budget_defaults_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_defaults_private FORCE ROW LEVEL SECURITY;
CREATE POLICY budget_defaults_private_owner ON budget_defaults_private FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY budget_defaults_private_system ON budget_defaults_private FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT (id, user_id, amount_minor, currency), UPDATE (amount_minor, currency)
  ON budget_defaults_private TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON budget_defaults_private TO app_system;

-- ---------------------------------------------------------------------------------------------
-- trip_budget_aggregates: RLS class T, written by the budget recompute job only. Below four maxes
-- the row carries the count and nothing else: the CHECK is the backstop for that rule.
CREATE TABLE trip_budget_aggregates (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL UNIQUE REFERENCES trips (id) ON DELETE CASCADE,
  currency char(3) NOT NULL,
  maxes_count smallint NOT NULL DEFAULT 0 CHECK (maxes_count >= 0),
  member_count smallint NOT NULL DEFAULT 0 CHECK (member_count >= 0),
  band_low_minor bigint CHECK (band_low_minor >= 0),
  band_high_minor bigint CHECK (band_high_minor >= 0),
  step_minor bigint CHECK (step_minor > 0),
  bucketed_dots jsonb CHECK (bucketed_dots IS NULL OR jsonb_typeof(bucketed_dots) = 'array'),
  under_all_ok boolean,
  infeasible boolean,
  computed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (maxes_count >= 4 OR (band_low_minor IS NULL AND band_high_minor IS NULL
    AND step_minor IS NULL AND bucketed_dots IS NULL AND under_all_ok IS NULL
    AND infeasible IS NULL)),
  CHECK ((band_low_minor IS NULL) = (band_high_minor IS NULL))
);
CREATE TRIGGER trip_budget_aggregates_touch_updated_at BEFORE UPDATE ON trip_budget_aggregates
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE trip_budget_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_budget_aggregates FORCE ROW LEVEL SECURITY;
CREATE POLICY trip_budget_aggregates_select ON trip_budget_aggregates FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY trip_budget_aggregates_system ON trip_budget_aggregates FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON trip_budget_aggregates TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_budget_aggregates TO app_system;

-- Backstop for the band edge rule, whatever computed it: a band needs four maxes from current setup
-- members, and its upper edge sits strictly below the lowest of them.
CREATE OR REPLACE FUNCTION app.trip_budget_aggregates_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  maxes integer;
  lowest bigint;
BEGIN
  IF NEW.band_high_minor IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*), min(b.amount_trip_minor) INTO maxes, lowest
    FROM budget_max_private b
   WHERE b.trip_id = NEW.trip_id
     AND b.user_id IN (SELECT app.setup_member_ids(NEW.trip_id));
  IF maxes < 4 THEN
    RAISE EXCEPTION 'a budget band needs four maxes' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.band_high_minor >= lowest THEN
    RAISE EXCEPTION 'the band must sit below every max' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.trip_budget_aggregates_guard() FROM PUBLIC;
CREATE TRIGGER trip_budget_aggregates_guard BEFORE INSERT OR UPDATE ON trip_budget_aggregates
  FOR EACH ROW EXECUTE FUNCTION app.trip_budget_aggregates_guard();

-- The crew-level band, only from four maxes on: {low_minor, high_minor, currency}.
CREATE OR REPLACE FUNCTION app.budget_band(p_trip uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  SELECT jsonb_build_object('low_minor', a.band_low_minor, 'high_minor', a.band_high_minor,
                            'currency', a.currency)
    FROM trip_budget_aggregates a
   WHERE a.trip_id = p_trip AND a.maxes_count >= 4 AND a.band_high_minor IS NOT NULL
     AND (app.uid() IS NULL OR app.is_trip_member(p_trip))
$$;
REVOKE EXECUTE ON FUNCTION app.budget_band(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.budget_band(uuid) TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- budget_plans: RLS class T. The organiser's locked target with its breakdown and stay mix;
-- `is_stale` once the dates it was priced for move.
CREATE TABLE budget_plans (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL UNIQUE REFERENCES trips (id) ON DELETE CASCADE,
  target_minor bigint NOT NULL CHECK (target_minor > 0),
  currency char(3) NOT NULL,
  band_low_minor bigint,
  band_high_minor bigint,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(breakdown) = 'object'),
  stay_mix jsonb CHECK (stay_mix IS NULL OR jsonb_typeof(stay_mix) = 'array'),
  planned_by_day jsonb CHECK (planned_by_day IS NULL OR jsonb_typeof(planned_by_day) = 'array'),
  quote_version text CHECK (char_length(quote_version) <= 80),
  is_stale boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  locked_by uuid REFERENCES users (id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX budget_plans_locked_by_idx ON budget_plans (locked_by) WHERE locked_by IS NOT NULL;
CREATE TRIGGER budget_plans_touch_updated_at BEFORE UPDATE ON budget_plans
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE budget_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY budget_plans_select ON budget_plans FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY budget_plans_system ON budget_plans FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON budget_plans TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON budget_plans TO app_system;

-- ---------------------------------------------------------------------------------------------
-- The C3 tables stay out of the guide's reach: guide_reader holds no privilege on any of them.
REVOKE ALL ON calendar_sources, calendar_days, availability_asks, budget_max_private,
  budget_defaults_private FROM guide_reader;

-- llm.trip_context: the budget band joins the trip header, only from four maxes on. Maxes and
-- calendars never enter the guide's context.
CREATE OR REPLACE VIEW llm.trip_context AS
SELECT
  t.id AS trip_id,
  t.crew_id,
  t.status,
  t.phase,
  t.start_date,
  t.end_date,
  coalesce(t.tz, d.tz) AS tz,
  coalesce(t.local_currency, d.currency) AS local_currency,
  t.seat_cap,
  t.is_solo,
  t.is_guest_guide,
  t.destination_id,
  d.name AS destination_name,
  d.country AS destination_country,
  g.slug AS guide_slug,
  (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', tp.user_id,
          'display_name', u.display_name,
          'role', tp.role,
          'rsvp', tp.rsvp,
          'taste_tags', to_jsonb(tst.tags)
        )
        ORDER BY tp.role, u.display_name
      ),
      '[]'::jsonb
    )
    FROM trip_participants tp
    JOIN users u ON u.id = tp.user_id
    LEFT JOIN taste_profiles tst ON tst.user_id = tp.user_id AND tst.visibility = 'crew'
    WHERE tp.trip_id = t.id
  ) AS participants,
  (
    SELECT jsonb_build_object('low_minor', a.band_low_minor, 'high_minor', a.band_high_minor,
                              'currency', a.currency)
      FROM trip_budget_aggregates a
     WHERE a.trip_id = t.id AND a.maxes_count >= 4 AND a.band_high_minor IS NOT NULL
  ) AS budget_band
FROM trips t
LEFT JOIN destinations d ON d.id = t.destination_id
LEFT JOIN guides g ON g.id = t.guide_id
WHERE t.id = nullif(current_setting('app.trip', true), '')::uuid
  AND app.is_trip_member(t.id);

-- When the server last filed a setup event of `p_type` about one member of one trip (the stale
-- calendar nudge and the must-do prompt go out once per period, not once per run). app_system
-- reads no event log otherwise.
CREATE OR REPLACE FUNCTION app.last_setup_event_at(p_type text, p_trip uuid, p_user uuid)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  SELECT max(e.occurred_at) FROM domain_events e
   WHERE e.type = p_type AND e.type IN ('calendar.stale', 'must_do.prompted')
     AND e.trip_id = p_trip AND e.payload->>'user_id' = p_user::text
$$;
REVOKE EXECUTE ON FUNCTION app.last_setup_event_at(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.last_setup_event_at(text, uuid, uuid) TO app_system;

-- ---------------------------------------------------------------------------------------------
-- domain_events: the setup events join the catalogue (packages/domain/src/setup/events.ts).
ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (
  'crew.member_joined', 'crew.member_left', 'crew.member_removed', 'trip.created',
  'trip.status_changed', 'plan.version_created', 'change_set.proposed', 'change_set.applied',
  'change_set.reverted', 'change_set.rejected', 'rsvp.changed', 'auth.merged', 'invite.opened',
  'attribution.claimed', 'guide_action.undone', 'fare.dropped', 'forecast.changed',
  'hazard.changed', 'moderation.decided', 'entitlement.granted', 'entitlement.revoked',
  'device.permissions_changed', 'visit.recorded', 'pass.issued', 'profile.updated',
  'profile.taste_changed', 'profile.avatar_changed', 'crew.created', 'crew.updated',
  'crew.code_rotated', 'user.active_crew_changed', 'invite.created', 'invite.claimed',
  'invite.deferred', 'invite.declined', 'invite.revoked', 'invite.nudged', 'trip.seat_opened',
  'seat_offer.accepted', 'referral.progressed', 'chat.message_sent', 'chat.message_edited',
  'chat.message_deleted', 'chat.reaction_changed', 'chat.guide_mentioned', 'inbox.item_resolved',
  'inbox.read', 'nudge.sent', 'nudge.received', 'tip.created', 'tip.dismissed',
  'trip.dates_changed', 'trip.destination_set', 'booking.flight_added', 'booking.flight_changed',
  'booking.flight_removed', 'user.tz_changed', 'location_share.changed', 'meetup.created',
  'meetup.moved', 'meetup.crew_close', 'crew.pinged', 'poll.created', 'poll.candidate_added',
  'poll.candidate_removed', 'poll.stage_changed', 'poll.closed', 'poll.cancelled',
  'poll.reveal_seen', 'poll.lead_changed', 'poll.closing_soon', 'poll.pick_needed', 'ballot.cast',
  'ballot.changed', 'ballot.retracted', 'pitch.created', 'pitch.queued', 'place.saved',
  'place.unsaved', 'availability.updated', 'calendar.connected', 'calendar.disconnected',
  'calendar.stale', 'availability_ask.created', 'availability_ask.answered',
  'availability_ask.timed_out', 'setup.step_changed', 'budget.submission_counted', 'budget.locked',
  'rooms.changed', 'rooms.locked', 'room_swap.requested', 'stay.chosen', 'must_dos.changed',
  'must_do.fit_checked', 'must_do.prompted', 'lottery.tracked', 'lottery.reminder_due'
));

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList: the derived C1 setup rows only.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY['availability_summaries', 'date_window_options',
                                   'trip_budget_aggregates', 'budget_plans'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON availability_summaries, date_window_options, trip_budget_aggregates, budget_plans
  TO powersync_repl;
