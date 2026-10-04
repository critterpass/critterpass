-- migrate:no-transaction
-- Machine picks for destinations without a curated set (docs/data-model.md §3.13 `pois`).
--
-- Only a few destinations have editorially curated places; everywhere else the catalogue is open
-- data with nothing saying which few hundred places are worth suggesting. `pick_rank` (1 = first)
-- marks the places the `places.pick` job chose for such a destination, and `pick_source` says how:
-- `named` (a well-known place the model named and we found in our own rows) or `fill` (the best
-- open-data rows by quality). A place is "recommended" when it is editorial or has a pick rank;
-- that is what drafting, suggestions and the phone's offline pack read.
--
-- pois holds millions of rows and the ingest writes to it: the columns are added without a default
-- (no rewrite), the check is NOT VALID (every existing row is NULL/NULL and passes; new writes are
-- checked) and the index is built CONCURRENTLY. Every statement is idempotent so a failed run can
-- simply be retried. pois stays C0 public place data.
ALTER TABLE pois ADD COLUMN IF NOT EXISTS pick_rank integer;
ALTER TABLE pois ADD COLUMN IF NOT EXISTS pick_source text;

ALTER TABLE pois DROP CONSTRAINT IF EXISTS pois_pick_check;
ALTER TABLE pois ADD CONSTRAINT pois_pick_check CHECK (
  (pick_rank IS NULL) = (pick_source IS NULL)
  AND (pick_rank IS NULL OR pick_rank > 0)
  AND (pick_source IS NULL OR pick_source IN ('named', 'fill'))
) NOT VALID;

CREATE INDEX CONCURRENTLY IF NOT EXISTS pois_destination_pick_rank_idx ON pois (destination_id, pick_rank)
  WHERE pick_rank IS NOT NULL;

-- The ops console reads pois column by column: the pick columns are public place data like the rest.
GRANT SELECT (pick_rank, pick_source) ON pois TO admin_reader;

-- The guide's view gains the rank, so its "recommended" matches every other reader's. The column
-- is appended, so the view keeps its existing column order.
CREATE OR REPLACE VIEW llm.pois AS
SELECT
  p.id,
  p.destination_id,
  p.name,
  p.name_local,
  p.category,
  p.lat,
  p.lng,
  p.address,
  p.hours,
  p.hours_verified_at,
  p.price_level,
  p.tags,
  p.status,
  coalesce(p.timezone, d.tz) AS timezone,
  lc.is_open_now,
  lc.closed_permanently,
  lc.checked_at AS live_checked_at,
  p.curation,
  coalesce(p.editorial -> 'must_see' = 'true'::jsonb, false) AS must_see,
  p.editorial ->> 'why_go' AS why_go,
  p.fts,
  p.pick_rank
FROM pois p
JOIN destinations d ON d.id = p.destination_id
LEFT JOIN poi_live_checks lc ON lc.poi_id = p.id
WHERE p.status = 'active';
