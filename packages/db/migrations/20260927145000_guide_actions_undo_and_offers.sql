-- The guide-action approval and undo paths (docs/data-model.md §3.3, docs/product-decisions.md "approval authority"),
-- completing the guide_actions undo surface added by the earlier *_guide_actions_undo_and_offers
-- migration:
--
-- 1. A guide-authored change set reaches `approved` only through a recorded decision: the autonomy
--    policy (app_system, with the guide action's `auto` decider audit on the running action), a vote
--    result the poll engine records, or a person deciding as themselves (organiser, or `self` for a
--    change touching only their own items).
-- 2. app.undo_guide_action: the one undo path (the `undo_guide_action` command and system callers).
--    It applies the action's stored inverse as a new change set and records a compensating action.
-- 3. A person may still change the status of a set the policy approved (an undo reverts it); only
--    setting `policy` stays reserved to app_system.
-- 4. `guide_action.undone` joins the domain event types (packages/domain/src/events/catalogue.ts).

ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (
  'crew.member_joined', 'crew.member_left', 'crew.member_removed',
  'trip.created', 'trip.status_changed',
  'plan.version_created',
  'change_set.proposed', 'change_set.applied', 'change_set.reverted', 'change_set.rejected',
  'rsvp.changed',
  'auth.merged',
  'invite.opened', 'attribution.claimed',
  'guide_action.undone'
));

CREATE INDEX guide_actions_change_set_idx ON guide_actions (change_set_id) WHERE change_set_id IS NOT NULL;
CREATE INDEX guide_actions_compensates_idx ON guide_actions (compensates_id) WHERE compensates_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.change_sets_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  caller uuid := app.uid();
BEGIN
  -- Only the setting of `policy` is refused to a person: a later status change on a set the policy
  -- approved (reverting it through an undo) must stay possible for them.
  IF NEW.approved_by_kind = 'policy' AND caller IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.approved_by_kind IS DISTINCT FROM 'policy') THEN
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

  IF NEW.status = 'approved' AND NEW.author_kind = 'guide' THEN
    IF NEW.approved_by_kind IS NULL THEN
      RAISE EXCEPTION 'guide change set % needs a recorded approval source', NEW.id
        USING ERRCODE = 'insufficient_privilege';
    ELSIF NEW.approved_by_kind = 'policy' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.guide_actions ga
         WHERE ga.change_set_id = NEW.id AND ga.status = 'running' AND ga.reversible
           AND ga.audit -> 'decider' ->> 'outcome' = 'auto'
      ) THEN
        RAISE EXCEPTION 'guide change set % has no autonomy decision allowing it', NEW.id
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF caller IS NOT NULL THEN
      IF NEW.approved_by IS DISTINCT FROM caller THEN
        RAISE EXCEPTION 'a person approves a guide change set only as themselves'
          USING ERRCODE = 'insufficient_privilege';
      ELSIF NEW.approved_by_kind = 'vote' THEN
        RAISE EXCEPTION 'only the poll engine records a vote result' USING ERRCODE = 'insufficient_privilege';
      ELSIF NEW.approved_by_kind = 'organiser' AND NOT app.is_trip_organiser(NEW.trip_id) THEN
        RAISE EXCEPTION 'only an organiser approves as organiser' USING ERRCODE = 'insufficient_privilege';
      ELSIF NEW.approved_by_kind = 'self' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(NEW.ops) AS op,
                      jsonb_array_elements_text(COALESCE(op -> 'affected_user_ids', '[]'::jsonb)) AS affected
         WHERE affected <> caller::text
      ) THEN
        RAISE EXCEPTION 'self-approval covers only the approver''s own items' USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF (NEW.approved_by_kind = 'vote' AND NEW.poll_id IS NULL)
       OR (NEW.approved_by_kind IN ('organiser', 'self') AND NEW.approved_by IS NULL) THEN
      RAISE EXCEPTION 'guide change set % approval lacks its poll or approver', NEW.id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.change_sets_guard() FROM PUBLIC;

-- Undo a done, reversible guide action inside its window. Visible only to trip participants (others
-- get no_data_found); allowed for an affected member or an organiser. An already-undone action
-- returns its first undo again, so repeated undos are harmless. The inverse is refused
-- (serialization_failure) when a touched item changed since the action ran, so an undo never
-- silently overwrites a later edit. Reasons travel in HINT for the command layer's error mapping.
CREATE OR REPLACE FUNCTION app.undo_guide_action(p_action_id uuid, p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  a guide_actions%ROWTYPE;
  prior guide_actions%ROWTYPE;
  original change_sets%ROWTYPE;
  organiser boolean;
  current_version uuid;
  op jsonb;
  item plan_items%ROWTYPE;
  item_day integer;
  undo_set uuid;
  undo_action uuid;
  new_version uuid;
BEGIN
  IF p_actor IS NULL OR (app.uid() IS NOT NULL AND app.uid() <> p_actor) THEN
    RAISE EXCEPTION 'an undo is made by its caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO a FROM guide_actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM trip_participants WHERE trip_id = a.trip_id AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'guide action % not found', p_action_id USING ERRCODE = 'no_data_found';
  END IF;
  organiser := EXISTS (
    SELECT 1 FROM trip_participants WHERE trip_id = a.trip_id AND user_id = p_actor AND role = 'organiser'
  );
  IF NOT organiser AND NOT COALESCE(a.audit -> 'affected_user_ids' ? p_actor::text, false) THEN
    RAISE EXCEPTION 'only an affected member or an organiser may undo guide action %', a.id
      USING ERRCODE = 'insufficient_privilege', HINT = 'not_affected';
  END IF;

  IF a.status = 'undone' THEN
    SELECT * INTO prior FROM guide_actions WHERE compensates_id = a.id ORDER BY created_at LIMIT 1;
    RETURN jsonb_build_object('action_id', a.id, 'undo_action_id', prior.id,
      'change_set_id', prior.change_set_id, 'trip_id', a.trip_id, 'already_undone', true);
  END IF;
  IF a.status <> 'done' OR NOT a.reversible OR a.inverse IS NULL OR a.compensates_id IS NOT NULL
     OR a.change_set_id IS NULL THEN
    RAISE EXCEPTION 'guide action % cannot be undone (status %)', a.id, a.status
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'not_undoable';
  END IF;
  IF a.undo_until IS NULL OR a.undo_until <= now() THEN
    RAISE EXCEPTION 'the undo window of guide action % has closed', a.id
      USING ERRCODE = 'object_not_in_prerequisite_state', HINT = 'undo_window_closed';
  END IF;

  SELECT * INTO original FROM change_sets WHERE id = a.change_set_id FOR UPDATE;
  SELECT current_version_id INTO current_version FROM trips WHERE id = a.trip_id FOR UPDATE;
  FOR op IN SELECT value FROM jsonb_array_elements(a.inverse -> 'ops') AS value LOOP
    SELECT * INTO item FROM plan_items
     WHERE version_id = current_version AND stable_id = (op ->> 'target')::uuid;
    IF op ->> 'op' = 'add' THEN
      IF FOUND THEN
        RAISE EXCEPTION 'plan item % came back since guide action % ran', op ->> 'target', a.id
          USING ERRCODE = 'serialization_failure', HINT = 'plan_changed';
      END IF;
      CONTINUE;
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'plan item % is gone since guide action % ran', op ->> 'target', a.id
        USING ERRCODE = 'serialization_failure', HINT = 'plan_changed';
    END IF;
    SELECT day_no INTO item_day FROM plan_days WHERE id = item.day_id;
    IF jsonb_populate_record(item, COALESCE(op -> 'before', '{}'::jsonb) - 'day_no') IS DISTINCT FROM item
       OR (op -> 'before' ? 'day_no' AND (op -> 'before' ->> 'day_no')::integer IS DISTINCT FROM item_day) THEN
      RAISE EXCEPTION 'plan item % changed since guide action % ran', op ->> 'target', a.id
        USING ERRCODE = 'serialization_failure', HINT = 'plan_changed';
    END IF;
  END LOOP;

  INSERT INTO change_sets (trip_id, base_version_id, trigger, scope, author_kind, author_id, status, ops, cost_delta_minor)
  VALUES (a.trip_id, current_version, 'manual', original.scope, 'user', p_actor, 'draft', a.inverse -> 'ops',
          -COALESCE(a.cost_delta_minor, 0))
  RETURNING id INTO undo_set;
  UPDATE change_sets SET status = 'proposed' WHERE id = undo_set;
  UPDATE change_sets
     SET status = 'approved', approved_by = p_actor,
         approved_by_kind = CASE WHEN organiser THEN 'organiser' ELSE 'self' END
   WHERE id = undo_set;
  new_version := app.apply_change_set(undo_set);
  IF new_version IS NULL THEN
    RAISE EXCEPTION 'the plan moved on while guide action % was being undone', a.id
      USING ERRCODE = 'serialization_failure', HINT = 'plan_changed';
  END IF;

  INSERT INTO guide_actions (trip_id, change_set_id, kind, status, reversible, compensates_id,
    cost_delta_minor, disruption_id, audit)
  VALUES (a.trip_id, undo_set, a.kind, 'planned', false, a.id, -COALESCE(a.cost_delta_minor, 0),
    a.disruption_id, jsonb_build_object('undo_of', a.id, 'requested_by', p_actor, 'at', now()))
  RETURNING id INTO undo_action;
  UPDATE guide_actions SET status = 'running' WHERE id = undo_action;
  UPDATE guide_actions SET status = 'done' WHERE id = undo_action;
  UPDATE guide_actions
     SET status = 'undone',
         audit = audit || jsonb_build_object('undone', jsonb_build_object(
           'by', p_actor, 'at', now(), 'undo_action_id', undo_action))
   WHERE id = a.id;
  UPDATE change_sets SET status = 'reverted' WHERE id = a.change_set_id AND status = 'applied';
  PERFORM app.cancel_scheduled_event('guide_action.undo_expire', a.id, '');

  RETURN jsonb_build_object('action_id', a.id, 'undo_action_id', undo_action,
    'change_set_id', undo_set, 'version_id', new_version, 'trip_id', a.trip_id, 'already_undone', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION app.undo_guide_action(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.undo_guide_action(uuid, uuid) TO app_user, app_system;
