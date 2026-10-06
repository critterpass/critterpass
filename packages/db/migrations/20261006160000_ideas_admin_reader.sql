-- The ops console reads the ideas board as admin_reader to review a suggested idea before it is
-- published. The table is C0; writes stay with app_system.
-- BEGIN GENERATED admin_reader grants
GRANT SELECT (author_id, created_at, description, embedding, fixed_in_version, id, locale, merged_into_id, status, status_changed_at, team_note, title, updated_at, votes_count) ON ideas TO admin_reader;
CREATE POLICY ideas_admin_reader ON ideas FOR SELECT TO admin_reader USING (true);
-- END GENERATED admin_reader grants
