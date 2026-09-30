-- Critters (docs/data-model.md §3.9): eggs, encounters and their evidence, per-sample dwell rows,
-- the collection, guide skins and the crew collection counts. Doc deltas: `encounter_evidence`
-- splits the C3 evidence off `encounters` (the private-field strategy of
-- docs/data-model-sync-and-privacy.md §1, so `encounters` can sync without it);
-- `crew_collection_counts` is a table (PowerSync cannot replicate views); `encounter_samples`
-- keeps a distance band, never a coordinate; `guide_skins` is created here;
-- `user_settings.explore_at_home`.
--
-- Every table is written by the server (app_system: the worker, or a command after its own check
-- through asSystemRole), except that a traveller may insert their own encounter. app_user reads
-- only its own rows; trip members read each other's egg (the hatch status on the trip hub); crew
-- members read each other's counts, which vanish when the owner hides their collection.

-- ---------------------------------------------------------------------------------------------
-- eggs: RLS O (+ trip members read), C1. One per traveller per trip.
CREATE TABLE eggs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  form_id uuid NOT NULL REFERENCES critter_forms (id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  hatched_at timestamptz,
  trigger text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eggs_user_trip_key UNIQUE (user_id, trip_id)
);
ALTER TABLE eggs ADD CONSTRAINT eggs_trigger_check
  CHECK (trigger IS NULL OR trigger IN ('landed', 'arrived', 'manual'));
ALTER TABLE eggs ADD CONSTRAINT eggs_hatched_check CHECK ((hatched_at IS NULL) = (trigger IS NULL));
CREATE INDEX eggs_trip_idx ON eggs (trip_id);
CREATE TRIGGER eggs_touch_updated_at BEFORE UPDATE ON eggs
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE eggs ENABLE ROW LEVEL SECURITY;
ALTER TABLE eggs FORCE ROW LEVEL SECURITY;
CREATE POLICY eggs_select ON eggs FOR SELECT TO app_user
  USING (user_id = app.uid() OR app.is_trip_member(trip_id));
CREATE POLICY eggs_system ON eggs FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON eggs TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON eggs TO app_system;

ALTER TABLE trip_participants ADD CONSTRAINT trip_participants_egg_id_fkey
  FOREIGN KEY (egg_id) REFERENCES eggs (id) ON DELETE SET NULL;
COMMENT ON COLUMN trip_participants.egg_id IS 'The traveller''s egg for this trip, set when granted.';

-- ---------------------------------------------------------------------------------------------
-- encounters: RLS O, C1. The id is the client's (UUIDv7), so an offline start, its samples and
-- its befriend agree on one row. `verification` is set once befriended. `trip_id` is null only for
-- a home-set encounter (explore at home).
CREATE TABLE encounters (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  trip_id uuid REFERENCES trips (id),
  spawn_rule_id uuid NOT NULL REFERENCES spawn_rules (id),
  form_id uuid NOT NULL REFERENCES critter_forms (id),
  poi_id uuid REFERENCES pois (id),
  state text NOT NULL DEFAULT 'accruing',
  dwell_s integer NOT NULL DEFAULT 0 CHECK (dwell_s >= 0),
  offline boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL,
  ready_at timestamptz,
  resolved_at timestamptz,
  verification text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE encounters ADD CONSTRAINT encounters_state_check
  CHECK (state IN ('accruing', 'ready', 'befriended', 'wandered_off', 'abandoned'));
ALTER TABLE encounters ADD CONSTRAINT encounters_verification_check
  CHECK (verification IS NULL OR verification IN ('pending', 'verified', 'revoked'));
ALTER TABLE encounters ADD CONSTRAINT encounters_verification_state_check
  CHECK ((verification IS NULL) = (state <> 'befriended'));
CREATE INDEX encounters_user_trip_idx ON encounters (user_id, trip_id);
CREATE INDEX encounters_rule_trip_idx ON encounters (spawn_rule_id, trip_id)
  WHERE verification = 'verified';
CREATE UNIQUE INDEX encounters_one_active_key ON encounters (user_id)
  WHERE state IN ('accruing', 'ready');
CREATE TRIGGER encounters_touch_updated_at BEFORE UPDATE ON encounters
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters FORCE ROW LEVEL SECURITY;
CREATE POLICY encounters_select ON encounters FOR SELECT TO app_user USING (user_id = app.uid());
CREATE POLICY encounters_insert ON encounters FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND state = 'accruing' AND verification IS NULL);
CREATE POLICY encounters_system ON encounters FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON encounters TO app_user;
GRANT INSERT (id, user_id, trip_id, spawn_rule_id, form_id, poi_id, offline, started_at)
  ON encounters TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON encounters TO app_system;

-- ---------------------------------------------------------------------------------------------
-- encounter_evidence: RLS X, C3, 30 days. The signed bundle (aggregates, samples hash, mock
-- flags, device clock), the attestation claim and the verifier's score. Never synced, never
-- readable by app_user, guide_reader or admin_reader.
CREATE TABLE encounter_evidence (
  encounter_id uuid PRIMARY KEY REFERENCES encounters (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  attestation jsonb NOT NULL CHECK (jsonb_typeof(attestation) = 'object'),
  skew_ms bigint NOT NULL DEFAULT 0,
  score jsonb CHECK (score IS NULL OR jsonb_typeof(score) = 'object'),
  received_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX encounter_evidence_expires_idx ON encounter_evidence (expires_at);
ALTER TABLE encounter_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounter_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY encounter_evidence_system ON encounter_evidence FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON encounter_evidence TO app_system;

-- ---------------------------------------------------------------------------------------------
-- encounter_samples: RLS X, C3, 7 days. Per sample: a distance band, accuracy and speed. There is
-- deliberately no latitude, longitude or geometry column: never raw fixes.
CREATE TABLE encounter_samples (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  encounter_id uuid NOT NULL REFERENCES encounters (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  at timestamptz NOT NULL,
  distance_band text NOT NULL CHECK (distance_band IN ('0_10', '10_25', '25_50', '50_plus')),
  accuracy_m real NOT NULL CHECK (accuracy_m >= 0),
  speed_mps real NOT NULL CHECK (speed_mps >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT encounter_samples_encounter_at_key UNIQUE (encounter_id, at)
);
CREATE INDEX encounter_samples_created_idx ON encounter_samples (created_at);
ALTER TABLE encounter_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounter_samples FORCE ROW LEVEL SECURITY;
CREATE POLICY encounter_samples_system ON encounter_samples FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON encounter_samples TO app_system;

-- ---------------------------------------------------------------------------------------------
-- collection_entries: RLS O, C1. One per (user, form); names are copied in once verified.
CREATE TABLE collection_entries (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES critter_forms (id),
  critter_id uuid NOT NULL REFERENCES critters (id),
  found_at timestamptz NOT NULL,
  poi_id uuid REFERENCES pois (id),
  trip_id uuid REFERENCES trips (id),
  source text NOT NULL,
  encounter_id uuid REFERENCES encounters (id) ON DELETE SET NULL,
  verification text NOT NULL DEFAULT 'pending',
  critter_name text,
  form_name text,
  -- Set by reward.fanout when the find is announced (crew hint, event, rewards), exactly once.
  announced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collection_entries_user_form_key UNIQUE (user_id, form_id)
);
ALTER TABLE collection_entries ADD CONSTRAINT collection_entries_source_check
  CHECK (source IN ('hatch', 'encounter', 'quest', 'grant'));
ALTER TABLE collection_entries ADD CONSTRAINT collection_entries_verification_check
  CHECK (verification IN ('pending', 'verified'));
ALTER TABLE collection_entries ADD CONSTRAINT collection_entries_names_check
  CHECK (verification = 'verified' OR (critter_name IS NULL AND form_name IS NULL));
CREATE INDEX collection_entries_critter_idx ON collection_entries (critter_id)
  WHERE verification = 'verified';
CREATE TRIGGER collection_entries_touch_updated_at BEFORE UPDATE ON collection_entries
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE collection_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY collection_entries_select ON collection_entries FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY collection_entries_system ON collection_entries FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON collection_entries TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON collection_entries TO app_system;

-- ---------------------------------------------------------------------------------------------
-- guide_skins: RLS O, C1. The owned form a traveller dresses a guide in (canonical colour stays).
CREATE TABLE guide_skins (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  guide_id uuid NOT NULL REFERENCES guides (id),
  form_id uuid NOT NULL REFERENCES critter_forms (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guide_skins_user_guide_key UNIQUE (user_id, guide_id)
);
CREATE TRIGGER guide_skins_touch_updated_at BEFORE UPDATE ON guide_skins
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE guide_skins ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_skins FORCE ROW LEVEL SECURITY;
CREATE POLICY guide_skins_select ON guide_skins FOR SELECT TO app_user USING (user_id = app.uid());
CREATE POLICY guide_skins_system ON guide_skins FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON guide_skins TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON guide_skins TO app_system;

-- ---------------------------------------------------------------------------------------------
-- crew_collection_counts: RLS M (crew members read), C1. "Maya has 14": one row per (crew,
-- member) with verified distinct critters and forms. Kept by app.refresh_crew_collection_counts,
-- which the triggers below and the worker's crew_counts job call; a member who hides their
-- collection has no rows at all.
CREATE TABLE crew_collection_counts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  critters integer NOT NULL DEFAULT 0 CHECK (critters >= 0),
  forms integer NOT NULL DEFAULT 0 CHECK (forms >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_collection_counts_crew_user_key UNIQUE (crew_id, user_id)
);
CREATE INDEX crew_collection_counts_user_idx ON crew_collection_counts (user_id);
ALTER TABLE crew_collection_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_collection_counts FORCE ROW LEVEL SECURITY;
CREATE POLICY crew_collection_counts_select ON crew_collection_counts FOR SELECT TO app_user
  USING (app.is_crew_member(crew_id));
CREATE POLICY crew_collection_counts_system ON crew_collection_counts FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON crew_collection_counts TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON crew_collection_counts TO app_system;

CREATE FUNCTION app.refresh_crew_collection_counts(member uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  hidden boolean;
BEGIN
  SELECT coalesce((SELECT hide_collection FROM user_settings WHERE user_id = member), false)
    INTO hidden;
  IF hidden THEN
    DELETE FROM crew_collection_counts WHERE user_id = member;
    RETURN;
  END IF;
  DELETE FROM crew_collection_counts c WHERE c.user_id = member AND NOT EXISTS (
    SELECT 1 FROM crew_members m WHERE m.crew_id = c.crew_id AND m.user_id = member
      AND m.status = 'active');
  INSERT INTO crew_collection_counts (crew_id, user_id, critters, forms)
  SELECT m.crew_id, member, t.critters, t.forms
    FROM crew_members m,
         (SELECT count(DISTINCT critter_id)::int AS critters, count(*)::int AS forms
            FROM collection_entries WHERE user_id = member AND verification = 'verified') t
   WHERE m.user_id = member AND m.status = 'active'
  ON CONFLICT (crew_id, user_id) DO UPDATE
    SET critters = EXCLUDED.critters, forms = EXCLUDED.forms, updated_at = now()
    WHERE crew_collection_counts.critters IS DISTINCT FROM EXCLUDED.critters
       OR crew_collection_counts.forms IS DISTINCT FROM EXCLUDED.forms;
END
$$;
REVOKE ALL ON FUNCTION app.refresh_crew_collection_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.refresh_crew_collection_counts(uuid) TO app_system;

CREATE FUNCTION app.crew_collection_counts_trigger() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM app.refresh_crew_collection_counts(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END);
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION app.crew_collection_counts_trigger() FROM PUBLIC;
CREATE TRIGGER collection_entries_crew_counts
  AFTER INSERT OR DELETE OR UPDATE OF verification ON collection_entries
  FOR EACH ROW EXECUTE FUNCTION app.crew_collection_counts_trigger();
CREATE TRIGGER user_settings_crew_counts AFTER UPDATE OF hide_collection ON user_settings
  FOR EACH ROW WHEN (OLD.hide_collection IS DISTINCT FROM NEW.hide_collection)
  EXECUTE FUNCTION app.crew_collection_counts_trigger();
CREATE TRIGGER crew_members_crew_counts AFTER INSERT OR UPDATE OF status ON crew_members
  FOR EACH ROW EXECUTE FUNCTION app.crew_collection_counts_trigger();

-- ---------------------------------------------------------------------------------------------
-- Eggs are granted and hatched through these two functions, from a command (after its own check,
-- as app_system) or the worker, so every path grants the same form and hatches exactly once.
--
-- app.grant_egg: one egg per boarded traveller (RSVP in, or an organiser not out) per trip. The
-- form is the destination set's starter: its lowest-numbered critter's common form in the live
-- release, so a newly published destination set is picked up from the data. No set, no egg.
CREATE FUNCTION app.grant_egg(p_user uuid, p_trip uuid)
  RETURNS TABLE (egg_id uuid, created boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  starter uuid;
  inserted uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM trip_participants
     WHERE trip_id = p_trip AND user_id = p_user
       AND (rsvp = 'in' OR (role = 'organiser' AND rsvp <> 'out'))
  ) THEN
    RETURN;
  END IF;
  SELECT e.id INTO inserted FROM eggs e WHERE e.user_id = p_user AND e.trip_id = p_trip;
  IF inserted IS NOT NULL THEN
    RETURN QUERY SELECT inserted, false;
    RETURN;
  END IF;
  SELECT f.id INTO starter
    FROM trips t
    JOIN destinations d ON d.id = t.destination_id
    JOIN critter_sets s ON s.id = d.critter_set_id OR s.destination_id = d.id
    JOIN critters c ON c.set_id = s.id
    JOIN critter_forms f ON f.critter_id = c.id AND f.rarity = 'common'
   WHERE t.id = p_trip AND app.is_live_release(f.release_id)
   ORDER BY (s.id = d.critter_set_id) DESC, c.no, f.key
   LIMIT 1;
  IF starter IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO eggs (user_id, trip_id, form_id) VALUES (p_user, p_trip, starter)
  ON CONFLICT (user_id, trip_id) DO NOTHING
  RETURNING id INTO inserted;
  IF inserted IS NULL THEN
    SELECT e.id INTO inserted FROM eggs e WHERE e.user_id = p_user AND e.trip_id = p_trip;
    RETURN QUERY SELECT inserted, false;
    RETURN;
  END IF;
  UPDATE trip_participants SET egg_id = inserted WHERE trip_id = p_trip AND user_id = p_user;
  RETURN QUERY SELECT inserted, true;
END
$$;
REVOKE ALL ON FUNCTION app.grant_egg(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.grant_egg(uuid, uuid) TO app_system;

-- app.hatch_egg: grants the egg if the traveller boarded without one, hatches it once (whichever
-- trigger comes first), and files the hatched form as a verified collection entry with its names.
-- `hatched` is false when the egg had already hatched (another trigger or device got there first).
CREATE FUNCTION app.hatch_egg(p_user uuid, p_trip uuid, p_trigger text)
  RETURNS TABLE (egg_id uuid, form_id uuid, entry_id uuid, hatched boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  egg uuid;
  form uuid;
  entry uuid;
BEGIN
  PERFORM app.grant_egg(p_user, p_trip);
  UPDATE eggs e SET hatched_at = now(), trigger = p_trigger
   WHERE e.user_id = p_user AND e.trip_id = p_trip AND e.hatched_at IS NULL
  RETURNING e.id, e.form_id INTO egg, form;
  IF egg IS NULL THEN
    SELECT e.id, e.form_id INTO egg, form FROM eggs e WHERE e.user_id = p_user AND e.trip_id = p_trip;
    IF egg IS NOT NULL THEN
      RETURN QUERY SELECT egg, form, NULL::uuid, false;
    END IF;
    RETURN;
  END IF;
  INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, trip_id, source,
    verification, critter_name, form_name)
  SELECT p_user, f.id, f.critter_id, now(), p_trip, 'hatch', 'verified',
         (SELECT cn.name FROM critter_names cn
           WHERE cn.critter_id = f.critter_id AND cn.form_id IS NULL AND cn.locale = 'en' LIMIT 1),
         (SELECT cn.name FROM critter_names cn WHERE cn.form_id = f.id AND cn.locale = 'en' LIMIT 1)
    FROM critter_forms f WHERE f.id = form
  ON CONFLICT (user_id, form_id) DO NOTHING
  RETURNING id INTO entry;
  RETURN QUERY SELECT egg, form, entry, true;
END
$$;
REVOKE ALL ON FUNCTION app.hatch_egg(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.hatch_egg(uuid, uuid, text) TO app_system;

-- ---------------------------------------------------------------------------------------------
-- user_settings.explore_at_home: collecting in the home set needs this foreground opt-in.
ALTER TABLE user_settings ADD COLUMN explore_at_home boolean NOT NULL DEFAULT false;
GRANT SELECT (explore_at_home) ON user_settings TO admin_reader;

-- A traveller has at most one pending reminder per legendary window.
CREATE UNIQUE INDEX reminders_legendary_pending_key ON reminders (user_id, target_id)
  WHERE target_kind = 'legendary' AND status = 'pending';

-- ---------------------------------------------------------------------------------------------
-- The critter events join the catalogue (packages/domain/src/critters/events.ts), added to
-- whatever the constraint lists now.
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
      'egg.granted', 'egg.hatched', 'encounter.started', 'critter.befriended',
      'critter.revoked', 'copresence.completed', 'legendary.reminder_set',
      'legendary.reminder_due'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13): the synced critter tables. Evidence and
-- samples are C3 and never published.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'eggs', 'encounters', 'collection_entries', 'guide_skins', 'crew_collection_counts'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON eggs, encounters, collection_entries, guide_skins, crew_collection_counts
  TO powersync_repl;
