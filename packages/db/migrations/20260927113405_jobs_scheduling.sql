-- Durable jobs (docs/api-contracts-async.md §2, docs/data-model.md §3.18). pg-boss installs and
-- migrates its own tables inside `pgboss` when the worker starts; this migration creates only the
-- schema, owned by app_system, so every table pg-boss creates belongs to app_system as well.
-- app_user and guide_reader get nothing here: a command transaction enqueues through
-- packages/db/src/jobs/send-in-tx.ts, which switches to app_system for that one statement.
CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION app_system;
REVOKE ALL ON SCHEMA pgboss FROM PUBLIC;

-- Per-object timers in local time (docs/api-contracts-async.md §2.3, docs/data-model.md §3.11):
-- a row is one future job, `kind` names the pg-boss queue it goes to, and `due_at` is the UTC
-- instant resolved from `local_at` in `tz` (DST gaps move to the next valid minute, overlaps take
-- the first occurrence; packages/domain/src/time/local-schedule.ts). `slot` tells apart several
-- timers of one kind on one object (e.g. a poll's -24 h and -2 h reminders). The minute cron
-- `sched.enqueue_due` claims due `pending` rows with SKIP LOCKED and sends each job in the same
-- transaction that marks the row `enqueued`, so a timer fires once however many workers run.
-- RLS class S (system only), privacy class C2: timers carry ids and times, never content.
CREATE TABLE scheduled_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  kind text NOT NULL,
  ref_id uuid NOT NULL,
  slot text NOT NULL DEFAULT '',
  local_at timestamp NOT NULL,
  tz text NOT NULL,
  due_at timestamptz NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  pgboss_job_id uuid,
  fired_at timestamptz,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, ref_id, slot)
);
ALTER TABLE scheduled_events ADD CONSTRAINT scheduled_events_status_check
  CHECK (status IN ('pending', 'enqueued', 'cancelled', 'failed'));
ALTER TABLE scheduled_events ADD CONSTRAINT scheduled_events_tz_check CHECK (app.valid_tz(tz));
ALTER TABLE scheduled_events ADD CONSTRAINT scheduled_events_kind_check
  CHECK (kind ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$');
CREATE INDEX scheduled_events_due_idx ON scheduled_events (due_at) WHERE status = 'pending';
CREATE INDEX scheduled_events_status_due_idx ON scheduled_events (status, due_at);
CREATE TRIGGER scheduled_events_touch BEFORE UPDATE ON scheduled_events
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE scheduled_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_events FORCE ROW LEVEL SECURITY;
CREATE POLICY scheduled_events_system ON scheduled_events FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON scheduled_events TO app_system;

-- Command handlers (app_user) arm, re-arm and cancel timers only through these two functions.
-- Arming an existing (kind, ref_id, slot) re-arms it with the new time: the reschedule path.
CREATE OR REPLACE FUNCTION app.schedule_event(
  p_kind text, p_ref_id uuid, p_slot text, p_local_at timestamp, p_tz text, p_due_at timestamptz,
  p_data jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  event_id uuid;
BEGIN
  INSERT INTO scheduled_events (kind, ref_id, slot, local_at, tz, due_at, data, created_by)
  VALUES (p_kind, p_ref_id, p_slot, p_local_at, p_tz, p_due_at, COALESCE(p_data, '{}'::jsonb), app.uid())
  ON CONFLICT (kind, ref_id, slot) DO UPDATE SET
    local_at = EXCLUDED.local_at,
    tz = EXCLUDED.tz,
    due_at = EXCLUDED.due_at,
    data = EXCLUDED.data,
    status = 'pending',
    pgboss_job_id = NULL,
    fired_at = NULL,
    error = NULL
  RETURNING id INTO event_id;
  RETURN event_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.cancel_scheduled_event(p_kind text, p_ref_id uuid, p_slot text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
BEGIN
  UPDATE scheduled_events SET status = 'cancelled'
  WHERE kind = p_kind AND ref_id = p_ref_id AND slot = p_slot AND status = 'pending';
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.schedule_event(text, uuid, text, timestamp, text, timestamptz, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.cancel_scheduled_event(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.schedule_event(text, uuid, text, timestamp, text, timestamptz, jsonb)
  TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.cancel_scheduled_event(text, uuid, text) TO app_user, app_system;
