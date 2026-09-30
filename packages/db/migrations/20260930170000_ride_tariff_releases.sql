-- Ride tariffs join the content catalogue as their own release kind: published local taxi and
-- ride-hail fares per destination, each figure with its source link and the date it was checked,
-- reviewed and approved in the ops console like every other batch. The api reads the items straight
-- from the release (no catalogue table): the published release counts as reviewed, a batch still in
-- review is served flagged unreviewed. No user data; content_releases keeps its existing grants.
ALTER TABLE content_releases DROP CONSTRAINT content_releases_kind_check;
ALTER TABLE content_releases ADD CONSTRAINT content_releases_kind_check CHECK (kind IN (
  'sets', 'critters', 'forms', 'spawns', 'windows', 'personas', 'places', 'phrases',
  'taste_quiz', 'help', 'emergency', 'facilities', 'insurance', 'ride_tariffs'
));
