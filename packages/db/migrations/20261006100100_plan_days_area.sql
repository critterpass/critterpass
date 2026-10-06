-- The area a day is spent in (docs/data-model.md §3.3): a day trip's destination. Empty means the
-- day is where its stop is, which is every day of every trip so far; no backfill. The column rides
-- the existing plan_days policy and stream (crew versions to the crew, a private draft's days to
-- its organisers).
ALTER TABLE plan_days ADD COLUMN destination_id uuid REFERENCES destinations (id);
CREATE INDEX plan_days_destination_idx ON plan_days (destination_id)
  WHERE destination_id IS NOT NULL;
GRANT SELECT (destination_id) ON plan_days TO admin_reader;

-- `app.apply_change_set` copies the day's area with the rest of the day. Otherwise unchanged.
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
      WHERE value->>'target' = old_item.stable_id::text LIMIT 1;

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

  UPDATE change_sets SET status = 'applied', result_version_id = new_version_id WHERE id = cs_id;
  UPDATE trips SET current_version_id = new_version_id WHERE id = cs.trip_id;

  RETURN new_version_id;
END;
$$;

-- The destinations a trip may use: its own, its stops' and the areas its days are spent in, on the
-- crew's versions that are not superseded (and, with drafts, the organiser's too). The SQL twin
-- of `tripAreas` (packages/db/src/planning/areas.ts) for readers written in SQL. Runs as the
-- caller: a member sees what the tables' own policies let her see.
CREATE FUNCTION app.trip_area_ids(p_trip uuid, p_with_drafts boolean DEFAULT false)
RETURNS SETOF uuid
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT destination_id FROM trips WHERE id = p_trip AND destination_id IS NOT NULL
  UNION
  SELECT destination_id FROM trip_stops WHERE trip_id = p_trip
  UNION
  SELECT d.destination_id
    FROM plan_days d
    JOIN itinerary_versions v ON v.id = d.version_id
   WHERE d.trip_id = p_trip AND v.trip_id = p_trip AND d.destination_id IS NOT NULL
     AND v.status <> 'superseded' AND (p_with_drafts OR v.visibility = 'crew')
$$;
REVOKE ALL ON FUNCTION app.trip_area_ids(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.trip_area_ids(uuid, boolean) TO app_user, app_system;
