-- Mapillary street-level photos are a media source: a place with no photo of its own, no partner
-- photo and no labelled stock photo may show one that passed the content factory's checks
-- (CC BY-SA 4.0, credited to its contributor and Mapillary). The publish job writes the row; the
-- ingest job asks Mapillary for the file's current URL by `source_id` (its links expire).
ALTER TABLE media_assets DROP CONSTRAINT media_assets_source_check;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_source_check
  CHECK (source IN ('pexels', 'pixabay', 'wikimedia', 'mapillary'));
