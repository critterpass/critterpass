-- The ops console reads the ideas board as admin_reader to review a suggested idea before it is
-- published. Title, text, status and vote count are C0/C1; the embedding is not granted. Writes
-- stay with app_system.
GRANT SELECT (id, author_id, title, description, locale, status, team_note, fixed_in_version,
  merged_into_id, votes_count, status_changed_at, created_at, updated_at) ON ideas TO admin_reader;
CREATE POLICY ideas_admin_reader ON ideas FOR SELECT TO admin_reader USING (true);
