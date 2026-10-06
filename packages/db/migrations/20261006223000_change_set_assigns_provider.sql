-- A crew's pick of a driver travels in a change set (docs/api-contracts-suppliers.md §4.11): an
-- `assign_provider` op names the provider as its `target` and carries the days and, when the crew
-- voted on a quote, the terms. Applying the change set writes `provider_assignments`.
--
-- app.apply_provider_assignments: the one writer for those ops, called by `app.apply_change_set`
-- and by the API's own apply. Each op the reviewer left on sets its driver on its days with the
-- terms voted on (or, without any, the driver's shortlisted terms) and the change set that decided
-- it. The crew's decision is the later one: a day set on another driver meanwhile moves to the one
-- voted for. A provider that is not a live driver of the trip refuses the whole apply. Runs as the
-- caller (`app_system`, or the definer of `app.apply_change_set`); `app_user` has no write on the
-- table and no execute here.
CREATE FUNCTION app.apply_provider_assignments(cs_id uuid) RETURNS integer
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  cs change_sets%ROWTYPE;
  op jsonb;
  driver uuid;
  assigner uuid;
  written integer := 0;
  touched integer;
BEGIN
  SELECT * INTO cs FROM change_sets WHERE id = cs_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'change set % not found', cs_id;
  END IF;
  assigner := COALESCE(CASE WHEN cs.author_kind = 'user' THEN cs.author_id END, cs.approved_by);

  FOR op IN SELECT value FROM jsonb_array_elements(cs.ops) AS value
    WHERE value->>'op' = 'assign_provider'
      AND COALESCE((value->>'accepted')::boolean, true)
  LOOP
    driver := (op->>'target')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM providers
       WHERE id = driver AND trip_id = cs.trip_id AND kind = 'driver' AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'provider % is not a driver of trip %', driver, cs.trip_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    INSERT INTO provider_assignments (trip_id, day_date, provider_id, window_start, window_end,
      pickup, agreed, change_set_id, assigned_by)
    SELECT cs.trip_id, (day->>'date')::date, driver, day->>'window_start', day->>'window_end',
      day->>'pickup',
      COALESCE(
        NULLIF(op->'assignment'->'terms', 'null'::jsonb),
        (SELECT jsonb_build_object('price_minor', t.price_minor, 'currency', t.currency,
           'price_unit', t.price_unit, 'included_hours', t.included_hours,
           'includes', t.includes, 'overtime_minor', t.overtime_minor)
           FROM provider_terms t WHERE t.provider_id = driver)
      ),
      cs.id, assigner
    FROM jsonb_array_elements(op->'assignment'->'days') AS day
    ON CONFLICT (trip_id, day_date) DO UPDATE SET provider_id = EXCLUDED.provider_id,
      window_start = EXCLUDED.window_start, window_end = EXCLUDED.window_end,
      pickup = EXCLUDED.pickup, agreed = EXCLUDED.agreed,
      change_set_id = EXCLUDED.change_set_id, assigned_by = EXCLUDED.assigned_by;
    GET DIAGNOSTICS touched = ROW_COUNT;
    written := written + touched;
  END LOOP;

  RETURN written;
END;
$$;
REVOKE ALL ON FUNCTION app.apply_provider_assignments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.apply_provider_assignments(uuid) TO app_system;

-- `app.apply_change_set` leaves `assign_provider` ops out of the item replay and writes them
-- through the function above, in the same transaction as the new version. Otherwise unchanged.
CREATE OR REPLACE FUNCTION app.apply_change_set(cs_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  cs change_sets%ROWTYPE;
  new_version_id uuid;
  op jsonb;
  old_item plan_items%ROWTYPE;
  merged jsonb;
  new_item plan_items%ROWTYPE;
  target_day_no integer;
  target_day_id uuid;
BEGIN
  SELECT * INTO cs FROM change_sets WHERE id = cs_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'change set % not found', cs_id;
  END IF;
  IF cs.status <> 'approved' THEN
    RAISE EXCEPTION 'change set % is not approved (status=%)', cs_id, cs.status USING ERRCODE = 'check_violation';
  END IF;

  IF cs.base_version_id IS DISTINCT FROM (SELECT current_version_id FROM trips WHERE id = cs.trip_id) THEN
    UPDATE change_sets SET status = 'stale' WHERE id = cs_id;
    RETURN NULL;
  END IF;

  UPDATE itinerary_versions SET status = 'superseded' WHERE id = cs.base_version_id;

  new_version_id := uuidv7();
  INSERT INTO itinerary_versions (id, trip_id, parent_id, visibility, status, cost_pp_minor, currency)
  SELECT new_version_id, trip_id, cs.base_version_id, visibility, 'current', cost_pp_minor, currency
  FROM itinerary_versions WHERE id = cs.base_version_id;

  INSERT INTO plan_days (id, version_id, trip_id, day_no, date, theme, weather_ref, i18n,
    destination_id)
  SELECT uuidv7(), new_version_id, trip_id, day_no, date, theme, weather_ref, i18n, destination_id
  FROM plan_days WHERE version_id = cs.base_version_id;

  FOR old_item IN SELECT * FROM plan_items WHERE version_id = cs.base_version_id LOOP
    op := NULL;
    SELECT value INTO op FROM jsonb_array_elements(cs.ops) AS value
      WHERE value->>'target' = old_item.stable_id::text AND value->>'op' <> 'assign_provider'
      LIMIT 1;

    IF op IS NOT NULL AND op->>'op' = 'remove' THEN
      CONTINUE;
    END IF;

    merged := to_jsonb(old_item) || COALESCE(op->'after', '{}'::jsonb);
    new_item := jsonb_populate_record(NULL::plan_items, merged);
    new_item.id := uuidv7();
    new_item.version_id := new_version_id;

    target_day_no := NULLIF(op->'after'->>'day_no', '')::integer;
    IF target_day_no IS NULL THEN
      SELECT day_no INTO target_day_no FROM plan_days WHERE id = old_item.day_id;
    END IF;
    SELECT id INTO target_day_id FROM plan_days WHERE version_id = new_version_id AND day_no = target_day_no;
    new_item.day_id := target_day_id;

    INSERT INTO plan_items (id, version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, lane,
      attendee_ids, poi_id, custom_place, provider_id, booking_id, must_do_id, category, cost_model,
      amount_minor, currency, status, flexibility, is_outdoor, created_by_kind, notes, i18n)
    VALUES (new_item.id, new_item.version_id, new_item.day_id, new_item.trip_id, new_item.stable_id,
      new_item.starts_at, new_item.ends_at, new_item.tz, new_item.lane, new_item.attendee_ids,
      new_item.poi_id, new_item.custom_place, new_item.provider_id, new_item.booking_id,
      new_item.must_do_id, new_item.category, new_item.cost_model, new_item.amount_minor,
      new_item.currency, new_item.status, new_item.flexibility, new_item.is_outdoor,
      new_item.created_by_kind, new_item.notes, old_item.i18n);
  END LOOP;

  FOR op IN SELECT value FROM jsonb_array_elements(cs.ops) AS value WHERE value->>'op' = 'add' LOOP
    SELECT id INTO target_day_id FROM plan_days
      WHERE version_id = new_version_id AND day_no = (op->'after'->>'day_no')::integer;
    INSERT INTO plan_items (id, version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, lane,
      attendee_ids, poi_id, custom_place, category, cost_model, amount_minor, currency, status,
      is_outdoor, created_by_kind, notes)
    VALUES (
      uuidv7(), new_version_id, target_day_id, cs.trip_id, (op->>'target')::uuid,
      (op->'after'->>'starts_at')::timestamptz, (op->'after'->>'ends_at')::timestamptz,
      op->'after'->>'tz', op->'after'->>'lane',
      (SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(COALESCE(op->'after'->'attendee_ids', '[]'::jsonb)) x),
      NULLIF(op->'after'->>'poi_id', '')::uuid,
      CASE WHEN jsonb_typeof(op->'after'->'custom_place') = 'object' THEN op->'after'->'custom_place' END,
      op->'after'->>'category', op->'after'->>'cost_model',
      NULLIF(op->'after'->>'amount_minor', '')::bigint, op->'after'->>'currency',
      COALESCE(op->'after'->>'status', 'proposed'),
      COALESCE((op->'after'->>'is_outdoor')::boolean, false),
      COALESCE(op->'after'->>'created_by_kind', 'user'),
      op->'after'->>'notes'
    );
  END LOOP;

  PERFORM app.apply_provider_assignments(cs_id);

  UPDATE change_sets SET status = 'applied', result_version_id = new_version_id WHERE id = cs_id;
  UPDATE trips SET current_version_id = new_version_id WHERE id = cs.trip_id;

  RETURN new_version_id;
END;
$$;
