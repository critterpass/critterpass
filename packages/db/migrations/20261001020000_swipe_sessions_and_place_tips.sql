-- Explore (docs/data-model.md §3.1, §3.3, §3.13): group swiping (sessions, votes, the yes-only
-- mirror the crew syncs, server-arbitrated matches), guide tips on places, the crew's Q&A snippet
-- per place, and a traveller's named saved lists.
--
-- A swipe "no" is its voter's alone: swipe_votes is owner-read, never published and never granted
-- to replication or the guide; the crew sees yes votes only, through swipe_yes_votes, which a
-- trigger keeps in step with every vote, change and undo.

-- ---------------------------------------------------------------------------------------------
-- swipe_sessions: RLS class T. One open session per trip; the deck (ranked cards with the guide's
-- notes, ids and signals only) is written by the deck job. Commands write as the server.
CREATE TABLE swipe_sessions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  started_by uuid NOT NULL REFERENCES users (id),
  status text NOT NULL DEFAULT 'building' CHECK (status IN ('building', 'live', 'ended')),
  deck jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(deck) = 'array' AND pg_column_size(deck) <= 65536),
  -- Yes votes a card needs: min(2, participants) when the session started.
  match_rule smallint NOT NULL CHECK (match_rule BETWEEN 1 AND 2),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'ended') = (ended_at IS NOT NULL))
);
CREATE UNIQUE INDEX swipe_sessions_one_open_per_trip ON swipe_sessions (trip_id)
  WHERE status <> 'ended';
CREATE INDEX swipe_sessions_trip_idx ON swipe_sessions (trip_id, created_at DESC);
CREATE INDEX swipe_sessions_started_by_idx ON swipe_sessions (started_by);
CREATE INDEX swipe_sessions_destination_idx ON swipe_sessions (destination_id);
CREATE TRIGGER swipe_sessions_touch_updated_at BEFORE UPDATE ON swipe_sessions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE swipe_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE swipe_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY swipe_sessions_select ON swipe_sessions FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY swipe_sessions_system ON swipe_sessions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON swipe_sessions TO app_user;
GRANT SELECT, INSERT, UPDATE ON swipe_sessions TO app_system;

-- ---------------------------------------------------------------------------------------------
-- swipe_votes: RLS class O (read), written by the swipe_vote/undo_swipe commands as the server.
-- The one table holding a "no": owner-read only, unpublished, closed to replication and the guide.
CREATE TABLE swipe_votes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  session_id uuid NOT NULL REFERENCES swipe_sessions (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  poi_id uuid NOT NULL REFERENCES pois (id),
  verdict text NOT NULL CHECK (verdict IN ('yes', 'no', 'super')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT swipe_votes_session_user_poi_key UNIQUE (session_id, user_id, poi_id)
);
CREATE INDEX swipe_votes_user_idx ON swipe_votes (user_id);
CREATE INDEX swipe_votes_trip_idx ON swipe_votes (trip_id);
CREATE INDEX swipe_votes_poi_idx ON swipe_votes (poi_id);
CREATE TRIGGER swipe_votes_touch_updated_at BEFORE UPDATE ON swipe_votes
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE swipe_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE swipe_votes FORCE ROW LEVEL SECURITY;
CREATE POLICY swipe_votes_own ON swipe_votes FOR SELECT TO app_user USING (user_id = app.uid());
CREATE POLICY swipe_votes_system ON swipe_votes FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON swipe_votes TO app_user;
-- DELETE: undo, and the account merge.
GRANT SELECT, INSERT, UPDATE, DELETE ON swipe_votes TO app_system;
REVOKE ALL ON swipe_votes FROM guide_reader, powersync_repl;

-- ---------------------------------------------------------------------------------------------
-- swipe_yes_votes: RLS class T. The crew-visible face of swipe_votes: a row per yes (or super) vote,
-- gone the moment the vote flips to no or is undone. Only the trigger below writes it.
CREATE TABLE swipe_yes_votes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  session_id uuid NOT NULL REFERENCES swipe_sessions (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  poi_id uuid NOT NULL REFERENCES pois (id),
  super boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT swipe_yes_votes_session_user_poi_key UNIQUE (session_id, user_id, poi_id)
);
CREATE INDEX swipe_yes_votes_trip_idx ON swipe_yes_votes (trip_id);
CREATE INDEX swipe_yes_votes_user_idx ON swipe_yes_votes (user_id);
CREATE INDEX swipe_yes_votes_poi_idx ON swipe_yes_votes (poi_id);
CREATE TRIGGER swipe_yes_votes_touch_updated_at BEFORE UPDATE ON swipe_yes_votes
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE swipe_yes_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE swipe_yes_votes FORCE ROW LEVEL SECURITY;
CREATE POLICY swipe_yes_votes_select ON swipe_yes_votes FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY swipe_yes_votes_system ON swipe_yes_votes FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON swipe_yes_votes TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON swipe_yes_votes TO app_system;

CREATE FUNCTION app.mirror_swipe_yes_vote() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM swipe_yes_votes
     WHERE session_id = OLD.session_id AND user_id = OLD.user_id AND poi_id = OLD.poi_id;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    DELETE FROM swipe_yes_votes
     WHERE session_id = OLD.session_id AND user_id = OLD.user_id AND poi_id = OLD.poi_id;
  END IF;
  IF NEW.verdict = 'no' THEN
    RETURN NEW;
  END IF;
  INSERT INTO swipe_yes_votes (session_id, trip_id, user_id, poi_id, super)
  VALUES (NEW.session_id, NEW.trip_id, NEW.user_id, NEW.poi_id, NEW.verdict = 'super')
  ON CONFLICT (session_id, user_id, poi_id) DO UPDATE SET super = EXCLUDED.super;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.mirror_swipe_yes_vote() FROM PUBLIC;
CREATE TRIGGER swipe_votes_mirror_yes AFTER INSERT OR UPDATE OR DELETE ON swipe_votes
  FOR EACH ROW EXECUTE FUNCTION app.mirror_swipe_yes_vote();

-- ---------------------------------------------------------------------------------------------
-- swipe_matches: RLS class T. Exactly one per (session, card), inserted in the vote transaction
-- that reached the rule; the ChangeSet suggestion it became is linked once created.
CREATE TABLE swipe_matches (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  session_id uuid NOT NULL REFERENCES swipe_sessions (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  poi_id uuid NOT NULL REFERENCES pois (id),
  user_ids uuid[] NOT NULL CHECK (cardinality(user_ids) BETWEEN 1 AND 50),
  change_set_id uuid REFERENCES change_sets (id),
  day_no smallint CHECK (day_no BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT swipe_matches_session_poi_key UNIQUE (session_id, poi_id)
);
CREATE INDEX swipe_matches_trip_idx ON swipe_matches (trip_id);
CREATE INDEX swipe_matches_poi_idx ON swipe_matches (poi_id);
CREATE INDEX swipe_matches_change_set_idx ON swipe_matches (change_set_id)
  WHERE change_set_id IS NOT NULL;
CREATE TRIGGER swipe_matches_touch_updated_at BEFORE UPDATE ON swipe_matches
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE swipe_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE swipe_matches FORCE ROW LEVEL SECURITY;
CREATE POLICY swipe_matches_select ON swipe_matches FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY swipe_matches_system ON swipe_matches FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON swipe_matches TO app_user;
GRANT SELECT, INSERT, UPDATE ON swipe_matches TO app_system;

-- ---------------------------------------------------------------------------------------------
-- place_tips: RLS class R, C0. Approved tips are open to every signed-in reader; the author is
-- kept for moderation only, withheld from app_user by the column grant and from sync by the
-- stream's column list, and nulled when the author's account goes. destination_id is copied from
-- the place so the explore stream filters on its own parameter without a subquery.
CREATE TABLE place_tips (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  poi_id uuid NOT NULL REFERENCES pois (id),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  author_id uuid REFERENCES users (id) ON DELETE SET NULL,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
  lang text NOT NULL DEFAULT 'en' CHECK (lang ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  moderation_status text NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX place_tips_poi_idx ON place_tips (poi_id);
CREATE INDEX place_tips_destination_idx ON place_tips (destination_id)
  WHERE moderation_status = 'approved';
CREATE INDEX place_tips_author_idx ON place_tips (author_id) WHERE author_id IS NOT NULL;
CREATE TRIGGER place_tips_touch_updated_at BEFORE UPDATE ON place_tips
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE FUNCTION app.place_tips_copy_destination() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  SELECT destination_id INTO NEW.destination_id FROM pois WHERE id = NEW.poi_id;
  IF NEW.destination_id IS NULL THEN
    RAISE EXCEPTION 'place % has no destination', NEW.poi_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.place_tips_copy_destination() FROM PUBLIC;
CREATE TRIGGER place_tips_copy_destination BEFORE INSERT OR UPDATE OF poi_id ON place_tips
  FOR EACH ROW EXECUTE FUNCTION app.place_tips_copy_destination();

ALTER TABLE place_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_tips FORCE ROW LEVEL SECURITY;
CREATE POLICY place_tips_read ON place_tips FOR SELECT TO app_user
  USING (moderation_status = 'approved');
CREATE POLICY place_tips_system ON place_tips FOR ALL TO app_system USING (true) WITH CHECK (true);
CREATE POLICY place_tips_admin_reader ON place_tips FOR SELECT TO admin_reader USING (true);
GRANT SELECT (id, poi_id, destination_id, text, lang, moderation_status, created_at, updated_at)
  ON place_tips TO app_user;
GRANT SELECT, INSERT, UPDATE ON place_tips TO app_system;
GRANT SELECT ON place_tips TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- place_qna_summaries: RLS class T, C1, served by the place context route (never synced). One
-- line per (trip, place), summarised from that trip's own crew chat only; a crew never reads
-- another crew's line about the same place.
CREATE TABLE place_qna_summaries (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  poi_id uuid NOT NULL REFERENCES pois (id),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 280),
  source_message_id uuid NOT NULL,
  source_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT place_qna_summaries_trip_poi_key UNIQUE (trip_id, poi_id)
);
CREATE INDEX place_qna_summaries_poi_idx ON place_qna_summaries (poi_id);
CREATE TRIGGER place_qna_summaries_touch_updated_at BEFORE UPDATE ON place_qna_summaries
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE place_qna_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_qna_summaries FORCE ROW LEVEL SECURITY;
CREATE POLICY place_qna_summaries_select ON place_qna_summaries FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY place_qna_summaries_system ON place_qna_summaries FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON place_qna_summaries TO app_user;
GRANT SELECT, INSERT, UPDATE ON place_qna_summaries TO app_system;
REVOKE ALL ON place_qna_summaries FROM guide_reader, powersync_repl;

-- ---------------------------------------------------------------------------------------------
-- saved_lists: RLS class O, C2. A traveller's named lists (the default "Saved" needs no row);
-- saved_items.list_name names the list an item sits in. Deleting goes through its command.
CREATE TABLE saved_lists (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  position integer NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_lists_user_name_key UNIQUE (user_id, name)
);
CREATE TRIGGER saved_lists_touch_updated_at BEFORE UPDATE ON saved_lists
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE saved_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_lists FORCE ROW LEVEL SECURITY;
CREATE POLICY saved_lists_self ON saved_lists FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY saved_lists_system ON saved_lists FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT (id, user_id, name, position) ON saved_lists TO app_user;
GRANT UPDATE (name, position) ON saved_lists TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON saved_lists TO app_system;

-- A place page saves a POI as kind 'poi'; a destination stays kind 'place'.
ALTER TABLE saved_items DROP CONSTRAINT saved_items_kind_check;
ALTER TABLE saved_items ADD CONSTRAINT saved_items_kind_check
  CHECK (kind IN ('place', 'poi', 'plan', 'day', 'request'));

-- ---------------------------------------------------------------------------------------------
-- The swipe events join the catalogue (packages/domain/src/explore/events.ts), added to whatever
-- the constraint lists now.
DO $$
DECLARE
  current_values text[];
  merged text;
BEGIN
  SELECT array_agg(m[1] ORDER BY m[1]) INTO current_values
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = 'domain_events_type_check' AND c.conrelid = 'domain_events'::regclass;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_values || ARRAY[
      'swipe.started', 'swipe.deck_ready', 'swipe.voted', 'swipe.undone', 'swipe.matched',
      'swipe.ended'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList: sessions, yes votes and matches ride
-- the trip stream, tips the explore stream, lists the me stream. swipe_votes and
-- place_qna_summaries are never published.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY[
    'swipe_sessions', 'swipe_yes_votes', 'swipe_matches', 'place_tips', 'saved_lists'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON swipe_sessions, swipe_yes_votes, swipe_matches, place_tips, saved_lists
  TO powersync_repl;
