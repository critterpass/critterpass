-- Every critter is the guide of its own city (docs/product-decisions.md, docs/data-model.md §3.2).
-- A guide row carries its critter's key and an accent colour; a destination carries the critter of
-- its city; guide rows are created from the released critters by one function, so no guide needs a
-- migration again; a trip's guide is chosen by one function that both writers call, and it answers
-- by city only while the `guides.per_city` switch is on.

-- ---------------------------------------------------------------------------------------------
-- Columns. `guides.colour` stays for readers that only know the named colours.
ALTER TABLE guides ADD COLUMN IF NOT EXISTS critter_key text;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS accent text;
ALTER TABLE guides DROP CONSTRAINT IF EXISTS guides_critter_key_key;
ALTER TABLE guides ADD CONSTRAINT guides_critter_key_key UNIQUE (critter_key);
ALTER TABLE guides DROP CONSTRAINT IF EXISTS guides_accent_check;
ALTER TABLE guides ADD CONSTRAINT guides_accent_check
  CHECK (accent IS NULL OR accent ~ '^#[0-9a-f]{6}$');
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS critter_key text;
GRANT SELECT (critter_key, accent) ON guides TO admin_reader;
GRANT SELECT (critter_key) ON destinations TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- A guide's slug is its critter's name folded to plain lowercase letters ("Ngựa" → "ngua").
-- packages/critter-art/src/guides/fold.ts folds the same way.
CREATE OR REPLACE FUNCTION app.guide_slug(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, app AS $$
  SELECT regexp_replace(lower(app.unaccent_immutable(p_name)), '[^a-z]', '', 'g')
$$;
REVOKE EXECUTE ON FUNCTION app.guide_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guide_slug(text) TO app_system;

-- Creates or updates the guide of every released critter that has a look in `p_looks`
-- (`{"cp-006": {"accent": "#fff1d6", "colour": "cream"}}`, computed from the critter's own colours
-- by the caller). A guide that existed before its critter was released takes the critter's key and
-- keeps its slug and colour. Two critters folding to one slug fail on the unique slug instead of
-- one overwriting the other. Returns the number of rows written.
CREATE OR REPLACE FUNCTION app.sync_critter_guides(p_looks jsonb) RETURNS integer
LANGUAGE plpgsql SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_bad text;
  v_claimed integer;
  v_written integer;
BEGIN
  SELECT n.name INTO v_bad
    FROM critters c
    JOIN critter_names n ON n.critter_id = c.id AND n.form_id IS NULL AND n.locale = 'en'
   WHERE p_looks ? c.key AND app.guide_slug(n.name) !~ '^[a-z]{2,16}$'
   LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'critter name "%" does not fold to a guide slug', v_bad;
  END IF;

  UPDATE guides g SET critter_key = c.key
    FROM critters c
    JOIN critter_names n ON n.critter_id = c.id AND n.form_id IS NULL AND n.locale = 'en'
   WHERE g.critter_key IS NULL AND g.slug = app.guide_slug(n.name)
     AND NOT EXISTS (SELECT 1 FROM guides taken WHERE taken.critter_key = c.key);
  GET DIAGNOSTICS v_claimed = ROW_COUNT;

  INSERT INTO guides (slug, name, colour, accent, critter_key)
  SELECT app.guide_slug(n.name), n.name, p_looks -> c.key ->> 'colour',
         p_looks -> c.key ->> 'accent', c.key
    FROM critters c
    JOIN critter_names n ON n.critter_id = c.id AND n.form_id IS NULL AND n.locale = 'en'
   WHERE p_looks ? c.key
  ON CONFLICT (critter_key) DO UPDATE SET name = EXCLUDED.name, accent = EXCLUDED.accent
   WHERE (guides.name, guides.accent) IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.accent);
  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN v_claimed + v_written;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.sync_critter_guides(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.sync_critter_guides(jsonb) TO app_system;

-- ---------------------------------------------------------------------------------------------
-- The destination's critter: a generated city destination carries its city's critter, a place's
-- own destination (Kyoto, Đà Nẵng) the place's hero critter.
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
    SET name = EXCLUDED.name, country = EXCLUDED.country, coverage = EXCLUDED.coverage,
        currency = EXCLUDED.currency, tz = EXCLUDED.tz, critter_set_id = EXCLUDED.critter_set_id,
        critter_key = EXCLUDED.critter_key
  WHERE (destinations.name, destinations.country, destinations.coverage, destinations.currency,
         destinations.tz, destinations.critter_set_id, destinations.critter_key)
    IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.country, EXCLUDED.coverage, EXCLUDED.currency,
         EXCLUDED.tz, EXCLUDED.critter_set_id, EXCLUDED.critter_key);
END;
$$;
REVOKE EXECUTE ON FUNCTION app.sync_place_destinations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.sync_place_destinations() TO app_system;

-- ---------------------------------------------------------------------------------------------
-- The guide of a trip to a destination. With `guides.per_city` on it is the guide of the
-- destination's critter; with it off, or for a destination with no critter or no guide row yet, it
-- is the guide of the destination's place, else Tokek.
CREATE OR REPLACE FUNCTION app.destination_guide_id(p_destination_id uuid) RETURNS uuid
LANGUAGE sql STABLE SET search_path = pg_catalog, public, app AS $$
  SELECT coalesce(
           (SELECT g.id FROM guides g
             WHERE g.critter_key = d.critter_key
               AND EXISTS (SELECT 1 FROM ops.ops_config c
                            WHERE c.key = 'guides.per_city' AND c.value = 'true'::jsonb)),
           (SELECT g.id FROM guides g WHERE g.slug = coalesce(s.guide_slug, 'tokek')))
    FROM destinations d
    LEFT JOIN critter_sets s ON s.id = d.critter_set_id
   WHERE d.id = p_destination_id
$$;
REVOKE EXECUTE ON FUNCTION app.destination_guide_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.destination_guide_id(uuid) TO app_system;

INSERT INTO ops.ops_config (key, value, is_public) VALUES ('guides.per_city', 'false'::jsonb, false)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- Backfill from what is already released: the destination links, then a guide per critter. The
-- looks are packages/critter-art's `guideLook` over the dex as it stands today; a later release
-- passes its own. These tables force RLS; lifting FORCE for the owner inside this one transaction
-- lets the migrating owner read and write them without a policy.
ALTER TABLE guides NO FORCE ROW LEVEL SECURITY;
ALTER TABLE destinations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE critters NO FORCE ROW LEVEL SECURITY;
ALTER TABLE critter_names NO FORCE ROW LEVEL SECURITY;
ALTER TABLE critter_sets NO FORCE ROW LEVEL SECURITY;

SELECT app.sync_place_destinations();
SELECT app.sync_critter_guides($looks$
{
  "cp-001":{"accent":"#b5d68f","colour":"cream"}, "cp-002":{"accent":"#54d6a4","colour":"green"},
  "cp-003":{"accent":"#948eb0","colour":"green"}, "cp-004":{"accent":"#b8744d","colour":"red"},
  "cp-005":{"accent":"#ff8a4d","colour":"orange"}, "cp-006":{"accent":"#fff1d6","colour":"cream"},
  "cp-007":{"accent":"#c9a882","colour":"orange"}, "cp-008":{"accent":"#fffaf0","colour":"cream"},
  "cp-009":{"accent":"#dba06a","colour":"orange"}, "cp-010":{"accent":"#a497dc","colour":"blue"},
  "cp-011":{"accent":"#bcc2da","colour":"cream"}, "cp-012":{"accent":"#ffd84a","colour":"yellow"},
  "cp-013":{"accent":"#ffc46b","colour":"yellow"}, "cp-014":{"accent":"#ff6f5c","colour":"red"},
  "cp-015":{"accent":"#fffaf0","colour":"cream"}, "cp-016":{"accent":"#7fb8ff","colour":"blue"},
  "cp-017":{"accent":"#bf7c52","colour":"red"}, "cp-018":{"accent":"#e8b87a","colour":"orange"},
  "cp-019":{"accent":"#e3cc6c","colour":"yellow"}, "cp-020":{"accent":"#ffd84a","colour":"yellow"},
  "cp-021":{"accent":"#bab4ca","colour":"cream"}, "cp-022":{"accent":"#dba06a","colour":"orange"},
  "cp-023":{"accent":"#e3c49c","colour":"cream"}, "cp-024":{"accent":"#78b35e","colour":"green"},
  "cp-025":{"accent":"#ffd84a","colour":"yellow"}, "cp-026":{"accent":"#f2c98a","colour":"yellow"},
  "cp-027":{"accent":"#b0925e","colour":"orange"}, "cp-028":{"accent":"#ffc46b","colour":"yellow"},
  "cp-029":{"accent":"#fffaf0","colour":"cream"}, "cp-030":{"accent":"#8d87a8","colour":"green"},
  "cp-031":{"accent":"#c9cde0","colour":"cream"}, "cp-032":{"accent":"#e8c29a","colour":"cream"},
  "cp-033":{"accent":"#c98a5a","colour":"orange"}, "cp-034":{"accent":"#86bdfb","colour":"blue"},
  "cp-035":{"accent":"#ff9cc8","colour":"pink"}, "cp-036":{"accent":"#c9a27a","colour":"orange"},
  "cp-037":{"accent":"#c9a6f0","colour":"cream"}, "cp-038":{"accent":"#8f9a6a","colour":"green"},
  "cp-039":{"accent":"#54d6a4","colour":"green"}, "cp-040":{"accent":"#5b8fff","colour":"blue"},
  "cp-041":{"accent":"#ff5fa8","colour":"pink"}, "cp-042":{"accent":"#7494d4","colour":"blue"},
  "cp-043":{"accent":"#9cd66a","colour":"green"}, "cp-044":{"accent":"#c98a5a","colour":"orange"},
  "cp-045":{"accent":"#8a83ad","colour":"green"}, "cp-046":{"accent":"#a8764f","colour":"red"},
  "cp-047":{"accent":"#c9a27a","colour":"orange"}, "cp-048":{"accent":"#ff9a4d","colour":"orange"},
  "cp-049":{"accent":"#ffb3cf","colour":"cream"}, "cp-050":{"accent":"#cfa66e","colour":"orange"},
  "cp-051":{"accent":"#847f9e","colour":"green"}, "cp-052":{"accent":"#bcc2da","colour":"cream"},
  "cp-053":{"accent":"#54d6a4","colour":"green"}, "cp-054":{"accent":"#ffd84a","colour":"yellow"},
  "cp-055":{"accent":"#aaa4c2","colour":"green"}, "cp-056":{"accent":"#ff8fbf","colour":"pink"},
  "cp-057":{"accent":"#86bdfb","colour":"blue"}, "cp-058":{"accent":"#bcc2da","colour":"cream"},
  "cp-059":{"accent":"#aaa4c2","colour":"green"}, "cp-060":{"accent":"#fffaf0","colour":"cream"},
  "cp-061":{"accent":"#ff9a4d","colour":"orange"}, "cp-062":{"accent":"#ffb46b","colour":"orange"},
  "cp-063":{"accent":"#ffe08a","colour":"cream"}, "cp-064":{"accent":"#c9a27a","colour":"orange"},
  "cp-065":{"accent":"#dba06a","colour":"orange"}, "cp-066":{"accent":"#fff1e6","colour":"cream"},
  "cp-067":{"accent":"#ff5fa8","colour":"pink"}, "cp-068":{"accent":"#bab4ca","colour":"cream"},
  "cp-069":{"accent":"#e8d9b0","colour":"cream"}, "cp-070":{"accent":"#f4efe4","colour":"cream"},
  "cp-071":{"accent":"#c98a5a","colour":"orange"}, "cp-072":{"accent":"#a8764f","colour":"red"},
  "cp-073":{"accent":"#e8c290","colour":"cream"}, "cp-074":{"accent":"#ffb07a","colour":"orange"},
  "cp-075":{"accent":"#ff9a4d","colour":"orange"}, "cp-076":{"accent":"#54d6a4","colour":"green"},
  "cp-077":{"accent":"#847f9e","colour":"green"}, "cp-078":{"accent":"#a07c5c","colour":"red"},
  "cp-079":{"accent":"#ff9a4d","colour":"orange"}, "cp-080":{"accent":"#d9703a","colour":"red"},
  "cp-081":{"accent":"#e0703a","colour":"red"}, "cp-082":{"accent":"#bcc2da","colour":"cream"},
  "cp-083":{"accent":"#ff5a4d","colour":"red"}, "cp-084":{"accent":"#d9c9b0","colour":"cream"},
  "cp-085":{"accent":"#aaa4c2","colour":"green"}, "cp-086":{"accent":"#fffaf0","colour":"cream"},
  "cp-087":{"accent":"#c98a5a","colour":"orange"}, "cp-088":{"accent":"#8fd06a","colour":"green"},
  "cp-089":{"accent":"#e0703a","colour":"red"}, "cp-090":{"accent":"#aaa4c2","colour":"green"},
  "cp-091":{"accent":"#4f86ff","colour":"blue"}, "cp-092":{"accent":"#fffaf0","colour":"cream"},
  "cp-093":{"accent":"#54d6a4","colour":"green"}, "cp-094":{"accent":"#c9b8a0","colour":"cream"},
  "cp-095":{"accent":"#c9b3c9","colour":"cream"}, "cp-096":{"accent":"#ecd09a","colour":"cream"},
  "cp-097":{"accent":"#fffaf0","colour":"cream"}, "cp-098":{"accent":"#d9b48a","colour":"orange"},
  "cp-099":{"accent":"#ffe0b0","colour":"cream"}, "cp-100":{"accent":"#fff1d6","colour":"cream"},
  "cp-101":{"accent":"#acd0a4","colour":"green"}, "cp-102":{"accent":"#f4d9a0","colour":"cream"},
  "cp-103":{"accent":"#b8744d","colour":"red"}, "cp-104":{"accent":"#fffaf0","colour":"cream"},
  "cp-105":{"accent":"#bdb48c","colour":"orange"}, "cp-106":{"accent":"#fffaf0","colour":"cream"},
  "cp-107":{"accent":"#fffaf0","colour":"cream"}, "cp-108":{"accent":"#8d87a8","colour":"green"},
  "cp-109":{"accent":"#e8c290","colour":"cream"}, "cp-110":{"accent":"#4f86ff","colour":"blue"},
  "cp-111":{"accent":"#a9b06a","colour":"orange"}, "cp-112":{"accent":"#ffd84a","colour":"yellow"},
  "cp-113":{"accent":"#aea78f","colour":"green"}, "cp-114":{"accent":"#ead3b3","colour":"cream"},
  "cp-115":{"accent":"#fffaf0","colour":"cream"}, "cp-116":{"accent":"#fffaf0","colour":"cream"},
  "cp-117":{"accent":"#fffaf0","colour":"cream"}, "cp-118":{"accent":"#fffaf0","colour":"cream"},
  "cp-119":{"accent":"#dba06a","colour":"orange"}, "cp-120":{"accent":"#c9a27a","colour":"orange"},
  "cp-121":{"accent":"#d9b89a","colour":"cream"}, "cp-122":{"accent":"#e8d0b0","colour":"cream"},
  "cp-123":{"accent":"#aaa4c2","colour":"green"}, "cp-124":{"accent":"#fffaf0","colour":"cream"},
  "cp-125":{"accent":"#fffaf0","colour":"cream"}, "cp-126":{"accent":"#7494d4","colour":"blue"},
  "cp-127":{"accent":"#ffc46b","colour":"yellow"}, "cp-128":{"accent":"#c98a5a","colour":"orange"},
  "cp-129":{"accent":"#bab4ca","colour":"cream"}, "cp-130":{"accent":"#dba06a","colour":"orange"},
  "cp-131":{"accent":"#c9a27a","colour":"orange"}, "cp-132":{"accent":"#ffd84a","colour":"yellow"},
  "cp-133":{"accent":"#c9a27a","colour":"orange"}, "cp-134":{"accent":"#dba06a","colour":"orange"},
  "cp-135":{"accent":"#c9b08a","colour":"orange"}, "cp-136":{"accent":"#c9a27a","colour":"orange"},
  "cp-137":{"accent":"#ff9cc8","colour":"pink"}, "cp-138":{"accent":"#dba06a","colour":"orange"},
  "cp-139":{"accent":"#fffaf0","colour":"cream"}, "cp-140":{"accent":"#e0703a","colour":"red"},
  "cp-141":{"accent":"#fffaf0","colour":"cream"}, "cp-142":{"accent":"#847f9e","colour":"green"},
  "cp-143":{"accent":"#f4d9a0","colour":"cream"}, "cp-144":{"accent":"#b8905a","colour":"orange"},
  "cp-145":{"accent":"#fff3c4","colour":"cream"}, "cp-146":{"accent":"#6fd66a","colour":"green"},
  "cp-147":{"accent":"#ffd08a","colour":"yellow"}, "cp-148":{"accent":"#4f86ff","colour":"blue"},
  "cp-149":{"accent":"#54d6a4","colour":"green"}, "cp-150":{"accent":"#fffaf0","colour":"cream"},
  "cp-151":{"accent":"#ff6b5b","colour":"red"}
}
$looks$::jsonb);

ALTER TABLE critter_sets FORCE ROW LEVEL SECURITY;
ALTER TABLE critter_names FORCE ROW LEVEL SECURITY;
ALTER TABLE critters FORCE ROW LEVEL SECURITY;
ALTER TABLE destinations FORCE ROW LEVEL SECURITY;
ALTER TABLE guides FORCE ROW LEVEL SECURITY;
