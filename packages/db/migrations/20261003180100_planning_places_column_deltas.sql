-- Planning and places column and constraint deltas (docs/data-model.md §3.3, §3.13, §3.14),
-- expand-only: no existing row changes meaning.

-- A closed value list widened by `extra`, whatever it holds by then, so a sibling migration's
-- values are kept. `col IN (...)` constraints only.
CREATE FUNCTION pg_temp.widen_in_check(tbl regclass, con text, col text, extra text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  current_values text[];
  merged text;
BEGIN
  SELECT array_agg(m[1]) INTO current_values
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = con AND c.conrelid = tbl;
  IF current_values IS NULL THEN
    RAISE EXCEPTION 'constraint % on % not found', con, tbl;
  END IF;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_values || extra) AS t;
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', tbl, con);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%I IN (%s))', tbl, con, col, merged);
END
$$;

-- ---------------------------------------------------------------------------------------------
-- change_sets: the plan check, placed ideas, a filled gap and a split crew make change sets too.
-- An unsent draft is its author's alone ("ONLY YOU SEE THIS"): a person's draft reaches only them,
-- a guide's draft (a swipe match waiting for approval) reaches the trip's organisers. Once sent
-- (proposed, voting and on) it is visible as its base version is, as before.
SELECT pg_temp.widen_in_check('change_sets', 'change_sets_trigger_check', 'trigger',
  ARRAY['check', 'ideas', 'gap', 'split']);
DROP POLICY change_sets_select ON change_sets;
CREATE POLICY change_sets_select ON change_sets FOR SELECT TO app_user
  USING (
    app.is_version_visible(base_version_id)
    AND (
      status <> 'draft'
      OR (author_kind = 'user' AND author_id = app.uid())
      OR (author_kind = 'guide' AND app.is_trip_organiser(trip_id))
    )
  );
CREATE INDEX change_sets_author_status_idx ON change_sets (author_id, status);

-- ---------------------------------------------------------------------------------------------
-- plan_items.custom_place: a stop on a dropped pin, which has no `pois` row.
ALTER TABLE plan_items ADD COLUMN custom_place jsonb
  CONSTRAINT plan_items_custom_place_check CHECK (
    custom_place IS NULL
    OR (jsonb_typeof(custom_place) = 'object'
        AND jsonb_typeof(custom_place -> 'name') = 'string'
        AND jsonb_typeof(custom_place -> 'lat') = 'number'
        AND jsonb_typeof(custom_place -> 'lng') = 'number'));
GRANT SELECT (custom_place) ON plan_items TO admin_reader;

-- `app.apply_change_set` carries `custom_place` with every item, and an added item keeps the place
-- it was added for (its `poi_id` or `custom_place`). Otherwise unchanged.
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

  INSERT INTO plan_days (id, version_id, trip_id, day_no, date, theme, weather_ref, i18n)
  SELECT uuidv7(), new_version_id, trip_id, day_no, date, theme, weather_ref, i18n
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

-- ---------------------------------------------------------------------------------------------
-- destinations.drive_factor: free-flow drive minutes × this factor ≈ local traffic (editorial).
ALTER TABLE destinations ADD COLUMN drive_factor real NOT NULL DEFAULT 1.0
  CONSTRAINT destinations_drive_factor_check CHECK (drive_factor BETWEEN 0.5 AND 4.0);
GRANT SELECT (drive_factor) ON destinations TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- crowd_forecasts: editorial typical-week curves (shown only once ops approve them) and curves
-- from our own visit counts (only from five distinct crews up, a C5 aggregate). One curve per
-- place, source and weekday: the new key is added before the old (place, weekday) key is dropped;
-- nothing writes this table yet, so no reader or writer relies on the old key.
SELECT pg_temp.widen_in_check('crowd_forecasts', 'crowd_forecasts_source_check', 'source',
  ARRAY['editorial', 'visits']);
ALTER TABLE crowd_forecasts ADD COLUMN approved_at timestamptz;
ALTER TABLE crowd_forecasts ADD COLUMN crew_count integer
  CONSTRAINT crowd_forecasts_crew_count_check CHECK (crew_count IS NULL OR crew_count >= 0);
ALTER TABLE crowd_forecasts ADD CONSTRAINT crowd_forecasts_visits_crews_check
  CHECK (source <> 'visits' OR crew_count >= 5);
ALTER TABLE crowd_forecasts ADD CONSTRAINT crowd_forecasts_poi_source_dow_key
  UNIQUE (poi_id, source, dow);
ALTER TABLE crowd_forecasts DROP CONSTRAINT crowd_forecasts_poi_id_dow_key;
DROP POLICY crowd_forecasts_select ON crowd_forecasts;
CREATE POLICY crowd_forecasts_select ON crowd_forecasts FOR SELECT TO app_user
  USING (source <> 'editorial' OR approved_at IS NOT NULL);

-- ---------------------------------------------------------------------------------------------
-- agent_jobs: Tokek placing ideas on days. fair_use_counters: the silent caps of the plain-words
-- search, the link import and the split crew's compromise options.
SELECT pg_temp.widen_in_check('agent_jobs', 'agent_jobs_kind_check', 'kind', ARRAY['place_ideas']);
SELECT pg_temp.widen_in_check('fair_use_counters', 'fair_use_counters_metric_check', 'metric',
  ARRAY['search_parse', 'link_import', 'place_compromise']);

-- ---------------------------------------------------------------------------------------------
-- Domain events the planning commands and jobs append (packages/domain/src/planning/events.ts).
SELECT pg_temp.widen_in_check('domain_events', 'domain_events_type_check', 'type', ARRAY[
  'trip_idea.saved', 'trip_idea.removed', 'place.stance_set', 'place.stance_cleared',
  'plan.legs_updated']);

DROP FUNCTION pg_temp.widen_in_check(regclass, text, text, text[]);
