-- Community (docs/data-model.md §3.15): crews publish a finished or in-progress plan once every
-- participant agrees, other crews browse and copy it, and travellers rate the places they visited
-- with an optional tip for the next crew.
--
-- Shared content is read over the api with a cache, never synced: every table here is off the
-- powersync publication. A published plan is read only through its materialised `projection`
-- (names, costs and photos already cut to the crew's toggles); the columns that tie it back to the
-- crew (trip, requester, consent list) are never granted to app_user.

-- ---------------------------------------------------------------------------------------------
-- shared_plans: RLS "R when published, T otherwise", C0 for the projection, C2 for the trip link.
CREATE TABLE shared_plans (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  requested_by uuid REFERENCES users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_consent'
    CHECK (status IN ('pending_consent', 'declined', 'preparing', 'published', 'unpublished')),
  toggles jsonb NOT NULL DEFAULT '{"names": false, "costs": true, "photos": true}'::jsonb
    CHECK (jsonb_typeof(toggles) = 'object'),
  consent_required_uids uuid[] NOT NULL DEFAULT '{}',
  days_count smallint NOT NULL DEFAULT 0 CHECK (days_count BETWEEN 0 AND 60),
  travel_month smallint CHECK (travel_month BETWEEN 1 AND 12),
  travel_year smallint CHECK (travel_year BETWEEN 2000 AND 2100),
  crew_size smallint NOT NULL DEFAULT 1 CHECK (crew_size BETWEEN 1 AND 50),
  cost_pp_rounded_minor bigint CHECK (cost_pp_rounded_minor IS NULL OR cost_pp_rounded_minor >= 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  title text CHECK (title IS NULL OR char_length(title) <= 80),
  tags text[] NOT NULL DEFAULT '{}',
  taste jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(taste) = 'object'),
  projection jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(projection) = 'object' AND pg_column_size(projection) <= 262144),
  travelled boolean NOT NULL DEFAULT false,
  rating_avg numeric(3, 2) CHECK (rating_avg IS NULL OR rating_avg BETWEEN 1 AND 5),
  rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  copies_count integer NOT NULL DEFAULT 0 CHECK (copies_count >= 0),
  saves_count integer NOT NULL DEFAULT 0 CHECK (saves_count >= 0),
  unpublish_reason text CHECK (unpublish_reason IS NULL OR char_length(unpublish_reason) <= 500),
  published_at timestamptz,
  unpublished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One live request or publication per trip; a declined or unpublished one can be asked again.
CREATE UNIQUE INDEX shared_plans_one_live_per_trip ON shared_plans (trip_id)
  WHERE status IN ('pending_consent', 'preparing', 'published');
CREATE INDEX shared_plans_browse_idx ON shared_plans (destination_id, published_at DESC, id)
  WHERE status = 'published';
CREATE INDEX shared_plans_requested_by_idx ON shared_plans (requested_by)
  WHERE requested_by IS NOT NULL;
CREATE TRIGGER shared_plans_touch_updated_at BEFORE UPDATE ON shared_plans
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE shared_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY shared_plans_read ON shared_plans FOR SELECT TO app_user
  USING (status = 'published' OR app.is_trip_member(trip_id));
CREATE POLICY shared_plans_system ON shared_plans FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT (id, destination_id, status, toggles, days_count, travel_month, travel_year, crew_size,
              cost_pp_rounded_minor, currency, title, tags, projection, travelled, rating_avg,
              rating_count, copies_count, saves_count, published_at, created_at, updated_at)
  ON shared_plans TO app_user;
GRANT SELECT, INSERT, UPDATE ON shared_plans TO app_system;
REVOKE ALL ON shared_plans FROM guide_reader, powersync_repl;

-- ---------------------------------------------------------------------------------------------
-- shared_plan_consents: RLS O, C2. Each participant's answer to one publish request. Only its
-- owner reads it: the crew sees a count, never who declined.
CREATE TABLE shared_plan_consents (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  shared_plan_id uuid NOT NULL REFERENCES shared_plans (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  decision text NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'approved', 'declined', 'withdrawn')),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shared_plan_consents_plan_user_key UNIQUE (shared_plan_id, user_id),
  CHECK ((decision = 'pending') = (decided_at IS NULL))
);
CREATE INDEX shared_plan_consents_user_idx ON shared_plan_consents (user_id);
CREATE TRIGGER shared_plan_consents_touch_updated_at BEFORE UPDATE ON shared_plan_consents
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE shared_plan_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_plan_consents FORCE ROW LEVEL SECURITY;
CREATE POLICY shared_plan_consents_own ON shared_plan_consents FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY shared_plan_consents_system ON shared_plan_consents FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON shared_plan_consents TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON shared_plan_consents TO app_system;
REVOKE ALL ON shared_plan_consents FROM guide_reader, powersync_repl;

-- ---------------------------------------------------------------------------------------------
-- shared_plan_copies: RLS O, C2. Who copied which plan (or which days of it) into which trip.
CREATE TABLE shared_plan_copies (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  shared_plan_id uuid NOT NULL REFERENCES shared_plans (id),
  copied_by uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  days smallint[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shared_plan_copies_plan_idx ON shared_plan_copies (shared_plan_id);
CREATE INDEX shared_plan_copies_user_idx ON shared_plan_copies (copied_by);
CREATE INDEX shared_plan_copies_trip_idx ON shared_plan_copies (trip_id);
CREATE TRIGGER shared_plan_copies_touch_updated_at BEFORE UPDATE ON shared_plan_copies
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE shared_plan_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_plan_copies FORCE ROW LEVEL SECURITY;
CREATE POLICY shared_plan_copies_own ON shared_plan_copies FOR SELECT TO app_user
  USING (copied_by = app.uid());
CREATE POLICY shared_plan_copies_system ON shared_plan_copies FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON shared_plan_copies TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON shared_plan_copies TO app_system;
REVOKE ALL ON shared_plan_copies FROM guide_reader, powersync_repl;

-- ---------------------------------------------------------------------------------------------
-- ratings: RLS O, C2. A traveller's verdict on a place they visited on a trip, with an optional
-- tip. The tip reaches other crews only as an anonymous place_tips row once moderation passes it.
CREATE TABLE ratings (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  poi_id uuid NOT NULL REFERENCES pois (id),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  verdict text NOT NULL CHECK (verdict IN ('loved', 'fine', 'skip')),
  tip text CHECK (tip IS NULL OR char_length(tip) BETWEEN 1 AND 200),
  tip_status text NOT NULL DEFAULT 'none'
    CHECK (tip_status IN ('none', 'pending', 'approved', 'review', 'rejected')),
  place_tip_id uuid REFERENCES place_tips (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ratings_trip_poi_user_key UNIQUE (trip_id, poi_id, user_id),
  CHECK ((tip IS NULL) = (tip_status = 'none'))
);
CREATE INDEX ratings_user_idx ON ratings (user_id);
CREATE INDEX ratings_poi_idx ON ratings (poi_id);
CREATE INDEX ratings_trip_idx ON ratings (trip_id);
CREATE TRIGGER ratings_touch_updated_at BEFORE UPDATE ON ratings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings FORCE ROW LEVEL SECURITY;
CREATE POLICY ratings_own ON ratings FOR SELECT TO app_user USING (user_id = app.uid());
CREATE POLICY ratings_system ON ratings FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON ratings TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ratings TO app_system;
REVOKE ALL ON ratings FROM guide_reader, powersync_repl;

-- ---------------------------------------------------------------------------------------------
-- place_rating_stats: RLS R, C0. Nightly loved/fine/skip counts per place (social proof).
CREATE TABLE place_rating_stats (
  poi_id uuid PRIMARY KEY REFERENCES pois (id) ON DELETE CASCADE,
  loved integer NOT NULL DEFAULT 0 CHECK (loved >= 0),
  fine integer NOT NULL DEFAULT 0 CHECK (fine >= 0),
  skip integer NOT NULL DEFAULT 0 CHECK (skip >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE place_rating_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_rating_stats FORCE ROW LEVEL SECURITY;
CREATE POLICY place_rating_stats_read ON place_rating_stats FOR SELECT TO app_user USING (true);
CREATE POLICY place_rating_stats_system ON place_rating_stats FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON place_rating_stats TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON place_rating_stats TO app_system;
REVOKE ALL ON place_rating_stats FROM powersync_repl;

-- ---------------------------------------------------------------------------------------------
-- plan_links: RLS T, C2. Unlisted read-only links to a trip's plan. Only the hash of the token is
-- kept; the token itself is shown once, to the member who made the link.
CREATE TABLE plan_links (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  shared_plan_id uuid REFERENCES shared_plans (id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_links_trip_idx ON plan_links (trip_id);
CREATE INDEX plan_links_shared_plan_idx ON plan_links (shared_plan_id)
  WHERE shared_plan_id IS NOT NULL;
CREATE INDEX plan_links_created_by_idx ON plan_links (created_by) WHERE created_by IS NOT NULL;
CREATE TRIGGER plan_links_touch_updated_at BEFORE UPDATE ON plan_links
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE plan_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_links FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_links_select ON plan_links FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY plan_links_system ON plan_links FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT (id, trip_id, shared_plan_id, created_by, revoked_at, created_at, updated_at)
  ON plan_links TO app_user;
GRANT SELECT, INSERT, UPDATE ON plan_links TO app_system;
REVOKE ALL ON plan_links FROM guide_reader, powersync_repl;

-- ---------------------------------------------------------------------------------------------
-- place_tips gains where a tip came from: the guide's curation or a crew's moderated rating.
ALTER TABLE place_tips ADD COLUMN source text NOT NULL DEFAULT 'guide'
  CHECK (source IN ('guide', 'community'));
GRANT SELECT (source) ON place_tips TO app_user;

-- ---------------------------------------------------------------------------------------------
-- Every seat holder agreed to a plan going public, so when one of them leaves the crew or their
-- account is purged the plan comes down (and its links stop): their name, photos and tips can
-- never stay public without them. The crew's chat says the plan was unpublished, naming nobody.
CREATE FUNCTION app.unpublish_shared_plans_of(p_user uuid, p_crew uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  plan record;
BEGIN
  FOR plan IN
    UPDATE shared_plans s
       SET status = 'unpublished', projection = '{}'::jsonb, unpublished_at = now(),
           unpublish_reason = 'participant_left'
      FROM trips t
     WHERE t.id = s.trip_id AND (p_crew IS NULL OR t.crew_id = p_crew)
       AND s.status IN ('pending_consent', 'preparing', 'published')
       AND p_user = ANY (s.consent_required_uids)
    RETURNING s.id, t.crew_id
  LOOP
    UPDATE plan_links SET revoked_at = now() WHERE shared_plan_id = plan.id AND revoked_at IS NULL;
    PERFORM app.post_crew_system_message(plan.crew_id, 'plan_unpublished', plan.id, NULL);
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.unpublish_shared_plans_of(uuid, uuid) FROM PUBLIC;

CREATE FUNCTION app.crew_members_unpublish_plans() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status <> 'active' THEN
    PERFORM app.unpublish_shared_plans_of(NEW.user_id, NEW.crew_id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.crew_members_unpublish_plans() FROM PUBLIC;
CREATE TRIGGER crew_members_unpublish_plans AFTER UPDATE OF status ON crew_members
  FOR EACH ROW EXECUTE FUNCTION app.crew_members_unpublish_plans();

CREATE FUNCTION app.users_unpublish_plans() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = 'purged' AND OLD.status IS DISTINCT FROM 'purged' THEN
    PERFORM app.unpublish_shared_plans_of(NEW.id, NULL);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.users_unpublish_plans() FROM PUBLIC;
CREATE TRIGGER users_unpublish_plans AFTER UPDATE OF status ON users
  FOR EACH ROW EXECUTE FUNCTION app.users_unpublish_plans();

-- ---------------------------------------------------------------------------------------------
-- The community events join the closed list of domain event types.
CREATE OR REPLACE FUNCTION pg_temp.widen_in_check(tbl regclass, con text, col text, extra text[])
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
SELECT pg_temp.widen_in_check('domain_events', 'domain_events_type_check', 'type', ARRAY[
  'shared_plan.requested', 'shared_plan.consent_given', 'shared_plan.declined',
  'shared_plan.published', 'shared_plan.updated', 'shared_plan.unpublished', 'shared_plan.saved',
  'shared_plan.unsaved', 'shared_plan.copied', 'shared_plan.suggested', 'plan_link.created',
  'plan_link.revoked', 'place.rated']);
