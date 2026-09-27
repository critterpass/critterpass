-- llm.pois: the guide's only window onto the curated POI catalogue (docs/data-model-sync-and-privacy.md
-- §2 "LLM context views"). A plain view (not `security_invoker`) owned by whichever role runs this
-- migration, same as every other table here — so `guide_reader`, which is granted SELECT on this view
-- and nothing on `public.pois`/`public.poi_live_checks` directly, can still read through it. Active
-- POIs only, live-check flags joined in, no supplier content and no internal-only ingest fields
-- (source_ids, curation, merged_into_id, geofence, visit_radius_m). `timezone` is the one exception:
-- it is not internal, just merged from `pois.timezone`/`destinations.tz` into a single effective
-- value, since evaluating `hours` (the tz-aware `openAt` function) needs it regardless of the
-- `place_details` tool's separate "hours quoted only with verified_at" grounding rule.

CREATE VIEW llm.pois AS
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
  lc.checked_at AS live_checked_at
FROM pois p
JOIN destinations d ON d.id = p.destination_id
LEFT JOIN poi_live_checks lc ON lc.poi_id = p.id
WHERE p.status = 'active';

GRANT SELECT ON llm.pois TO guide_reader;
