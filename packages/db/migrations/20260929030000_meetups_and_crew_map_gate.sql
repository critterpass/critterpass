-- Crew live map (docs/data-model.md §3.12 `meetups`, `member_etas`; docs/api-contracts-async.md
-- §1.2 `trip_locations:{trip_id}`).
--
-- The crew map is open for a trip while it is boosted (Boost or First Trip Free, as materialised
-- into `trip_entitlements.boost_active`), in its trip days (`status = 'in_trip'`) and before
-- midnight after the last day in the destination's zone. `app.crew_map_open` is the one gate: the
-- `trip_locations` subscribe proxy, the `meetups` and crew-map `member_etas` RLS and the live
-- snapshot all call it. Production SQL reads only `now()`: no GUC can move the clock.
--
-- Privacy: meetups are C1 (a place and a time). Positions stay C3 in `location_fixes` (phase-owned
-- elsewhere, TTL 15 min) and reach viewers only over Centrifugo while the gate is open.

-- ---------------------------------------------------------------------------------------------
-- The gate.

-- Pure: whether the crew map of `trip` is open at instant `at`. Not executable by app_user, so no
-- caller can ask about another instant; tests call it as the owner to probe the window edge.
CREATE OR REPLACE FUNCTION app.crew_map_open_at(trip uuid, at timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM trips t
    JOIN trip_entitlements e ON e.trip_id = t.id
    WHERE t.id = trip
      AND e.boost_active
      AND t.status = 'in_trip'
      AND t.end_date IS NOT NULL
      AND t.tz IS NOT NULL
      AND at < ((t.end_date + 1)::timestamp AT TIME ZONE t.tz)
  )
$$;

CREATE OR REPLACE FUNCTION app.crew_map_open(trip uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT app.crew_map_open_at(trip, now())
$$;

-- When the crew map of `trip` closes for good this trip: midnight after the last day, destination
-- zone. Null while the trip has no end date or zone.
CREATE OR REPLACE FUNCTION app.crew_map_window_end(trip uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT (t.end_date + 1)::timestamp AT TIME ZONE t.tz
  FROM trips t WHERE t.id = trip AND t.end_date IS NOT NULL AND t.tz IS NOT NULL
$$;

-- A viewer of the crew map: a participant of the trip (still in the crew, not answered `out`
-- unless organising) while the gate is open. Sharing oneself is not required.
CREATE OR REPLACE FUNCTION app.can_view_crew_map(trip uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT app.is_trip_member(trip)
    AND EXISTS (
      SELECT 1 FROM trip_participants p
      WHERE p.trip_id = trip AND p.user_id = app.uid()
        AND (p.rsvp <> 'out' OR p.role = 'organiser')
    )
    AND app.crew_map_open(trip)
$$;

REVOKE ALL ON FUNCTION app.crew_map_open_at(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.crew_map_open(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.crew_map_window_end(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.can_view_crew_map(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.crew_map_open(uuid) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.crew_map_window_end(uuid) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.can_view_crew_map(uuid) TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- meetups: at most one active meet-up per trip. `arrived` maps uid → ISO instant the member came
-- within the arrival radius; `all_close_at` records the one "everyone is close" moment.
CREATE TABLE meetups (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  poi_id uuid REFERENCES pois (id),
  place_name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  meet_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users (id),
  status text NOT NULL DEFAULT 'active',
  arrived jsonb NOT NULL DEFAULT '{}'::jsonb,
  all_close_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE meetups ADD CONSTRAINT meetups_status_check
  CHECK (status IN ('active', 'done', 'cancelled'));
ALTER TABLE meetups ADD CONSTRAINT meetups_coords_check
  CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180);
ALTER TABLE meetups ADD CONSTRAINT meetups_place_name_check
  CHECK (char_length(place_name) BETWEEN 1 AND 120);
ALTER TABLE meetups ADD CONSTRAINT meetups_arrived_check CHECK (jsonb_typeof(arrived) = 'object');
CREATE INDEX meetups_trip_id_idx ON meetups (trip_id);
CREATE UNIQUE INDEX meetups_one_active_per_trip_idx ON meetups (trip_id) WHERE status = 'active';
CREATE INDEX meetups_poi_id_idx ON meetups (poi_id);
CREATE INDEX meetups_created_by_idx ON meetups (created_by);
CREATE TRIGGER meetups_touch_updated_at BEFORE UPDATE ON meetups
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE meetups ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetups FORCE ROW LEVEL SECURITY;
CREATE POLICY meetups_select ON meetups FOR SELECT TO app_user
  USING (app.can_view_crew_map(trip_id));
CREATE POLICY meetups_insert ON meetups FOR INSERT TO app_user
  WITH CHECK (created_by = app.uid() AND app.can_view_crew_map(trip_id));
CREATE POLICY meetups_update ON meetups FOR UPDATE TO app_user
  USING (app.can_view_crew_map(trip_id)) WITH CHECK (app.can_view_crew_map(trip_id));
CREATE POLICY meetups_system ON meetups FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON meetups TO app_user;
GRANT UPDATE (poi_id, place_name, lat, lng, meet_at, status) ON meetups TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON meetups TO app_system;

-- The trip a meet-up belongs to, for a member of that trip even while the gate hides the row, so
-- a command can answer "Boost needed" rather than "not found".
CREATE OR REPLACE FUNCTION app.meetup_trip(meetup uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT m.trip_id FROM meetups m WHERE m.id = meetup AND app.is_trip_member(m.trip_id)
$$;

-- A moved meet-up starts its arrivals, "everyone is close" moment and ETAs over (system-only
-- columns and rows), so the next recount runs at once for the new place.
CREATE OR REPLACE FUNCTION app.reset_meetup_arrivals(meetup uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  DELETE FROM member_etas e
   USING meetups m
   WHERE e.meetup_id = m.id AND m.id = meetup AND app.can_view_crew_map(m.trip_id);
  UPDATE meetups SET arrived = '{}'::jsonb, all_close_at = NULL
  WHERE id = meetup AND app.can_view_crew_map(trip_id);
$$;
REVOKE ALL ON FUNCTION app.meetup_trip(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reset_meetup_arrivals(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.meetup_trip(uuid) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.reset_meetup_arrivals(uuid) TO app_user;

-- ---------------------------------------------------------------------------------------------
-- member_etas: crew-map rows (those tied to a meet-up) need the open gate; Help rows (no meet-up)
-- keep the crew-visible rule.
-- `estimate`: the minutes are a straight-line estimate ("about"), not a routed path.
-- `status_text`: the status key, or `key:place` when a place is named ("leaving_place:Karsa Spa").
ALTER TABLE member_etas ADD COLUMN estimate boolean NOT NULL DEFAULT false;
ALTER TABLE member_etas ADD CONSTRAINT member_etas_meetup_id_fkey
  FOREIGN KEY (meetup_id) REFERENCES meetups (id) ON DELETE CASCADE;
CREATE INDEX member_etas_meetup_id_idx ON member_etas (meetup_id);
DROP POLICY member_etas_select ON member_etas;
CREATE POLICY member_etas_select ON member_etas FOR SELECT TO app_user
  USING (
    app.is_trip_member(trip_id)
    AND (meetup_id IS NULL OR app.can_view_crew_map(trip_id))
  );

-- ---------------------------------------------------------------------------------------------
-- Server-side revocation. Whoever stops being a viewer loses the `trip_locations` subscription in
-- the same transaction, and their own crew-map share ends so nobody keeps receiving their fixes.
-- Membership changes only matter while the map is open: closing it (Boost ending here, the window
-- ending in the `location.expire` job) already unsubscribes everyone.

-- One realtime envelope (`{v, id, type, at, data}`, packages/db/src/command/outbox.ts).
CREATE OR REPLACE FUNCTION app.crew_map_envelope(kind text, data jsonb) RETURNS jsonb
LANGUAGE sql VOLATILE SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object(
    'v', 1, 'id', uuidv7(), 'type', kind,
    'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'data', data
  )
$$;
REVOKE ALL ON FUNCTION app.crew_map_envelope(text, jsonb) FROM PUBLIC;

-- Ends `who`'s open crew-map shares on `trip` (every member's when `who` is null), announces each
-- with `share.ended`, and unsubscribes `who` (every participant and crew member when null).
CREATE OR REPLACE FUNCTION app.revoke_crew_map(trip uuid, who uuid, why text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  ended record;
  viewer uuid;
BEGIN
  FOR ended IN
    UPDATE location_shares
       SET ends_at = greatest(now(), starts_at + interval '1 millisecond')
     WHERE trip_id = trip AND reason = 'crew_map'
       AND (who IS NULL OR user_id = who)
       AND (ends_at IS NULL OR ends_at > now())
    RETURNING id, user_id
  LOOP
    INSERT INTO rt_outbox (channel, payload, idem_key, kind)
    VALUES (
      app.channel_name('trip_locations', trip::text),
      app.crew_map_envelope('share.ended', jsonb_build_object(
        'uid', ended.user_id, 'share_id', ended.id, 'reason', why)),
      gen_random_uuid(),
      'publish'
    );
  END LOOP;

  FOR viewer IN
    SELECT who WHERE who IS NOT NULL
    UNION
    SELECT tp.user_id FROM trip_participants tp WHERE who IS NULL AND tp.trip_id = trip
    UNION
    SELECT cm.user_id FROM crew_members cm JOIN trips t ON t.crew_id = cm.crew_id
     WHERE who IS NULL AND t.id = trip
  LOOP
    INSERT INTO rt_outbox (channel, payload, idem_key, kind)
    VALUES (
      app.channel_name('trip_locations', trip::text),
      jsonb_build_object('user_id', viewer),
      gen_random_uuid(),
      'unsubscribe'
    );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION app.revoke_crew_map(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.revoke_crew_map(uuid, uuid, text) TO app_system;

-- A participant who answers `out` (and does not organise) or whose row goes.
CREATE OR REPLACE FUNCTION app.trip_participants_crew_map_revoke() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF app.crew_map_open(OLD.trip_id) THEN
      PERFORM app.revoke_crew_map(OLD.trip_id, OLD.user_id, 'member_left');
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.rsvp = 'out' AND OLD.rsvp <> 'out' AND NEW.role <> 'organiser'
     AND app.crew_map_open(NEW.trip_id) THEN
    PERFORM app.revoke_crew_map(NEW.trip_id, NEW.user_id, 'member_left');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.trip_participants_crew_map_revoke() FROM PUBLIC;
CREATE TRIGGER trip_participants_crew_map_revoke
  AFTER UPDATE OF rsvp OR DELETE ON trip_participants
  FOR EACH ROW EXECUTE FUNCTION app.trip_participants_crew_map_revoke();

-- A crew member who leaves, is removed or becomes former: every trip of that crew.
CREATE OR REPLACE FUNCTION app.crew_members_crew_map_revoke() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  member_trip uuid;
BEGIN
  IF OLD.status = 'active' AND NEW.status <> 'active' THEN
    FOR member_trip IN
      SELECT t.id FROM trips t WHERE t.crew_id = NEW.crew_id AND app.crew_map_open(t.id)
    LOOP
      PERFORM app.revoke_crew_map(member_trip, NEW.user_id, 'member_left');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.crew_members_crew_map_revoke() FROM PUBLIC;
CREATE TRIGGER crew_members_crew_map_revoke
  AFTER UPDATE OF status ON crew_members
  FOR EACH ROW EXECUTE FUNCTION app.crew_members_crew_map_revoke();

-- Boost (or First Trip Free) ending mid-trip closes the map for everyone at once.
CREATE OR REPLACE FUNCTION app.trip_entitlements_crew_map_revoke() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.boost_active AND NOT NEW.boost_active THEN
    PERFORM app.revoke_crew_map(NEW.trip_id, NULL, 'boost_ended');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.trip_entitlements_crew_map_revoke() FROM PUBLIC;
CREATE TRIGGER trip_entitlements_crew_map_revoke
  AFTER UPDATE OF boost_active ON trip_entitlements
  FOR EACH ROW EXECUTE FUNCTION app.trip_entitlements_crew_map_revoke();

-- ---------------------------------------------------------------------------------------------
-- domain_events: live-map events join the catalogue (packages/domain/src/live-map/events.ts).
ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (
  'crew.member_joined', 'crew.member_left', 'crew.member_removed',
  'trip.created', 'trip.status_changed',
  'plan.version_created',
  'change_set.proposed', 'change_set.applied', 'change_set.reverted', 'change_set.rejected',
  'rsvp.changed',
  'auth.merged',
  'invite.opened', 'attribution.claimed',
  'guide_action.undone',
  'fare.dropped', 'forecast.changed', 'hazard.changed',
  'moderation.decided',
  'entitlement.granted', 'entitlement.revoked',
  'device.permissions_changed', 'visit.recorded',
  'pass.issued', 'profile.updated', 'profile.taste_changed', 'profile.avatar_changed',
  'crew.created', 'crew.updated', 'crew.code_rotated', 'user.active_crew_changed',
  'invite.created', 'invite.claimed', 'invite.deferred', 'invite.declined', 'invite.revoked',
  'invite.nudged', 'trip.seat_opened', 'seat_offer.accepted', 'referral.progressed',
  'chat.message_sent', 'chat.message_edited', 'chat.message_deleted', 'chat.reaction_changed',
  'chat.guide_mentioned',
  'inbox.item_resolved', 'inbox.read',
  'nudge.sent', 'nudge.received',
  'tip.created', 'tip.dismissed',
  'trip.dates_changed', 'trip.destination_set',
  'booking.flight_added', 'booking.flight_changed', 'booking.flight_removed',
  'user.tz_changed',
  'location_share.changed', 'meetup.created', 'meetup.moved', 'meetup.crew_close', 'crew.pinged'
));

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList: `meetups` joins the trip stream.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'meetups'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE meetups;
  END IF;
  GRANT SELECT ON meetups TO powersync_repl;
END
$$;
