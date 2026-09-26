-- Trip RLS helpers, the Trip status guard trigger and the crew-membership epoch trigger's trip-
-- scoped extension (docs/data-model.md §2, §3.3; docs/data-model-sync-and-privacy.md §3.1).

CREATE OR REPLACE FUNCTION app.is_trip_member(trip uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM trips WHERE id = trip AND app.is_crew_member(crew_id)
  )
$$;

CREATE OR REPLACE FUNCTION app.is_trip_participant(trip uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_participants WHERE trip_id = trip AND user_id = app.uid()
  )
$$;

-- Co-organisers: true for any role='organiser' row on the trip, never just the first one.
CREATE OR REPLACE FUNCTION app.is_trip_organiser(trip uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_participants WHERE trip_id = trip AND user_id = app.uid() AND role = 'organiser'
  )
$$;

-- Invoker rights on purpose (unlike the three above): every trip member can already SELECT every
-- trip_participants row for their trip, so this never discloses more than the caller's own RLS
-- grant already would, and an outsider correctly gets 0 rather than the true (leaked) headcount.
CREATE OR REPLACE FUNCTION app.trip_seats_held(trip uuid) RETURNS integer
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT count(*)::integer FROM trip_participants WHERE trip_id = trip AND holds_seat
$$;

REVOKE EXECUTE ON FUNCTION app.is_trip_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.is_trip_participant(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.is_trip_organiser(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.trip_seats_held(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.is_trip_member(uuid) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.is_trip_participant(uuid) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.is_trip_organiser(uuid) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.trip_seats_held(uuid) TO app_user, app_system;

-- Trip status guard (docs/data-model-sync-and-privacy.md §3.1): rejects any (old, new) pair not in
-- packages/domain/src/state/trip.transitions.json. A no-op UPDATE (other columns changing, status
-- untouched) always passes.
CREATE OR REPLACE FUNCTION app.trips_status_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('voting', 'setup') THEN
      RAISE EXCEPTION 'illegal initial trip status: %', NEW.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT ((OLD.status, NEW.status) IN (VALUES
    ('voting', 'won'), ('won', 'setup'), ('setup', 'drafting'),
    ('drafting', 'draft_review'), ('drafting', 'setup'),
    ('draft_review', 'redrafting'), ('redrafting', 'draft_review'),
    ('draft_review', 'proposed'), ('proposed', 'draft_review'),
    ('proposed', 'confirmed'), ('confirmed', 'pre_trip'),
    ('pre_trip', 'in_trip'), ('in_trip', 'post_trip'), ('post_trip', 'archived'),
    ('setup', 'cancelled'), ('proposed', 'cancelled'), ('confirmed', 'cancelled'), ('pre_trip', 'cancelled')
  )) THEN
    RAISE EXCEPTION 'illegal trip status transition: % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.trips_status_guard() FROM PUBLIC;

CREATE TRIGGER trips_status_guard BEFORE INSERT OR UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION app.trips_status_guard();

-- Membership epoch fan-out grows here (docs/data-model.md §3.2, §3.3): a user leaving/removed from
-- a crew also loses realtime access to every trip under that crew they participate in. The
-- crew_chat/crew_money/crew_bookings/crew_collection channels join this fan-out once the tables
-- naming them exist (chat, money, bookings, collection — all later phases).
CREATE OR REPLACE FUNCTION app.crew_members_epoch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  bumped_epoch integer;
  member_trip record;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'active' AND NEW.status = 'active') THEN
    UPDATE crews SET membership_epoch = membership_epoch + 1
      WHERE id = NEW.crew_id
      RETURNING membership_epoch INTO bumped_epoch;
    NEW.joined_epoch := bumped_epoch;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status <> 'active' THEN
    UPDATE crews SET membership_epoch = membership_epoch + 1 WHERE id = NEW.crew_id;
    INSERT INTO rt_outbox (channel, payload, idem_key, kind)
    VALUES (
      app.channel_name('crew', NEW.crew_id::text),
      jsonb_build_object('user_id', NEW.user_id),
      gen_random_uuid(),
      'unsubscribe'
    );

    FOR member_trip IN
      SELECT tp.trip_id FROM trip_participants tp
      JOIN trips t ON t.id = tp.trip_id
      WHERE t.crew_id = NEW.crew_id AND tp.user_id = NEW.user_id
    LOOP
      INSERT INTO rt_outbox (channel, payload, idem_key, kind)
      VALUES (
        app.channel_name('trip', member_trip.trip_id::text),
        jsonb_build_object('user_id', NEW.user_id),
        gen_random_uuid(),
        'unsubscribe'
      );
    END LOOP;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
