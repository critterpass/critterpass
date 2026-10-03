-- Recap, passport signatures and anniversary memories (docs/data-model.md §3.10). When a trip
-- ends, `recap.build` writes one recap per trip from code-computed aggregates (stats, route,
-- receipt, the one that got away) and one award per traveller; a late expense, booking, ride,
-- payment or find re-runs it and bumps `version` in place, so award ids, views, votes and
-- signatures survive every re-run. Doc deltas: one recap row per trip (version bumps in place),
-- `recap_awards` title/line/metric/value/evidence/mvp columns, `recap_views` doubles as the viewer
-- list, `recap_mvp_votes`, `stamp_signatures.trip_id/recap_id`, per-member `anniversaries`,
-- `memories`/`memory_reactions` created here, and a unique trip stamp per user.
--
-- Viewers are the travellers who were IN at any point (RSVP in, or a 3f-7 dropout), written by the
-- builder as `recap_views` rows. Every recap table is readable by a viewer who is still an active
-- crew member (`app.is_recap_viewer`); writes go through commands and the worker as app_system,
-- except a traveller's own MVP vote, which app_user may insert for itself once.

-- ---------------------------------------------------------------------------------------------
-- recaps: RLS class T (viewers), C1. `status`: queued → building → ready | failed; a re-run keeps
-- `ready` and swaps the aggregates in one statement. `content_hash` is the hash of the aggregates,
-- so a re-run over unchanged data bumps nothing; `changed_sections` names what the last bump
-- changed (the app's "Updated with late expenses" badge).
CREATE TABLE recaps (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  crew_id uuid NOT NULL REFERENCES crews (id),
  status text NOT NULL DEFAULT 'queued',
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  ended_on date,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(stats) = 'object'),
  route jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(route) = 'object'),
  receipt jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(receipt) = 'object'),
  got_away jsonb CHECK (got_away IS NULL OR jsonb_typeof(got_away) = 'object'),
  cards jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cards) = 'object'),
  content_hash text,
  changed_sections text[] NOT NULL DEFAULT '{}',
  agent_job_id uuid REFERENCES agent_jobs (id),
  failure_reason text CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 200),
  built_at timestamptz,
  ready_at timestamptz,
  mvp_closes_at timestamptz,
  mvp_closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recaps_trip_key UNIQUE (trip_id)
);
ALTER TABLE recaps ADD CONSTRAINT recaps_status_check
  CHECK (status IN ('queued', 'building', 'ready', 'failed'));
ALTER TABLE recaps ADD CONSTRAINT recaps_changed_sections_check
  CHECK (changed_sections <@ ARRAY['stats', 'route', 'receipt', 'got_away', 'awards']::text[]);
CREATE INDEX recaps_crew_id_idx ON recaps (crew_id);
CREATE INDEX recaps_agent_job_id_idx ON recaps (agent_job_id) WHERE agent_job_id IS NOT NULL;
CREATE INDEX recaps_mvp_open_idx ON recaps (mvp_closes_at)
  WHERE mvp_closes_at IS NOT NULL AND mvp_closed_at IS NULL;
CREATE TRIGGER recaps_touch_updated_at BEFORE UPDATE ON recaps
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- recap_views: RLS class O, C2. One row per viewer, written by the builder (opened_at null until
-- the first open), so the table is also the recap's viewer list every policy below reads.
CREATE TABLE recap_views (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  recap_id uuid NOT NULL REFERENCES recaps (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  opened_at timestamptz,
  completed_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recap_views_recap_user_key UNIQUE (recap_id, user_id)
);
CREATE INDEX recap_views_user_trip_idx ON recap_views (user_id, trip_id);
CREATE INDEX recap_views_trip_id_idx ON recap_views (trip_id);
CREATE TRIGGER recap_views_touch_updated_at BEFORE UPDATE ON recap_views
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- A viewer of the trip's recap who is still an active member of its crew.
CREATE OR REPLACE FUNCTION app.is_recap_viewer(trip uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM recap_views v JOIN trips t ON t.id = v.trip_id
     WHERE v.trip_id = trip AND v.user_id = app.uid() AND app.is_crew_member(t.crew_id)
  )
$$;
REVOKE EXECUTE ON FUNCTION app.is_recap_viewer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_recap_viewer(uuid) TO app_user, app_system;

-- A viewer of the trip's recap, whether or not they are still in its crew: a member who left keeps
-- the trip's memories.
CREATE OR REPLACE FUNCTION app.was_recap_viewer(trip uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM recap_views WHERE trip_id = trip AND user_id = app.uid())
$$;
REVOKE EXECUTE ON FUNCTION app.was_recap_viewer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.was_recap_viewer(uuid) TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- recap_awards: RLS class T (viewers), C1. One per traveller, chosen by code from `metric`/`value`
-- (`evidence` holds the supporting numbers); `title` and `line` are the guide's words, null until
-- written. `opted_out` hides the award for everyone. `mvp_votes` is the tally the vote command
-- keeps, so no vote row ever leaves its voter.
CREATE TABLE recap_awards (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  recap_id uuid NOT NULL REFERENCES recaps (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  kind text NOT NULL,
  metric text NOT NULL,
  value integer NOT NULL DEFAULT 0 CHECK (value >= 0),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  title text CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 40),
  line text CHECK (line IS NULL OR char_length(line) BETWEEN 1 AND 140),
  opted_out boolean NOT NULL DEFAULT false,
  mvp_votes integer NOT NULL DEFAULT 0 CHECK (mvp_votes >= 0),
  is_mvp boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recap_awards_recap_user_key UNIQUE (recap_id, user_id)
);
ALTER TABLE recap_awards ADD CONSTRAINT recap_awards_kind_check CHECK (kind IN (
  'treasurer', 'planner', 'early_riser', 'critter_whisperer', 'explorer', 'best_find',
  'navigator', 'human_camera', 'good_company'
));
CREATE INDEX recap_awards_trip_id_idx ON recap_awards (trip_id);
CREATE INDEX recap_awards_user_id_idx ON recap_awards (user_id);
CREATE TRIGGER recap_awards_touch_updated_at BEFORE UPDATE ON recap_awards
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- recap_mvp_votes: RLS class O, C2. One vote per traveller per recap (changeable until the vote
-- closes); only the voter reads it, the crew sees the tallies on recap_awards.
CREATE TABLE recap_mvp_votes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  recap_id uuid NOT NULL REFERENCES recaps (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  voter_id uuid NOT NULL REFERENCES users (id),
  award_id uuid NOT NULL REFERENCES recap_awards (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recap_mvp_votes_recap_voter_key UNIQUE (recap_id, voter_id)
);
CREATE INDEX recap_mvp_votes_voter_trip_idx ON recap_mvp_votes (voter_id, trip_id);
CREATE INDEX recap_mvp_votes_award_id_idx ON recap_mvp_votes (award_id);
CREATE TRIGGER recap_mvp_votes_touch_updated_at BEFORE UPDATE ON recap_mvp_votes
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Trip stamps: one per traveller and trip, so stamping on recap ready is an idempotent upsert.
CREATE UNIQUE INDEX stamps_one_trip_stamp_idx ON stamps (user_id, trip_id) WHERE kind = 'trip';

-- stamp_signatures: RLS class T (viewers), C1. A traveller's signature on each crew member's trip
-- stamp, written when they open the recap; the stroke is a `media_objects` key (purpose
-- signature).
CREATE TABLE stamp_signatures (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  stamp_id uuid NOT NULL REFERENCES stamps (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  recap_id uuid NOT NULL REFERENCES recaps (id) ON DELETE CASCADE,
  signer_id uuid NOT NULL REFERENCES users (id),
  stroke_media_key text CHECK (stroke_media_key IS NULL OR char_length(stroke_media_key) <= 300),
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stamp_signatures_stamp_signer_key UNIQUE (stamp_id, signer_id)
);
CREATE INDEX stamp_signatures_trip_id_idx ON stamp_signatures (trip_id);
CREATE INDEX stamp_signatures_recap_id_idx ON stamp_signatures (recap_id);
CREATE INDEX stamp_signatures_signer_id_idx ON stamp_signatures (signer_id);
CREATE TRIGGER stamp_signatures_touch_updated_at BEFORE UPDATE ON stamp_signatures
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- memories: RLS class T (past viewers), C1. The guide's "a year later" line for a trip (author
-- null) anchored on its recap; `local_date` is the day remembered.
CREATE TABLE memories (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  anchor_kind text NOT NULL,
  anchor_id uuid NOT NULL,
  author_id uuid REFERENCES users (id),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 280),
  local_date date,
  photo_media_key text CHECK (photo_media_key IS NULL OR char_length(photo_media_key) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memories_anchor_key UNIQUE (trip_id, anchor_kind, anchor_id)
);
ALTER TABLE memories ADD CONSTRAINT memories_anchor_kind_check
  CHECK (anchor_kind IN ('anniversary'));
CREATE INDEX memories_author_id_idx ON memories (author_id) WHERE author_id IS NOT NULL;
CREATE TRIGGER memories_touch_updated_at BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- memory_reactions: RLS class T (past viewers), C1. One reaction per traveller per memory: an
-- emoji, a short line (≤ 40 characters) or both.
CREATE TABLE memory_reactions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  memory_id uuid NOT NULL REFERENCES memories (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  emoji text CHECK (emoji IS NULL OR char_length(emoji) BETWEEN 1 AND 16),
  text text CHECK (text IS NULL OR char_length(text) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memory_reactions_memory_user_key UNIQUE (memory_id, user_id),
  CHECK (emoji IS NOT NULL OR text IS NOT NULL)
);
CREATE INDEX memory_reactions_trip_id_idx ON memory_reactions (trip_id);
CREATE INDEX memory_reactions_user_id_idx ON memory_reactions (user_id);
CREATE TRIGGER memory_reactions_touch_updated_at BEFORE UPDATE ON memory_reactions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- anniversaries: RLS class S, C2. One per traveller and trip: `fire_on` is the trip's best day a
-- year on, `fire_at` that date's morning in the traveller's own zone; the daily scan fires each
-- due row once and links the trip's memory.
CREATE TABLE anniversaries (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  recap_id uuid NOT NULL REFERENCES recaps (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id),
  fire_on date NOT NULL,
  tz text NOT NULL,
  fire_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  memory_id uuid REFERENCES memories (id),
  fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anniversaries_trip_user_key UNIQUE (trip_id, user_id)
);
ALTER TABLE anniversaries ADD CONSTRAINT anniversaries_status_check
  CHECK (status IN ('scheduled', 'fired', 'cancelled'));
ALTER TABLE anniversaries ADD CONSTRAINT anniversaries_tz_check CHECK (app.valid_tz(tz));
CREATE INDEX anniversaries_due_idx ON anniversaries (fire_at) WHERE status = 'scheduled';
CREATE INDEX anniversaries_recap_id_idx ON anniversaries (recap_id);
CREATE INDEX anniversaries_user_id_idx ON anniversaries (user_id);
CREATE INDEX anniversaries_memory_id_idx ON anniversaries (memory_id) WHERE memory_id IS NOT NULL;
CREATE TRIGGER anniversaries_touch_updated_at BEFORE UPDATE ON anniversaries
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Row security and grants.
ALTER TABLE recaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE recaps FORCE ROW LEVEL SECURITY;
CREATE POLICY recaps_select ON recaps FOR SELECT TO app_user
  USING (app.is_recap_viewer(trip_id));
CREATE POLICY recaps_system ON recaps FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON recaps TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON recaps TO app_system;

ALTER TABLE recap_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE recap_views FORCE ROW LEVEL SECURITY;
CREATE POLICY recap_views_select ON recap_views FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY recap_views_system ON recap_views FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON recap_views TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON recap_views TO app_system;

ALTER TABLE recap_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE recap_awards FORCE ROW LEVEL SECURITY;
CREATE POLICY recap_awards_select ON recap_awards FOR SELECT TO app_user
  USING (app.is_recap_viewer(trip_id));
CREATE POLICY recap_awards_system ON recap_awards FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON recap_awards TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON recap_awards TO app_system;

ALTER TABLE recap_mvp_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recap_mvp_votes FORCE ROW LEVEL SECURITY;
CREATE POLICY recap_mvp_votes_select ON recap_mvp_votes FOR SELECT TO app_user
  USING (voter_id = app.uid());
CREATE POLICY recap_mvp_votes_insert ON recap_mvp_votes FOR INSERT TO app_user
  WITH CHECK (voter_id = app.uid() AND app.is_recap_viewer(trip_id));
CREATE POLICY recap_mvp_votes_system ON recap_mvp_votes FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON recap_mvp_votes TO app_user;
GRANT INSERT (id, recap_id, trip_id, voter_id, award_id) ON recap_mvp_votes TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON recap_mvp_votes TO app_system;

ALTER TABLE stamp_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamp_signatures FORCE ROW LEVEL SECURITY;
CREATE POLICY stamp_signatures_select ON stamp_signatures FOR SELECT TO app_user
  USING (app.is_recap_viewer(trip_id));
CREATE POLICY stamp_signatures_system ON stamp_signatures FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON stamp_signatures TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON stamp_signatures TO app_system;

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories FORCE ROW LEVEL SECURITY;
CREATE POLICY memories_select ON memories FOR SELECT TO app_user
  USING (app.was_recap_viewer(trip_id));
CREATE POLICY memories_system ON memories FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON memories TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON memories TO app_system;

ALTER TABLE memory_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_reactions FORCE ROW LEVEL SECURITY;
CREATE POLICY memory_reactions_select ON memory_reactions FOR SELECT TO app_user
  USING (app.was_recap_viewer(trip_id));
CREATE POLICY memory_reactions_system ON memory_reactions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON memory_reactions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON memory_reactions TO app_system;

ALTER TABLE anniversaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE anniversaries FORCE ROW LEVEL SECURITY;
CREATE POLICY anniversaries_system ON anniversaries FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON anniversaries TO app_system;

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13): every recap table but `anniversaries`.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'recaps', 'recap_views', 'recap_awards', 'recap_mvp_votes', 'stamp_signatures', 'memories',
    'memory_reactions'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON recaps, recap_views, recap_awards, recap_mvp_votes, stamp_signatures, memories,
  memory_reactions TO powersync_repl;
