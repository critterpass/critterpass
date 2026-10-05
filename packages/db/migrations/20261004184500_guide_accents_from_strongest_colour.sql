-- A guide's accent is the strongest of its critter's own colours, so a pale critter is known by its
-- mane or beak instead of an off-white fill (Ngựa is pink, not cream). The guide rows created
-- before that rule take their new accent here; `app.sync_critter_guides` writes a row only when
-- its name or accent differs, so a second run writes nothing, and a row's slug and named colour
-- stay as they are. The looks are packages/critter-art's `guideLook` over the dex as it stands
-- today; a later release passes its own.
ALTER TABLE guides NO FORCE ROW LEVEL SECURITY;
ALTER TABLE critters NO FORCE ROW LEVEL SECURITY;
ALTER TABLE critter_names NO FORCE ROW LEVEL SECURITY;

SELECT app.sync_critter_guides($looks$
{
  "cp-001":{"accent":"#b5d68f","colour":"yellow"}, "cp-002":{"accent":"#54d6a4","colour":"green"},
  "cp-003":{"accent":"#948eb0","colour":"blue"}, "cp-004":{"accent":"#b8744d","colour":"orange"},
  "cp-005":{"accent":"#ff8a4d","colour":"orange"}, "cp-006":{"accent":"#ff8fbf","colour":"pink"},
  "cp-007":{"accent":"#c9a882","colour":"orange"}, "cp-008":{"accent":"#e6dfcf","colour":"cream"},
  "cp-009":{"accent":"#dba06a","colour":"orange"}, "cp-010":{"accent":"#a497dc","colour":"blue"},
  "cp-011":{"accent":"#7c84a8","colour":"blue"}, "cp-012":{"accent":"#ffd84a","colour":"yellow"},
  "cp-013":{"accent":"#d0703a","colour":"orange"}, "cp-014":{"accent":"#ff6f5c","colour":"red"},
  "cp-015":{"accent":"#817d9d","colour":"blue"}, "cp-016":{"accent":"#7fb8ff","colour":"blue"},
  "cp-017":{"accent":"#bf7c52","colour":"orange"}, "cp-018":{"accent":"#e8b87a","colour":"orange"},
  "cp-019":{"accent":"#e3cc6c","colour":"yellow"}, "cp-020":{"accent":"#e0a92a","colour":"yellow"},
  "cp-021":{"accent":"#817ba4","colour":"blue"}, "cp-022":{"accent":"#dba06a","colour":"orange"},
  "cp-023":{"accent":"#e3c49c","colour":"orange"}, "cp-024":{"accent":"#78b35e","colour":"green"},
  "cp-025":{"accent":"#ffd84a","colour":"yellow"}, "cp-026":{"accent":"#f2c98a","colour":"yellow"},
  "cp-027":{"accent":"#b0925e","colour":"yellow"}, "cp-028":{"accent":"#d9703a","colour":"orange"},
  "cp-029":{"accent":"#817d9d","colour":"blue"}, "cp-030":{"accent":"#8d87a8","colour":"blue"},
  "cp-031":{"accent":"#8d93b0","colour":"blue"}, "cp-032":{"accent":"#e8c29a","colour":"orange"},
  "cp-033":{"accent":"#c98a5a","colour":"orange"}, "cp-034":{"accent":"#86bdfb","colour":"blue"},
  "cp-035":{"accent":"#ff5fa8","colour":"pink"}, "cp-036":{"accent":"#c9a27a","colour":"orange"},
  "cp-037":{"accent":"#c9a6f0","colour":"blue"}, "cp-038":{"accent":"#c9cc9a","colour":"yellow"},
  "cp-039":{"accent":"#54d6a4","colour":"green"}, "cp-040":{"accent":"#5b8fff","colour":"blue"},
  "cp-041":{"accent":"#ff5fa8","colour":"pink"}, "cp-042":{"accent":"#7494d4","colour":"blue"},
  "cp-043":{"accent":"#9cd66a","colour":"green"}, "cp-044":{"accent":"#c98a5a","colour":"orange"},
  "cp-045":{"accent":"#8a83ad","colour":"blue"}, "cp-046":{"accent":"#a8764f","colour":"orange"},
  "cp-047":{"accent":"#c9a27a","colour":"orange"}, "cp-048":{"accent":"#ff5a3d","colour":"red"},
  "cp-049":{"accent":"#ff7fae","colour":"pink"}, "cp-050":{"accent":"#cfa66e","colour":"yellow"},
  "cp-051":{"accent":"#857ea1","colour":"blue"}, "cp-052":{"accent":"#7c84a8","colour":"blue"},
  "cp-053":{"accent":"#54d6a4","colour":"green"}, "cp-054":{"accent":"#ffd84a","colour":"yellow"},
  "cp-055":{"accent":"#aaa4c2","colour":"blue"}, "cp-056":{"accent":"#ff8fbf","colour":"pink"},
  "cp-057":{"accent":"#86bdfb","colour":"blue"}, "cp-058":{"accent":"#7c84a8","colour":"blue"},
  "cp-059":{"accent":"#aaa4c2","colour":"blue"}, "cp-060":{"accent":"#e6dfcf","colour":"cream"},
  "cp-061":{"accent":"#ff9a4d","colour":"orange"}, "cp-062":{"accent":"#ffb46b","colour":"orange"},
  "cp-063":{"accent":"#c99a2a","colour":"yellow"}, "cp-064":{"accent":"#c9a27a","colour":"orange"},
  "cp-065":{"accent":"#dba06a","colour":"orange"}, "cp-066":{"accent":"#e6d6c6","colour":"cream"},
  "cp-067":{"accent":"#ff5fa8","colour":"pink"}, "cp-068":{"accent":"#817ba4","colour":"blue"},
  "cp-069":{"accent":"#e8d9b0","colour":"yellow"}, "cp-070":{"accent":"#bcc2da","colour":"cream"},
  "cp-071":{"accent":"#c98a5a","colour":"orange"}, "cp-072":{"accent":"#a8764f","colour":"orange"},
  "cp-073":{"accent":"#b8905a","colour":"orange"}, "cp-074":{"accent":"#ffb07a","colour":"orange"},
  "cp-075":{"accent":"#ff9a4d","colour":"orange"}, "cp-076":{"accent":"#54d6a4","colour":"green"},
  "cp-077":{"accent":"#857ea1","colour":"blue"}, "cp-078":{"accent":"#a07c5c","colour":"orange"},
  "cp-079":{"accent":"#ff9a4d","colour":"orange"}, "cp-080":{"accent":"#d9703a","colour":"orange"},
  "cp-081":{"accent":"#e0703a","colour":"orange"}, "cp-082":{"accent":"#bcc2da","colour":"cream"},
  "cp-083":{"accent":"#ff5a4d","colour":"red"}, "cp-084":{"accent":"#937f61","colour":"yellow"},
  "cp-085":{"accent":"#817d9d","colour":"blue"}, "cp-086":{"accent":"#807d96","colour":"cream"},
  "cp-087":{"accent":"#c98a5a","colour":"orange"}, "cp-088":{"accent":"#8fd06a","colour":"green"},
  "cp-089":{"accent":"#e0703a","colour":"orange"}, "cp-090":{"accent":"#aaa4c2","colour":"blue"},
  "cp-091":{"accent":"#4f86ff","colour":"blue"}, "cp-092":{"accent":"#817d9d","colour":"blue"},
  "cp-093":{"accent":"#54d6a4","colour":"green"}, "cp-094":{"accent":"#c9b8a0","colour":"cream"},
  "cp-095":{"accent":"#8f7a9a","colour":"pink"}, "cp-096":{"accent":"#b8905a","colour":"orange"},
  "cp-097":{"accent":"#817d9d","colour":"blue"}, "cp-098":{"accent":"#d9b48a","colour":"orange"},
  "cp-099":{"accent":"#d9a066","colour":"orange"}, "cp-100":{"accent":"#d6c498","colour":"yellow"},
  "cp-101":{"accent":"#acd0a4","colour":"green"}, "cp-102":{"accent":"#c9a06a","colour":"orange"},
  "cp-103":{"accent":"#b8744d","colour":"orange"}, "cp-104":{"accent":"#847f9e","colour":"blue"},
  "cp-105":{"accent":"#bdb48c","colour":"yellow"}, "cp-106":{"accent":"#807d96","colour":"cream"},
  "cp-107":{"accent":"#aaa4c2","colour":"blue"}, "cp-108":{"accent":"#827da2","colour":"blue"},
  "cp-109":{"accent":"#e8c290","colour":"orange"}, "cp-110":{"accent":"#4f86ff","colour":"blue"},
  "cp-111":{"accent":"#a9b06a","colour":"yellow"}, "cp-112":{"accent":"#ffd84a","colour":"yellow"},
  "cp-113":{"accent":"#aea78f","colour":"cream"}, "cp-114":{"accent":"#ead3b3","colour":"yellow"},
  "cp-115":{"accent":"#b8744d","colour":"orange"}, "cp-116":{"accent":"#817d9d","colour":"blue"},
  "cp-117":{"accent":"#c66846","colour":"red"}, "cp-118":{"accent":"#c9cde0","colour":"cream"},
  "cp-119":{"accent":"#dba06a","colour":"orange"}, "cp-120":{"accent":"#c9a27a","colour":"orange"},
  "cp-121":{"accent":"#d9b89a","colour":"orange"}, "cp-122":{"accent":"#e8d0b0","colour":"yellow"},
  "cp-123":{"accent":"#aaa4c2","colour":"blue"}, "cp-124":{"accent":"#e6dfcf","colour":"cream"},
  "cp-125":{"accent":"#807d96","colour":"cream"}, "cp-126":{"accent":"#7494d4","colour":"blue"},
  "cp-127":{"accent":"#ffc46b","colour":"yellow"}, "cp-128":{"accent":"#c98a5a","colour":"orange"},
  "cp-129":{"accent":"#817ba4","colour":"blue"}, "cp-130":{"accent":"#dba06a","colour":"orange"},
  "cp-131":{"accent":"#c9a27a","colour":"orange"}, "cp-132":{"accent":"#ffd84a","colour":"yellow"},
  "cp-133":{"accent":"#c9a27a","colour":"orange"}, "cp-134":{"accent":"#dba06a","colour":"orange"},
  "cp-135":{"accent":"#c9b08a","colour":"yellow"}, "cp-136":{"accent":"#c9a27a","colour":"orange"},
  "cp-137":{"accent":"#ff9cc8","colour":"pink"}, "cp-138":{"accent":"#dba06a","colour":"orange"},
  "cp-139":{"accent":"#817d9d","colour":"blue"}, "cp-140":{"accent":"#e0703a","colour":"orange"},
  "cp-141":{"accent":"#c9cde0","colour":"cream"}, "cp-142":{"accent":"#857ea1","colour":"blue"},
  "cp-143":{"accent":"#f4d9a0","colour":"yellow"}, "cp-144":{"accent":"#b8905a","colour":"orange"},
  "cp-145":{"accent":"#fff3c4","colour":"cream"}, "cp-146":{"accent":"#6fd66a","colour":"green"},
  "cp-147":{"accent":"#c97a3a","colour":"orange"}, "cp-148":{"accent":"#4f86ff","colour":"blue"},
  "cp-149":{"accent":"#54d6a4","colour":"green"}, "cp-150":{"accent":"#817d9d","colour":"blue"},
  "cp-151":{"accent":"#ff6b5b","colour":"red"}
}
$looks$::jsonb);

ALTER TABLE critter_names FORCE ROW LEVEL SECURITY;
ALTER TABLE critters FORCE ROW LEVEL SECURITY;
ALTER TABLE guides FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------------
-- Readers that run as the signed-in user (place search) ask whether guides go by city through this
-- function: app_user holds no grant on ops.ops_config.
CREATE OR REPLACE FUNCTION app.guides_per_city() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM ops.ops_config
                  WHERE key = 'guides.per_city' AND value = 'true'::jsonb)
$$;
REVOKE ALL ON FUNCTION app.guides_per_city() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guides_per_city() TO app_user, app_system;

-- The phone chooses the guide of a screen with no trip (Explore, a place page) from its own synced
-- rows, so it has to know the switch: the key becomes public and reaches phones through
-- `client_config`. Its value is not touched.
UPDATE ops.ops_config SET is_public = true WHERE key = 'guides.per_city' AND NOT is_public;
