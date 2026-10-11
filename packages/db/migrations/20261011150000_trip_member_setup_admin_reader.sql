-- The admin console reads every crew-visible (C1) column of each member's setup part, as it does
-- for every other registered table below C3: how they get there joins the mode and when it was set.

GRANT SELECT (way_arrives_at, way_booking_id, way_currency, way_estimate_minor, way_from,
  way_minutes) ON trip_member_setup TO admin_reader;
CREATE POLICY trip_member_setup_admin_reader ON trip_member_setup FOR SELECT TO admin_reader
  USING (true);
