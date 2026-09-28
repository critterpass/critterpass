-- The ops console's cost index review reads the editorial price bands as admin_reader (C0).
-- Writes stay on the audited review_cost_index command (app_system).
-- BEGIN GENERATED admin_reader grants
GRANT SELECT (created_at, currency, destination_id, food_pp_day_minor, fun_pp_day_minor, id, nightly_minor_high, nightly_minor_low, reviewed_at, source, source_url, sourced_on, stay_type, updated_at) ON destination_cost_indices TO admin_reader;
CREATE POLICY destination_cost_indices_admin_reader ON destination_cost_indices FOR SELECT TO admin_reader USING (true);
-- END GENERATED admin_reader grants
