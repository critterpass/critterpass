-- The kind of place a curated place's researcher found it to be (docs/data-model.md §3.13 `pois`).
--
-- Open data files places under the wrong kind ("Khao San Road" as a restaurant, a fado house as a
-- restaurant, a war memorial as a hotel), so the draft planner plans a curated place as the kind
-- the curated places loader wrote here, unless it is `other`; `category` keeps what open data
-- files. It lives in its own column, not in `editorial`, because app builds already installed
-- read `editorial` strictly and would show a note with a key they do not know in English. It is
-- not copied to `place_cards` or `trip_places`, so it never reaches a phone. Null unless the place
-- carries a curated block; the loader clears it with the block.
--
-- pois holds millions of rows: the column is added without a default (no rewrite) and the check
-- is NOT VALID (every existing row is NULL and passes; new writes are checked). Idempotent. pois
-- stays C0 public place data.
ALTER TABLE pois ADD COLUMN IF NOT EXISTS curated_category text;

ALTER TABLE pois DROP CONSTRAINT IF EXISTS pois_curated_category_check;
ALTER TABLE pois ADD CONSTRAINT pois_curated_category_check CHECK (curated_category IN (
  'temple_shrine', 'food', 'market', 'nature', 'beach', 'museum', 'nightlife', 'shopping',
  'transit', 'stay', 'health', 'other'
)) NOT VALID;

-- The ops console reads pois column by column: the researched kind is public place data too.
GRANT SELECT (curated_category) ON pois TO admin_reader;
