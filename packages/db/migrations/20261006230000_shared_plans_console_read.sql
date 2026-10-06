-- The console lists the plans crews have published (or that came down) so an operator can take one
-- down with a reason. admin_reader gets the table's columns the privacy map allows (class C0, with
-- trip_id, requested_by and consent_required_uids at C2; nothing here is C3), as for every table
-- the console reads.
GRANT SELECT (consent_required_uids, copies_count, cost_pp_rounded_minor, created_at, crew_size,
  currency, days_count, destination_id, id, projection, published_at, rating_avg, rating_count,
  requested_by, saves_count, status, tags, taste, title, toggles, travel_month, travel_year,
  travelled, trip_id, unpublish_reason, unpublished_at, updated_at) ON shared_plans TO admin_reader;
-- A plan still waiting for its crew's consent, declined or being prepared was never made public, so
-- the console never reads it.
CREATE POLICY shared_plans_admin_reader ON shared_plans FOR SELECT TO admin_reader
  USING (status IN ('published', 'unpublished'));
