-- The ops console reads a reported AI place profile (its lines, facts and sources) as admin_reader
-- when it decides a `place_profile` report. The table is C0; writes stay with app_system.
-- BEGIN GENERATED admin_reader grants
GRANT SELECT (basis, best_times, category, cost_micros, dish, dropped_facts, error, facts, generated_at, meal_role, model, photos, poi_id, requested_at, second_source, sources, status, texts, timings, updated_at, visit_min) ON place_profiles TO admin_reader;
CREATE POLICY place_profiles_admin_reader ON place_profiles FOR SELECT TO admin_reader USING (true);
-- END GENERATED admin_reader grants
