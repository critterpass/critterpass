-- Profile, settings, app icons and travel history (docs/data-model.md §3.1).
--
-- Expand only: new columns are nullable or defaulted, new tables are additive, and the users
-- username format check matches what `update_profile` already enforces.

-- ---------------------------------------------------------------------------------------------
-- users: spoken languages (3n-3) and the username change clock (one change per 30 days).
ALTER TABLE users ADD COLUMN languages text[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN username_changed_at timestamptz;
ALTER TABLE users ADD CONSTRAINT users_username_format_check
  CHECK (username IS NULL OR username ~ '^[a-z0-9_.]{3,20}$');
ALTER TABLE users ADD CONSTRAINT users_languages_max_check
  CHECK (cardinality(languages) <= 12);
GRANT SELECT (languages, username_changed_at) ON users TO admin_reader;

-- user_settings: guide sound and music (3n-7) and the home currency override (3n-8).
ALTER TABLE user_settings ADD COLUMN audio jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE user_settings ADD COLUMN home_currency_override text;
ALTER TABLE user_settings ADD CONSTRAINT user_settings_audio_object_check
  CHECK (jsonb_typeof(audio) = 'object');
ALTER TABLE user_settings ADD CONSTRAINT user_settings_home_currency_override_check
  CHECK (home_currency_override IS NULL OR home_currency_override ~ '^[A-Z]{3}$');
GRANT SELECT (audio, home_currency_override) ON user_settings TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- app_icon_unlocks: earned app icons (3n-5). RLS class O read / S write: only the unlock job
-- writes, the owner reads (and marks the NEW badge seen through `set_app_icon`'s system step).
CREATE TABLE app_icon_unlocks (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  icon_key text NOT NULL CHECK (icon_key ~ '^[a-z][a-z0-9-]{1,31}$'),
  source text NOT NULL CHECK (source IN ('form_found', 'crew_achievement', 'home_set')),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, icon_key)
);
CREATE TRIGGER app_icon_unlocks_touch_updated_at BEFORE UPDATE ON app_icon_unlocks
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE app_icon_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_icon_unlocks FORCE ROW LEVEL SECURITY;
CREATE POLICY app_icon_unlocks_owner_read ON app_icon_unlocks FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY app_icon_unlocks_system ON app_icon_unlocks FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON app_icon_unlocks TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_icon_unlocks TO app_system;

-- past_trips: self-reported travel history. RLS class O; removal is a soft delete
-- (`app_user` holds no DELETE anywhere).
CREATE TABLE past_trips (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  place_id uuid,
  country text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX past_trips_user_id_idx ON past_trips (user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER past_trips_touch_updated_at BEFORE UPDATE ON past_trips
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE past_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE past_trips FORCE ROW LEVEL SECURITY;
CREATE POLICY past_trips_self ON past_trips FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY past_trips_system ON past_trips FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON past_trips TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON past_trips TO app_system;

-- ---------------------------------------------------------------------------------------------
-- The profile, settings, icon and travel-history events join the catalogue
-- (packages/domain/src/you/events.ts).
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
      'settings.changed', 'profile.icon_changed', 'profile.icon_unlocked', 'past_trip.added',
      'past_trip.removed'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- ---------------------------------------------------------------------------------------------
-- The two publishable tables join the powersync publication (stream `me`), same guarded pattern
-- as every earlier extension (packages/db/src/publication.ts is the source of truth).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_icon_unlocks', 'past_trips'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
    EXECUTE format('GRANT SELECT ON %I TO powersync_repl', t);
  END LOOP;
END
$$;
