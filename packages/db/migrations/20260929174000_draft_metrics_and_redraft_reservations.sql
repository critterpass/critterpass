-- Drafting and redrafts (docs/data-model.md §3.3, §3.14). The plan tables already exist; this only
-- adds the columns a drafted version carries, the redraft reservation that holds a trip's redraft
-- quota while a redraft runs, the `redrafts` view, `llm.plan_items` for the guide's context, the
-- redraft fair-use metric, and the drafting domain events.

-- ---------------------------------------------------------------------------------------------
-- plan_items.locked_reason: why a redraft must keep an item where it is.
ALTER TABLE plan_items ADD COLUMN locked_reason text;
ALTER TABLE plan_items ADD CONSTRAINT plan_items_locked_reason_check
  CHECK (locked_reason IS NULL OR locked_reason IN ('booking', 'must_do', 'user'));

-- itinerary_versions.metrics / coverage: the planner's totals and what the draft covers
-- (packages/domain/src/itinerary/schemas.ts#draftMetricsSchema, #draftCoverageSchema).
ALTER TABLE itinerary_versions ADD COLUMN metrics jsonb;
ALTER TABLE itinerary_versions ADD COLUMN coverage jsonb;
ALTER TABLE itinerary_versions ADD CONSTRAINT itinerary_versions_metrics_object_check
  CHECK (metrics IS NULL OR jsonb_typeof(metrics) = 'object');
ALTER TABLE itinerary_versions ADD CONSTRAINT itinerary_versions_coverage_object_check
  CHECK (coverage IS NULL OR jsonb_typeof(coverage) = 'object');
-- One version per job: a retried persist step finds the version it already wrote.
CREATE UNIQUE INDEX itinerary_versions_created_by_job_key
  ON itinerary_versions (created_by_job_id) WHERE created_by_job_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- redraft_reservations: RLS organiser-only read, written only by command handlers and the worker
-- (as app_system). `status` moves reserved -> committed (result kept or reverted) or reserved ->
-- released (job failed, cancelled or found nothing better); a settled row never moves again.
CREATE TABLE redraft_reservations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  agent_job_id uuid NOT NULL UNIQUE REFERENCES agent_jobs (id),
  status text NOT NULL DEFAULT 'reserved',
  free_reason text,
  quota_period_key text,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE redraft_reservations ADD CONSTRAINT redraft_reservations_status_check
  CHECK (status IN ('reserved', 'committed', 'released'));
ALTER TABLE redraft_reservations ADD CONSTRAINT redraft_reservations_free_reason_check
  CHECK (free_reason IS NULL OR free_reason IN ('late_must_do'));
ALTER TABLE redraft_reservations ADD CONSTRAINT redraft_reservations_settled_check
  CHECK ((status = 'reserved') = (settled_at IS NULL));
CREATE INDEX redraft_reservations_trip_status_idx ON redraft_reservations (trip_id, status);
CREATE TRIGGER redraft_reservations_touch_updated_at BEFORE UPDATE ON redraft_reservations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE redraft_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE redraft_reservations FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.redraft_reservations_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.status <> 'reserved' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'redraft reservation already %', OLD.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.redraft_reservations_guard() FROM PUBLIC;
CREATE TRIGGER redraft_reservations_guard BEFORE UPDATE ON redraft_reservations
  FOR EACH ROW EXECUTE FUNCTION app.redraft_reservations_guard();

CREATE POLICY redraft_reservations_select ON redraft_reservations FOR SELECT TO app_user
  USING (app.is_trip_organiser(trip_id));
CREATE POLICY redraft_reservations_system ON redraft_reservations FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON redraft_reservations TO app_user;
GRANT SELECT, INSERT, UPDATE ON redraft_reservations TO app_system;

-- `redrafts`: a redraft is its agent job (`redraft_id` = agent_jobs.id) with its reservation and
-- candidate version. security_invoker, so the caller's RLS on both tables applies.
CREATE VIEW redrafts WITH (security_invoker = true) AS
SELECT
  j.id AS redraft_id,
  j.trip_id,
  j.user_id,
  j.status AS job_status,
  j.base_version_id,
  nullif(j.result_ref->>'candidate_version_id', '')::uuid AS candidate_version_id,
  (j.result_ref->>'day_no')::int AS day_no,
  j.result_ref->>'outcome' AS outcome,
  r.status AS reservation_status,
  r.free_reason,
  j.created_at,
  j.updated_at
FROM agent_jobs j
LEFT JOIN redraft_reservations r ON r.agent_job_id = j.id
WHERE j.kind = 'redraft';
GRANT SELECT ON redrafts TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- llm.plan_items (docs/data-model-sync-and-privacy.md §2): the trip's current crew-visible version,
-- plus its organiser draft only when the asking user organises the trip. Places by our own id and
-- name; costs are the cost engine's numbers already on the item.
GRANT EXECUTE ON FUNCTION app.is_trip_organiser(uuid) TO guide_reader;

CREATE OR REPLACE VIEW llm.plan_items AS
SELECT
  iv.id AS version_id,
  iv.visibility,
  iv.status AS version_status,
  d.day_no,
  d.date,
  d.theme,
  i.stable_id,
  i.category,
  i.poi_id,
  p.name AS poi_name,
  i.starts_at,
  i.ends_at,
  i.tz,
  i.must_do_id,
  i.booking_id,
  i.locked_reason,
  i.cost_model,
  i.amount_minor,
  i.currency,
  i.notes
FROM itinerary_versions iv
JOIN trips t ON t.id = iv.trip_id
JOIN plan_items i ON i.version_id = iv.id
JOIN plan_days d ON d.id = i.day_id
LEFT JOIN pois p ON p.id = i.poi_id
WHERE iv.trip_id = nullif(current_setting('app.trip', true), '')::uuid
  AND app.is_trip_member(iv.trip_id)
  AND (
    (iv.visibility = 'crew' AND iv.id = t.current_version_id)
    OR (iv.visibility = 'organiser' AND iv.id = t.draft_version_id
        AND app.is_trip_organiser(iv.trip_id))
  );
GRANT SELECT ON llm.plan_items TO guide_reader;

-- ---------------------------------------------------------------------------------------------
-- Silent redraft fair use for trips without a visible cap (docs/product-decisions.md §3).
ALTER TABLE fair_use_counters DROP CONSTRAINT fair_use_counters_metric_check;
ALTER TABLE fair_use_counters ADD CONSTRAINT fair_use_counters_metric_check
  CHECK (metric IN ('guide_tokens', 'voice_seconds', 'vision_calls', 'redrafts'));

-- ---------------------------------------------------------------------------------------------
-- domain_events: the drafting events join the catalogue (packages/domain/src/itinerary/events.ts).
-- Added to whatever the constraint lists now, so a sibling migration's types are kept.
DO $$
DECLARE
  current_types text[];
  merged text;
BEGIN
  SELECT array_agg(m[1] ORDER BY m[1]) INTO current_types
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = 'domain_events_type_check' AND c.conrelid = 'domain_events'::regclass;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_types || ARRAY[
      'draft.requested', 'draft.ready', 'draft.failed', 'draft.cancelled',
      'draft.version_restored', 'redraft.requested', 'redraft.delivered', 'redraft.kept',
      'redraft.reverted'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13): redraft_reservations (C1).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'redraft_reservations'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE redraft_reservations;
  END IF;
END
$$;
GRANT SELECT ON redraft_reservations TO powersync_repl;
