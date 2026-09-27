-- Moderation intake: `report_content` collapses repeat reports of one subject into its open report
-- and counts every filing; the input compliance check files review-band text without a reporter;
-- `moderate_item` records its verdict as a `moderation.decided` domain event.

-- ---------------------------------------------------------------------------------------------
-- moderation_reports: a report is filed by a user or by the compliance check (no reporter).
ALTER TABLE moderation_reports ADD COLUMN source text NOT NULL DEFAULT 'user'
  CHECK (source IN ('user', 'compliance'));
ALTER TABLE moderation_reports ALTER COLUMN reporter_id DROP NOT NULL;
ALTER TABLE moderation_reports ADD CONSTRAINT moderation_reports_reporter_check
  CHECK (source <> 'user' OR reporter_id IS NOT NULL);
CREATE INDEX moderation_reports_open_subject_idx ON moderation_reports
  (target_kind, target_id, last_reported_at DESC) WHERE status = 'open';

-- The new column joins admin_reader's generated column grant (privacy map, class C2).
GRANT SELECT (source) ON moderation_reports TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- ops.moderation_filings: one row per (report, reporter). Written only by the `report_content`
-- command as app_system, read by the console as admin_reader; app_user has no access (ops schema).
CREATE TABLE ops.moderation_filings (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  report_id uuid NOT NULL REFERENCES moderation_reports (id),
  reporter_id uuid NOT NULL REFERENCES users (id),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  filed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, reporter_id)
);
CREATE INDEX moderation_filings_reporter_idx ON ops.moderation_filings (reporter_id, filed_at DESC);
ALTER TABLE ops.moderation_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.moderation_filings FORCE ROW LEVEL SECURITY;
CREATE POLICY moderation_filings_system ON ops.moderation_filings FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY moderation_filings_admin_reader ON ops.moderation_filings FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT, INSERT ON ops.moderation_filings TO app_system;
GRANT SELECT ON ops.moderation_filings TO admin_reader;

-- Earlier reports each count as their reporter's filing.
INSERT INTO ops.moderation_filings (report_id, reporter_id, reason, filed_at)
SELECT id, reporter_id, reason, created_at FROM moderation_reports WHERE reporter_id IS NOT NULL
ON CONFLICT (report_id, reporter_id) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- domain_events: `moderation.decided` joins the catalogue (packages/domain/src/events/catalogue.ts).
ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (
  'crew.member_joined', 'crew.member_left', 'crew.member_removed',
  'trip.created', 'trip.status_changed',
  'plan.version_created',
  'change_set.proposed', 'change_set.applied', 'change_set.reverted', 'change_set.rejected',
  'rsvp.changed',
  'auth.merged',
  'invite.opened', 'attribution.claimed',
  'guide_action.undone',
  'moderation.decided'
));
