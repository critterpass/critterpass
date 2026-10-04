-- A trip's plan can exist before the guide drafts it: an organiser-only draft with the trip's days
-- and no stops, which the organiser edits by hand. Two additive columns on `itinerary_versions`
-- (privacy class unchanged: C1, read by `app.is_version_visible`):
--   `origin`: what made the version. `dates` = the empty plan written when dates lock, `hand` = an
--     organiser's own edit of a draft, `guide` = a guide draft or redraft, `restore` = an earlier
--     draft brought back. Null on versions written before this column and on crew versions.
--   `checked_at`: when the plan check last ran on an organiser-only draft. The trip-wide
--     `plan_checks` row is the crew's, so a private draft's run is stamped on the draft itself.
-- Older app builds ignore both columns.

ALTER TABLE itinerary_versions ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE itinerary_versions ADD COLUMN IF NOT EXISTS checked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'itinerary_versions_origin_check'
  ) THEN
    ALTER TABLE itinerary_versions ADD CONSTRAINT itinerary_versions_origin_check
      CHECK (origin IS NULL OR origin IN ('dates', 'hand', 'guide', 'restore'));
  END IF;
END
$$;
