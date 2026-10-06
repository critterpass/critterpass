-- The perk lines the paywall, the plan comparison and the boost screens list. The app shows a perk
-- only while its row here is switched on (`is_shipped`) and it has words for the row's `copy_key`,
-- so a perk can be withdrawn from every screen without a release. Keys match the app's perk copy;
-- `sort` is the display order within a tier. A row that already exists keeps its switch: only its
-- tier, copy key and order are brought in line.
--
-- The table's rows are system-written under forced row security, so the rows go in as app_system.
SET LOCAL ROLE app_system;

-- Earlier seed names no app version has words for.
DELETE FROM perks WHERE key IN (
  'pass_plus_unlimited_guide', 'pass_plus_spoken_readout', 'boost_unlimited_guide_trip',
  'boost_unlimited_redrafts', 'boost_seats_16'
);

INSERT INTO perks (key, tier, copy_key, sort) VALUES
  ('pass_plus_guide_unlimited', 'pass_plus', 'monetize.perks.pass_plus_guide_unlimited', 10),
  ('pass_plus_mailbox_import', 'pass_plus', 'monetize.perks.pass_plus_mailbox_import', 20),
  ('pass_plus_icon_styles', 'pass_plus', 'monetize.perks.pass_plus_icon_styles', 30),
  ('pass_plus_no_sponsored', 'pass_plus', 'monetize.perks.pass_plus_no_sponsored', 40),
  ('pass_plus_next_flight', 'pass_plus', 'monetize.perks.pass_plus_next_flight', 50),
  ('pass_plus_read_out', 'pass_plus', 'monetize.perks.pass_plus_read_out', 60),
  ('pass_plus_postcard', 'pass_plus', 'monetize.perks.pass_plus_postcard', 70),
  ('boost_redrafts', 'boost', 'monetize.perks.boost_redrafts', 110),
  ('boost_live_map', 'boost', 'monetize.perks.boost_live_map', 120),
  ('boost_seats', 'boost', 'monetize.perks.boost_seats', 130),
  ('boost_guide_unlimited', 'boost', 'monetize.perks.boost_guide_unlimited', 140),
  ('boost_no_sponsored', 'boost', 'monetize.perks.boost_no_sponsored', 150),
  ('ftf_first_trip_free', 'ftf', 'monetize.perks.ftf_first_trip_free', 210),
  ('crew_year_everywhere', 'crew_year', 'monetize.perks.crew_year_everywhere', 310)
ON CONFLICT (key) DO UPDATE
  SET tier = EXCLUDED.tier, copy_key = EXCLUDED.copy_key, sort = EXCLUDED.sort;

RESET ROLE;
