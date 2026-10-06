-- Feedback triage and the tracker loop. Triage sorts a ticket (what kind of report, which part of
-- the app) next to the severity, summary and duplicate columns it already had; `fix_notified_at`
-- marks that the reporter was told their fix shipped, so they are told once. The triage and tracker
-- columns stay ungranted to app_user and unnamed by any sync stream, like the earlier ones.
ALTER TABLE feedback_tickets
  ADD COLUMN triage_kind text
    CHECK (triage_kind IN ('bug', 'idea', 'question', 'praise', 'other')),
  ADD COLUMN triage_area text
    CHECK (triage_area IN ('planning', 'money', 'guide', 'critters', 'crew', 'bookings', 'maps',
      'account', 'other')),
  ADD COLUMN triaged_at timestamptz,
  ADD COLUMN fix_notified_at timestamptz;
CREATE INDEX feedback_tickets_tracker_issue_idx ON feedback_tickets (tracker_issue_id)
  WHERE tracker_issue_id IS NOT NULL;

-- The ops console triages tickets as admin_reader. The table is C2; what the device said about
-- itself and the attachments are C3 and stay out of the grant.
-- BEGIN GENERATED admin_reader grants
GRANT SELECT (app_version, body, category, context, created_at, duplicate_of, duplicate_score, fix_notified_at, fixed_in_version, id, idea_id, include_device_info, mood, reply_channel, reply_due_at, sent_at, severity, source, status, ticket_no, tracker_issue_id, triage_area, triage_kind, triage_summary, triaged_at, trip_id, updated_at, user_id) ON feedback_tickets TO admin_reader;
CREATE POLICY feedback_tickets_admin_reader ON feedback_tickets FOR SELECT TO admin_reader USING (true);
-- END GENERATED admin_reader grants

-- The event that files the "we fixed it" inbox card (packages/domain/src/help/events.ts), added to
-- whatever the constraint lists now.
DO $$
DECLARE
  current_values text[];
  merged text;
BEGIN
  SELECT array_agg(m[1] ORDER BY m[1]) INTO current_values
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = 'domain_events_type_check' AND c.conrelid = 'domain_events'::regclass;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_values || ARRAY['feedback.fix_shipped']) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;
