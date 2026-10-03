-- Open-data fields the POI ingest now keeps from Overture and FSQ OS Places, and the box each
-- destination's places come from.
--
-- `pois.confidence` is Overture's own existence score in [0, 1] (FSQ OS has none, so an FSQ-only
-- place leaves it null). Search uses it to rank low-confidence open-data rows below real places and
-- to keep them out of a no-query browse; it never hides or deletes a row, because trips, must-dos,
-- spawns and editorial content reference POI ids. `website` and `phone` are the first value the
-- sources list (FSQ's wins on a match), `brand` is Overture's brand name for chain places. The
-- table's RLS, grants and privacy class (C0) already cover the new columns: app_user reads the whole
-- row, app_system writes it. The PowerSync place streams list their columns explicitly, so these
-- stay server-side.
ALTER TABLE pois
  ADD COLUMN confidence real,
  ADD COLUMN website text,
  ADD COLUMN phone text,
  ADD COLUMN brand text;

ALTER TABLE pois ADD CONSTRAINT pois_confidence_check
  CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1);

-- `destinations.place_bounds` is the box the POI ingest reads open data for, and the area place
-- search covers for that destination. A source place is stored once (the per-source unique
-- indexes), so where boxes overlap (Hội An inside Đà Nẵng's, Reykjavík inside Iceland's) the first
-- destination to ingest it owns the row; search matches a destination's own rows or any row inside
-- its box. Kept apart from `geofence`, which drives arrival on the device. Filled by the ingest
-- CLI's bounds backfill from the geofence, the region-pack bounds or the Overture locality point
-- sized by population. Covered by the table's existing grants and RLS.
ALTER TABLE destinations ADD COLUMN place_bounds geography(Polygon, 4326);
