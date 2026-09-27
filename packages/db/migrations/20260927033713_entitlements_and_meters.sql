-- Entitlement, meter and catalogue tables (docs/data-model.md §3.14), the atomic quota/fair-use SQL
-- functions and the PowerSync publication additions for this phase's tables.

CREATE TABLE products (
  key text PRIMARY KEY,
  store_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  type text NOT NULL,
  grants jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE products ADD CONSTRAINT products_key_check CHECK (key IN (
  'pass_monthly', 'pass_yearly', 'boost_trip', 'boost_crew_year', 'gift_pass_3m'
));
ALTER TABLE products ADD CONSTRAINT products_type_check CHECK (type IN (
  'auto_renew_sub', 'consumable', 'non_renewing'
));
CREATE TRIGGER products_touch_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

CREATE TABLE perks (
  key text PRIMARY KEY,
  tier text NOT NULL,
  copy_key text NOT NULL,
  is_shipped boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE perks ADD CONSTRAINT perks_tier_check CHECK (tier IN ('pass_plus', 'boost', 'ftf', 'crew_year'));
CREATE TRIGGER perks_touch_updated_at BEFORE UPDATE ON perks
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE perks ENABLE ROW LEVEL SECURITY;
ALTER TABLE perks FORCE ROW LEVEL SECURITY;

CREATE TABLE user_entitlements (
  user_id uuid PRIMARY KEY REFERENCES users (id),
  pass_plus boolean NOT NULL DEFAULT false,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  guide_unlimited_global boolean NOT NULL DEFAULT false,
  icon_styles text[] NOT NULL DEFAULT '{}',
  computed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_entitlements FORCE ROW LEVEL SECURITY;

CREATE TABLE trip_entitlements (
  trip_id uuid PRIMARY KEY REFERENCES trips (id),
  boost_active boolean NOT NULL DEFAULT false,
  seat_cap integer NOT NULL DEFAULT 6,
  -- Integer, not nullable: `redraftLimit()` (packages/entitlements) returns `Infinity` for an
  -- unlimited trip; the stored stand-in is REDRAFT_LIMIT_SENTINEL (services/api/src/entitlements/
  -- materialise.ts), converted back to `Infinity` wherever it is read for a decision.
  redraft_limit integer NOT NULL DEFAULT 3,
  live_map boolean NOT NULL DEFAULT false,
  sponsored boolean NOT NULL DEFAULT true,
  computed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE trip_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_entitlements FORCE ROW LEVEL SECURITY;

-- usage_counters: visible, per-period quotas (guide meter, redrafts). A surrogate `id` (PowerSync
-- requires a single-column id; docs/data-model.md §1) alongside the real natural-key uniqueness.
CREATE TABLE usage_counters (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  subject_kind text NOT NULL,
  subject_id uuid NOT NULL,
  metric text NOT NULL,
  period_key text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  limit_at_time integer NOT NULL,
  reset_at timestamptz NOT NULL,
  -- When this (subject, metric, period_key) row was first created: the tz-abuse guard's anchor
  -- (app.consume_quota allows at most one new period per subject/metric per 20h, so repeatedly
  -- moving a device's clock/tz forward cannot manufacture extra free windows inside one real day).
  started_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE usage_counters ADD CONSTRAINT usage_counters_subject_kind_check CHECK (subject_kind IN ('user', 'trip'));
ALTER TABLE usage_counters ADD CONSTRAINT usage_counters_metric_check CHECK (metric IN ('guide_answers', 'redrafts', 'map_opens'));
ALTER TABLE usage_counters ADD CONSTRAINT usage_counters_count_nonnegative_check CHECK (count >= 0);
ALTER TABLE usage_counters ADD CONSTRAINT usage_counters_limit_positive_check CHECK (limit_at_time > 0);
ALTER TABLE usage_counters ADD CONSTRAINT usage_counters_natural_key UNIQUE (subject_kind, subject_id, metric, period_key);
CREATE INDEX usage_counters_subject_metric_started_idx ON usage_counters (subject_kind, subject_id, metric, started_at DESC);
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters FORCE ROW LEVEL SECURITY;

-- fair_use_counters: silent caps, never client-visible (docs/product-decisions.md §3). No app_user
-- or app_system grant at all, matching cmd_log's RLS class S — app.bump_fair_use (SECURITY DEFINER,
-- owned by app_owner) is the only read or write path.
CREATE TABLE fair_use_counters (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  metric text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  cap integer NOT NULL
);
ALTER TABLE fair_use_counters ADD CONSTRAINT fair_use_counters_metric_check CHECK (metric IN ('guide_tokens', 'voice_seconds', 'vision_calls'));
ALTER TABLE fair_use_counters ADD CONSTRAINT fair_use_counters_count_nonnegative_check CHECK (count >= 0);
ALTER TABLE fair_use_counters ADD CONSTRAINT fair_use_counters_cap_positive_check CHECK (cap > 0);
ALTER TABLE fair_use_counters ADD CONSTRAINT fair_use_counters_natural_key UNIQUE (user_id, metric, window_start);
ALTER TABLE fair_use_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE fair_use_counters FORCE ROW LEVEL SECURITY;

-- RLS policies and grants (docs/data-model.md §3.14).

-- products/perks: Authz "adm" (no console yet, app_system stands in), RLS "R" (read-all authenticated).
CREATE POLICY products_select ON products FOR SELECT TO app_user USING (true);
CREATE POLICY products_system ON products FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON products TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO app_system;

CREATE POLICY perks_select ON perks FOR SELECT TO app_user USING (true);
CREATE POLICY perks_system ON perks FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON perks TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON perks TO app_system;

-- user_entitlements: RLS "O", materialised server-side only — no app_user INSERT/UPDATE grant at all.
CREATE POLICY user_entitlements_select ON user_entitlements FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY user_entitlements_system ON user_entitlements FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON user_entitlements TO app_user;
GRANT SELECT, INSERT, UPDATE ON user_entitlements TO app_system;

-- trip_entitlements: RLS "T", same materialised-only shape.
CREATE POLICY trip_entitlements_select ON trip_entitlements FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY trip_entitlements_system ON trip_entitlements FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON trip_entitlements TO app_user;
GRANT SELECT, INSERT, UPDATE ON trip_entitlements TO app_system;

-- usage_counters: RLS "O / T" depending on subject_kind. Read-only for both roles: every write goes
-- through app.consume_quota/app.release_quota (SECURITY DEFINER, owned by app_owner) so the
-- used-vs-limit check is never bypassed by a raw UPDATE, from either role.
CREATE POLICY usage_counters_select ON usage_counters FOR SELECT TO app_user
  USING (
    (subject_kind = 'user' AND subject_id = app.uid())
    OR (subject_kind = 'trip' AND app.is_trip_member(subject_id))
  );
GRANT SELECT ON usage_counters TO app_user, app_system;

-- app.consume_quota: the one INSERT/UPDATE path for usage_counters (docs/system-architecture.md
-- §4.6: "quota reserved in the command tx, released on failure"). A single
-- INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit RETURNING is what makes N concurrent
-- callers at the boundary agree on exactly `limit` winners: Postgres serialises concurrent
-- INSERT/ON CONFLICT attempts on the same unique key, so the WHERE guard is evaluated against each
-- other's committed result, never a stale read.
--
-- Anti-abuse: a caller-claimed period_key is honoured only if the subject/metric's current period
-- is either the same key or at least 20h old, so repeatedly moving a device's clock/tz forward
-- cannot manufacture extra free windows inside one real day. The `SELECT ... FOR UPDATE` also
-- serialises concurrent callers on this decision itself.
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

  IF FOUND AND latest.period_key <> p_period_key AND now() - latest.started_at < interval '20 hours' THEN
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

-- app.release_quota: undoes one consume ("reserve on submit, release on failure"; a reverted
-- redraft still counts, so this is only ever called for a job that never actually ran, not one that
-- ran and failed after starting). Floors at 0, never goes negative.
CREATE OR REPLACE FUNCTION app.release_quota(
  p_subject_kind text, p_subject_id uuid, p_metric text, p_period_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  updated usage_counters%ROWTYPE;
BEGIN
  UPDATE usage_counters
    SET count = GREATEST(count - 1, 0)
    WHERE subject_kind = p_subject_kind AND subject_id = p_subject_id
      AND metric = p_metric AND period_key = p_period_key
    RETURNING * INTO updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'release_quota: no usage_counters row for %/%/%/%', p_subject_kind, p_subject_id, p_metric, p_period_key
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN jsonb_build_object('used', updated.count, 'limit', updated.limit_at_time);
END;
$$;

REVOKE EXECUTE ON FUNCTION app.release_quota(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.release_quota(text, uuid, text, text) TO app_user, app_system;

-- app.bump_fair_use: unconditional increment (docs/product-decisions.md §3: fair use degrades, it
-- never blocks the action itself) — the caller turns the returned count/cap into an ok/degrade_haiku/
-- busy decision (packages/entitlements/src/fair-use.ts), never this function.
CREATE OR REPLACE FUNCTION app.bump_fair_use(
  p_user_id uuid, p_metric text, p_window_start timestamptz, p_cap integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO fair_use_counters (user_id, metric, window_start, count, cap)
  VALUES (p_user_id, p_metric, p_window_start, 1, p_cap)
  ON CONFLICT (user_id, metric, window_start) DO UPDATE
    SET count = fair_use_counters.count + 1, cap = EXCLUDED.cap
  RETURNING count INTO new_count;

  RETURN jsonb_build_object('count', new_count, 'cap', p_cap);
END;
$$;

REVOKE EXECUTE ON FUNCTION app.bump_fair_use(uuid, text, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.bump_fair_use(uuid, text, timestamptz, integer) TO app_user, app_system;

-- PowerSync publication additions (docs/code-standards.md §13): products, perks, user_entitlements,
-- trip_entitlements, usage_counters. fair_use_counters is deliberately excluded (silent, never
-- shown; packages/db/src/publication.ts#PUBLISHABLE_CLASS_EXCEPTIONS).
DO $$
DECLARE
  allow_listed text[] := ARRAY[
    'products', 'perks', 'user_entitlements', 'trip_entitlements', 'usage_counters'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY allow_listed LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
    EXECUTE format('GRANT SELECT ON %I TO powersync_repl', t);
  END LOOP;
END
$$;
