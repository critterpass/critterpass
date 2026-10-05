-- AI place profiles: the short page a place gets when no reviewed note exists, written by the
-- `places.profile` job from web pages (SearXNG, our own fetch of the top pages, DeepSeek's own web
-- search as the second source for fees, hours and closures) and read by `GET /v1/places/{id}`.
--
-- place_profiles: Authz "sys", RLS "R", privacy class C0. One row per place. `texts` holds the lines
-- per app locale ({"en": {why_go, best_time, crowd, facts[]}, "vi": …}): written in English (and
-- Vietnamese for a place in Vietnam), other languages added the first time a reader asks.
-- `facts[i]` ({kind, source_url, quote, second_source}) is worded by `texts.<locale>.facts[i]`.
-- Labels (`category`, `meal_role`, `best_times`) come from Jev reading our own row. Photos are our
-- own resized copies in the media bucket (`key` under the public `c/` prefix) with the page they
-- were found on. No user data: the row is about a place, never about who asked. Not synced.
CREATE TABLE place_profiles (
  poi_id uuid PRIMARY KEY REFERENCES pois (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'declined', 'failed')),
  texts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(texts) = 'object'),
  category text,
  meal_role text CHECK (meal_role IN ('meal', 'light', 'none')),
  best_times text[] NOT NULL DEFAULT '{}'
    CHECK (best_times <@ ARRAY['early_morning', 'morning', 'midday', 'afternoon', 'sunset',
                               'evening', 'after_dark']::text[]),
  visit_min smallint CHECK (visit_min BETWEEN 15 AND 600),
  dish text,
  facts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(facts) = 'array'),
  dropped_facts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dropped_facts) = 'array'),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
  second_source jsonb,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(photos) = 'array'),
  model text,
  cost_micros bigint NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  timings jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- The daily spend cap sums today's runs.
CREATE INDEX place_profiles_requested_at_idx ON place_profiles (requested_at);
ALTER TABLE place_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY place_profiles_select ON place_profiles FOR SELECT TO app_user USING (true);
CREATE POLICY place_profiles_system ON place_profiles FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON place_profiles TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON place_profiles TO app_system;

-- place_search_pace: Authz "sys", RLS "S", privacy class C0. One row: the next moment a place
-- search may go to SearXNG, shared by every worker, so the scraped engines behind it see a steady
-- trickle instead of bursts (they suspend after about 200 queries in 30 minutes). `seq` counts
-- reservations; the caller rotates engines by it.
CREATE TABLE place_search_pace (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  next_at timestamptz NOT NULL DEFAULT now(),
  seq bigint NOT NULL DEFAULT 0
);
INSERT INTO place_search_pace (id) VALUES (true);
ALTER TABLE place_search_pace ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_search_pace FORCE ROW LEVEL SECURITY;
CREATE POLICY place_search_pace_system ON place_search_pace FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, UPDATE ON place_search_pace TO app_system;

-- Reserves the next search slot: returns how long to wait (ms, never negative) and the slot's
-- number. Slots are `p_gap_ms` apart; the row lock serialises concurrent callers.
CREATE FUNCTION app.reserve_place_search(p_gap_ms integer)
RETURNS TABLE (wait_ms integer, seq bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_slot timestamptz;
  v_seq bigint;
BEGIN
  SELECT greatest(p.next_at, v_now) INTO v_slot FROM place_search_pace p WHERE p.id FOR UPDATE;
  UPDATE place_search_pace p
     SET next_at = v_slot + make_interval(secs => greatest(p_gap_ms, 0) / 1000.0),
         seq = p.seq + 1
   WHERE p.id
  RETURNING p.seq INTO v_seq;
  RETURN QUERY SELECT greatest(0, ceil(extract(epoch FROM v_slot - v_now) * 1000))::integer, v_seq;
END;
$$;
REVOKE ALL ON FUNCTION app.reserve_place_search(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_place_search(integer) TO app_system;
