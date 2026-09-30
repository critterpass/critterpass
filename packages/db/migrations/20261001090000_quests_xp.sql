-- Crew quests and XP (docs/data-model.md §3.9): the day's quests, optional sign-ups, progress, the
-- append-only XP ledger and each crew's running total. Doc deltas: `crew_xp` is a table (PowerSync
-- cannot replicate views), updated in the same transaction as every crew ledger row; quests carry
-- their local date, slot, title, line, scope and reveal time; progress keeps the distinct things it
-- counted; `stickers.level` marks a crew-level sticker, one per crew per level.
--
-- Every row is written by the server (app_system: the worker, or a command after its own check),
-- except that a traveller may sign themselves up for a quest on their trip. Trip members read the
-- trip's quests, sign-ups and progress; a member reads their own XP rows, and the crew's rows and
-- total are read by its current members.

-- ---------------------------------------------------------------------------------------------
-- quests: RLS T (trip members read), C1. At most four per trip per local day.
CREATE TABLE quests (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  local_date date NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 0 AND 3),
  template text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  metric text NOT NULL,
  target integer NOT NULL CHECK (target >= 1),
  reward jsonb NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 24),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 110),
  scope text NOT NULL DEFAULT 'crew' CHECK (scope IN ('crew', 'optional')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('offered', 'active', 'completed', 'failed', 'expired')),
  source text NOT NULL CHECK (source IN ('guide', 'fallback')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  completed_at timestamptz,
  reveal_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quests_trip_day_slot_key UNIQUE (trip_id, local_date, slot),
  CHECK (ends_at > starts_at),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE INDEX quests_live_idx ON quests (trip_id) WHERE status IN ('offered', 'active');
CREATE TRIGGER quests_touch_updated_at BEFORE UPDATE ON quests
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE quests FORCE ROW LEVEL SECURITY;
CREATE POLICY quests_select ON quests FOR SELECT TO app_user USING (app.is_trip_member(trip_id));
CREATE POLICY quests_system ON quests FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON quests TO app_user;
GRANT SELECT, INSERT, UPDATE ON quests TO app_system;

-- ---------------------------------------------------------------------------------------------
-- quest_signups: RLS T, C1. A traveller signs themselves up for an optional quest.
CREATE TABLE quest_signups (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  quest_id uuid NOT NULL REFERENCES quests (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quest_signups_quest_user_key UNIQUE (quest_id, user_id)
);
CREATE INDEX quest_signups_trip_idx ON quest_signups (trip_id);
CREATE INDEX quest_signups_user_idx ON quest_signups (user_id);
ALTER TABLE quest_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_signups FORCE ROW LEVEL SECURITY;
CREATE POLICY quest_signups_select ON quest_signups FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY quest_signups_insert ON quest_signups FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.is_trip_participant(trip_id)
    AND EXISTS (SELECT 1 FROM quests q WHERE q.id = quest_id AND q.trip_id = quest_signups.trip_id));
CREATE POLICY quest_signups_system ON quest_signups FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON quest_signups TO app_user;
GRANT INSERT (quest_id, trip_id, user_id) ON quest_signups TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON quest_signups TO app_system;

-- ---------------------------------------------------------------------------------------------
-- quest_progress: RLS T, C1. One row per quest; `counted` holds the distinct things that moved it
-- (a place, a traveller, an expense), `source_event_ids` every event already applied.
CREATE TABLE quest_progress (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  quest_id uuid NOT NULL REFERENCES quests (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  value integer NOT NULL DEFAULT 0 CHECK (value >= 0),
  counted text[] NOT NULL DEFAULT '{}',
  source_event_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quest_progress_quest_key UNIQUE (quest_id)
);
CREATE INDEX quest_progress_trip_idx ON quest_progress (trip_id);
ALTER TABLE quest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_progress FORCE ROW LEVEL SECURITY;
CREATE POLICY quest_progress_select ON quest_progress FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY quest_progress_system ON quest_progress FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON quest_progress TO app_user;
GRANT SELECT, INSERT, UPDATE ON quest_progress TO app_system;

-- ---------------------------------------------------------------------------------------------
-- xp_ledger: RLS O / M, C1, append-only. A crew row (user_id null) counts toward the crew's level;
-- member rows record each traveller's share. One row per source per crew and per member, so a
-- repeated grant writes nothing.
CREATE TABLE xp_ledger (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  crew_id uuid REFERENCES crews (id) ON DELETE CASCADE,
  trip_id uuid REFERENCES trips (id),
  amount integer NOT NULL CHECK (amount >= 0),
  source_kind text NOT NULL CHECK (source_kind IN ('quest', 'form', 'visit', 'settle')),
  source_id uuid NOT NULL,
  granted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR crew_id IS NOT NULL)
);
CREATE UNIQUE INDEX xp_ledger_crew_source_uk ON xp_ledger (source_kind, source_id)
  WHERE user_id IS NULL;
CREATE UNIQUE INDEX xp_ledger_member_source_uk ON xp_ledger (source_kind, source_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX xp_ledger_user_idx ON xp_ledger (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX xp_ledger_crew_idx ON xp_ledger (crew_id) WHERE user_id IS NULL;
ALTER TABLE xp_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY xp_ledger_select ON xp_ledger FOR SELECT TO app_user
  USING (user_id = app.uid() OR (user_id IS NULL AND app.is_crew_member(crew_id)));
CREATE POLICY xp_ledger_system ON xp_ledger FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON xp_ledger TO app_user;
GRANT SELECT, INSERT ON xp_ledger TO app_system;
-- An account merge moves an anonymous member's rows to the surviving account (and drops the ones
-- it already has); deleting an account removes its own rows through the cascade.
GRANT UPDATE (user_id), DELETE ON xp_ledger TO app_system;

-- Append-only: nothing changes a row except an account merge re-pointing `user_id`, and nothing
-- deletes one except the owner's account going away or an anonymous account merging.
CREATE OR REPLACE FUNCTION app.xp_ledger_append_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.crew_id, NEW.trip_id, NEW.amount, NEW.source_kind, NEW.source_id,
        NEW.granted_at, NEW.created_at) IS DISTINCT FROM
       (OLD.id, OLD.crew_id, OLD.trip_id, OLD.amount, OLD.source_kind, OLD.source_id,
        OLD.granted_at, OLD.created_at)
       OR OLD.user_id IS NULL OR NEW.user_id IS NULL THEN
      RAISE EXCEPTION 'xp_ledger is append-only' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = OLD.user_id AND u.status <> 'anonymous'
  ) THEN
    RETURN OLD;
  END IF;
  IF OLD.user_id IS NULL AND NOT EXISTS (SELECT 1 FROM crews c WHERE c.id = OLD.crew_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'xp_ledger is append-only' USING ERRCODE = 'P0001';
END;
$$;
REVOKE EXECUTE ON FUNCTION app.xp_ledger_append_only() FROM PUBLIC;
CREATE TRIGGER xp_ledger_append_only BEFORE UPDATE OR DELETE ON xp_ledger
  FOR EACH ROW EXECUTE FUNCTION app.xp_ledger_append_only();

-- ---------------------------------------------------------------------------------------------
-- crew_xp: RLS M (crew members read), C1. The crew's XP (the sum of its crew ledger rows) and
-- level, kept by app.grant_xp in the same transaction as each crew row.
CREATE TABLE crew_xp (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id) ON DELETE CASCADE,
  xp bigint NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level integer NOT NULL DEFAULT 1 CHECK (level >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_xp_crew_key UNIQUE (crew_id)
);
ALTER TABLE crew_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_xp FORCE ROW LEVEL SECURITY;
CREATE POLICY crew_xp_select ON crew_xp FOR SELECT TO app_user USING (app.is_crew_member(crew_id));
CREATE POLICY crew_xp_system ON crew_xp FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON crew_xp TO app_user;
GRANT SELECT, INSERT, UPDATE ON crew_xp TO app_system;

-- ---------------------------------------------------------------------------------------------
-- Crew-level stickers: a crew-owned row (user_id null) per level reached, granted once.
ALTER TABLE stickers ADD COLUMN level smallint CHECK (level IS NULL OR level >= 2);
ALTER TABLE stickers ADD CONSTRAINT stickers_crew_level_check
  CHECK (kind <> 'crew_level' OR (level IS NOT NULL AND crew_id IS NOT NULL AND user_id IS NULL));
CREATE UNIQUE INDEX stickers_crew_level_uk ON stickers (crew_id, level) WHERE kind = 'crew_level';
GRANT SELECT (level) ON stickers TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- The level curve (mirrors packages/domain/src/quests/levels.ts; a database test holds the two to
-- one table): level 1 → 2 takes 400 XP, each level 100 more, from level 7 on 1,000 per level.
CREATE OR REPLACE FUNCTION app.crew_level(p_xp bigint) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE
  lvl integer := 1;
  floor_xp bigint := 0;
BEGIN
  WHILE lvl < 999 AND p_xp >= floor_xp + 100 * least(10, lvl + 3) LOOP
    floor_xp := floor_xp + 100 * least(10, lvl + 3);
    lvl := lvl + 1;
  END LOOP;
  RETURN lvl;
END;
$$;
GRANT EXECUTE ON FUNCTION app.crew_level(bigint) TO app_user, app_system;

-- app.grant_xp: one grant from one source. Writes the crew row (when there is a crew) and a row per
-- member, each at most once per source, moves `crew_xp` with the crew row under its row lock, and
-- grants a crew-level sticker for every even level crossed. A repeat of the same source grants
-- nothing and reports the crew's level unchanged.
CREATE OR REPLACE FUNCTION app.grant_xp(
  p_crew uuid, p_trip uuid, p_users uuid[], p_amount integer, p_kind text, p_source uuid,
  p_at timestamptz
)
RETURNS TABLE (granted boolean, level_before integer, level_after integer, sticker_ids uuid[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  crew_row uuid;
  member_rows integer := 0;
  before_xp bigint := 0;
  lb integer;
  la integer;
  new_stickers uuid[] := '{}';
BEGIN
  IF p_crew IS NOT NULL THEN
    INSERT INTO crew_xp (crew_id) VALUES (p_crew) ON CONFLICT (crew_id) DO NOTHING;
    SELECT x.xp INTO before_xp FROM crew_xp x WHERE x.crew_id = p_crew FOR UPDATE;
    INSERT INTO xp_ledger (crew_id, trip_id, amount, source_kind, source_id, granted_at)
    VALUES (p_crew, p_trip, p_amount, p_kind, p_source, p_at)
    ON CONFLICT (source_kind, source_id) WHERE user_id IS NULL DO NOTHING
    RETURNING id INTO crew_row;
  END IF;
  WITH inserted AS (
    INSERT INTO xp_ledger (user_id, crew_id, trip_id, amount, source_kind, source_id, granted_at)
    SELECT DISTINCT u, p_crew, p_trip, p_amount, p_kind, p_source, p_at
      FROM unnest(coalesce(p_users, '{}'::uuid[])) AS u
    ON CONFLICT (source_kind, source_id, user_id) WHERE user_id IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO member_rows FROM inserted;
  IF p_crew IS NULL THEN
    RETURN QUERY SELECT member_rows > 0, NULL::integer, NULL::integer, new_stickers;
    RETURN;
  END IF;
  lb := app.crew_level(before_xp);
  IF crew_row IS NULL THEN
    RETURN QUERY SELECT member_rows > 0, lb, lb, new_stickers;
    RETURN;
  END IF;
  la := app.crew_level(before_xp + p_amount);
  UPDATE crew_xp SET xp = before_xp + p_amount, level = la, updated_at = now()
   WHERE crew_id = p_crew;
  IF la > lb THEN
    WITH granted_stickers AS (
      INSERT INTO stickers (crew_id, trip_id, kind, level, granted_at)
      SELECT p_crew, p_trip, 'crew_level', l, p_at
        FROM generate_series(lb + 1, la) AS l
       WHERE l >= 2 AND l % 2 = 0
      ON CONFLICT (crew_id, level) WHERE kind = 'crew_level' DO NOTHING
      RETURNING id
    )
    SELECT coalesce(array_agg(id), '{}') INTO new_stickers FROM granted_stickers;
  END IF;
  RETURN QUERY SELECT true, lb, la, new_stickers;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.grant_xp(uuid, uuid, uuid[], integer, text, uuid, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.grant_xp(uuid, uuid, uuid[], integer, text, uuid, timestamptz)
  TO app_system;

-- app.grant_quest_reward: completes a live quest once (under its row lock) and grants its XP to the
-- crew and to the given travellers still on the trip. `completed` is false when it was already
-- finished, failed or expired, so a retried evaluator grants nothing twice.
CREATE OR REPLACE FUNCTION app.grant_quest_reward(
  p_quest uuid, p_users uuid[], p_at timestamptz, p_reveal_at timestamptz
)
RETURNS TABLE (
  completed boolean, trip_id uuid, crew_id uuid, xp integer, user_ids uuid[],
  level_before integer, level_after integer, sticker_ids uuid[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
#variable_conflict use_column
DECLARE
  q record;
  members uuid[];
  g record;
BEGIN
  SELECT qq.id, qq.trip_id, qq.status, (qq.reward->>'xp')::integer AS xp, t.crew_id
    INTO q FROM quests qq JOIN trips t ON t.id = qq.trip_id
   WHERE qq.id = p_quest FOR UPDATE OF qq;
  IF q.id IS NULL OR q.status NOT IN ('offered', 'active') THEN
    RETURN QUERY SELECT false, q.trip_id, q.crew_id, 0, '{}'::uuid[], NULL::integer,
      NULL::integer, '{}'::uuid[];
    RETURN;
  END IF;
  SELECT coalesce(array_agg(tp.user_id ORDER BY tp.user_id), '{}') INTO members
    FROM trip_participants tp
   WHERE tp.trip_id = q.trip_id AND tp.rsvp <> 'out' AND tp.user_id = ANY (p_users);
  UPDATE quests SET status = 'completed', completed_at = p_at, reveal_at = p_reveal_at
   WHERE id = q.id;
  SELECT * INTO g FROM app.grant_xp(q.crew_id, q.trip_id, members, q.xp, 'quest', q.id, p_at);
  RETURN QUERY SELECT true, q.trip_id, q.crew_id, q.xp, members, g.level_before, g.level_after,
    g.sticker_ids;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.grant_quest_reward(uuid, uuid[], timestamptz, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.grant_quest_reward(uuid, uuid[], timestamptz, timestamptz)
  TO app_system;

-- ---------------------------------------------------------------------------------------------
-- Settle XP for trips settled before quests existed: the crew and every member who got the Settled
-- Tokek earn the settle XP (150, packages/domain/src/quests/levels.ts XP_SOURCES.settle) once, at
-- the time they settled.
DO $$
DECLARE
  s record;
BEGIN
  FOR s IN
    SELECT st.crew_id, st.trip_id, array_agg(st.user_id ORDER BY st.user_id) AS users,
           min(st.granted_at) AS at
      FROM stickers st
     WHERE st.kind = 'settled' AND st.trip_id IS NOT NULL AND st.crew_id IS NOT NULL
     GROUP BY st.crew_id, st.trip_id
     ORDER BY min(st.granted_at)
  LOOP
    PERFORM app.grant_xp(s.crew_id, s.trip_id, s.users, 150, 'settle', s.trip_id, s.at);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- The quest and XP events join the catalogue (packages/domain/src/quests/events.ts), added to
-- whatever the constraint lists now.
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
      'quest.published', 'quest.signed_up', 'quest.progress', 'quest.completed', 'xp.granted',
      'sticker.granted'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13): every quest and XP table syncs.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quests', 'quest_signups', 'quest_progress', 'xp_ledger', 'crew_xp']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON quests, quest_signups, quest_progress, xp_ledger, crew_xp TO powersync_repl;
