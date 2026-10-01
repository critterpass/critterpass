-- Whether the build that registered a push-to-start token draws that kind. iOS issues a token for
-- every kind the app declares, even kinds its widget extension has no view for yet; a push-start
-- of such a kind shows a blank activity. Builds that list the kinds they draw (`la_kinds` on
-- `register_la_token`) set this per token; older builds never do, so the server push-starts only
-- the baseline kinds on their phones. Same RLS as the table: owner reads, app_system writes.
ALTER TABLE la_push_to_start_tokens ADD COLUMN drawn boolean NOT NULL DEFAULT false;
