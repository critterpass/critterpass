-- Which stops an edit pushed later, and from when, so the edit's own stop can later be taken off
-- and those stops put back exactly. One additive column on `itinerary_versions` (privacy class
-- unchanged: C1, read by `app.is_version_visible`): `pushes`, a JSON array of
-- `{cause, items: [{stable_id, from: {starts_at, ends_at}, to: {starts_at, ends_at}}]}`. A record
-- is carried to the next version only while its cause stop exists and every stop it pushed still
-- sits at its `to` time on the same day (the api's `commitPlanVersion` drops it otherwise).
ALTER TABLE itinerary_versions ADD COLUMN IF NOT EXISTS pushes jsonb;

-- The ops console reads every column of the version (the privacy map grants admin_reader the
-- whole row).
GRANT SELECT (pushes) ON itinerary_versions TO admin_reader;
