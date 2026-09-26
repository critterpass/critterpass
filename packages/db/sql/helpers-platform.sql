-- Command bookkeeping (app.claim_op, app.record_cmd_result), domain events
-- (app.append_event), the activity log (app.append_activity), the rt_outbox publish path
-- (app.enqueue_rt) and retention (app.purge_expired_platform_rows) — docs/data-model.md
-- §3.18, docs/api-contracts.md §2.3-2.4, docs/system-architecture.md §4.1, §4.3.

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
