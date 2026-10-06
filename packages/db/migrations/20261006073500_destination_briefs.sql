-- Destination briefs: a destination's ranked essentials, its eateries and what a night costs per
-- tier, written by the `places.destination_brief` job from web pages (SearXNG, our own fetch of
-- the top pages, DeepSeek reading them) and read by Explore's picks and the recommended order.
--
-- destination_briefs: Authz "sys", RLS "R", privacy class C0. One row per destination.
-- `essentials` [{poi_id, rank, why: {locale: line}, sources: [{url, title, quote}], must_see,
-- essential}], `eateries` [{poi_id, dish, why, sources}], `stays` [{tier, low, high, currency,
-- source}] (amounts in major units of `currency`, one room a night). Every name is one of our own
-- place rows; a name no row carries is never stored. `why` is written in English (and Vietnamese
-- for a place in Vietnam); other languages are added the first time a reader asks. `origin`
-- 'editorial' rows carry the curated cities' must-sees and are never overwritten by a run.
-- No user data: the row is about a destination, never about who asked. Not synced.
CREATE TABLE IF NOT EXISTS destination_briefs (
  destination_id uuid PRIMARY KEY REFERENCES destinations (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'declined', 'failed')),
  origin text NOT NULL DEFAULT 'ai' CHECK (origin IN ('editorial', 'ai')),
  essentials jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(essentials) = 'array'),
  eateries jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(eateries) = 'array'),
  stays jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(stays) = 'array'),
  dropped jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dropped) = 'array'),
  model text,
  cost_micros bigint NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  timings jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  reviewed_at timestamptz,
  requested_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (origin = 'ai' OR reviewed_at IS NOT NULL)
);
-- The daily spend cap sums today's runs.
CREATE INDEX IF NOT EXISTS destination_briefs_requested_at_idx ON destination_briefs (requested_at);
ALTER TABLE destination_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE destination_briefs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS destination_briefs_select ON destination_briefs;
CREATE POLICY destination_briefs_select ON destination_briefs FOR SELECT TO app_user USING (true);
DROP POLICY IF EXISTS destination_briefs_system ON destination_briefs;
CREATE POLICY destination_briefs_system ON destination_briefs FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON destination_briefs TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON destination_briefs TO app_system;

-- A place's rank among its destination's ready brief essentials, or null: the recommended order
-- reads it first. Runs as the caller, so the table's own policies apply.
CREATE OR REPLACE FUNCTION app.brief_essential_rank(p_destination_id uuid, p_poi_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT (e.value->>'rank')::integer
    FROM destination_briefs b, jsonb_array_elements(b.essentials) AS e(value)
   WHERE b.destination_id = p_destination_id AND b.status = 'ready'
     AND e.value->>'poi_id' = p_poi_id::text
   LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION app.brief_essential_rank(uuid, uuid) TO app_user, app_system;

-- The curated cities' must-sees, essentials first, as reviewed briefs. Re-running refreshes only
-- editorial briefs, never one a run wrote.
INSERT INTO destination_briefs
  (destination_id, status, origin, essentials, reviewed_at, generated_at)
SELECT ranked.destination_id, 'ready', 'editorial',
       jsonb_agg(jsonb_build_object(
         'poi_id', ranked.id, 'rank', ranked.rank, 'why', '{}'::jsonb, 'sources', '[]'::jsonb,
         'must_see', true, 'essential', ranked.essential) ORDER BY ranked.rank),
       now(), now()
  FROM (
    SELECT p.id, p.destination_id,
           coalesce((p.editorial->>'essential')::boolean, false) AS essential,
           row_number() OVER (
             PARTITION BY p.destination_id
             ORDER BY coalesce((p.editorial->>'essential')::boolean, false) DESC,
                      array_position(ARRAY['temple_shrine', 'nature', 'beach', 'museum', 'market',
                                           'other', 'shopping', 'food', 'nightlife'], p.category)
                        NULLS LAST,
                      p.name, p.id) AS rank
      FROM pois p
     WHERE p.curation = 'editorial' AND p.status = 'active' AND p.merged_into_id IS NULL
       AND coalesce((p.editorial->>'must_see')::boolean, false)
  ) ranked
 GROUP BY ranked.destination_id
ON CONFLICT (destination_id) DO UPDATE
   SET essentials = EXCLUDED.essentials, status = 'ready', reviewed_at = EXCLUDED.reviewed_at,
       generated_at = EXCLUDED.generated_at, updated_at = now()
 WHERE destination_briefs.origin = 'editorial';
