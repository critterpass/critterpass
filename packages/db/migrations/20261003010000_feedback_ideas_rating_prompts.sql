-- Feedback, the idea board and the rating-prompt log (docs/data-model.md §3.14, §3.15).
--
-- feedback_tickets: what a traveller sent from Settings, an article or a shake, numbered for the
-- "#CP-{ticket_no}" receipt; the triage, tracker and reply columns are filled by the server later.
-- ideas: the public board; a new idea waits in `pending_review`, seen by its author alone, until the
-- team publishes it. idea_votes: one row per voter per idea, keyed to the calendar month it was cast
-- in, so the ten-a-month budget counts the votes that still stand. rating_prompts: every time the
-- app asked the store for a review, or held the request back.
--
-- Every write goes through a command running as app_system; app_user reads its own rows (and the
-- public ideas). The embedding column is never granted to app_user nor named by a sync stream.

-- ---------------------------------------------------------------------------------------------
-- feedback_tickets: RLS class O (C2), retained two years.
CREATE SEQUENCE feedback_ticket_no_seq START WITH 10001;

CREATE TABLE feedback_tickets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  ticket_no bigint NOT NULL UNIQUE DEFAULT nextval('feedback_ticket_no_seq'),
  mood text CHECK (mood IN ('grr', 'meh', 'okay', 'good', 'love')),
  category text CHECK (category IN ('planning', 'money', 'guide_chat', 'critters', 'other', 'bug')),
  body text NOT NULL DEFAULT '',
  include_device_info boolean NOT NULL,
  device_info jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  trip_id uuid REFERENCES trips (id),
  media_ids uuid[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'settings'
    CHECK (source IN ('settings', 'help', 'article', 'shake')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'replied', 'in_tracker', 'closed')),
  reply_channel text NOT NULL CHECK (reply_channel IN ('email', 'inbox')),
  reply_due_at timestamptz NOT NULL,
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  triage_summary text,
  duplicate_of uuid REFERENCES feedback_tickets (id) ON DELETE SET NULL,
  duplicate_score real,
  tracker_issue_id text,
  fixed_in_version text,
  idea_id uuid,
  app_version text NOT NULL,
  sent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_tickets_device_info_check
    CHECK (include_device_info OR device_info IS NULL),
  CONSTRAINT feedback_tickets_media_check CHECK (cardinality(media_ids) <= 3)
);
CREATE INDEX feedback_tickets_user_idx ON feedback_tickets (user_id, created_at DESC);
CREATE INDEX feedback_tickets_open_idx ON feedback_tickets (reply_due_at) WHERE status = 'new';
CREATE INDEX feedback_tickets_trip_idx ON feedback_tickets (trip_id) WHERE trip_id IS NOT NULL;

-- How support answers a ticket: by email when the account has a real, verified address, otherwise
-- in the Inbox (phone-only and guest accounts). Reads only those two facts from auth.user.
CREATE FUNCTION app.feedback_reply_channel(p_user_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM auth."user" u
     WHERE u.id = p_user_id AND u.email_verified
       AND u.email NOT LIKE '%@anonymous.placeholder.invalid'
  ) THEN 'email' ELSE 'inbox' END
$$;
REVOKE EXECUTE ON FUNCTION app.feedback_reply_channel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.feedback_reply_channel(uuid) TO app_system;

-- ---------------------------------------------------------------------------------------------
-- ideas: RLS class R for published statuses (C0), the author's own while pending.
CREATE TABLE ideas (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  author_id uuid REFERENCES users (id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 8 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  locale text NOT NULL,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN
    ('pending_review', 'open', 'planned', 'building', 'shipped', 'declined', 'merged')),
  team_note text,
  fixed_in_version text,
  merged_into_id uuid REFERENCES ideas (id),
  votes_count integer NOT NULL DEFAULT 0 CHECK (votes_count >= 0),
  embedding vector(1024),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ideas_merged_check CHECK ((status = 'merged') = (merged_into_id IS NOT NULL))
);
ALTER TABLE feedback_tickets ADD CONSTRAINT feedback_tickets_idea_id_fkey
  FOREIGN KEY (idea_id) REFERENCES ideas (id);
CREATE INDEX ideas_status_votes_idx ON ideas (status, votes_count DESC, created_at DESC);
CREATE INDEX ideas_author_idx ON ideas (author_id) WHERE author_id IS NOT NULL;
CREATE INDEX ideas_merged_into_idx ON ideas (merged_into_id) WHERE merged_into_id IS NOT NULL;
CREATE INDEX ideas_title_trgm_idx ON ideas USING gin (title gin_trgm_ops);
CREATE INDEX ideas_embedding_idx ON ideas USING hnsw (embedding vector_cosine_ops);
CREATE INDEX feedback_tickets_idea_idx ON feedback_tickets (idea_id) WHERE idea_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- idea_votes: RLS class O (C2). `month_key` is `YYYY-MM` on the voter's calendar.
CREATE TABLE idea_votes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  idea_id uuid NOT NULL REFERENCES ideas (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id),
  month_key text NOT NULL CHECK (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idea_id, user_id)
);
CREATE INDEX idea_votes_user_month_idx ON idea_votes (user_id, month_key);

-- The board's count follows its votes, whoever adds or removes them (a vote, a take-back, a merge).
CREATE FUNCTION app.idea_votes_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE ideas SET votes_count = votes_count + 1 WHERE id = NEW.idea_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE ideas SET votes_count = votes_count - 1 WHERE id = OLD.idea_id;
  ELSIF NEW.idea_id IS DISTINCT FROM OLD.idea_id THEN
    UPDATE ideas SET votes_count = votes_count - 1 WHERE id = OLD.idea_id;
    UPDATE ideas SET votes_count = votes_count + 1 WHERE id = NEW.idea_id;
  END IF;
  RETURN NULL;
END
$$;
CREATE TRIGGER idea_votes_count AFTER INSERT OR UPDATE OF idea_id OR DELETE ON idea_votes
  FOR EACH ROW EXECUTE FUNCTION app.idea_votes_count();

-- One vote within the month's budget. The voter's votes are serialised by an advisory lock, so two
-- votes racing from two devices can never both take the last one. Answers what happened:
-- `voted`, `already` (this voter's vote stands), `over_budget`, `closed` (not taking votes) or
-- `not_found` (no idea, or one the voter may not see), with the votes left and the idea's count.
CREATE FUNCTION app.vote_idea(
  p_idea_id uuid,
  p_user_id uuid,
  p_month_key text,
  p_budget integer
) RETURNS TABLE (outcome text, votes_left integer, votes_count integer)
LANGUAGE plpgsql AS $$
DECLARE
  v_status text;
  v_author uuid;
  v_used integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('idea_votes:' || p_user_id::text, 0));
  SELECT i.status, i.author_id INTO v_status, v_author FROM ideas i WHERE i.id = p_idea_id;
  SELECT count(*)::integer INTO v_used FROM idea_votes v
   WHERE v.user_id = p_user_id AND v.month_key = p_month_key;
  IF v_status IS NULL OR (v_status = 'pending_review' AND v_author IS DISTINCT FROM p_user_id) THEN
    RETURN QUERY SELECT 'not_found', greatest(p_budget - v_used, 0), 0;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM idea_votes v WHERE v.idea_id = p_idea_id AND v.user_id = p_user_id) THEN
    RETURN QUERY SELECT 'already', greatest(p_budget - v_used, 0),
      (SELECT i.votes_count FROM ideas i WHERE i.id = p_idea_id);
    RETURN;
  END IF;
  IF v_status NOT IN ('open', 'planned', 'building') THEN
    RETURN QUERY SELECT 'closed', greatest(p_budget - v_used, 0),
      (SELECT i.votes_count FROM ideas i WHERE i.id = p_idea_id);
    RETURN;
  END IF;
  IF v_used >= p_budget THEN
    RETURN QUERY SELECT 'over_budget', 0,
      (SELECT i.votes_count FROM ideas i WHERE i.id = p_idea_id);
    RETURN;
  END IF;
  INSERT INTO idea_votes (idea_id, user_id, month_key) VALUES (p_idea_id, p_user_id, p_month_key);
  RETURN QUERY SELECT 'voted', greatest(p_budget - v_used - 1, 0),
    (SELECT i.votes_count FROM ideas i WHERE i.id = p_idea_id);
END
$$;
REVOKE ALL ON FUNCTION app.vote_idea(uuid, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.vote_idea(uuid, uuid, text, integer) TO app_system;

-- ---------------------------------------------------------------------------------------------
-- rating_prompts: RLS class O (C2), retained a year.
CREATE TABLE rating_prompts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  trip_id uuid REFERENCES trips (id),
  shown boolean NOT NULL,
  shown_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rating_prompts_user_idx ON rating_prompts (user_id, shown_at DESC);
CREATE INDEX rating_prompts_trip_idx ON rating_prompts (trip_id) WHERE trip_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- RLS and grants.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['feedback_tickets', 'ideas', 'idea_votes', 'rating_prompts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO app_system USING (true) WITH CHECK (true)',
      t || '_system', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_system', t);
  END LOOP;
END
$$;
GRANT USAGE ON SEQUENCE feedback_ticket_no_seq TO app_system;
CREATE TRIGGER feedback_tickets_touch_updated_at BEFORE UPDATE ON feedback_tickets
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER ideas_touch_updated_at BEFORE UPDATE ON ideas
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE POLICY feedback_tickets_select ON feedback_tickets FOR SELECT TO app_user
  USING (user_id = app.uid());
GRANT SELECT (id, user_id, ticket_no, mood, category, body, include_device_info, context, trip_id,
  media_ids, source, status, reply_channel, fixed_in_version, sent_at, created_at, updated_at)
  ON feedback_tickets TO app_user;

CREATE POLICY ideas_select ON ideas FOR SELECT TO app_user
  USING (status <> 'pending_review' OR author_id = app.uid());
GRANT SELECT (id, author_id, title, description, locale, status, team_note, fixed_in_version,
  merged_into_id, votes_count, status_changed_at, created_at, updated_at) ON ideas TO app_user;

CREATE POLICY idea_votes_select ON idea_votes FOR SELECT TO app_user USING (user_id = app.uid());
GRANT SELECT ON idea_votes TO app_user;

CREATE POLICY rating_prompts_select ON rating_prompts FOR SELECT TO app_user
  USING (user_id = app.uid());
GRANT SELECT ON rating_prompts TO app_user;

-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['feedback_tickets', 'ideas', 'idea_votes', 'rating_prompts'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON feedback_tickets, ideas, idea_votes, rating_prompts TO powersync_repl;
