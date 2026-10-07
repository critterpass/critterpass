-- What an erased account still leaves behind once its rows and its stored objects are gone.
--
-- 1. `media_objects` rows. The table is server-only and the system role may insert and update it
--    but never delete: the rows are the list of stored objects still to erase. Once the object
--    store purge has removed an erased account's objects, this function removes that account's
--    rows, and only for an account whose deletion row says it was purged.
CREATE OR REPLACE FUNCTION app.purge_account_media_objects(p_user_id uuid) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH gone AS (
    DELETE FROM media_objects m
     WHERE m.owner_id = p_user_id
       AND EXISTS (SELECT 1 FROM account_deletions d
                    WHERE d.user_id = p_user_id AND d.purged_at IS NOT NULL)
    RETURNING 1
  )
  SELECT count(*)::integer FROM gone;
$$;
REVOKE EXECUTE ON FUNCTION app.purge_account_media_objects(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_account_media_objects(uuid) TO app_system;

-- 2. Feedback filed in the tracker. A ticket's row goes with its account, and with it the only
--    link to the tracker issue that still quotes what the person wrote. Each deleted ticket that
--    was filed leaves one row here, tied to the deletion and to nothing that names the person;
--    the external purge redacts the issue (or the ticket's comment on it) and removes the row.
--    RLS class S: no app_user access at all.
CREATE TABLE feedback_tracker_redactions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  deletion_id uuid NOT NULL REFERENCES account_deletions (id) ON DELETE CASCADE,
  ticket_no bigint NOT NULL,
  tracker_issue_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deletion_id, ticket_no)
);
ALTER TABLE feedback_tracker_redactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_tracker_redactions FORCE ROW LEVEL SECURITY;
CREATE POLICY feedback_tracker_redactions_system ON feedback_tracker_redactions
  FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, DELETE ON feedback_tracker_redactions TO app_system;

CREATE OR REPLACE FUNCTION app.note_tracker_redaction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.tracker_issue_id IS NOT NULL THEN
    INSERT INTO feedback_tracker_redactions (deletion_id, ticket_no, tracker_issue_id)
    SELECT d.id, OLD.ticket_no, OLD.tracker_issue_id
      FROM account_deletions d
     WHERE d.user_id = OLD.user_id AND d.restored_at IS NULL
     ORDER BY d.requested_at DESC
     LIMIT 1
    ON CONFLICT (deletion_id, ticket_no) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.note_tracker_redaction() FROM PUBLIC;

CREATE TRIGGER feedback_tickets_note_tracker_redaction BEFORE DELETE ON feedback_tickets
  FOR EACH ROW EXECUTE FUNCTION app.note_tracker_redaction();
