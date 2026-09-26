-- Plan versions, days, items, ChangeSets and GuideActions (docs/data-model.md §3.3). Guides never
-- write plan_items directly: the only write path for app_user is the SECURITY DEFINER
-- app.apply_change_set below, which requires an already-approved change set.

CREATE TABLE itinerary_versions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  parent_id uuid REFERENCES itinerary_versions (id),
  visibility text NOT NULL DEFAULT 'organiser',
  status text NOT NULL DEFAULT 'drafting',
  cost_pp_minor bigint,
  currency text,
  created_by_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN itinerary_versions.created_by_job_id IS 'No FK yet: agent_jobs does not exist until a later phase.';
ALTER TABLE itinerary_versions ADD CONSTRAINT itinerary_versions_visibility_check CHECK (visibility IN ('organiser', 'crew'));
ALTER TABLE itinerary_versions ADD CONSTRAINT itinerary_versions_status_check CHECK (status IN ('drafting', 'draft', 'proposed', 'current', 'superseded'));
CREATE INDEX itinerary_versions_trip_status_idx ON itinerary_versions (trip_id, status);
CREATE TRIGGER itinerary_versions_touch_updated_at BEFORE UPDATE ON itinerary_versions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE itinerary_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_versions FORCE ROW LEVEL SECURITY;

-- Expand migration: trips.current_version_id/draft_version_id were created column-only by
-- trips_and_participants (itinerary_versions did not exist yet); wire up the real FK now.
ALTER TABLE trips ADD CONSTRAINT trips_current_version_id_fkey FOREIGN KEY (current_version_id) REFERENCES itinerary_versions (id);
ALTER TABLE trips ADD CONSTRAINT trips_draft_version_id_fkey FOREIGN KEY (draft_version_id) REFERENCES itinerary_versions (id);

CREATE TABLE plan_days (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  version_id uuid NOT NULL REFERENCES itinerary_versions (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  day_no integer NOT NULL,
  date date,
  theme text,
  weather_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, day_no)
);
COMMENT ON COLUMN plan_days.weather_ref IS 'No FK yet: weather_snapshots does not exist until a later phase.';
CREATE INDEX plan_days_trip_id_idx ON plan_days (trip_id);
CREATE TRIGGER plan_days_touch_updated_at BEFORE UPDATE ON plan_days
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE plan_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_days FORCE ROW LEVEL SECURITY;

CREATE TABLE plan_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  version_id uuid NOT NULL REFERENCES itinerary_versions (id),
  day_id uuid NOT NULL REFERENCES plan_days (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  -- Survives across versions; ChangeSet ops and version diffs key on this, never on id.
  stable_id uuid NOT NULL DEFAULT uuidv7(),
  starts_at timestamptz,
  ends_at timestamptz,
  tz text,
  lane text,
  attendee_ids uuid[],
  poi_id uuid,
  provider_id uuid,
  booking_id uuid,
  must_do_id uuid,
  category text,
  cost_model text,
  amount_minor bigint,
  currency text,
  status text NOT NULL DEFAULT 'proposed',
  flexibility text,
  is_outdoor boolean NOT NULL DEFAULT false,
  created_by_kind text NOT NULL DEFAULT 'user',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN plan_items.poi_id IS 'No FK yet: pois does not exist until a later phase.';
COMMENT ON COLUMN plan_items.provider_id IS 'No FK yet: providers does not exist until a later phase.';
COMMENT ON COLUMN plan_items.booking_id IS 'No FK yet: bookings does not exist until a later phase.';
COMMENT ON COLUMN plan_items.must_do_id IS 'No FK yet: must_dos does not exist until a later phase.';
ALTER TABLE plan_items ADD CONSTRAINT plan_items_tz_check CHECK (tz IS NULL OR app.valid_tz(tz));
ALTER TABLE plan_items ADD CONSTRAINT plan_items_cost_model_check CHECK (cost_model IS NULL OR cost_model IN ('per_person', 'group', 'unit'));
ALTER TABLE plan_items ADD CONSTRAINT plan_items_status_check CHECK (status IN ('confirmed', 'proposed', 'voting'));
ALTER TABLE plan_items ADD CONSTRAINT plan_items_created_by_kind_check CHECK (created_by_kind IN ('user', 'guide'));
CREATE INDEX plan_items_version_day_idx ON plan_items (version_id, day_id);
CREATE INDEX plan_items_trip_stable_idx ON plan_items (trip_id, stable_id);
CREATE TRIGGER plan_items_touch_updated_at BEFORE UPDATE ON plan_items
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_items FORCE ROW LEVEL SECURITY;

CREATE TABLE change_sets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  base_version_id uuid NOT NULL REFERENCES itinerary_versions (id),
  trigger text NOT NULL,
  scope text NOT NULL DEFAULT 'group',
  author_kind text NOT NULL,
  author_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  poll_id uuid,
  cost_delta_minor bigint,
  -- Structural shape: packages/domain/src/plan/change-set-ops.ts#changeSetOpsSchema.
  ops jsonb NOT NULL,
  approved_by_kind text,
  approved_by uuid,
  result_version_id uuid REFERENCES itinerary_versions (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN change_sets.poll_id IS 'No FK yet: polls does not exist until a later phase.';
ALTER TABLE change_sets ADD CONSTRAINT change_sets_trigger_check CHECK (trigger IN ('weather', 'manual', 'dropout', 'delay', 'chat', 'redraft', 'swap'));
ALTER TABLE change_sets ADD CONSTRAINT change_sets_scope_check CHECK (scope IN ('group', 'personal'));
ALTER TABLE change_sets ADD CONSTRAINT change_sets_author_kind_check CHECK (author_kind IN ('user', 'guide'));
ALTER TABLE change_sets ADD CONSTRAINT change_sets_status_check CHECK (status IN ('draft', 'proposed', 'voting', 'approved', 'applied', 'rejected', 'reverted', 'stale'));
ALTER TABLE change_sets ADD CONSTRAINT change_sets_approved_by_kind_check CHECK (approved_by_kind IS NULL OR approved_by_kind IN ('vote', 'organiser', 'self', 'policy'));
ALTER TABLE change_sets ADD CONSTRAINT change_sets_ops_is_array_check CHECK (jsonb_typeof(ops) = 'array');
CREATE INDEX change_sets_trip_status_idx ON change_sets (trip_id, status);
CREATE TRIGGER change_sets_touch_updated_at BEFORE UPDATE ON change_sets
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE change_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_sets FORCE ROW LEVEL SECURITY;

CREATE TABLE guide_actions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  change_set_id uuid REFERENCES change_sets (id),
  kind text NOT NULL,
  target_provider_id uuid,
  channel text,
  status text NOT NULL DEFAULT 'planned',
  reversible boolean NOT NULL DEFAULT false,
  compensates_id uuid REFERENCES guide_actions (id),
  cost_delta_minor bigint,
  audit jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN guide_actions.target_provider_id IS 'No FK yet: providers does not exist until a later phase.';
ALTER TABLE guide_actions ADD CONSTRAINT guide_actions_status_check CHECK (status IN ('planned', 'needs_approval', 'running', 'done', 'failed'));
CREATE INDEX guide_actions_trip_id_idx ON guide_actions (trip_id);
CREATE TRIGGER guide_actions_touch_updated_at BEFORE UPDATE ON guide_actions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE guide_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_actions FORCE ROW LEVEL SECURITY;

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
-- this structural replay are validated by the planner before a change set may be
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

-- RLS policies and grants (docs/data-model.md §3.3).

CREATE POLICY itinerary_versions_select ON itinerary_versions FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id) AND (visibility = 'crew' OR app.is_trip_organiser(trip_id)));
CREATE POLICY itinerary_versions_insert ON itinerary_versions FOR INSERT TO app_user
  WITH CHECK (app.is_trip_organiser(trip_id));
CREATE POLICY itinerary_versions_update ON itinerary_versions FOR UPDATE TO app_user
  USING (app.is_trip_organiser(trip_id))
  WITH CHECK (app.is_trip_organiser(trip_id));
CREATE POLICY itinerary_versions_system ON itinerary_versions FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON itinerary_versions TO app_user, app_system;

CREATE POLICY plan_days_select ON plan_days FOR SELECT TO app_user
  USING (app.is_version_visible(version_id));
CREATE POLICY plan_days_insert ON plan_days FOR INSERT TO app_user
  WITH CHECK (app.is_trip_organiser(trip_id));
CREATE POLICY plan_days_update ON plan_days FOR UPDATE TO app_user
  USING (app.is_trip_organiser(trip_id))
  WITH CHECK (app.is_trip_organiser(trip_id));
CREATE POLICY plan_days_system ON plan_days FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON plan_days TO app_user, app_system;

-- plan_items: no app_user policy for INSERT/UPDATE/DELETE at all — with RLS forced, that leaves it
-- unwritable by app_user regardless of table grants; app.apply_change_set (SECURITY DEFINER, owner
-- app_owner has BYPASSRLS) is the only path, matching "guide never writes plan_items directly".
CREATE POLICY plan_items_select ON plan_items FOR SELECT TO app_user
  USING (app.is_version_visible(version_id));
CREATE POLICY plan_items_system ON plan_items FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON plan_items TO app_user;
GRANT SELECT, INSERT, UPDATE ON plan_items TO app_system;

CREATE POLICY change_sets_select ON change_sets FOR SELECT TO app_user
  USING (app.is_version_visible(base_version_id));
CREATE POLICY change_sets_insert ON change_sets FOR INSERT TO app_user
  WITH CHECK (app.is_trip_member(trip_id));
CREATE POLICY change_sets_update ON change_sets FOR UPDATE TO app_user
  USING (author_id = app.uid() OR app.is_trip_organiser(trip_id))
  WITH CHECK (author_id = app.uid() OR app.is_trip_organiser(trip_id));
CREATE POLICY change_sets_system ON change_sets FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON change_sets TO app_user, app_system;

-- guide_actions: "T read, S write" — trip members read, only app_system (after change-set approval)
-- writes.
CREATE POLICY guide_actions_select ON guide_actions FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY guide_actions_system ON guide_actions FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON guide_actions TO app_user;
GRANT SELECT, INSERT, UPDATE ON guide_actions TO app_system;
