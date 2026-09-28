-- Passes, taste profiles, stamps and avatars (docs/data-model.md §3.1 `taste_profiles`, `passes`,
-- `avatars`; §3.10 `stamps`).
--
-- Every row here is crew-visible (C1): the owner and anyone sharing an active crew read it. Passes
-- and stamps are system-written: a command reserves, issues and stamps through the SECURITY DEFINER
-- functions below, which only ever touch the caller's own rows. Taste profiles and avatars are
-- owner-written; a profile's `visibility` mirrors `user_settings.hide_taste_tags`, so hidden tags
-- never reach a crewmate through RLS, the `crew_people` stream or `llm.trip_context`.

-- ---------------------------------------------------------------------------------------------
-- passes: one per user. `start_pass` reserves the number while the pass is still a draft; an
-- offline `issue_pass` that never saw a reservation takes the next number when it syncs.
CREATE SEQUENCE pass_number_seq AS bigint START WITH 1 MINVALUE 1 NO CYCLE;

CREATE TABLE passes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL UNIQUE REFERENCES users (id),
  status text NOT NULL DEFAULT 'draft',
  number text NOT NULL UNIQUE,
  issued_at timestamptz,
  cover text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE passes ADD CONSTRAINT passes_status_check CHECK (status IN ('draft', 'issued'));
ALTER TABLE passes ADD CONSTRAINT passes_issued_check
  CHECK ((status = 'issued') = (issued_at IS NOT NULL));
ALTER TABLE passes ADD CONSTRAINT passes_number_check CHECK (number ~ '^CP-[0-9]{4,}$');
CREATE TRIGGER passes_touch_updated_at BEFORE UPDATE ON passes
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE passes FORCE ROW LEVEL SECURITY;
CREATE POLICY passes_select ON passes FOR SELECT TO app_user
  USING (user_id = app.uid() OR app.shares_crew(user_id, app.uid()));
CREATE POLICY passes_system ON passes FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON passes TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON passes TO app_system;
GRANT USAGE ON SEQUENCE pass_number_seq TO app_system;

-- `CP-0427`: four digits at least, never truncated (packages/domain/src/pass/number.ts).
CREATE OR REPLACE FUNCTION app.format_pass_number(n bigint) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT 'CP-' || CASE WHEN n < 10000 THEN lpad(n::text, 4, '0') ELSE n::text END
$$;

-- The caller's pass, reserving a number (as a draft under `p_id`) when there is none yet. A pass
-- that already exists keeps its id and number, so a replay or a late offline issue lands on it.
CREATE OR REPLACE FUNCTION app.reserve_pass(p_id uuid)
RETURNS TABLE (id uuid, number text, status text, issued_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
#variable_conflict use_column
DECLARE
  caller uuid := app.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'reserve_pass needs app.uid' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM passes p WHERE p.user_id = caller) THEN
    INSERT INTO passes (id, user_id, number)
    VALUES (coalesce(p_id, uuidv7()), caller, app.format_pass_number(nextval('pass_number_seq')))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN QUERY SELECT p.id, p.number, p.status, p.issued_at FROM passes p WHERE p.user_id = caller;
END
$$;

-- Issues the caller's pass (reserving it first when needed). `newly` is false on a replay.
CREATE OR REPLACE FUNCTION app.issue_pass(p_id uuid)
RETURNS TABLE (id uuid, number text, issued_at timestamptz, newly boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
#variable_conflict use_column
DECLARE
  caller uuid := app.uid();
  changed integer;
BEGIN
  PERFORM 1 FROM app.reserve_pass(p_id);
  UPDATE passes p SET status = 'issued', issued_at = now()
  WHERE p.user_id = caller AND p.status = 'draft';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN QUERY SELECT p.id, p.number, p.issued_at, changed > 0 FROM passes p
  WHERE p.user_id = caller;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- stamps: the pages of the pass. The home stamp is No. 1, created when the pass is issued and
-- re-inked when the home airport changes; trip and referral stamps follow later in `seq_no` order.
CREATE TABLE stamps (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  pass_id uuid NOT NULL REFERENCES passes (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id),
  kind text NOT NULL,
  seq_no integer NOT NULL,
  destination_id uuid REFERENCES destinations (id),
  trip_id uuid REFERENCES trips (id),
  dates daterange,
  iata text,
  country text,
  ink_colour text,
  status text NOT NULL DEFAULT 'stamped',
  stamped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, seq_no)
);
ALTER TABLE stamps ADD CONSTRAINT stamps_kind_check
  CHECK (kind IN ('home', 'issued', 'trip', 'referral'));
ALTER TABLE stamps ADD CONSTRAINT stamps_status_check CHECK (status IN ('upcoming', 'stamped'));
ALTER TABLE stamps ADD CONSTRAINT stamps_seq_no_check CHECK (seq_no >= 1);
ALTER TABLE stamps ADD CONSTRAINT stamps_iata_check CHECK (iata IS NULL OR iata ~ '^[A-Z]{3}$');
ALTER TABLE stamps ADD CONSTRAINT stamps_country_check
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
CREATE UNIQUE INDEX stamps_one_home_idx ON stamps (pass_id) WHERE kind = 'home';
CREATE INDEX stamps_pass_id_idx ON stamps (pass_id);
CREATE INDEX stamps_trip_id_idx ON stamps (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX stamps_destination_id_idx ON stamps (destination_id) WHERE destination_id IS NOT NULL;
CREATE TRIGGER stamps_touch_updated_at BEFORE UPDATE ON stamps
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamps FORCE ROW LEVEL SECURITY;
CREATE POLICY stamps_select ON stamps FOR SELECT TO app_user
  USING (user_id = app.uid() OR app.shares_crew(user_id, app.uid()));
CREATE POLICY stamps_system ON stamps FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON stamps TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON stamps TO app_system;

-- Inks (or re-inks) the caller's home stamp on their issued pass; false while the pass is a draft.
CREATE OR REPLACE FUNCTION app.put_home_stamp(p_iata text, p_country text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  caller uuid := app.uid();
  pass uuid;
BEGIN
  SELECT p.id INTO pass FROM passes p WHERE p.user_id = caller AND p.status = 'issued';
  IF pass IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO stamps (pass_id, user_id, kind, seq_no, iata, country, status, stamped_at)
  VALUES (pass, caller, 'home', 1, p_iata, p_country, 'stamped', now())
  ON CONFLICT (pass_id) WHERE kind = 'home'
  DO UPDATE SET iata = EXCLUDED.iata, country = EXCLUDED.country
  WHERE (stamps.iata, stamps.country) IS DISTINCT FROM (EXCLUDED.iata, EXCLUDED.country);
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION app.format_pass_number(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reserve_pass(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.issue_pass(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.put_home_stamp(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.format_pass_number(bigint) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.reserve_pass(uuid) TO app_user;
GRANT EXECUTE ON FUNCTION app.issue_pass(uuid) TO app_user;
GRANT EXECUTE ON FUNCTION app.put_home_stamp(text, text) TO app_user;

-- ---------------------------------------------------------------------------------------------
-- taste_profiles: quiz answers and the tags they produce. `visibility` is not the owner's to
-- write: triggers derive it from `user_settings.hide_taste_tags` ('self' = hidden from the crew).
CREATE TABLE taste_profiles (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL UNIQUE REFERENCES users (id),
  answers jsonb NOT NULL DEFAULT '[]',
  tags text[] NOT NULL DEFAULT '{}',
  tag_sources jsonb NOT NULL DEFAULT '{}',
  chronotype text,
  pace text,
  room_pref text,
  visibility text NOT NULL DEFAULT 'crew',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE taste_profiles ADD CONSTRAINT taste_profiles_chronotype_check
  CHECK (chronotype IS NULL OR chronotype IN ('early', 'late'));
ALTER TABLE taste_profiles ADD CONSTRAINT taste_profiles_pace_check
  CHECK (pace IS NULL OR pace IN ('easy', 'packed'));
ALTER TABLE taste_profiles ADD CONSTRAINT taste_profiles_visibility_check
  CHECK (visibility IN ('crew', 'self'));
ALTER TABLE taste_profiles ADD CONSTRAINT taste_profiles_shape_check
  CHECK (jsonb_typeof(answers) = 'array' AND jsonb_typeof(tag_sources) = 'object');
CREATE TRIGGER taste_profiles_touch_updated_at BEFORE UPDATE ON taste_profiles
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE OR REPLACE FUNCTION app.taste_profile_visibility() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.visibility := CASE WHEN EXISTS (
    SELECT 1 FROM user_settings s WHERE s.user_id = NEW.user_id AND s.hide_taste_tags
  ) THEN 'self' ELSE 'crew' END;
  RETURN NEW;
END
$$;
CREATE TRIGGER taste_profiles_visibility BEFORE INSERT OR UPDATE ON taste_profiles
  FOR EACH ROW EXECUTE FUNCTION app.taste_profile_visibility();

CREATE OR REPLACE FUNCTION app.user_settings_taste_visibility() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE taste_profiles t
  SET visibility = CASE WHEN NEW.hide_taste_tags THEN 'self' ELSE 'crew' END
  WHERE t.user_id = NEW.user_id
    AND t.visibility <> CASE WHEN NEW.hide_taste_tags THEN 'self' ELSE 'crew' END;
  RETURN NULL;
END
$$;
CREATE TRIGGER user_settings_taste_visibility
  AFTER INSERT OR UPDATE OF hide_taste_tags ON user_settings
  FOR EACH ROW EXECUTE FUNCTION app.user_settings_taste_visibility();
REVOKE ALL ON FUNCTION app.taste_profile_visibility() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.user_settings_taste_visibility() FROM PUBLIC;

ALTER TABLE taste_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE taste_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY taste_profiles_select ON taste_profiles FOR SELECT TO app_user
  USING (
    user_id = app.uid() OR (visibility = 'crew' AND app.shares_crew(user_id, app.uid()))
  );
CREATE POLICY taste_profiles_insert ON taste_profiles FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid());
CREATE POLICY taste_profiles_update ON taste_profiles FOR UPDATE TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY taste_profiles_system ON taste_profiles FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON taste_profiles TO app_user;
GRANT INSERT (id, user_id, answers, tags, tag_sources, chronotype, pace, room_pref)
  ON taste_profiles TO app_user;
GRANT UPDATE (answers, tags, tag_sources, chronotype, pace, room_pref) ON taste_profiles TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON taste_profiles TO app_system;

-- ---------------------------------------------------------------------------------------------
-- avatars: one row per choice (the id is the client's), `users.avatar_id` points at the current
-- one. Photo avatars start `pending`; only the moderation job (app_system) moves them on, and
-- crewmates see initials until one is `approved`. `variant_keys` holds the rendered PNG sizes.
CREATE TABLE avatars (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  form_id text,
  ring text,
  media_key text,
  moderation_status text NOT NULL DEFAULT 'none',
  moderation_reason text,
  variant_keys jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE avatars ADD CONSTRAINT avatars_kind_check
  CHECK (kind IN ('initials', 'critter', 'photo'));
ALTER TABLE avatars ADD CONSTRAINT avatars_ring_check
  CHECK (ring IS NULL OR ring IN ('rare', 'epic', 'legendary'));
ALTER TABLE avatars ADD CONSTRAINT avatars_moderation_status_check
  CHECK (moderation_status IN ('none', 'pending', 'approved', 'rejected'));
ALTER TABLE avatars ADD CONSTRAINT avatars_shape_check CHECK (
  CASE kind
    WHEN 'initials' THEN form_id IS NULL AND media_key IS NULL AND moderation_status = 'none'
    WHEN 'critter' THEN form_id IS NOT NULL AND media_key IS NULL AND moderation_status = 'none'
    ELSE form_id IS NULL AND media_key IS NOT NULL AND moderation_status <> 'none'
  END
);
ALTER TABLE avatars ADD CONSTRAINT avatars_variant_keys_check
  CHECK (jsonb_typeof(variant_keys) = 'object');
CREATE INDEX avatars_user_id_idx ON avatars (user_id);
CREATE INDEX avatars_pending_idx ON avatars (created_at) WHERE moderation_status = 'pending';
CREATE TRIGGER avatars_touch_updated_at BEFORE UPDATE ON avatars
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatars FORCE ROW LEVEL SECURITY;
CREATE POLICY avatars_select ON avatars FOR SELECT TO app_user
  USING (user_id = app.uid() OR app.shares_crew(user_id, app.uid()));
CREATE POLICY avatars_insert ON avatars FOR INSERT TO app_user
  WITH CHECK (
    user_id = app.uid()
    AND moderation_status = CASE WHEN kind = 'photo' THEN 'pending' ELSE 'none' END
    AND variant_keys = '{}'::jsonb
  );
CREATE POLICY avatars_system ON avatars FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON avatars TO app_user;
GRANT INSERT (id, user_id, kind, form_id, ring, media_key, moderation_status) ON avatars TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON avatars TO app_system;

-- The ops console previews an avatar under review.
GRANT SELECT (created_at, form_id, id, kind, media_key, moderation_reason, moderation_status, ring, updated_at, user_id, variant_keys) ON avatars TO admin_reader;
CREATE POLICY avatars_admin_reader ON avatars FOR SELECT TO admin_reader USING (true);

ALTER TABLE users ADD CONSTRAINT users_avatar_id_fkey
  FOREIGN KEY (avatar_id) REFERENCES avatars (id) ON DELETE SET NULL;
CREATE INDEX users_avatar_id_idx ON users (avatar_id) WHERE avatar_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- llm.trip_context: participants gain their crew-visible taste tags (hidden ones stay out).
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
  ) AS participants
FROM trips t
LEFT JOIN destinations d ON d.id = t.destination_id
LEFT JOIN guides g ON g.id = t.guide_id
WHERE t.id = nullif(current_setting('app.trip', true), '')::uuid
  AND app.is_trip_member(t.id);

-- ---------------------------------------------------------------------------------------------
-- domain_events: the pass and profile events join the catalogue
-- (packages/domain/src/events/catalogue.ts).
ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (
  'crew.member_joined', 'crew.member_left', 'crew.member_removed',
  'trip.created', 'trip.status_changed',
  'plan.version_created',
  'change_set.proposed', 'change_set.applied', 'change_set.reverted', 'change_set.rejected',
  'rsvp.changed',
  'auth.merged',
  'invite.opened', 'attribution.claimed',
  'guide_action.undone',
  'fare.dropped', 'forecast.changed', 'hazard.changed',
  'moderation.decided',
  'entitlement.granted', 'entitlement.revoked',
  'device.permissions_changed', 'visit.recorded',
  'pass.issued', 'profile.updated', 'profile.taste_changed', 'profile.avatar_changed'
));

-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList: all four tables are C1 and synced.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['passes', 'stamps', 'taste_profiles', 'avatars'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
    EXECUTE format('GRANT SELECT ON %I TO powersync_repl', t);
  END LOOP;
END
$$;
