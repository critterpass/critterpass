-- The ops console's season review reads month curves and queued events as admin_reader (both C0).
-- Writes stay on the audited upsert_season_editorial and review_season_event commands (app_system).
-- BEGIN GENERATED admin_reader grants
GRANT SELECT (confidence, created_at, destination_id, ends_on, forecast_updated_at, id, key, kind, name, reviewed_at, source, source_url, sourced_on, starts_on, updated_at) ON season_events TO admin_reader;
CREATE POLICY season_events_admin_reader ON season_events FOR SELECT TO admin_reader USING (true);
GRANT SELECT (colour_role, created_at, crowd_index, destination_id, highlight_tag, id, month, price_index, price_index_source, reviewed_at, source, source_url, sourced_on, updated_at) ON season_months TO admin_reader;
CREATE POLICY season_months_admin_reader ON season_months FOR SELECT TO admin_reader USING (true);
-- END GENERATED admin_reader grants
