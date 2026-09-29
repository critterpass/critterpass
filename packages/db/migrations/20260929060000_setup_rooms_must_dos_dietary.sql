-- Trip setup, rooms, must-dos and dietary data (docs/data-model.md §3.1, §3.4): the room plan and
-- who sleeps where, each member's room preferences, the crew's must-dos with their fit, the private
-- dietary profile and the dietary flags the crew may see once the member consents.
--
-- The crew reads rooms, assignments and must-dos (C1). The organiser changes rooms through commands
-- (server writes); a member adds and edits only their own must-dos, and the fit columns are the
-- server's. dietary_profiles is C3 (owner-only, unpublished, no guide_reader); the crew sees only
-- the derived participant_dietary_flags, and only while the member's consent stands.

-- ---------------------------------------------------------------------------------------------
-- room_plans: RLS class T. One plan per trip: the chosen stay, its rooms per stay (`rooms`:
-- [{stay_key, key, capacity, nightly_minor, label}]), the price currency and the lock.
CREATE TABLE room_plans (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL UNIQUE REFERENCES trips (id) ON DELETE CASCADE,
  stay_option_id text CHECK (char_length(stay_option_id) <= 80),
  rooms jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rooms) = 'array'),
  currency char(3),
  nights smallint CHECK (nights BETWEEN 0 AND 60),
  stay_booking_id uuid,
  free_cancel_until timestamptz,
  same_pairs_all_stays boolean NOT NULL DEFAULT true,
  is_stale boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  locked_by uuid REFERENCES users (id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX room_plans_locked_by_idx ON room_plans (locked_by) WHERE locked_by IS NOT NULL;
CREATE TRIGGER room_plans_touch_updated_at BEFORE UPDATE ON room_plans
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE room_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY room_plans_select ON room_plans FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY room_plans_system ON room_plans FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON room_plans TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON room_plans TO app_system;

-- ---------------------------------------------------------------------------------------------
-- room_assignments: RLS class T. Who sleeps in which room of which stay; `trait_label` is the
-- template group label (light sleepers, early risers, night owls).
CREATE TABLE room_assignments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  stay_key text NOT NULL DEFAULT 'main' CHECK (char_length(stay_key) BETWEEN 1 AND 40),
  room_key text NOT NULL CHECK (char_length(room_key) BETWEEN 1 AND 40),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  trait_label text CHECK (trait_label IN ('light_sleepers', 'early_risers', 'night_owls', 'couple')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, stay_key, user_id)
);
CREATE INDEX room_assignments_user_id_idx ON room_assignments (user_id);
CREATE TRIGGER room_assignments_touch_updated_at BEFORE UPDATE ON room_assignments
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE room_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY room_assignments_select ON room_assignments FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY room_assignments_system ON room_assignments FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON room_assignments TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON room_assignments TO app_system;

-- ---------------------------------------------------------------------------------------------
-- room_prefs: RLS class O (C2). A member's own room chips for one trip (early bird, light
-- sleeper, snorer, don't care) and the partner they share a bed with; the server groups rooms from
-- them and the crew sees only the resulting group labels.
CREATE TABLE room_prefs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  chips text[] NOT NULL DEFAULT '{}'
    CHECK (chips <@ ARRAY['early_bird', 'night_owl', 'light_sleeper', 'snorer', 'dont_care']),
  partner_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id),
  CHECK (partner_id IS NULL OR partner_id <> user_id)
);
CREATE INDEX room_prefs_user_id_idx ON room_prefs (user_id);
CREATE INDEX room_prefs_partner_id_idx ON room_prefs (partner_id) WHERE partner_id IS NOT NULL;
CREATE TRIGGER room_prefs_touch_updated_at BEFORE UPDATE ON room_prefs
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE room_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_prefs FORCE ROW LEVEL SECURITY;
CREATE POLICY room_prefs_owner ON room_prefs FOR ALL TO app_user
  USING (user_id = app.uid())
  WITH CHECK (user_id = app.uid() AND app.is_trip_member(trip_id));
CREATE POLICY room_prefs_system ON room_prefs FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT (id, trip_id, user_id, chips, partner_id), UPDATE (chips, partner_id)
  ON room_prefs TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON room_prefs TO app_system;

-- ---------------------------------------------------------------------------------------------
-- must_dos: RLS class T. One primary must-do per member plus optional extras (priority 0 is the
-- primary). The owner writes the words and the place; the fit columns belong to the fit-check job.
-- A duplicate merges into the first row with both members in `co_owner_ids`.
CREATE TABLE must_dos (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  poi_id uuid REFERENCES pois (id) ON DELETE SET NULL,
  freeform boolean NOT NULL DEFAULT false,
  priority smallint NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 9),
  co_owner_ids uuid[] NOT NULL DEFAULT '{}',
  fit_status text NOT NULL DEFAULT 'unknown' CHECK (fit_status IN ('fits', 'tight', 'clash', 'unknown')),
  fit_note text CHECK (char_length(fit_note) <= 160),
  target_day smallint CHECK (target_day >= 1),
  external_action text NOT NULL DEFAULT 'none'
    CHECK (external_action IN ('lottery', 'book_ahead', 'none')),
  external_deadline date,
  external_url text CHECK (char_length(external_url) <= 500),
  fit_checked_at timestamptz,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (freeform = (poi_id IS NULL))
);
CREATE INDEX must_dos_trip_id_idx ON must_dos (trip_id) WHERE deleted_at IS NULL;
CREATE INDEX must_dos_owner_id_idx ON must_dos (owner_id);
CREATE INDEX must_dos_poi_id_idx ON must_dos (poi_id) WHERE poi_id IS NOT NULL;
CREATE UNIQUE INDEX must_dos_primary_uk ON must_dos (trip_id, owner_id)
  WHERE priority = 0 AND deleted_at IS NULL;
CREATE TRIGGER must_dos_touch_updated_at BEFORE UPDATE ON must_dos
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE must_dos ENABLE ROW LEVEL SECURITY;
ALTER TABLE must_dos FORCE ROW LEVEL SECURITY;
CREATE POLICY must_dos_select ON must_dos FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY must_dos_owner_insert ON must_dos FOR INSERT TO app_user
  WITH CHECK (owner_id = app.uid() AND app.is_trip_member(trip_id));
CREATE POLICY must_dos_owner_update ON must_dos FOR UPDATE TO app_user
  USING (owner_id = app.uid()) WITH CHECK (owner_id = app.uid() AND app.is_trip_member(trip_id));
CREATE POLICY must_dos_system ON must_dos FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT (id, trip_id, owner_id, title, poi_id, freeform, priority),
  UPDATE (title, poi_id, freeform, priority, deleted_at) ON must_dos TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON must_dos TO app_system;

-- ---------------------------------------------------------------------------------------------
-- dietary_profiles: RLS class X (C3). A member's diet, allergies and notes; the crew may see
-- derived flags only while `visibility = 'crew_flags'` and consent is on record.
CREATE TABLE dietary_profiles (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  diet text CHECK (diet IN ('none', 'vegetarian', 'vegan', 'pescatarian', 'halal', 'kosher')),
  allergies text[] NOT NULL DEFAULT '{}',
  avoid text[] NOT NULL DEFAULT '{}',
  spice text CHECK (spice IN ('none', 'mild', 'medium', 'hot')),
  accessibility_notes_enc text,
  consent_at timestamptz,
  visibility text NOT NULL DEFAULT 'self' CHECK (visibility IN ('self', 'crew_flags')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(allergies) <= 20 AND cardinality(avoid) <= 20)
);
CREATE TRIGGER dietary_profiles_touch_updated_at BEFORE UPDATE ON dietary_profiles
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE dietary_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dietary_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY dietary_profiles_owner ON dietary_profiles FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY dietary_profiles_system ON dietary_profiles FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT (id, user_id, diet, allergies, avoid, spice, accessibility_notes_enc,
  consent_at, visibility), UPDATE (diet, allergies, avoid, spice, accessibility_notes_enc,
  consent_at, visibility) ON dietary_profiles TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON dietary_profiles TO app_system;

-- ---------------------------------------------------------------------------------------------
-- participant_dietary_flags: RLS class T (C1, derived with consent). The flags (`vegetarian`,
-- `no_peanuts`) of one member for one trip, written only by app.sync_dietary_flags.
CREATE TABLE participant_dietary_flags (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  flags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id)
);
CREATE INDEX participant_dietary_flags_user_id_idx ON participant_dietary_flags (user_id);
CREATE TRIGGER participant_dietary_flags_touch_updated_at BEFORE UPDATE ON participant_dietary_flags
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE participant_dietary_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_dietary_flags FORCE ROW LEVEL SECURITY;
CREATE POLICY participant_dietary_flags_select ON participant_dietary_flags FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY participant_dietary_flags_system ON participant_dietary_flags FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON participant_dietary_flags TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON participant_dietary_flags TO app_system;

-- The flags a profile may show: the diet and one `no_<allergen>` per allergy. Nothing else (avoid
-- lists, spice, notes) ever leaves the profile.
CREATE OR REPLACE FUNCTION app.dietary_flags_of(p dietary_profiles) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, app AS $$
  SELECT coalesce(array_agg(flag ORDER BY flag), '{}')
    FROM (
      SELECT p.diet AS flag WHERE p.diet IS NOT NULL AND p.diet <> 'none'
      UNION
      SELECT 'no_' || lower(regexp_replace(a, '[^a-zA-Z0-9]+', '_', 'g')) FROM unnest(p.allergies) a
    ) f
$$;

-- Re-derives one member's flags on every open trip of their crews: written while consent stands,
-- removed the moment it does not.
CREATE OR REPLACE FUNCTION app.sync_dietary_flags(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  profile dietary_profiles;
  shown boolean;
BEGIN
  SELECT * INTO profile FROM dietary_profiles WHERE user_id = p_user;
  shown := FOUND AND profile.visibility = 'crew_flags' AND profile.consent_at IS NOT NULL
    AND cardinality(app.dietary_flags_of(profile)) > 0;
  IF NOT shown THEN
    DELETE FROM participant_dietary_flags WHERE user_id = p_user;
    RETURN;
  END IF;
  INSERT INTO participant_dietary_flags AS f (trip_id, user_id, flags)
  SELECT t.id, p_user, app.dietary_flags_of(profile)
    FROM trips t
    JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = p_user AND m.status = 'active'
   WHERE t.status NOT IN ('archived', 'cancelled')
  ON CONFLICT (trip_id, user_id) DO UPDATE SET flags = EXCLUDED.flags
  WHERE f.flags IS DISTINCT FROM EXCLUDED.flags;
  DELETE FROM participant_dietary_flags f
   WHERE f.user_id = p_user
     AND NOT EXISTS (
       SELECT 1 FROM trips t
         JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = p_user AND m.status = 'active'
        WHERE t.id = f.trip_id AND t.status NOT IN ('archived', 'cancelled')
     );
END;
$$;
REVOKE EXECUTE ON FUNCTION app.sync_dietary_flags(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.sync_dietary_flags(uuid) TO app_system;

CREATE OR REPLACE FUNCTION app.dietary_profiles_sync_flags() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
BEGIN
  PERFORM app.sync_dietary_flags(coalesce(NEW.user_id, OLD.user_id));
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.dietary_profiles_sync_flags() FROM PUBLIC;
CREATE TRIGGER dietary_profiles_sync_flags AFTER INSERT OR UPDATE OR DELETE ON dietary_profiles
  FOR EACH ROW EXECUTE FUNCTION app.dietary_profiles_sync_flags();

-- A member joining or leaving a crew, or a trip opening, re-derives the flags that follow them.
CREATE OR REPLACE FUNCTION app.crew_members_sync_dietary_flags() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM dietary_profiles WHERE user_id = NEW.user_id)
     OR EXISTS (SELECT 1 FROM participant_dietary_flags WHERE user_id = NEW.user_id) THEN
    PERFORM app.sync_dietary_flags(NEW.user_id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.crew_members_sync_dietary_flags() FROM PUBLIC;
CREATE TRIGGER crew_members_sync_dietary_flags AFTER INSERT OR UPDATE OF status ON crew_members
  FOR EACH ROW EXECUTE FUNCTION app.crew_members_sync_dietary_flags();

CREATE OR REPLACE FUNCTION app.trips_sync_dietary_flags() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  member uuid;
BEGIN
  FOR member IN
    SELECT m.user_id FROM crew_members m JOIN dietary_profiles p ON p.user_id = m.user_id
     WHERE m.crew_id = NEW.crew_id AND m.status = 'active'
  LOOP
    PERFORM app.sync_dietary_flags(member);
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.trips_sync_dietary_flags() FROM PUBLIC;
CREATE TRIGGER trips_sync_dietary_flags AFTER INSERT OR UPDATE OF status ON trips
  FOR EACH ROW EXECUTE FUNCTION app.trips_sync_dietary_flags();

-- ---------------------------------------------------------------------------------------------
-- What the date-window engine reads for one trip, as the server only: each setup member's reported
-- days and askable `maybe` days over [p_from, p_to], the destination's reviewed season months and
-- events, cached fares from members' home airports, and the trip's must-dos with their places'
-- hours. The engine (packages/planner) turns it into window options; only those reach the crew.
CREATE OR REPLACE FUNCTION app.setup_window_inputs(p_trip uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  WITH trip AS (SELECT id, destination_id FROM trips WHERE id = p_trip),
  members AS (
    SELECT m.user_id, upper(u.home_airport) AS home
      FROM app.setup_member_ids(p_trip) AS m(user_id)
      JOIN users u ON u.id = m.user_id
  )
  SELECT jsonb_build_object(
    'members', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'uid', m.user_id,
        'home', m.home,
        'days', (
          SELECT coalesce(jsonb_object_agg(d.date::text, d.state), '{}'::jsonb)
            FROM calendar_days d
           WHERE d.user_id = m.user_id AND d.date BETWEEN p_from AND p_to AND d.state <> 'unknown'
        ),
        'askable', (
          SELECT coalesce(jsonb_agg(d.date::text ORDER BY d.date), '[]'::jsonb)
            FROM calendar_days d
           WHERE d.user_id = m.user_id AND d.date BETWEEN p_from AND p_to AND d.guide_may_ask
        )
      ) ORDER BY m.user_id), '[]'::jsonb)
      FROM members m
    ),
    'months', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('month', s.month, 'role', s.colour_role)), '[]'::jsonb)
        FROM season_months s JOIN trip t ON t.destination_id = s.destination_id
       WHERE s.reviewed_at IS NOT NULL
    ),
    'events', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'kind', e.kind, 'starts_on', e.starts_on::text, 'ends_on', e.ends_on::text)), '[]'::jsonb)
        FROM season_events e JOIN trip t ON t.destination_id = e.destination_id
       WHERE e.reviewed_at IS NOT NULL AND e.ends_on >= p_from AND e.starts_on <= p_to
    ),
    'fares', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'origin', f.origin_iata, 'month', f.month::text, 'price_minor', f.price_minor,
               'days', f.days)), '[]'::jsonb)
        FROM fare_cells f JOIN trip t ON t.destination_id = f.destination_id
       WHERE f.origin_iata IN (SELECT home FROM members WHERE home IS NOT NULL)
         AND f.month BETWEEN date_trunc('month', p_from)::date AND p_to
    ),
    'must_dos', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', md.id, 'owner_id', md.owner_id, 'hours', p.hours) ORDER BY md.id), '[]'::jsonb)
        FROM must_dos md LEFT JOIN pois p ON p.id = md.poi_id
       WHERE md.trip_id = p_trip AND md.deleted_at IS NULL
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION app.setup_window_inputs(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.setup_window_inputs(uuid, date, date) TO app_system;

-- ---------------------------------------------------------------------------------------------
-- reminders: a tracked lottery or book-ahead must-do reminds its owner (never enters for them).
ALTER TABLE reminders DROP CONSTRAINT reminders_target_kind_check;
ALTER TABLE reminders ADD CONSTRAINT reminders_target_kind_check
  CHECK (target_kind IN ('form_window', 'quiet_window', 'legendary', 'must_do'));

-- ---------------------------------------------------------------------------------------------
-- The C3 dietary profile stays out of the guide's reach; its consented flags reach the guide's
-- user preferences for the trip in context.
REVOKE ALL ON dietary_profiles FROM guide_reader;

CREATE OR REPLACE VIEW llm.user_prefs AS
SELECT
  s.user_id,
  s.chattiness,
  s.app_locale,
  s.talk_out_loud,
  s.crew_chat_mode,
  s.price_display,
  s.time_format,
  s.distance_unit,
  (
    SELECT f.flags FROM participant_dietary_flags f
     WHERE f.user_id = s.user_id
       AND f.trip_id = nullif(current_setting('app.trip', true), '')::uuid
  ) AS dietary_flags
FROM user_settings s
WHERE s.user_id = app.uid();

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY['room_plans', 'room_assignments', 'room_prefs', 'must_dos',
                                   'participant_dietary_flags'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON room_plans, room_assignments, room_prefs, must_dos, participant_dietary_flags
  TO powersync_repl;
