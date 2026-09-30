-- Disruptions (docs/data-model.md §3.12): what threatens a trip's plan and what the guide did or
-- proposes about it. A flight change, a storm, a forecast that moves an outdoor item, or a member
-- running late becomes one `disruptions` row; the forecast watcher keeps one `watch_items` row per
-- threatened plan item; the running-late check keeps the latest ETA per member and item in
-- `journey_checks` and never a coordinate. Every table is written by the server (app_system: the
-- worker, or a command after its own authorisation), so app_user only ever reads. Doc deltas:
-- `disruptions.cause/version/dedupe_key/ref_*/title/summary/facts/actions/options/decision_poll_id/
-- chosen_option_id`, `watch_items.day/title/detail/sources/checked_at/resolved_at/…`,
-- `journey_checks`, and the `guide_actions.disruption_id` foreign key.

-- ---------------------------------------------------------------------------------------------
-- disruptions: RLS class T, C1. `dedupe_key` names the thing disrupted (`flight:<segment>`,
-- `storm:<watch item>`, `weather:<plan item>`, `late:<plan item>:<user>`) so a re-trigger bumps
-- `version` on the open row instead of opening a second one. `facts` holds the only numbers the
-- copy may carry; `actions` are the classified rows (done by the guide, needing a yes, a vendor
-- draft, a rebook link) with their live state; `options` are the planner's choices (storm, running
-- late); `source_snapshot` is
-- the raw signal (flight status, forecast cell, ETA) and stays out of the guide's view.
CREATE TABLE disruptions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  kind text NOT NULL,
  cause text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 200),
  ref_kind text,
  ref_id uuid,
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 280),
  affected jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(affected) = 'object'),
  facts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(facts) = 'object'),
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  actions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(actions) = 'array'),
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(source_snapshot) = 'object'),
  change_set_id uuid REFERENCES change_sets (id),
  decision_poll_id uuid REFERENCES polls (id),
  chosen_option_id text CHECK (chosen_option_id IS NULL OR char_length(chosen_option_id) <= 40),
  chosen_by uuid REFERENCES users (id),
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE disruptions ADD CONSTRAINT disruptions_kind_check
  CHECK (kind IN ('flight_delay', 'storm', 'weather', 'running_late', 'closure'));
ALTER TABLE disruptions ADD CONSTRAINT disruptions_cause_check
  CHECK (cause IN ('delay', 'cancelled', 'diverted', 'missed_connection', 'rough_seas', 'wind',
    'rain', 'volcano', 'crowds', 'traffic', 'closure', 'manual'));
ALTER TABLE disruptions ADD CONSTRAINT disruptions_status_check
  CHECK (status IN ('open', 'resolved', 'withdrawn', 'undone'));
ALTER TABLE disruptions ADD CONSTRAINT disruptions_ref_kind_check
  CHECK (ref_kind IS NULL OR ref_kind IN ('flight_segment', 'watch_item', 'plan_item'));
ALTER TABLE disruptions ADD CONSTRAINT disruptions_resolved_check
  CHECK ((status = 'open') = (resolved_at IS NULL));
-- One open disruption per disrupted thing; closed ones stay as history.
CREATE UNIQUE INDEX disruptions_open_dedupe_key ON disruptions (trip_id, dedupe_key)
  WHERE status = 'open';
CREATE INDEX disruptions_trip_status_idx ON disruptions (trip_id, status);
CREATE TRIGGER disruptions_touch_updated_at BEFORE UPDATE ON disruptions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE disruptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE disruptions FORCE ROW LEVEL SECURITY;
CREATE POLICY disruptions_select ON disruptions FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY disruptions_system ON disruptions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON disruptions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON disruptions TO app_system;

ALTER TABLE guide_actions ADD CONSTRAINT guide_actions_disruption_id_fkey
  FOREIGN KEY (disruption_id) REFERENCES disruptions (id);
COMMENT ON COLUMN guide_actions.disruption_id IS
  'Groups the actions one disruption took or proposes, for its rows and "undo everything".';

-- ---------------------------------------------------------------------------------------------
-- watch_items: RLS class T, C1. One per threatened thing on a day (`target_ref` is a plan item's
-- stable id, or `day:<date>` / `airport:<date>` for day-wide risks). `impact` holds the rule
-- scores and the metrics that tripped them; `sources` the cited signals ("reported by …").
CREATE TABLE watch_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  kind text NOT NULL,
  target_ref text NOT NULL CHECK (char_length(target_ref) BETWEEN 1 AND 80),
  plan_item_stable_id uuid,
  day date NOT NULL,
  status text NOT NULL DEFAULT 'go',
  score smallint NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  impact jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(impact) = 'object'),
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 120),
  detail text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 280),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
  disruption_id uuid REFERENCES disruptions (id),
  escalated_at timestamptz,
  checked_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT watch_items_trip_kind_target_key UNIQUE (trip_id, kind, target_ref)
);
ALTER TABLE watch_items ADD CONSTRAINT watch_items_kind_check
  CHECK (kind IN ('weather', 'marine', 'volcano', 'crowds', 'traffic', 'closure'));
ALTER TABLE watch_items ADD CONSTRAINT watch_items_status_check
  CHECK (status IN ('go', 'watching', 'plan_b', 'set'));
CREATE INDEX watch_items_trip_day_idx ON watch_items (trip_id, day);
CREATE TRIGGER watch_items_touch_updated_at BEFORE UPDATE ON watch_items
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE watch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_items FORCE ROW LEVEL SECURITY;
CREATE POLICY watch_items_select ON watch_items FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY watch_items_system ON watch_items FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON watch_items TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON watch_items TO app_system;

-- ---------------------------------------------------------------------------------------------
-- journey_checks: RLS class T (owner + the item's co-participants), C2, not synced. The latest
-- running-late check per member and plan item: the ETA the router gave and how late it runs. The
-- device's fix is used for routing and dropped; there is no coordinate column here, by design.
-- `late_streak` / `on_time_streak` carry the two-check hysteresis. Rows expire after a day.
CREATE TABLE journey_checks (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  item_id uuid NOT NULL REFERENCES plan_items (id),
  user_id uuid NOT NULL REFERENCES users (id),
  mode text NOT NULL,
  eta_at timestamptz NOT NULL,
  late_min integer NOT NULL CHECK (late_min BETWEEN -1440 AND 1440),
  late_streak smallint NOT NULL DEFAULT 0 CHECK (late_streak BETWEEN 0 AND 1000),
  on_time_streak smallint NOT NULL DEFAULT 0 CHECK (on_time_streak BETWEEN 0 AND 1000),
  traffic boolean NOT NULL DEFAULT false,
  disruption_id uuid REFERENCES disruptions (id),
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journey_checks_trip_item_user_key UNIQUE (trip_id, item_id, user_id)
);
ALTER TABLE journey_checks ADD CONSTRAINT journey_checks_mode_check
  CHECK (mode IN ('drive', 'walk', 'scooter', 'transfer'));
CREATE INDEX journey_checks_checked_at_idx ON journey_checks (checked_at);
CREATE INDEX journey_checks_user_idx ON journey_checks (user_id);
CREATE TRIGGER journey_checks_touch_updated_at BEFORE UPDATE ON journey_checks
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE journey_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY journey_checks_select ON journey_checks FOR SELECT TO app_user
  USING (
    user_id = app.uid()
    OR (
      app.is_trip_member(trip_id)
      AND EXISTS (
        SELECT 1 FROM plan_items pi
         WHERE pi.id = journey_checks.item_id
           AND (pi.attendee_ids IS NULL OR app.uid() = ANY (pi.attendee_ids))
      )
    )
  );
CREATE POLICY journey_checks_system ON journey_checks FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON journey_checks TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON journey_checks TO app_system;

-- ---------------------------------------------------------------------------------------------
-- The guide's view: open and past disruptions and the watch list of the trip in context, without
-- the raw source snapshot (vendor payloads, ETAs) or who chose what.
CREATE OR REPLACE VIEW llm.disruptions AS
SELECT d.id, d.trip_id, d.kind, d.cause, d.status, d.version, d.title, d.summary, d.facts,
       d.options, d.detected_at, d.resolved_at
FROM disruptions d
WHERE app.is_trip_member(d.trip_id);
GRANT SELECT ON llm.disruptions TO guide_reader;

CREATE OR REPLACE VIEW llm.watch_items AS
SELECT w.id, w.trip_id, w.kind, w.day, w.status, w.title, w.detail, w.sources, w.checked_at,
       w.resolved_at
FROM watch_items w
WHERE app.is_trip_member(w.trip_id);
GRANT SELECT ON llm.watch_items TO guide_reader;

-- ---------------------------------------------------------------------------------------------
-- Domain events disruptions append, merged into the allow-list whatever else it holds by then.
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
    FROM unnest(current_values || ARRAY[
      'disruption.detected', 'disruption.needs_yes', 'disruption.updated',
      'disruption.resolved', 'disruption.action_decided', 'disruption.undone',
      'disruption.announced', 'running_late.detected', 'late_option.chosen',
      'watch.escalated', 'weather.suggested', 'weather.suggestion_dismissed',
      'storm.decided'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13): disruptions and the watch list ride the trip
-- stream; journey_checks is not published.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['disruptions', 'watch_items'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON disruptions, watch_items TO powersync_repl;
