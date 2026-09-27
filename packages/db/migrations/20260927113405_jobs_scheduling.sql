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

-- Retention for the command/event bookkeeping tables (docs/api-contracts-async.md §2.3
-- `maint.purge`). app_system has no grant on cmd_log, cmd_results or domain_events and must not
-- read them, so the purge job deletes through this function: the time column and filter per table
-- are fixed here, the job supplies only the age (never under a day) and a batch size (at most
-- 5000 rows per call, so one call never holds locks for long). Returns the rows deleted.
CREATE OR REPLACE FUNCTION app.purge_expired(p_table text, p_ttl interval, p_limit integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  cutoff timestamptz := now() - p_ttl;
  deleted integer;
BEGIN
  IF p_ttl < interval '1 day' THEN
    RAISE EXCEPTION 'retention under one day refused' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'purge batch must be 1..5000 rows' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  CASE p_table
    WHEN 'cmd_results' THEN
      DELETE FROM cmd_results WHERE op_id IN (
        SELECT op_id FROM cmd_results WHERE server_ts < cutoff LIMIT p_limit);
    WHEN 'cmd_log' THEN
      -- A log row still referenced by a result waits for the result's own (shorter) retention.
      DELETE FROM cmd_log WHERE op_id IN (
        SELECT l.op_id FROM cmd_log l
        WHERE l.created_at < cutoff
          AND NOT EXISTS (SELECT 1 FROM cmd_results r WHERE r.op_id = l.op_id)
        LIMIT p_limit);
    WHEN 'domain_events' THEN
      DELETE FROM domain_events WHERE id IN (
        SELECT id FROM domain_events WHERE occurred_at < cutoff LIMIT p_limit);
    WHEN 'rt_outbox' THEN
      -- Sent rows age from their send; rows parked after the relay's last attempt (10) from their
      -- creation. Rows still being retried are never touched.
      DELETE FROM rt_outbox WHERE id IN (
        SELECT id FROM rt_outbox
        WHERE published_at < cutoff OR (published_at IS NULL AND attempts >= 10 AND created_at < cutoff)
        LIMIT p_limit);
    ELSE
      RAISE EXCEPTION 'no retention rule for table %', p_table USING ERRCODE = 'invalid_parameter_value';
  END CASE;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.purge_expired(text, interval, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_expired(text, interval, integer) TO app_system;

-- Anonymous account garbage collection (`maint.anon_gc`, docs/data-model-sync-and-privacy.md:
-- anonymous users inactive 90 d with no crew and no purchase are purged). Activity lives in the
-- auth schema, which app_system cannot read, so candidate selection is a SECURITY DEFINER function;
-- `app.anon_gc_finish` re-checks the same conditions under a row lock before it removes the
-- account's device action keys, its `users` row and its `auth.user` row (sessions and linked
-- accounts cascade). The job deletes every other per-user row through the merge-rule registry
-- (packages/db/src/merge-rules.ts) first, in the same transaction.
CREATE OR REPLACE FUNCTION app.anon_gc_is_candidate(p_user_id uuid, p_inactive interval)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN auth."user" au ON au.id = u.id AND au.is_anonymous
    WHERE u.id = p_user_id
      AND u.status = 'anonymous'
      AND GREATEST(
            u.updated_at,
            au.updated_at,
            COALESCE((SELECT max(s.updated_at) FROM auth.session s WHERE s.user_id = u.id), '-infinity')
          ) < now() - p_inactive
      AND NOT EXISTS (SELECT 1 FROM crew_members m WHERE m.user_id = u.id)
      AND NOT EXISTS (
        SELECT 1 FROM user_entitlements e
        WHERE e.user_id = u.id AND (e.pass_plus OR jsonb_array_length(e.sources) > 0))
  )
$$;

CREATE OR REPLACE FUNCTION app.anon_gc_candidates(p_inactive interval, p_limit integer)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT u.id FROM public.users u
  WHERE u.status = 'anonymous' AND u.created_at < now() - p_inactive
    AND app.anon_gc_is_candidate(u.id, p_inactive)
  ORDER BY u.created_at
  LIMIT p_limit
$$;

CREATE OR REPLACE FUNCTION app.anon_gc_finish(p_user_id uuid, p_inactive interval)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT app.anon_gc_is_candidate(p_user_id, p_inactive) THEN
    RETURN false;
  END IF;
  DELETE FROM device_action_keys WHERE user_id = p_user_id;
  DELETE FROM public.users WHERE id = p_user_id;
  DELETE FROM auth."user" WHERE id = p_user_id AND is_anonymous;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.anon_gc_is_candidate(uuid, interval) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.anon_gc_candidates(interval, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.anon_gc_finish(uuid, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.anon_gc_is_candidate(uuid, interval) TO app_system;
GRANT EXECUTE ON FUNCTION app.anon_gc_candidates(interval, integer) TO app_system;
GRANT EXECUTE ON FUNCTION app.anon_gc_finish(uuid, interval) TO app_system;
