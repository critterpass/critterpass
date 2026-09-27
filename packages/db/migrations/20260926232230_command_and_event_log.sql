-- Command bookkeeping, domain events and the activity log (docs/data-model.md §3.18,
-- docs/api-contracts.md §2.4). `rt_outbox` and `app.channel_name` already exist
-- (identity_and_crews); this migration only extends rt_outbox, never recreates it.

CREATE TABLE cmd_log (
  op_id uuid PRIMARY KEY,
  uid uuid,
  cmd text NOT NULL,
  payload_hash text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS class S: no app_user or app_system grant at all. app.claim_op/app.record_cmd_result (owned
-- by app_owner) write it through owner privilege, not a role grant; nothing else may touch it.
ALTER TABLE cmd_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cmd_log FORCE ROW LEVEL SECURITY;

CREATE TABLE cmd_results (
  op_id uuid PRIMARY KEY REFERENCES cmd_log (op_id),
  uid uuid NOT NULL,
  cmd text NOT NULL,
  status text NOT NULL,
  code text,
  detail jsonb,
  result_ref jsonb,
  server_ts timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cmd_results ADD CONSTRAINT cmd_results_status_check CHECK (status IN ('applied', 'rejected', 'duplicate'));
-- Keep in sync with packages/domain/src/errors.ts#ERROR_CODES (packages/db/test/idempotency.test.ts
-- cross-checks this list against that array so the two can never silently drift).
ALTER TABLE cmd_results ADD CONSTRAINT cmd_results_code_check CHECK (code IS NULL OR code IN (
  'AUTH_REQUIRED', 'SESSION_REVOKED', 'MERGE_REQUIRED', 'ACCOUNT_CLOSED', 'ATTESTATION_FAILED',
  'FORBIDDEN', 'ACTION_KEY_SCOPE', 'NOT_FOUND', 'VALIDATION', 'STATE_INVALID', 'VERSION_CONFLICT',
  'IDEMPOTENCY_MISMATCH', 'RATE_LIMITED', 'NUDGE_TOO_SOON', 'QUOTA_EXHAUSTED', 'REDRAFT_LIMIT',
  'SEAT_LIMIT', 'WAITLISTED', 'ENTITLEMENT_REQUIRED', 'BOOST_INTENT_LOCKED', 'VOTE_CLOSED',
  'NOT_ELIGIBLE', 'INVITE_EXPIRED', 'INVITE_REVOKED', 'CODE_INVALID', 'CODE_REDEEMED', 'CODE_EXPIRED',
  'OWNED_BY_OTHER_ACCOUNT', 'K_ANON_UNAVAILABLE', 'HOLD_EXPIRED', 'HOLD_NOT_PROVIDED',
  'SUPPLIER_UNAVAILABLE', 'SUPPLIER_REJECTED', 'PAYMENT_PENDING', 'LOCATION_IMPLAUSIBLE',
  'CONTENT_REJECTED', 'PAYLOAD_TOO_LARGE', 'UPSTREAM_TIMEOUT', 'INTERNAL'
));
ALTER TABLE cmd_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE cmd_results FORCE ROW LEVEL SECURITY;
-- RLS class O: the owner may read their own outcomes (synced by the `me` stream once published);
-- no app_user INSERT/UPDATE grant — only app.record_cmd_result writes this table.
CREATE POLICY cmd_results_owner_read ON cmd_results FOR SELECT TO app_user
  USING (uid = app.uid());
GRANT SELECT ON cmd_results TO app_user;

CREATE TABLE domain_events (
  id uuid PRIMARY KEY,
  type text NOT NULL,
  aggregate_kind text NOT NULL,
  aggregate_id uuid NOT NULL,
  actor_kind text NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  -- Fan-out columns (doc delta: data-model.md §3.18 wins on naming, api-contracts.md §2.4's
  -- `crew_id`/`trip_id` are added here for consumers that only care about one crew/trip).
  crew_id uuid,
  trip_id uuid
);
-- Keep in sync with packages/domain/src/events/catalogue.ts#DOMAIN_EVENT_TYPES; later phases add
-- their own event types via an expand migration (ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT).
ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (
  'crew.member_joined', 'crew.member_left', 'crew.member_removed',
  'trip.created', 'trip.status_changed',
  'plan.version_created',
  'change_set.proposed', 'change_set.applied', 'change_set.reverted', 'change_set.rejected',
  'rsvp.changed'
));
ALTER TABLE domain_events ADD CONSTRAINT domain_events_actor_kind_check CHECK (actor_kind IN ('user', 'guide', 'system'));
CREATE INDEX domain_events_aggregate_idx ON domain_events (aggregate_kind, aggregate_id);
CREATE INDEX domain_events_occurred_at_idx ON domain_events (occurred_at);
-- RLS class S: append-only, no UPDATE/DELETE grant to anyone but the purge function (which needs
-- none either — it is SECURITY DEFINER, owned by app_owner). No app_user or app_system grant at
-- all; app.append_event is the only write path.
ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events FORCE ROW LEVEL SECURITY;

CREATE TABLE activity_events (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trips (id),
  crew_id uuid NOT NULL REFERENCES crews (id),
  actor_kind text NOT NULL,
  actor_id uuid,
  verb text NOT NULL,
  object_kind text NOT NULL,
  object_id uuid,
  text text,
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE activity_events ADD CONSTRAINT activity_events_actor_kind_check CHECK (actor_kind IN ('user', 'guide', 'system'));
CREATE INDEX activity_events_trip_at_idx ON activity_events (trip_id, at DESC);
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events FORCE ROW LEVEL SECURITY;
-- "T read, S write": every trip member reads; only app.append_activity (SECURITY DEFINER) and
-- app_system write.
CREATE POLICY activity_events_select ON activity_events FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY activity_events_system ON activity_events FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON activity_events TO app_user;
GRANT SELECT, INSERT, UPDATE ON activity_events TO app_system;

-- rt_outbox extension (created by identity_and_crews; never recreated). The relay worker
-- (docs/system-architecture.md §4.3) needs to select pending rows and mark them published, which
-- neither app_user nor app_system had any grant for until now.
CREATE POLICY rt_outbox_system ON rt_outbox FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, UPDATE ON rt_outbox TO app_system;

-- app.enqueue_rt: the one write path for rt_outbox 'publish' rows from a command handler (docs/
-- system-architecture.md §4.3). app_user may only publish to a channel they could subscribe to:
-- their own user:#uid, or a crew/trip channel they are a member of. kind <> 'publish' is reserved
-- for triggers (which write rt_outbox directly, being SECURITY DEFINER themselves already) and
-- app_system (uid unset).
CREATE OR REPLACE FUNCTION app.enqueue_rt(channel text, payload jsonb, kind text DEFAULT 'publish') RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  caller_uid uuid := app.uid();
  new_id bigint;
BEGIN
  IF kind NOT IN ('publish', 'unsubscribe', 'disconnect') THEN
    RAISE EXCEPTION 'invalid rt_outbox kind: %', kind USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF kind <> 'publish' AND caller_uid IS NOT NULL THEN
    RAISE EXCEPTION 'only app_system or a trigger may enqueue kind %', kind USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF caller_uid IS NOT NULL THEN
    IF NOT (
      channel = app.channel_name('user', caller_uid::text)
      OR (channel LIKE 'crew%:%' AND app.is_crew_member(split_part(channel, ':', 2)::uuid))
      OR (channel LIKE 'trip%:%' AND app.is_trip_member(split_part(channel, ':', 2)::uuid))
    ) THEN
      RAISE EXCEPTION 'not permitted to publish on channel %', channel USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  INSERT INTO rt_outbox (channel, payload, idem_key, kind)
  VALUES (channel, payload, gen_random_uuid(), kind)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.enqueue_rt(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.enqueue_rt(text, jsonb, text) TO app_user, app_system;

-- app.claim_op: cmd_log's only write path (docs/api-contracts.md §2.3 step 3). Returns
-- {outcome: 'new'} on first insert, {outcome: 'duplicate', result} on a repeat with the same hash,
-- or {outcome: 'mismatch'} on a repeat with a different hash — the caller (a command handler)
-- decides what a mismatch means for the request, this function only reports the fact.
CREATE OR REPLACE FUNCTION app.claim_op(p_op_id uuid, p_uid uuid, p_cmd text, p_payload_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  existing cmd_log%ROWTYPE;
BEGIN
  INSERT INTO cmd_log (op_id, uid, cmd, payload_hash) VALUES (p_op_id, p_uid, p_cmd, p_payload_hash)
    ON CONFLICT (op_id) DO NOTHING;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'new');
  END IF;

  SELECT * INTO existing FROM cmd_log WHERE op_id = p_op_id;
  IF existing.payload_hash <> p_payload_hash THEN
    RETURN jsonb_build_object('outcome', 'mismatch');
  END IF;
  RETURN jsonb_build_object('outcome', 'duplicate', 'result', existing.result);
END;
$$;

REVOKE EXECUTE ON FUNCTION app.claim_op(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_op(uuid, uuid, text, text) TO app_user, app_system;

-- app.record_cmd_result: writes cmd_results + cmd_log.result + one rt_outbox `cmd.result` row on
-- `user:#uid`, all atomically (docs/api-contracts.md §2.3 step 7; Transaction helpers table).
CREATE OR REPLACE FUNCTION app.record_cmd_result(
  p_op_id uuid, p_uid uuid, p_cmd text, p_status text,
  p_code text DEFAULT NULL, p_detail jsonb DEFAULT NULL, p_result_ref jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  full_result jsonb;
BEGIN
  full_result := jsonb_build_object('status', p_status, 'code', p_code, 'detail', p_detail, 'result_ref', p_result_ref);

  INSERT INTO cmd_results (op_id, uid, cmd, status, code, detail, result_ref)
  VALUES (p_op_id, p_uid, p_cmd, p_status, p_code, p_detail, p_result_ref);

  UPDATE cmd_log SET result = full_result WHERE op_id = p_op_id;

  INSERT INTO rt_outbox (channel, payload, idem_key, kind)
  VALUES (
    app.channel_name('user', p_uid::text),
    jsonb_build_object('type', 'cmd.result', 'op_id', p_op_id, 'status', p_status, 'code', p_code, 'result_ref', p_result_ref),
    p_op_id,
    'publish'
  )
  ON CONFLICT (idem_key) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.record_cmd_result(uuid, uuid, text, text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_cmd_result(uuid, uuid, text, text, text, jsonb, jsonb) TO app_user, app_system;

-- app.append_event: domain_events' only write path (docs/system-architecture.md §4.1 step 6).
CREATE OR REPLACE FUNCTION app.append_event(
  p_type text, p_aggregate_kind text, p_aggregate_id uuid,
  p_actor_kind text, p_actor_id uuid, p_payload jsonb,
  p_crew_id uuid DEFAULT NULL, p_trip_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO domain_events (id, type, aggregate_kind, aggregate_id, actor_kind, actor_id, payload, crew_id, trip_id)
  VALUES (uuidv7(), p_type, p_aggregate_kind, p_aggregate_id, p_actor_kind, p_actor_id, p_payload, p_crew_id, p_trip_id)
  RETURNING id
$$;

REVOKE EXECUTE ON FUNCTION app.append_event(text, text, uuid, text, uuid, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.append_event(text, text, uuid, text, uuid, jsonb, uuid, uuid) TO app_user, app_system;

-- app.append_activity: activity_events' only app_user-reachable write path (the activity-ticker projection).
CREATE OR REPLACE FUNCTION app.append_activity(
  p_trip_id uuid, p_crew_id uuid, p_actor_kind text, p_actor_id uuid,
  p_verb text, p_object_kind text, p_object_id uuid, p_text text
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  INSERT INTO activity_events (id, trip_id, crew_id, actor_kind, actor_id, verb, object_kind, object_id, text)
  VALUES (uuidv7(), p_trip_id, p_crew_id, p_actor_kind, p_actor_id, p_verb, p_object_kind, p_object_id, p_text)
  RETURNING id
$$;

REVOKE EXECUTE ON FUNCTION app.append_activity(uuid, uuid, text, uuid, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.append_activity(uuid, uuid, text, uuid, text, text, uuid, text) TO app_user, app_system;

-- app.purge_expired_platform_rows: retention windows from docs/data-model.md §3.18 /
-- docs/data-model-sync-and-privacy.md §6. Registered into the `maint.purge` cron once that job
-- runner exists; app_system-only (a scheduled job, never a per-request call).
CREATE OR REPLACE FUNCTION app.purge_expired_platform_rows() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  DELETE FROM cmd_log WHERE created_at < now() - interval '30 days';
  DELETE FROM cmd_results WHERE server_ts < now() - interval '14 days';
  DELETE FROM rt_outbox WHERE published_at IS NOT NULL AND published_at < now() - interval '7 days';
  DELETE FROM domain_events WHERE occurred_at < now() - interval '400 days';
END;
$$;

REVOKE EXECUTE ON FUNCTION app.purge_expired_platform_rows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_expired_platform_rows() TO app_system;
