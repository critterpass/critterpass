-- The request role can no longer add itself to a crew or trip it has no claim on. Until now the
-- insert policies on crew_members, trip_participants and calendar_days checked only that the row
-- named the caller, so the api commands were the only thing between a user and a foreign crew.
--
-- Who writes these tables: app_user (every api command, PowerSync uploads included, since they run
-- as commands) and app_system (worker, webhooks, merges, seeds). The read-only roles hold no write
-- grant. The legitimate app_user paths, and what now proves each one:
--   * starting a crew: the caller created the crew row (crew_members_insert);
--   * joining a crew: a live join code, an open personal invite whose seat token the caller holds,
--     or an open in-app invite addressed to the caller (app.join_crew);
--   * a seat or a "no" on a trip, and the first organiser row of a new trip: the caller is an
--     active member of the trip's crew (trip_participants_insert);
--   * a calendar day tagged with a trip: the same crew membership (calendar_days).

-- ---------------------------------------------------------------------------------------------
-- crew_members: only a crew's creator inserts their own row directly.
CREATE OR REPLACE FUNCTION app.is_crew_creator(crew uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM crews WHERE id = crew AND created_by = app.uid())
$$;
REVOKE EXECUTE ON FUNCTION app.is_crew_creator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_crew_creator(uuid) TO app_user, app_system;

DROP POLICY crew_members_insert ON crew_members;
CREATE POLICY crew_members_insert ON crew_members FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.is_crew_creator(crew_id));

-- Joins the caller to a crew as a member, or brings their former membership back to active, when
-- they hold one proof for that crew: a live crew or trip code, the seat token (by its SHA-256) of
-- a personal invite that is still open or already theirs, or an open in-app invite addressed to
-- them. Raises insufficient_privilege without one. True when a row was created or revived. The
-- ceiling, the joiner's crew limit and redeeming the proof stay with the command, under
-- app.lock_crew_membership.
CREATE OR REPLACE FUNCTION app.join_crew(
  p_crew uuid, p_code text, p_seat_token_hash text, p_invite uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  caller uuid := app.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'join_crew needs a caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (
    EXISTS (
      SELECT 1 FROM join_codes jc
       WHERE jc.code = p_code AND jc.crew_id = p_crew AND jc.status = 'active'
         AND (jc.expires_at IS NULL OR jc.expires_at > now())
         AND (jc.max_uses IS NULL OR jc.uses < jc.max_uses)
    )
    OR EXISTS (
      SELECT 1 FROM invites i
       WHERE i.seat_token_hash = p_seat_token_hash AND i.crew_id = p_crew
         AND (
           i.claimed_by = caller
           OR (i.claimed_by IS NULL AND i.status IN ('pending', 'later') AND i.expires_at > now())
         )
    )
    OR EXISTS (
      SELECT 1 FROM invites i
       WHERE i.id = p_invite AND i.crew_id = p_crew AND i.invitee_user_id = caller
         AND i.status IN ('pending', 'later') AND i.expires_at > now()
    )
  ) THEN
    RAISE EXCEPTION 'no live code or invite for this crew' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE crew_members SET status = 'active', role = 'member', keep_in_chat = false, left_at = NULL
   WHERE crew_id = p_crew AND user_id = caller AND status <> 'active';
  IF FOUND THEN
    RETURN true;
  END IF;
  INSERT INTO crew_members (crew_id, user_id, role) VALUES (p_crew, caller, 'member')
  ON CONFLICT (crew_id, user_id) DO NOTHING;
  RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.join_crew(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.join_crew(uuid, text, text, uuid) TO app_user;

-- Reviving a former membership needed no proof at all: anyone who had left or been removed could
-- call it and be back in. app.join_crew does the revival now, behind the same proof as a new join.
DROP FUNCTION app.reactivate_membership(uuid);

-- ---------------------------------------------------------------------------------------------
-- trip_participants: the caller's own row, on a trip of a crew they are an active member of.
DROP POLICY trip_participants_insert ON trip_participants;
CREATE POLICY trip_participants_insert ON trip_participants FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.is_trip_member(trip_id));

-- ---------------------------------------------------------------------------------------------
-- calendar_days: a day stays its owner's alone; one tagged with a trip needs that trip's crew.
-- Updates keep the owner-only check (a day tagged long ago must stay editable after its owner
-- leaves the crew), so a trigger refuses re-tagging a day to a trip the caller has no part in.
DROP POLICY calendar_days_owner ON calendar_days;
CREATE POLICY calendar_days_owner_select ON calendar_days FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY calendar_days_owner_insert ON calendar_days FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND (trip_id IS NULL OR app.is_trip_member(trip_id)));
CREATE POLICY calendar_days_owner_update ON calendar_days FOR UPDATE TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());

CREATE OR REPLACE FUNCTION app.calendar_days_trip_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.trip_id IS NOT NULL AND NEW.trip_id IS DISTINCT FROM OLD.trip_id
     AND app.uid() IS NOT NULL AND NOT app.is_trip_member(NEW.trip_id) THEN
    RAISE EXCEPTION 'not a member of the trip''s crew' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.calendar_days_trip_guard() FROM PUBLIC;
CREATE TRIGGER calendar_days_trip_guard BEFORE UPDATE OF trip_id ON calendar_days
  FOR EACH ROW EXECUTE FUNCTION app.calendar_days_trip_guard();
