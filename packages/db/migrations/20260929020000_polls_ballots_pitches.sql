-- The one Poll + Ballot engine and the destination vote (docs/data-model.md §3.3,
-- docs/data-model-sync-and-privacy.md §3.2): guide pitches, polls with their options and ballots,
-- the once-per-person winner reveal, the poll state guard, one destinations row per searchable
-- place (the 61-place index's cities beside the six guide destinations) and the new events.
--
-- Every write goes through a command handler as app_system after its own checks, except a ballot:
-- a voter casts and changes their own ballot as app_user, and `app.can_vote` is the backstop that
-- keeps an ineligible or late ballot out even if a handler forgot to check.

-- ---------------------------------------------------------------------------------------------
-- destinations: every city of the place index becomes a destination a crew can pitch, save and
-- travel to. `critter_set_id` ties a destination to its place (country-level set) for the locals,
-- the month hints and the guest guide.
ALTER TABLE destinations ADD COLUMN critter_set_id uuid REFERENCES critter_sets (id);
CREATE INDEX destinations_critter_set_id_idx ON destinations (critter_set_id)
  WHERE critter_set_id IS NOT NULL;
GRANT SELECT (critter_set_id) ON destinations TO admin_reader;
CREATE INDEX destinations_name_trgm_idx ON destinations
  USING gin (app.unaccent_immutable(lower(name)) gin_trgm_ops);

-- Upserts one destination per (place, city) of the released index. A guide destination already
-- inside a place (Kyoto in Japan) is linked to its place instead of getting a second row.
CREATE OR REPLACE FUNCTION app.sync_place_destinations() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
BEGIN
  UPDATE destinations d SET critter_set_id = s.id
    FROM critter_sets s
   WHERE s.destination_id = d.id AND d.critter_set_id IS DISTINCT FROM s.id;

  INSERT INTO destinations (slug, name, country, coverage, currency, tz, critter_set_id)
  SELECT DISTINCT ON (slug) slug, city, place, coverage, currency, tz, set_id
    FROM (
      SELECT s.code || '-' || trim(BOTH '-' FROM regexp_replace(
               app.unaccent_immutable(lower(c.city)), '[^a-z0-9]+', '-', 'g')) AS slug,
             c.city, s.name AS place, s.coverage, s.currency, s.tz, s.id AS set_id
        FROM critters c
        JOIN critter_sets s ON s.id = c.set_id
        LEFT JOIN destinations linked ON linked.id = s.destination_id
       WHERE linked.id IS NULL
          OR app.unaccent_immutable(lower(linked.name)) <> app.unaccent_immutable(lower(c.city))
    ) cities
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name, country = EXCLUDED.country, coverage = EXCLUDED.coverage,
        currency = EXCLUDED.currency, tz = EXCLUDED.tz, critter_set_id = EXCLUDED.critter_set_id
  WHERE (destinations.name, destinations.country, destinations.coverage, destinations.currency,
         destinations.tz, destinations.critter_set_id)
    IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.country, EXCLUDED.coverage, EXCLUDED.currency,
         EXCLUDED.tz, EXCLUDED.critter_set_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION app.sync_place_destinations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.sync_place_destinations() TO app_system;

CREATE OR REPLACE FUNCTION app.sync_place_destinations_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
BEGIN
  PERFORM app.sync_place_destinations();
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.sync_place_destinations_trigger() FROM PUBLIC;

CREATE TRIGGER critters_sync_destinations AFTER INSERT OR UPDATE ON critters
  FOR EACH STATEMENT EXECUTE FUNCTION app.sync_place_destinations_trigger();
CREATE TRIGGER critter_sets_sync_destinations AFTER INSERT OR UPDATE ON critter_sets
  FOR EACH STATEMENT EXECUTE FUNCTION app.sync_place_destinations_trigger();

SELECT app.sync_place_destinations();

-- ---------------------------------------------------------------------------------------------
-- saved_items: a "request this city" from an empty search is kept as the requester's own row
-- until the feedback inbox exists.
ALTER TABLE saved_items DROP CONSTRAINT saved_items_kind_check;
ALTER TABLE saved_items ADD CONSTRAINT saved_items_kind_check
  CHECK (kind IN ('place', 'plan', 'day', 'request'));
ALTER TABLE saved_items ADD COLUMN note text CHECK (char_length(note) <= 80);
GRANT INSERT (note) ON saved_items TO app_user;

-- ---------------------------------------------------------------------------------------------
-- pitches: RLS class M. A guide pitch of one place for one crew (cached per place and month
-- until the fares it quotes change); the same row becomes the place's candidate on the board.
CREATE TABLE pitches (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  trip_id uuid REFERENCES trips (id),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  pitched_by uuid REFERENCES users (id) ON DELETE SET NULL,
  month smallint CHECK (month BETWEEN 1 AND 12),
  sections jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sections) = 'object'),
  quote_ids uuid[] NOT NULL DEFAULT '{}',
  model text CHECK (char_length(model) <= 80),
  prompt_version text CHECK (char_length(prompt_version) <= 40),
  cache_key text NOT NULL CHECK (char_length(cache_key) <= 200),
  fare_snapshot_id text CHECK (char_length(fare_snapshot_id) <= 200),
  status text NOT NULL DEFAULT 'pitched'
    CHECK (status IN ('pitched', 'on_board', 'queued', 'final', 'won', 'back_in_deck')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pitches_trip_id_idx ON pitches (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX pitches_crew_status_idx ON pitches (crew_id, status);
CREATE INDEX pitches_crew_cache_idx ON pitches (crew_id, cache_key, created_at DESC);
CREATE INDEX pitches_destination_id_idx ON pitches (destination_id);
CREATE INDEX pitches_pitched_by_idx ON pitches (pitched_by) WHERE pitched_by IS NOT NULL;
CREATE TRIGGER pitches_touch_updated_at BEFORE UPDATE ON pitches
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE pitches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitches FORCE ROW LEVEL SECURITY;
CREATE POLICY pitches_select ON pitches FOR SELECT TO app_user
  USING (app.is_crew_member(crew_id));
CREATE POLICY pitches_system ON pitches FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON pitches TO app_user;
GRANT SELECT, INSERT, UPDATE ON pitches TO app_system;

-- ---------------------------------------------------------------------------------------------
-- polls: RLS class M (crew polls) / T (trip polls). `eligible_voter_ids` is the snapshot taken at
-- creation; `stage` is set for destination polls only.
CREATE TABLE polls (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  trip_id uuid REFERENCES trips (id),
  kind text NOT NULL CHECK (kind IN
    ('destination', 'generic', 'day_option', 'changeset_approval', 'decision', 'mvp')),
  stage text CHECK (stage IN ('board', 'final')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  question text CHECK (char_length(question) BETWEEN 1 AND 140),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  eligible_voter_ids uuid[] NOT NULL DEFAULT '{}',
  decider_policy text
    CHECK (decider_policy IN ('organiser', 'any_affected', 'majority_of_affected', 'threshold_n')),
  threshold integer CHECK (threshold >= 1),
  closes_at timestamptz,
  allow_change boolean NOT NULL DEFAULT true,
  tie_rule text NOT NULL DEFAULT 'earliest_to_count'
    CHECK (tie_rule IN ('cheaper_for_majority_origin', 'organiser_pick', 'earliest_to_count')),
  winner_option_id uuid,
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  close_reason text CHECK (close_reason IN ('all_voted', 'deadline', 'manual', 'decider')),
  closed_at timestamptz,
  stage_changed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT polls_stage_kind CHECK ((kind = 'destination') = (stage IS NOT NULL)),
  CONSTRAINT polls_threshold_policy CHECK ((decider_policy = 'threshold_n') = (threshold IS NOT NULL)),
  CONSTRAINT polls_closed_shape CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);
CREATE INDEX polls_trip_status_idx ON polls (trip_id, status) WHERE trip_id IS NOT NULL;
CREATE INDEX polls_crew_status_idx ON polls (crew_id, status);
CREATE INDEX polls_open_closes_at_idx ON polls (closes_at) WHERE status = 'open';
CREATE INDEX polls_created_by_idx ON polls (created_by) WHERE created_by IS NOT NULL;
-- A crew has at most one open destination poll: every pitch lands on the same board.
CREATE UNIQUE INDEX polls_one_open_destination_key ON polls (crew_id)
  WHERE kind = 'destination' AND status = 'open';
CREATE TRIGGER polls_touch_updated_at BEFORE UPDATE ON polls
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls FORCE ROW LEVEL SECURITY;

-- Poll state guard (docs/data-model-sync-and-privacy.md §3.2), hand-copied from
-- packages/domain/src/polls/state.ts: born open; open → closed | cancelled; stages move only
-- while a destination poll is open.
CREATE OR REPLACE FUNCTION app.polls_state_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' THEN
      RAISE EXCEPTION 'illegal initial poll status: %', NEW.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> NEW.status AND NOT (OLD.status = 'open' AND NEW.status IN ('closed', 'cancelled')) THEN
    RAISE EXCEPTION 'illegal poll status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.stage IS DISTINCT FROM NEW.stage AND NOT (
    OLD.status = 'open' AND NEW.status = 'open'
    AND ((OLD.stage, NEW.stage) IN (VALUES ('board', 'final'), ('final', 'board')))
  ) THEN
    RAISE EXCEPTION 'illegal poll stage change: % -> %', OLD.stage, NEW.stage
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'open' AND (OLD.winner_option_id IS DISTINCT FROM NEW.winner_option_id) THEN
    RAISE EXCEPTION 'a closed poll keeps its winner' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.polls_state_guard() FROM PUBLIC;
CREATE TRIGGER polls_state_guard BEFORE INSERT OR UPDATE ON polls
  FOR EACH ROW EXECUTE FUNCTION app.polls_state_guard();

-- Read access to a poll row: crew polls follow the crew, trip polls the trip.
CREATE OR REPLACE FUNCTION app.can_read_poll_scope(crew uuid, trip uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT CASE WHEN trip IS NULL THEN app.is_crew_member(crew) ELSE app.is_trip_member(trip) END
$$;

-- The ballot backstop: the caller may vote on `poll` only while it is open and before its
-- deadline (a board's `closes_at` is when it advances, not a deadline), the caller is in its
-- eligible snapshot and can still read it (an ex-member cannot).
CREATE OR REPLACE FUNCTION app.can_vote(poll uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM polls p
     WHERE p.id = poll AND p.status = 'open'
       AND (p.stage = 'board' OR p.closes_at IS NULL OR p.closes_at > now())
       AND app.uid() = ANY (p.eligible_voter_ids)
       AND app.can_read_poll_scope(p.crew_id, p.trip_id)
  )
$$;

-- A voter may change their mind only on a poll that allows it.
CREATE OR REPLACE FUNCTION app.can_change_ballot(poll uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT app.can_vote(poll) AND EXISTS (SELECT 1 FROM polls WHERE id = poll AND allow_change)
$$;

REVOKE EXECUTE ON FUNCTION app.can_read_poll_scope(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.can_vote(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.can_change_ballot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_read_poll_scope(uuid, uuid) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.can_vote(uuid) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.can_change_ballot(uuid) TO app_user, app_system;

CREATE POLICY polls_select ON polls FOR SELECT TO app_user
  USING (app.can_read_poll_scope(crew_id, trip_id));
CREATE POLICY polls_system ON polls FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON polls TO app_user;
GRANT SELECT, INSERT, UPDATE ON polls TO app_system;

-- ---------------------------------------------------------------------------------------------
-- poll_options: children of their poll (cascade). `crew_id`/`trip_id` are copied from the poll by
-- trigger so policies and streams filter without a join.
CREATE TABLE poll_options (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  poll_id uuid NOT NULL REFERENCES polls (id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES crews (id),
  trip_id uuid REFERENCES trips (id),
  kind text NOT NULL CHECK (kind IN ('destination', 'poi', 'changeset', 'text', 'date_window')),
  ref_id uuid,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  frozen_quote_id uuid REFERENCES price_quotes (id),
  pitch_id uuid REFERENCES pitches (id),
  proposed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  position smallint NOT NULL CHECK (position >= 0),
  eliminated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poll_options_id_poll_key UNIQUE (id, poll_id)
);
CREATE UNIQUE INDEX poll_options_poll_ref_key ON poll_options (poll_id, ref_id) WHERE ref_id IS NOT NULL;
CREATE INDEX poll_options_poll_id_idx ON poll_options (poll_id, position);
CREATE INDEX poll_options_crew_id_idx ON poll_options (crew_id);
CREATE INDEX poll_options_trip_id_idx ON poll_options (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX poll_options_frozen_quote_id_idx ON poll_options (frozen_quote_id)
  WHERE frozen_quote_id IS NOT NULL;
CREATE INDEX poll_options_pitch_id_idx ON poll_options (pitch_id) WHERE pitch_id IS NOT NULL;
CREATE INDEX poll_options_proposed_by_idx ON poll_options (proposed_by) WHERE proposed_by IS NOT NULL;
CREATE TRIGGER poll_options_touch_updated_at BEFORE UPDATE ON poll_options
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE polls ADD CONSTRAINT polls_winner_option_fk
  FOREIGN KEY (winner_option_id, id) REFERENCES poll_options (id, poll_id);

-- Copies the poll's crew and trip onto a child row, whatever the writer supplied.
CREATE OR REPLACE FUNCTION app.poll_child_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  SELECT crew_id, trip_id INTO NEW.crew_id, NEW.trip_id FROM polls WHERE id = NEW.poll_id;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.poll_child_scope() FROM PUBLIC;
CREATE TRIGGER poll_options_scope BEFORE INSERT OR UPDATE OF poll_id ON poll_options
  FOR EACH ROW EXECUTE FUNCTION app.poll_child_scope();

ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_options FORCE ROW LEVEL SECURITY;
CREATE POLICY poll_options_select ON poll_options FOR SELECT TO app_user
  USING (app.can_read_poll_scope(crew_id, trip_id));
CREATE POLICY poll_options_system ON poll_options FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON poll_options TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON poll_options TO app_system;

-- ---------------------------------------------------------------------------------------------
-- ballots: one per (poll, voter). The voter writes their own, only while `app.can_vote` holds;
-- the option must belong to the same poll (composite foreign key).
CREATE TABLE ballots (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  poll_id uuid NOT NULL REFERENCES polls (id) ON DELETE CASCADE,
  option_id uuid NOT NULL,
  crew_id uuid NOT NULL REFERENCES crews (id),
  trip_id uuid REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'widget', 'notification', 'la')),
  op_id uuid NOT NULL,
  cast_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ballots_poll_user_key UNIQUE (poll_id, user_id),
  CONSTRAINT ballots_option_fk FOREIGN KEY (option_id, poll_id)
    REFERENCES poll_options (id, poll_id) ON DELETE CASCADE
);
CREATE INDEX ballots_option_id_idx ON ballots (option_id);
CREATE INDEX ballots_crew_id_idx ON ballots (crew_id);
CREATE INDEX ballots_trip_id_idx ON ballots (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX ballots_user_id_idx ON ballots (user_id);
CREATE TRIGGER ballots_touch_updated_at BEFORE UPDATE ON ballots
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER ballots_scope BEFORE INSERT OR UPDATE OF poll_id ON ballots
  FOR EACH ROW EXECUTE FUNCTION app.poll_child_scope();
ALTER TABLE ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ballots FORCE ROW LEVEL SECURITY;
CREATE POLICY ballots_select ON ballots FOR SELECT TO app_user
  USING (app.can_read_poll_scope(crew_id, trip_id));
CREATE POLICY ballots_insert ON ballots FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.can_vote(poll_id));
CREATE POLICY ballots_update ON ballots FOR UPDATE TO app_user
  USING (user_id = app.uid())
  WITH CHECK (user_id = app.uid() AND app.can_change_ballot(poll_id));
CREATE POLICY ballots_system ON ballots FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT (id, poll_id, option_id, crew_id, trip_id, user_id, source, op_id, cast_at)
  ON ballots TO app_user;
GRANT UPDATE (option_id, source, op_id, cast_at) ON ballots TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ballots TO app_system;

-- ---------------------------------------------------------------------------------------------
-- poll_reveals: RLS class O. Filed for every eligible voter when a poll closes; the voter marks
-- it seen once, on whichever device showed the reveal first.
CREATE TABLE poll_reveals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  poll_id uuid NOT NULL REFERENCES polls (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poll_reveals_poll_user_key UNIQUE (poll_id, user_id)
);
CREATE INDEX poll_reveals_user_id_idx ON poll_reveals (user_id);
CREATE TRIGGER poll_reveals_touch_updated_at BEFORE UPDATE ON poll_reveals
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE poll_reveals ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_reveals FORCE ROW LEVEL SECURITY;
CREATE POLICY poll_reveals_self ON poll_reveals FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY poll_reveals_system ON poll_reveals FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT (id, poll_id, user_id, seen_at) ON poll_reveals TO app_user;
GRANT UPDATE (seen_at) ON poll_reveals TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON poll_reveals TO app_system;

-- change_sets.poll_id now has its table.
ALTER TABLE change_sets ADD CONSTRAINT change_sets_poll_id_fk FOREIGN KEY (poll_id) REFERENCES polls (id);
CREATE INDEX change_sets_poll_id_idx ON change_sets (poll_id) WHERE poll_id IS NOT NULL;
COMMENT ON COLUMN change_sets.poll_id IS NULL;

-- ---------------------------------------------------------------------------------------------
-- domain_events: poll, ballot, pitch and saved-place events join the catalogue
-- (packages/domain/src/polls/events.ts).
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
  'poll.created', 'poll.candidate_added', 'poll.candidate_removed', 'poll.stage_changed',
  'poll.closed', 'poll.cancelled', 'poll.reveal_seen', 'poll.lead_changed', 'poll.closing_soon',
  'ballot.cast', 'ballot.changed', 'ballot.retracted',
  'pitch.created', 'pitch.queued',
  'place.saved', 'place.unsaved'
));

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY['pitches', 'polls', 'poll_options', 'ballots', 'poll_reveals'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON pitches, polls, poll_options, ballots, poll_reveals TO powersync_repl;
