-- Guide-written shared text in each reader's language. The guide writes in English; a nullable
-- `i18n` column on the row that holds the text carries its translations:
--
--   {"vi": {"notes": "…"}, "ja": {"notes": "…"}, "_src": "<hash of the source fields>"}
--
-- so a translation is read, synced and hidden exactly like the text it translates (an
-- organiser-only draft's translations are organiser-only; a member's briefing is theirs alone).
-- `_src` is the hash of the source fields the translations were made from (`@cp/domain`
-- guide-text): once the text changes, readers fall back to the source until it is translated
-- again. Written only by the server (app_system: the `guide_text.translate` job); the privacy
-- class is the table's own.
--
-- Fields: plan_days.theme, plan_items.notes (guide-written items), briefing_items.text,
-- quests.title/body, and the headline, reasons and quote inside pitches.sections.

ALTER TABLE plan_days ADD COLUMN i18n jsonb
  CONSTRAINT plan_days_i18n_check CHECK (i18n IS NULL OR jsonb_typeof(i18n) = 'object');
ALTER TABLE plan_items ADD COLUMN i18n jsonb
  CONSTRAINT plan_items_i18n_check CHECK (i18n IS NULL OR jsonb_typeof(i18n) = 'object');
ALTER TABLE briefing_items ADD COLUMN i18n jsonb
  CONSTRAINT briefing_items_i18n_check CHECK (i18n IS NULL OR jsonb_typeof(i18n) = 'object');
ALTER TABLE quests ADD COLUMN i18n jsonb
  CONSTRAINT quests_i18n_check CHECK (i18n IS NULL OR jsonb_typeof(i18n) = 'object');
ALTER TABLE pitches ADD COLUMN i18n jsonb
  CONSTRAINT pitches_i18n_check CHECK (i18n IS NULL OR jsonb_typeof(i18n) = 'object');

-- The ops console reads the plan tables column by column; the other three have no console grant.
GRANT SELECT (i18n) ON plan_days TO admin_reader;
GRANT SELECT (i18n) ON plan_items TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- A plan version made from another keeps its translations: `app.apply_change_set` copies each
-- day's and each carried item's `i18n` with the row. An item whose note the change set rewrote
-- keeps the old translations too; their `_src` no longer matches, so they read as stale. An added
-- item starts without any. The function is otherwise unchanged.
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
      attendee_ids, poi_id, provider_id, booking_id, must_do_id, category, cost_model, amount_minor,
      currency, status, flexibility, is_outdoor, created_by_kind, notes, i18n)
    VALUES (new_item.id, new_item.version_id, new_item.day_id, new_item.trip_id, new_item.stable_id,
      new_item.starts_at, new_item.ends_at, new_item.tz, new_item.lane, new_item.attendee_ids,
      new_item.poi_id, new_item.provider_id, new_item.booking_id, new_item.must_do_id, new_item.category,
      new_item.cost_model, new_item.amount_minor, new_item.currency, new_item.status, new_item.flexibility,
      new_item.is_outdoor, new_item.created_by_kind, new_item.notes, old_item.i18n);
  END LOOP;

  FOR op IN SELECT value FROM jsonb_array_elements(cs.ops) AS value WHERE value->>'op' = 'add' LOOP
    SELECT id INTO target_day_id FROM plan_days
      WHERE version_id = new_version_id AND day_no = (op->'after'->>'day_no')::integer;
    INSERT INTO plan_items (id, version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, lane,
      attendee_ids, category, cost_model, amount_minor, currency, status, is_outdoor, created_by_kind, notes)
    VALUES (
      uuidv7(), new_version_id, target_day_id, cs.trip_id, (op->>'target')::uuid,
      (op->'after'->>'starts_at')::timestamptz, (op->'after'->>'ends_at')::timestamptz,
      op->'after'->>'tz', op->'after'->>'lane',
      (SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(COALESCE(op->'after'->'attendee_ids', '[]'::jsonb)) x),
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
