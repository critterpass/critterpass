-- migrate:no-transaction
-- A booked stay finds its place by name among its trip's areas' stay POIs
-- (packages/db/src/planning/stay.ts): `destination_id = ANY(areas) AND lower(name) IN (title,
-- location)` over active stays. Without an index on the name, every call read every POI of the
-- table (millions) past the statement timeout, so the plan check failed for any trip with a booked
-- stay. This partial index holds only active stays, keyed by destination and lowercased name.
--
-- Built CONCURRENTLY, outside a transaction, so the place ingest keeps writing while it builds; the
-- statement is idempotent so a failed run can simply be retried.
CREATE INDEX CONCURRENTLY IF NOT EXISTS pois_stay_destination_name_idx
  ON pois (destination_id, lower(name))
  WHERE category = 'stay' AND status = 'active';
