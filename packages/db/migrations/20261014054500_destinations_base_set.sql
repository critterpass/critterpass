-- The destination base set: about 5,000 travel destinations (Wikidata items with a Wikivoyage
-- article, GeoNames cities as gap fill, Vietnam topped up) that crews can search, pitch and vote
-- on. Built monthly by the worker's `destinations.base_build` job; a base row is read over the api
-- and synced only to the crews whose trips, polls or pitches use it.
--
-- `origin` says where a row came from: `seed` (the hand-seeded guide cities), `critter` (a critter
-- city or place, kept by app.sync_place_destinations()), `area` (a day-trip area) or `base` (the
-- base-set build). The build only enriches rows of the first three (ids, centre, population,
-- names, photo, text); their slug, name, coverage, set and critter never change.
--
-- Class C0 like the rest of the table: RLS, grants and the app_user read policy are unchanged.

ALTER TABLE destinations
  ADD COLUMN origin text NOT NULL DEFAULT 'critter'
    CONSTRAINT destinations_origin_check CHECK (origin IN ('seed', 'critter', 'area', 'base')),
  ADD COLUMN wikidata_qid text CONSTRAINT destinations_wikidata_qid_key UNIQUE
    CONSTRAINT destinations_wikidata_qid_check CHECK (wikidata_qid ~ '^Q[0-9]+$'),
  ADD COLUMN geonames_id integer CONSTRAINT destinations_geonames_id_key UNIQUE,
  ADD COLUMN country_code text
    CONSTRAINT destinations_country_code_check CHECK (country_code ~ '^[A-Z]{2}$'),
  ADD COLUMN admin1 text CONSTRAINT destinations_admin1_check CHECK (char_length(admin1) <= 80),
  ADD COLUMN kind text CONSTRAINT destinations_kind_check
    CHECK (kind IN ('city', 'town', 'village', 'island', 'park', 'region')),
  ADD COLUMN lat double precision CONSTRAINT destinations_lat_check CHECK (lat BETWEEN -90 AND 90),
  ADD COLUMN lng double precision
    CONSTRAINT destinations_lng_check CHECK (lng BETWEEN -180 AND 180),
  ADD COLUMN population integer CONSTRAINT destinations_population_check CHECK (population >= 0),
  -- `{en, vi, local}` names plus `source` ('vn_pick' keeps a Vietnam pick through every rebuild).
  ADD COLUMN names jsonb NOT NULL DEFAULT '{}'
    CONSTRAINT destinations_names_check CHECK (jsonb_typeof(names) = 'object'),
  ADD COLUMN base_rank real,
  -- `{method, distance_km, confidence?}`: how the critter of a base row was chosen, for audit.
  ADD COLUMN critter_match jsonb
    CONSTRAINT destinations_critter_match_check CHECK (jsonb_typeof(critter_match) = 'object'),
  -- `{<locale>: {line, about}}`, written from Wikidata and GeoNames facts only.
  ADD COLUMN texts jsonb NOT NULL DEFAULT '{}'
    CONSTRAINT destinations_texts_check CHECK (jsonb_typeof(texts) = 'object'),
  ADD COLUMN base_built_at timestamptz;

-- What place search matches: the name and every known name, lower case and unaccented, so
-- "quy nhon" finds Quy Nhơn.
ALTER TABLE destinations ADD COLUMN search_name text GENERATED ALWAYS AS (
  btrim(app.unaccent_immutable(lower(
    name || ' ' || coalesce(names ->> 'en', '') || ' ' || coalesce(names ->> 'vi', '') || ' '
      || coalesce(names ->> 'local', '')
  )))
) STORED;
CREATE INDEX destinations_search_name_trgm_idx ON destinations USING gin (search_name gin_trgm_ops);
CREATE INDEX destinations_base_idx ON destinations (country_code, base_rank DESC)
  WHERE origin = 'base';

UPDATE destinations SET origin = 'area' WHERE coverage = 'area';
UPDATE destinations SET origin = 'seed'
 WHERE slug IN ('bali', 'kyoto', 'iceland', 'mexico-city', 'lisbon', 'cusco', 'da-nang');

GRANT SELECT (origin, wikidata_qid, geonames_id, country_code, admin1, kind, lat, lng, population,
  names, base_rank, critter_match, texts, base_built_at, search_name) ON destinations TO admin_reader;

-- One release row per build holds the build's Commons photos.
ALTER TABLE content_releases DROP CONSTRAINT content_releases_kind_check;
ALTER TABLE content_releases ADD CONSTRAINT content_releases_kind_check CHECK (kind IN (
  'sets', 'critters', 'forms', 'spawns', 'windows', 'personas', 'places', 'phrases',
  'taste_quiz', 'help', 'emergency', 'facilities', 'insurance', 'ride_tariffs', 'media',
  'destinations'
));

-- Search and new polls offer base rows while this is on (the rollback switch).
INSERT INTO ops.ops_config (key, value, is_public)
VALUES ('destinations.base_search', 'true'::jsonb, false)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION app.destinations_base_search() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM ops.ops_config
                      WHERE key = 'destinations.base_search' AND value = 'false'::jsonb)
$$;
REVOKE ALL ON FUNCTION app.destinations_base_search() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.destinations_base_search() TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- A critter city whose slug a base row already holds takes that row over: it gains the critter
-- columns and becomes a critter row, and keeps the build's name, ids, photo, text and match.
CREATE OR REPLACE FUNCTION app.sync_place_destinations() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
BEGIN
  UPDATE destinations d SET critter_set_id = s.id, critter_key = s.hero_critter_key
    FROM critter_sets s
   WHERE s.destination_id = d.id
     AND (d.critter_set_id, d.critter_key) IS DISTINCT FROM (s.id, s.hero_critter_key);

  INSERT INTO destinations (slug, name, country, coverage, currency, tz, critter_set_id, critter_key)
  SELECT DISTINCT ON (slug) slug, city, place, coverage, currency, tz, set_id, critter_key
    FROM (
      SELECT s.code || '-' || trim(BOTH '-' FROM regexp_replace(
               app.unaccent_immutable(lower(c.city)), '[^a-z0-9]+', '-', 'g')) AS slug,
             c.city, s.name AS place, s.coverage, s.currency, s.tz, s.id AS set_id,
             c.key AS critter_key
        FROM critters c
        JOIN critter_sets s ON s.id = c.set_id
        LEFT JOIN destinations linked ON linked.id = s.destination_id
       WHERE linked.id IS NULL
          OR app.unaccent_immutable(lower(linked.name)) <> app.unaccent_immutable(lower(c.city))
    ) cities
   ORDER BY slug, critter_key
  ON CONFLICT (slug) DO UPDATE
    SET name = CASE WHEN destinations.origin = 'base' THEN destinations.name ELSE EXCLUDED.name END,
        country = CASE WHEN destinations.origin = 'base' THEN destinations.country
                       ELSE EXCLUDED.country END,
        coverage = EXCLUDED.coverage,
        currency = coalesce(EXCLUDED.currency, destinations.currency),
        tz = coalesce(EXCLUDED.tz, destinations.tz),
        critter_set_id = EXCLUDED.critter_set_id,
        critter_key = EXCLUDED.critter_key,
        critter_match = CASE WHEN destinations.origin = 'base' THEN destinations.critter_match END,
        origin = CASE WHEN destinations.origin = 'base' THEN 'critter' ELSE destinations.origin END
  WHERE destinations.origin = 'base'
     OR (destinations.name, destinations.country, destinations.coverage, destinations.currency,
         destinations.tz, destinations.critter_set_id, destinations.critter_key)
    IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.country, EXCLUDED.coverage, EXCLUDED.currency,
         EXCLUDED.tz, EXCLUDED.critter_set_id, EXCLUDED.critter_key);
END;
$$;
REVOKE EXECUTE ON FUNCTION app.sync_place_destinations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.sync_place_destinations() TO app_system;
