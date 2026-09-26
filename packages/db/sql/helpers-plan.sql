-- Plan version/day/item visibility helper, the ChangeSet status guard trigger and
-- app.apply_change_set (docs/data-model.md §3.3, docs/data-model-sync-and-privacy.md §3.6).

-- Version-gated visibility (docs/data-model.md §3.3): an organiser-only draft is invisible to a
-- plain crew member; everything else on a trip a member can see is visible to every trip member.
-- Shared by plan_days/plan_items (via version_id) and change_sets (via base_version_id) so the
-- "organiser-only when the base is a private draft" rule lives in exactly one place.
CREATE OR REPLACE FUNCTION app.is_version_visible(version uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM itinerary_versions iv
    WHERE iv.id = version
      AND app.is_trip_member(iv.trip_id)
      AND (iv.visibility = 'crew' OR app.is_trip_organiser(iv.trip_id))
  )
$$;

REVOKE EXECUTE ON FUNCTION app.is_version_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_version_visible(uuid) TO app_user, app_system;

-- ChangeSet status guard (docs/data-model-sync-and-privacy.md §3.6): draft -> proposed -> voting ->
-- approved -> applied, proposed|voting -> rejected, applied -> reverted; any non-terminal status ->
-- stale (the base version was superseded while this change set was pending). Mirrors
-- packages/domain/src/state/change-set.ts exactly. `approved_by_kind = 'policy'` is rejected from
-- any caller with app.uid() set — only app_system (a policy job) may write it.
CREATE OR REPLACE FUNCTION app.change_sets_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.approved_by_kind = 'policy' AND app.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'only app_system may set approved_by_kind to policy' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'illegal initial change set status: %', NEW.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'stale' THEN
    IF OLD.status IN ('applied', 'rejected', 'reverted', 'stale') THEN
      RAISE EXCEPTION 'illegal change set transition: % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT ((OLD.status, NEW.status) IN (VALUES
    ('draft', 'proposed'), ('proposed', 'voting'), ('proposed', 'approved'), ('proposed', 'rejected'),
    ('voting', 'approved'), ('voting', 'rejected'), ('approved', 'applied'), ('applied', 'reverted')
  )) THEN
    RAISE EXCEPTION 'illegal change set transition: % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.change_sets_guard() FROM PUBLIC;

CREATE TRIGGER change_sets_guard BEFORE INSERT OR UPDATE ON change_sets
  FOR EACH ROW EXECUTE FUNCTION app.change_sets_guard();

-- app.apply_change_set: SECURITY DEFINER shell (docs/data-model.md §3.3 migration table). Requires
-- an approved change set; copies the base version's days and items into a new version, applying
-- each op by stable_id (add/move/remove/retime/swap); marks the change set stale with no writes if
-- the trip's current version has moved on since base_version_id was captured. Op semantics beyond
-- this structural replay are validated by the planner (phase 16) before a change set may be
-- approved in the first place.
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

  INSERT INTO plan_days (id, version_id, trip_id, day_no, date, theme, weather_ref)
  SELECT uuidv7(), new_version_id, trip_id, day_no, date, theme, weather_ref
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
      currency, status, flexibility, is_outdoor, created_by_kind, notes)
    VALUES (new_item.id, new_item.version_id, new_item.day_id, new_item.trip_id, new_item.stable_id,
      new_item.starts_at, new_item.ends_at, new_item.tz, new_item.lane, new_item.attendee_ids,
      new_item.poi_id, new_item.provider_id, new_item.booking_id, new_item.must_do_id, new_item.category,
      new_item.cost_model, new_item.amount_minor, new_item.currency, new_item.status, new_item.flexibility,
      new_item.is_outdoor, new_item.created_by_kind, new_item.notes);
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

REVOKE EXECUTE ON FUNCTION app.apply_change_set(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.apply_change_set(uuid) TO app_user, app_system;
