-- Guide chat (docs/data-model.md §3.6): the guide sheet's threads and messages, the question a free
-- user queues for the meter reset, phrase practice, custom phrase cards, and the guide's turns in
-- crew chat. Every table here is written by the server (as app_system) except phrase_progress,
-- which its owner writes. A thread is private (its owner only) or group (the trip's crew, doc delta:
-- data-model lists private only).

-- ---------------------------------------------------------------------------------------------
-- guide_threads: RLS class O (private) / T (group), C2. One private thread per user and trip (and
-- one with no trip, the home guide); one group thread per trip.
CREATE TABLE guide_threads (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  trip_id uuid REFERENCES trips (id),
  crew_id uuid REFERENCES crews (id),
  guide_id uuid REFERENCES guides (id),
  mode text NOT NULL DEFAULT 'private',
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE guide_threads ADD CONSTRAINT guide_threads_mode_check
  CHECK (mode IN ('private', 'group'));
ALTER TABLE guide_threads ADD CONSTRAINT guide_threads_group_has_trip_check
  CHECK (mode = 'private' OR (trip_id IS NOT NULL AND crew_id IS NOT NULL));
CREATE UNIQUE INDEX guide_threads_private_key ON guide_threads (user_id, trip_id) NULLS NOT DISTINCT
  WHERE mode = 'private';
CREATE UNIQUE INDEX guide_threads_group_key ON guide_threads (trip_id) WHERE mode = 'group';
CREATE INDEX guide_threads_trip_idx ON guide_threads (trip_id) WHERE trip_id IS NOT NULL;
CREATE TRIGGER guide_threads_touch_updated_at BEFORE UPDATE ON guide_threads
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE guide_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_threads FORCE ROW LEVEL SECURITY;

CREATE POLICY guide_threads_select ON guide_threads FOR SELECT TO app_user
  USING (
    (mode = 'private' AND user_id = app.uid())
    OR (mode = 'group' AND app.is_trip_member(trip_id))
  );
CREATE POLICY guide_threads_system ON guide_threads FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON guide_threads TO app_user;
GRANT SELECT, INSERT, UPDATE ON guide_threads TO app_system;

-- ---------------------------------------------------------------------------------------------
-- guide_messages: C2, readable wherever its thread is. `trip_id` repeats the thread's trip so the
-- group thread syncs on the trip stream. `meter_counted` marks the answers that spent a unit.
CREATE TABLE guide_messages (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  thread_id uuid NOT NULL REFERENCES guide_threads (id),
  trip_id uuid REFERENCES trips (id),
  role text NOT NULL,
  author_id uuid REFERENCES users (id),
  content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 8000),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(attachments) = 'array' AND jsonb_array_length(attachments) <= 10),
  cards jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(cards) = 'array'),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
  voice boolean NOT NULL DEFAULT false,
  meter_counted boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'complete',
  rating text,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE guide_messages ADD CONSTRAINT guide_messages_role_check
  CHECK (role IN ('user', 'guide', 'tool'));
ALTER TABLE guide_messages ADD CONSTRAINT guide_messages_status_check
  CHECK (status IN ('complete', 'failed', 'refused'));
ALTER TABLE guide_messages ADD CONSTRAINT guide_messages_rating_check
  CHECK (rating IS NULL OR (role = 'guide' AND rating IN ('up', 'down')));
ALTER TABLE guide_messages ADD CONSTRAINT guide_messages_author_check
  CHECK (role <> 'user' OR author_id IS NOT NULL);
CREATE INDEX guide_messages_thread_created_idx ON guide_messages (thread_id, created_at);
CREATE INDEX guide_messages_trip_idx ON guide_messages (trip_id) WHERE trip_id IS NOT NULL;
ALTER TABLE guide_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_messages FORCE ROW LEVEL SECURITY;

-- The subquery runs under the caller's own guide_threads policy.
CREATE POLICY guide_messages_select ON guide_messages FOR SELECT TO app_user
  USING (EXISTS (SELECT 1 FROM guide_threads t WHERE t.id = thread_id));
CREATE POLICY guide_messages_system ON guide_messages FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON guide_messages TO app_user;
GRANT SELECT, INSERT, UPDATE ON guide_messages TO app_system;

-- ---------------------------------------------------------------------------------------------
-- queued_guide_questions: C2, owner only. One live question per user per meter day (`queued_for`
-- is the spent day's period key); a cancelled one frees the day again.
CREATE TABLE queued_guide_questions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  thread_id uuid NOT NULL REFERENCES guide_threads (id),
  trip_id uuid REFERENCES trips (id),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  tz text NOT NULL,
  queued_for text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  answer_after timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  answer_message_id uuid REFERENCES guide_messages (id),
  answered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE queued_guide_questions ADD CONSTRAINT queued_guide_questions_status_check
  CHECK (status IN ('queued', 'answered', 'cancelled', 'failed'));
ALTER TABLE queued_guide_questions ADD CONSTRAINT queued_guide_questions_answered_check
  CHECK ((status = 'answered') = (answer_message_id IS NOT NULL));
CREATE UNIQUE INDEX queued_guide_questions_one_per_day_key
  ON queued_guide_questions (user_id, queued_for) WHERE status <> 'cancelled';
CREATE INDEX queued_guide_questions_due_idx ON queued_guide_questions (answer_after)
  WHERE status = 'queued';
CREATE TRIGGER queued_guide_questions_touch_updated_at BEFORE UPDATE ON queued_guide_questions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE queued_guide_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE queued_guide_questions FORCE ROW LEVEL SECURITY;

CREATE POLICY queued_guide_questions_select ON queued_guide_questions FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY queued_guide_questions_system ON queued_guide_questions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON queued_guide_questions TO app_user;
GRANT SELECT, INSERT, UPDATE ON queued_guide_questions TO app_system;

-- ---------------------------------------------------------------------------------------------
-- phrase_progress: C2, self. The owner records practice on a curated or custom phrase card (no FK:
-- `phrase_id` names either kind).
CREATE TABLE phrase_progress (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  phrase_id uuid NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  score smallint CHECK (score BETWEEN 0 AND 100),
  practised_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT phrase_progress_user_phrase_key UNIQUE (user_id, phrase_id)
);
CREATE TRIGGER phrase_progress_touch_updated_at BEFORE UPDATE ON phrase_progress
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE phrase_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE phrase_progress FORCE ROW LEVEL SECURITY;

CREATE POLICY phrase_progress_owner ON phrase_progress FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY phrase_progress_system ON phrase_progress FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON phrase_progress TO app_user;
GRANT SELECT, INSERT, UPDATE ON phrase_progress TO app_system;

-- ---------------------------------------------------------------------------------------------
-- custom_phrase_cards: C2, owner only. `request_phrase_card` writes the request; the phrase job fills
-- the text and, when the voice provider is configured, the audio (`device` = play on-device TTS).
CREATE TABLE custom_phrase_cards (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  guide_id uuid REFERENCES guides (id),
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 1 AND 160),
  language text NOT NULL CHECK (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  register text NOT NULL,
  address text CHECK (char_length(address) <= 300),
  text text,
  romanisation text,
  gloss text,
  audio_key text,
  audio_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE custom_phrase_cards ADD CONSTRAINT custom_phrase_cards_register_check
  CHECK (register IN ('casual', 'polite', 'formal'));
ALTER TABLE custom_phrase_cards ADD CONSTRAINT custom_phrase_cards_audio_status_check
  CHECK (audio_status IN ('pending', 'ready', 'device', 'failed'));
ALTER TABLE custom_phrase_cards ADD CONSTRAINT custom_phrase_cards_audio_key_check
  CHECK ((audio_status = 'ready') = (audio_key IS NOT NULL));
CREATE INDEX custom_phrase_cards_user_trip_idx ON custom_phrase_cards (user_id, trip_id);
CREATE TRIGGER custom_phrase_cards_touch_updated_at BEFORE UPDATE ON custom_phrase_cards
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE custom_phrase_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_phrase_cards FORCE ROW LEVEL SECURITY;

CREATE POLICY custom_phrase_cards_select ON custom_phrase_cards FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY custom_phrase_cards_system ON custom_phrase_cards FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON custom_phrase_cards TO app_user;
GRANT SELECT, INSERT, UPDATE ON custom_phrase_cards TO app_system;

-- ---------------------------------------------------------------------------------------------
-- guide_crew_turns: RLS class S, C4 (server-only, like crew_chat_counters). One row per guide turn
-- in crew chat: a mention reply (keyed by the mention message, so the api stream and the worker job
-- never both answer it) or a proactive offer (keyed by its trigger, and counted against the crew's
-- daily cap). Never client-visible.
CREATE TABLE guide_crew_turns (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  trip_id uuid REFERENCES trips (id),
  kind text NOT NULL,
  message_id uuid UNIQUE,
  trigger_key text,
  asker_id uuid REFERENCES users (id),
  status text NOT NULL DEFAULT 'running',
  metered boolean NOT NULL DEFAULT false,
  quota_period_key text,
  reply_message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE guide_crew_turns ADD CONSTRAINT guide_crew_turns_kind_check
  CHECK (kind IN ('mention', 'proactive'));
ALTER TABLE guide_crew_turns ADD CONSTRAINT guide_crew_turns_status_check
  CHECK (status IN ('running', 'answered', 'failed', 'skipped'));
ALTER TABLE guide_crew_turns ADD CONSTRAINT guide_crew_turns_shape_check
  CHECK (
    (kind = 'mention' AND message_id IS NOT NULL AND asker_id IS NOT NULL)
    OR (kind = 'proactive' AND trigger_key IS NOT NULL)
  );
CREATE UNIQUE INDEX guide_crew_turns_trigger_key ON guide_crew_turns (crew_id, trigger_key)
  WHERE trigger_key IS NOT NULL;
CREATE INDEX guide_crew_turns_crew_kind_created_idx ON guide_crew_turns (crew_id, kind, created_at);
CREATE TRIGGER guide_crew_turns_touch_updated_at BEFORE UPDATE ON guide_crew_turns
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE guide_crew_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_crew_turns FORCE ROW LEVEL SECURITY;

CREATE POLICY guide_crew_turns_system ON guide_crew_turns FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON guide_crew_turns TO app_system;

-- ---------------------------------------------------------------------------------------------
-- llm.guide_history (docs/data-model-sync-and-privacy.md §2): the thread the guide is answering in,
-- read as guide_reader. Only the asking user's private threads, or a group thread of a trip they
-- are on; `app.thread` names the one thread.
CREATE OR REPLACE VIEW llm.guide_history AS
SELECT
  m.thread_id,
  m.role,
  m.content,
  m.status,
  m.created_at
FROM guide_messages m
JOIN guide_threads t ON t.id = m.thread_id
WHERE t.id = nullif(current_setting('app.thread', true), '')::uuid
  AND m.role IN ('user', 'guide')
  AND m.status = 'complete'
  AND (
    (t.mode = 'private' AND t.user_id = app.uid())
    OR (t.mode = 'group' AND app.is_trip_member(t.trip_id))
  );
GRANT SELECT ON llm.guide_history TO guide_reader;

-- llm.crew_profiles: the `crew_profiles` tool's rows for the trip in context. First names, the
-- crew-visible taste tags, pace and chronotype, and dietary flags only where the member consented
-- (participant_dietary_flags exists only while consent stands). No budgets, no profile detail.
CREATE OR REPLACE VIEW llm.crew_profiles AS
SELECT
  tp.trip_id,
  tp.user_id,
  split_part(coalesce(u.display_name, ''), ' ', 1) AS first_name,
  CASE WHEN tst.visibility = 'crew' THEN tst.tags ELSE '{}'::text[] END AS taste_tags,
  coalesce(f.flags, '{}'::text[]) AS dietary_flags,
  CASE WHEN tst.visibility = 'crew' THEN tst.pace END AS pace,
  CASE WHEN tst.visibility = 'crew' THEN tst.chronotype END AS chronotype
FROM trip_participants tp
JOIN users u ON u.id = tp.user_id
LEFT JOIN taste_profiles tst ON tst.user_id = tp.user_id
LEFT JOIN participant_dietary_flags f ON f.trip_id = tp.trip_id AND f.user_id = tp.user_id
WHERE tp.trip_id = nullif(current_setting('app.trip', true), '')::uuid
  AND app.is_trip_member(tp.trip_id);
GRANT SELECT ON llm.crew_profiles TO guide_reader;

-- ---------------------------------------------------------------------------------------------
-- The free meter never moves back a day: a period key older than the subject's latest one (a
-- device tz moved west after the reset) counts toward the latest period instead. Together with the
-- 20 h rule (a new period at most once per 20 h), a tz change can never grant a second free day.
CREATE OR REPLACE FUNCTION app.consume_quota(
  p_subject_kind text, p_subject_id uuid, p_metric text, p_period_key text,
  p_limit integer, p_reset_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  latest usage_counters%ROWTYPE;
  effective_period_key text := p_period_key;
  effective_reset_at timestamptz := p_reset_at;
  new_count integer;
BEGIN
  SELECT * INTO latest FROM usage_counters
    WHERE subject_kind = p_subject_kind AND subject_id = p_subject_id AND metric = p_metric
    ORDER BY started_at DESC LIMIT 1
    FOR UPDATE;

  IF FOUND AND latest.period_key <> p_period_key AND (
    now() - latest.started_at < interval '20 hours'
    OR (
      latest.period_key ~ '^\d{4}-\d{2}-\d{2}$' AND p_period_key ~ '^\d{4}-\d{2}-\d{2}$'
      AND p_period_key < latest.period_key
    )
  ) THEN
    effective_period_key := latest.period_key;
    effective_reset_at := latest.reset_at;
  END IF;

  INSERT INTO usage_counters (subject_kind, subject_id, metric, period_key, count, limit_at_time, reset_at)
  VALUES (p_subject_kind, p_subject_id, p_metric, effective_period_key, 1, p_limit, effective_reset_at)
  ON CONFLICT (subject_kind, subject_id, metric, period_key) DO UPDATE
    SET count = usage_counters.count + 1
    WHERE usage_counters.count < p_limit
  RETURNING count INTO new_count;

  IF NOT FOUND THEN
    SELECT count INTO new_count FROM usage_counters
      WHERE subject_kind = p_subject_kind AND subject_id = p_subject_id
        AND metric = p_metric AND period_key = effective_period_key;
    RETURN jsonb_build_object(
      'ok', false, 'used', new_count, 'limit', p_limit,
      'reset_at', effective_reset_at, 'period_key', effective_period_key
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'used', new_count, 'limit', p_limit,
    'reset_at', effective_reset_at, 'period_key', effective_period_key
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION app.consume_quota(text, uuid, text, text, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.consume_quota(text, uuid, text, text, integer, timestamptz) TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- domain_events: the guide events join the catalogue (packages/domain/src/guide/events.ts), added
-- to whatever the constraint lists now so a sibling migration's types are kept.
DO $$
DECLARE
  current_types text[];
  merged text;
BEGIN
  SELECT array_agg(m[1] ORDER BY m[1]) INTO current_types
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = 'domain_events_type_check' AND c.conrelid = 'domain_events'::regclass;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_types || ARRAY[
      'guide.question_queued', 'guide.question_cancelled', 'guide.question_answered',
      'guide.answer_rated', 'guide.offer_posted', 'phrase.requested', 'phrase.ready'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13): the C2 guide tables. guide_crew_turns never
-- syncs.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'guide_threads', 'guide_messages', 'queued_guide_questions', 'phrase_progress',
    'custom_phrase_cards'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON guide_threads, guide_messages, queued_guide_questions, phrase_progress,
  custom_phrase_cards TO powersync_repl;
