-- Trip, participant and catalogue tables plus the Trip status machine's SQL guard trigger
-- (docs/data-model.md §3.3, docs/data-model-sync-and-privacy.md §3.1). The allowed (from, to)
-- pairs below are a hand transcription of packages/domain/src/state/trip.transitions.json;
-- packages/domain/test/state/trip.test.ts and packages/db/test/trip-machine.test.ts both prove the
-- TS machine and this trigger agree on every pair.

CREATE TABLE destinations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  country text,
  coverage text NOT NULL DEFAULT 'guest',
  colour text,
  currency text,
  best_months integer[],
  tz text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE destinations ADD CONSTRAINT destinations_coverage_check CHECK (coverage IN ('live', 'guest'));
ALTER TABLE destinations ADD CONSTRAINT destinations_tz_check CHECK (tz IS NULL OR app.valid_tz(tz));
CREATE TRIGGER destinations_touch_updated_at BEFORE UPDATE ON destinations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinations FORCE ROW LEVEL SECURITY;

-- guides.colour is the canonical guide palette (docs/product-decisions.md C5): Tokek yellow, Pon
-- orange, Lundi blue, Ajo pink, Sardi green, Paco cream.
CREATE TABLE guides (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  colour text NOT NULL,
  persona_pack_version text,
  voice_id text,
  local_words jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE guides ADD CONSTRAINT guides_colour_check CHECK (colour IN ('yellow', 'orange', 'blue', 'pink', 'green', 'cream'));
CREATE TRIGGER guides_touch_updated_at BEFORE UPDATE ON guides
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE guides FORCE ROW LEVEL SECURITY;

CREATE TABLE trips (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  status text NOT NULL,
  -- Mirrors packages/domain/src/state/trip.ts#deriveTripPhase; a test asserts the two never drift.
  phase text GENERATED ALWAYS AS (
    CASE status
      WHEN 'pre_trip' THEN 'pre'
      WHEN 'in_trip' THEN 'in'
      WHEN 'post_trip' THEN 'post'
      WHEN 'archived' THEN 'post'
      WHEN 'cancelled' THEN 'cancelled'
      ELSE 'planning'
    END
  ) STORED,
  setup_step text NOT NULL DEFAULT 'when',
  destination_id uuid REFERENCES destinations (id),
  guide_id uuid REFERENCES guides (id),
  is_guest_guide boolean NOT NULL DEFAULT false,
  is_solo boolean NOT NULL DEFAULT false,
  start_date date,
  end_date date,
  tz text,
  local_currency text,
  -- Base tier (docs/product-decisions.md §3); phase 12's entitlements materialiser recomputes both
  -- once boost/Pass+ exist.
  seat_cap integer NOT NULL DEFAULT 6,
  plan_progress integer NOT NULL DEFAULT 0,
  redrafts_used integer NOT NULL DEFAULT 0,
  redraft_limit integer NOT NULL DEFAULT 3,
  -- No FK yet: itinerary_versions is created by the next migration (expand migration adds it).
  current_version_id uuid,
  draft_version_id uuid,
  reply_by timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE trips ADD CONSTRAINT trips_status_check CHECK (status IN (
  'voting', 'won', 'setup', 'drafting', 'draft_review', 'redrafting', 'proposed', 'confirmed',
  'pre_trip', 'in_trip', 'post_trip', 'archived', 'cancelled'
));
ALTER TABLE trips ADD CONSTRAINT trips_setup_step_check CHECK (setup_step IN ('when', 'budget', 'rooms', 'must_dos', 'done'));
ALTER TABLE trips ADD CONSTRAINT trips_tz_check CHECK (tz IS NULL OR app.valid_tz(tz));
ALTER TABLE trips ADD CONSTRAINT trips_plan_progress_check CHECK (plan_progress BETWEEN 0 AND 100);
CREATE INDEX trips_crew_id_status_idx ON trips (crew_id, status);
CREATE TRIGGER trips_touch_updated_at BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips FORCE ROW LEVEL SECURITY;

CREATE TABLE trip_participants (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  role text NOT NULL DEFAULT 'member',
  rsvp text NOT NULL DEFAULT 'unopened',
  -- docs/product-decisions.md C26: waitlisted members do not hold a real seat either.
  holds_seat boolean GENERATED ALWAYS AS (rsvp NOT IN ('out', 'waitlisted')) STORED,
  waitlist_position integer,
  chosen_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  landed_at timestamptz,
  countdown_target_at timestamptz,
  egg_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id)
);
COMMENT ON COLUMN trip_participants.egg_id IS 'No FK yet: eggs does not exist until a later phase.';
ALTER TABLE trip_participants ADD CONSTRAINT trip_participants_role_check CHECK (role IN ('organiser', 'member'));
ALTER TABLE trip_participants ADD CONSTRAINT trip_participants_rsvp_check CHECK (rsvp IN ('unopened', 'opened', 'maybe', 'in', 'out', 'waitlisted'));
CREATE INDEX trip_participants_trip_holds_seat_idx ON trip_participants (trip_id) WHERE holds_seat;
CREATE TRIGGER trip_participants_touch_updated_at BEFORE UPDATE ON trip_participants
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE trip_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_participants FORCE ROW LEVEL SECURITY;

-- Trip RLS helpers (docs/data-model.md §2, §3.3). SECURITY DEFINER for the same reason as the
-- crew helpers: the tables they read carry FORCE ROW LEVEL SECURITY, some of it defined in terms
-- of these very functions, so the definer role's BYPASSRLS (app_owner) breaks the recursion.
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

-- Co-organisers: true for any active role='organiser' row (Q-11 default), never just the first one.
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

-- RLS policies and grants (docs/data-model.md §3.3).

-- destinations/guides: Authz "adm" (admin writes; no console yet, so app_system stands in),
-- RLS "R" (read-all authenticated, no app_user write).
CREATE POLICY destinations_select ON destinations FOR SELECT TO app_user USING (true);
CREATE POLICY destinations_system ON destinations FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON destinations TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON destinations TO app_system;

CREATE POLICY guides_select ON guides FOR SELECT TO app_user USING (true);
CREATE POLICY guides_system ON guides FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON guides TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON guides TO app_system;

-- trips: "mem read; org transitions" — any crew member reads the header, only a trip organiser (or
-- app_system, e.g. a poll-close job) may write it; the status guard trigger above is the real
-- backstop on `status` itself. Any crew member may pitch/start a trip for their own crew.
CREATE POLICY trips_select ON trips FOR SELECT TO app_user
  USING (app.is_trip_member(id));
CREATE POLICY trips_insert ON trips FOR INSERT TO app_user
  WITH CHECK (app.is_crew_member(crew_id));
CREATE POLICY trips_update ON trips FOR UPDATE TO app_user
  USING (app.is_trip_organiser(id))
  WITH CHECK (app.is_trip_organiser(id));
CREATE POLICY trips_system ON trips FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON trips TO app_user, app_system;

-- trip_participants: roster visible to every trip member; a participant manages their own RSVP row,
-- an organiser manages any row (same shape as crew_members — role is caller-chosen at self-insert
-- time; business rules on who may claim 'organiser' belong to the app-layer policy module, not RLS).
CREATE POLICY trip_participants_select ON trip_participants FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY trip_participants_insert ON trip_participants FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid());
CREATE POLICY trip_participants_update ON trip_participants FOR UPDATE TO app_user
  USING (user_id = app.uid() OR app.is_trip_organiser(trip_id))
  WITH CHECK (user_id = app.uid() OR app.is_trip_organiser(trip_id));
CREATE POLICY trip_participants_system ON trip_participants FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON trip_participants TO app_user, app_system;
