-- llm.pois gains what the guide needs to search and recommend honestly. The catalogue has no
-- ratings, so the only quality signals the guide may cite are the content factory's: whether a place
-- is editorially curated, its must-see flag and its "why go" line. `fts` (the unaccented name, local
-- name, tags and address vector the public search already uses) lets the guide find a place typed
-- without accents or in another word order through the GIN index, since guide_reader may not call
-- app.unaccent_immutable itself. Columns are appended, so the view keeps its existing column order.

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
  p.fts
FROM pois p
JOIN destinations d ON d.id = p.destination_id
LEFT JOIN poi_live_checks lc ON lc.poi_id = p.id
WHERE p.status = 'active';
