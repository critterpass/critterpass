-- Setting a trip up together, in any order once the dates are locked, with the guide drafting as
-- the answers arrive (docs/api-contracts.md §4.5 doc delta, docs/data-model-sync-and-privacy.md
-- §3.1 doc delta).
--
-- 1. A draft can be made again from the latest answers: `draft_review → drafting` joins the trip
--    machine (packages/domain/src/state/trip.transitions.json).
-- 2. `trips.sketched_days`: the day numbers of the organiser's private draft that hold at least
--    one stop, so every member sees how far the draft has come without seeing what is in it.
--    Kept by a trigger that runs at commit, once the new draft's days and stops are written.
-- 3. `trip_member_setup` (C1, RLS T, system-written): per setup member, whether their free days
--    and their private max are in (never which days, never the amount), and the way they get
--    there (mode, where from, when they arrive, an estimate or their booking).

-- ---------------------------------------------------------------------------------------------
-- 1. The trip machine.
CREATE OR REPLACE FUNCTION app.trips_status_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('voting', 'setup') THEN
      RAISE EXCEPTION 'illegal initial trip status: %', NEW.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT ((OLD.status, NEW.status) IN (VALUES
    ('voting', 'won'), ('won', 'setup'), ('setup', 'drafting'),
    ('drafting', 'draft_review'), ('drafting', 'setup'), ('draft_review', 'drafting'),
    ('draft_review', 'redrafting'), ('redrafting', 'draft_review'),
    ('draft_review', 'proposed'), ('proposed', 'draft_review'),
    ('proposed', 'confirmed'), ('confirmed', 'pre_trip'),
    ('pre_trip', 'in_trip'), ('in_trip', 'post_trip'), ('post_trip', 'archived'),
    ('setup', 'cancelled'), ('proposed', 'cancelled'), ('confirmed', 'cancelled'), ('pre_trip', 'cancelled')
  )) THEN
    RAISE EXCEPTION 'illegal trip status transition: % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. How far the private draft has come.
ALTER TABLE trips ADD COLUMN sketched_days smallint[] NOT NULL DEFAULT '{}';
GRANT SELECT (sketched_days) ON trips TO admin_reader;

CREATE OR REPLACE FUNCTION app.trips_sketch_days() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  days smallint[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT d.day_no::smallint ORDER BY d.day_no::smallint), '{}')
    INTO days
    FROM trips t
    JOIN plan_days d ON d.version_id = t.draft_version_id
   WHERE t.id = NEW.id
     AND EXISTS (SELECT 1 FROM plan_items i WHERE i.day_id = d.id);
  UPDATE trips SET sketched_days = days
   WHERE id = NEW.id AND sketched_days IS DISTINCT FROM days;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.trips_sketch_days() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER trips_sketch_days AFTER UPDATE OF draft_version_id ON trips
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.trips_sketch_days();

UPDATE trips t SET sketched_days = s.days
  FROM (
    SELECT t2.id,
           array_agg(DISTINCT d.day_no::smallint ORDER BY d.day_no::smallint) AS days
      FROM trips t2
      JOIN plan_days d ON d.version_id = t2.draft_version_id
     WHERE EXISTS (SELECT 1 FROM plan_items i WHERE i.day_id = d.id)
     GROUP BY t2.id
  ) s
 WHERE s.id = t.id;

-- ---------------------------------------------------------------------------------------------
-- 3. Each member's part of setup.
CREATE TABLE trip_member_setup (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  days_in boolean NOT NULL DEFAULT false,
  max_in boolean NOT NULL DEFAULT false,
  way_mode text CHECK (way_mode IN ('flight', 'train', 'bus', 'car', 'boat', 'other')),
  way_from text CHECK (char_length(way_from) BETWEEN 1 AND 80),
  way_arrives_at timestamptz,
  way_minutes integer CHECK (way_minutes BETWEEN 1 AND 10080),
  way_estimate_minor bigint CHECK (way_estimate_minor >= 0),
  way_currency char(3),
  way_booking_id uuid REFERENCES bookings (id) ON DELETE SET NULL,
  way_set_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id),
  CHECK ((way_estimate_minor IS NULL) = (way_currency IS NULL))
);
CREATE INDEX trip_member_setup_user_idx ON trip_member_setup (user_id);
CREATE TRIGGER trip_member_setup_touch_updated_at BEFORE UPDATE ON trip_member_setup
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE trip_member_setup ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_member_setup FORCE ROW LEVEL SECURITY;
CREATE POLICY trip_member_setup_select ON trip_member_setup FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY trip_member_setup_system ON trip_member_setup FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON trip_member_setup TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_member_setup TO app_system;
GRANT SELECT (created_at, days_in, id, max_in, trip_id, updated_at, user_id, way_mode, way_set_at)
  ON trip_member_setup TO admin_reader;

-- Whether each setup member's days and max are in: days anywhere in the locked dates (before the
-- dates lock, anywhere in the setup horizon), and a private max for this trip. Only flags leave
-- the C3 tables. Returns the number of members written.
CREATE OR REPLACE FUNCTION app.recompute_member_setup(p_trip uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  written integer;
BEGIN
  WITH t AS (
    SELECT coalesce(start_date, current_date) AS lo,
           coalesce(end_date, current_date + 183) AS hi
      FROM trips WHERE id = p_trip
  ), m AS (
    SELECT app.setup_member_ids(p_trip) AS user_id
  ), flags AS (
    SELECT m.user_id,
           EXISTS (SELECT 1 FROM calendar_days d, t
                    WHERE d.user_id = m.user_id AND d.state <> 'unknown'
                      AND d.date BETWEEN t.lo AND t.hi) AS days_in,
           EXISTS (SELECT 1 FROM budget_max_private b
                    WHERE b.trip_id = p_trip AND b.user_id = m.user_id) AS max_in
      FROM m
  )
  INSERT INTO trip_member_setup AS s (trip_id, user_id, days_in, max_in)
  SELECT p_trip, f.user_id, f.days_in, f.max_in FROM flags f
  ON CONFLICT (trip_id, user_id) DO UPDATE
    SET days_in = EXCLUDED.days_in, max_in = EXCLUDED.max_in
  WHERE (s.days_in, s.max_in) IS DISTINCT FROM (EXCLUDED.days_in, EXCLUDED.max_in);
  GET DIAGNOSTICS written = ROW_COUNT;
  RETURN written;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.recompute_member_setup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.recompute_member_setup(uuid) TO app_system;

-- The availability recount (the window recompute job, after every calendar sync) refreshes the
-- flags too.
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

  PERFORM app.recompute_member_setup(p_trip);

  SELECT count(*) INTO kept FROM availability_summaries s WHERE s.trip_id = p_trip;
  RETURN kept;
END;
$$;

-- Trips being set up now get their flags.
SELECT app.recompute_member_setup(id)
  FROM trips WHERE status IN ('won', 'setup', 'drafting', 'draft_review', 'redrafting');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'powersync' AND tablename = 'trip_member_setup'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE trip_member_setup;
  END IF;
END
$$;
GRANT SELECT ON trip_member_setup TO powersync_repl;

-- ---------------------------------------------------------------------------------------------
-- 4. How a member likes to sleep, beside their room chips (their own row only): share a room,
--    a room of their own, or either; and the ground-floor chip.
ALTER TABLE room_prefs ADD COLUMN sleep text CHECK (sleep IN ('share', 'own', 'either'));
GRANT INSERT (sleep), UPDATE (sleep) ON room_prefs TO app_user;
ALTER TABLE room_prefs DROP CONSTRAINT IF EXISTS room_prefs_chips_check;
ALTER TABLE room_prefs ADD CONSTRAINT room_prefs_chips_check
  CHECK (chips <@ ARRAY['early_bird', 'night_owl', 'light_sleeper', 'snorer', 'dont_care',
                        'ground_floor']);
