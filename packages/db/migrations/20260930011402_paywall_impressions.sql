-- Paywall impressions (docs/data-model.md §3.14): every time a paywall or an offer was shown to a
-- user and what they did with it. The paywall governor (packages/domain/src/paywall/governor.ts)
-- reads these rows on the device (they sync to their owner) and on the server before a paywall
-- push: at most one unsolicited paywall per local day, and a quiet no hides an offer for its trip.
-- `local_date` is the device's calendar date when it happened, so "one a day" follows the user's
-- own day wherever they are.

-- paywall_impressions: RLS class O (C2). Recorded through `record_paywall_event` (offline-capable,
-- so the client supplies the id) and by the push router for paywall pushes.
CREATE TABLE paywall_impressions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  trip_id uuid REFERENCES trips (id),
  entry_point text NOT NULL CHECK (entry_point IN (
    'guide_limit', 'redraft_last', 'seat_cap', 'live_map', 'lock_screen_map', 'ftf_ending',
    'postcard', 'widget_locked', 'boost_card', 'pass_chip', 'plan_page', 'widget_gallery'
  )),
  outcome text NOT NULL
    CHECK (outcome IN ('shown', 'dismissed', 'quiet_no', 'purchased_pass', 'purchased_boost')),
  channel text NOT NULL DEFAULT 'app' CHECK (channel IN ('app', 'push', 'crew_card')),
  governed boolean NOT NULL,
  shown_at timestamptz NOT NULL,
  local_date date NOT NULL,
  suppressed_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX paywall_impressions_user_shown_idx ON paywall_impressions (user_id, shown_at);
CREATE INDEX paywall_impressions_trip_id_idx ON paywall_impressions (trip_id) WHERE trip_id IS NOT NULL;

ALTER TABLE paywall_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE paywall_impressions FORCE ROW LEVEL SECURITY;
CREATE POLICY paywall_impressions_select ON paywall_impressions FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY paywall_impressions_system ON paywall_impressions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON paywall_impressions TO app_user;
GRANT SELECT, INSERT, UPDATE ON paywall_impressions TO app_system;

-- Ops console reads.
GRANT SELECT (channel, created_at, entry_point, governed, id, local_date, outcome, shown_at,
  suppressed_until, trip_id, user_id) ON paywall_impressions TO admin_reader;
CREATE POLICY paywall_impressions_admin_reader ON paywall_impressions FOR SELECT TO admin_reader USING (true);

-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList: the owner's own impressions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'powersync' AND tablename = 'paywall_impressions'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE paywall_impressions;
  END IF;
END
$$;
GRANT SELECT ON paywall_impressions TO powersync_repl;
