-- Sharing the plan with a driver or guide (docs/data-model.md, doc delta): a no-login page at
-- `/t/{token}` with the days they are needed, and their reply (a quote, a suggested order and tips)
-- that reaches the crew as a change set the crew votes on.
--
-- driver_plan_shares: RLS class T, C1 (`token_enc` C2). The crew reads its trip's shares (open
-- count, expiry, who made them); the token itself is kept as a SHA-256 hash for lookup and sealed
-- with the field keyring so the crew's share sheet can show the link again. Neither token column
-- nor the PDF key is granted to app_user. Only the system writes, after the command checked the
-- caller is a member. One live link per driver per trip: a new link revokes the old one.
CREATE TABLE driver_plan_shares (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  provider_id uuid REFERENCES providers (id),
  driver_name text NOT NULL CHECK (char_length(driver_name) BETWEEN 1 AND 40),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  itinerary_version_id uuid NOT NULL REFERENCES itinerary_versions (id),
  day_nos smallint[] NOT NULL CHECK (cardinality(day_nos) BETWEEN 1 AND 60),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  token_enc text NOT NULL,
  allow_quote boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  open_count integer NOT NULL DEFAULT 0 CHECK (open_count >= 0),
  last_opened_at timestamptz,
  pdf_key text,
  pdf_version_id uuid,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX driver_plan_shares_live_key ON driver_plan_shares
  (trip_id, COALESCE(provider_id::text, lower(driver_name)))
  WHERE revoked_at IS NULL;
CREATE INDEX driver_plan_shares_trip_idx ON driver_plan_shares (trip_id, created_at DESC);
CREATE INDEX driver_plan_shares_expiry_idx ON driver_plan_shares (expires_at)
  WHERE revoked_at IS NULL AND pdf_key IS NOT NULL;
CREATE TRIGGER driver_plan_shares_touch_updated_at BEFORE UPDATE ON driver_plan_shares
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE driver_plan_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_plan_shares FORCE ROW LEVEL SECURITY;
CREATE POLICY driver_plan_shares_select ON driver_plan_shares FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY driver_plan_shares_system ON driver_plan_shares FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT (id, trip_id, provider_id, driver_name, created_by, itinerary_version_id, day_nos,
  allow_quote, expires_at, revoked_at, open_count, last_opened_at, version, created_at, updated_at)
  ON driver_plan_shares TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_plan_shares TO app_system;

-- driver_plan_replies: RLS class T, C1. What the driver sent back: the quote, a suggested order per
-- day and tips. One open reply per link: a later send replaces it until the crew has voted.
-- Read by the crew; written only by the system from the public reply route.
CREATE TABLE driver_plan_replies (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  share_id uuid NOT NULL REFERENCES driver_plan_shares (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  price_per_day_minor bigint CHECK (price_per_day_minor IS NULL OR price_per_day_minor > 0),
  currency char(3),
  includes text[] NOT NULL DEFAULT '{}',
  overtime_per_hour_minor bigint CHECK (overtime_per_hour_minor IS NULL OR overtime_per_hour_minor >= 0),
  included_hours smallint CHECK (included_hours IS NULL OR included_hours BETWEEN 1 AND 24),
  car text CHECK (car IS NULL OR char_length(car) <= 80),
  days jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(days) = 'array'),
  tips jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(tips) = 'array' AND jsonb_array_length(tips) <= 5),
  change_set_id uuid REFERENCES change_sets (id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replaced', 'decided')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_plan_replies_price_currency_check
    CHECK ((price_per_day_minor IS NULL) = (currency IS NULL))
);
CREATE UNIQUE INDEX driver_plan_replies_open_key ON driver_plan_replies (share_id)
  WHERE status = 'open';
CREATE INDEX driver_plan_replies_trip_idx ON driver_plan_replies (trip_id, created_at DESC);
CREATE INDEX driver_plan_replies_change_set_idx ON driver_plan_replies (change_set_id)
  WHERE change_set_id IS NOT NULL;
CREATE TRIGGER driver_plan_replies_touch_updated_at BEFORE UPDATE ON driver_plan_replies
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE driver_plan_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_plan_replies FORCE ROW LEVEL SECURITY;
CREATE POLICY driver_plan_replies_select ON driver_plan_replies FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY driver_plan_replies_system ON driver_plan_replies FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON driver_plan_replies TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_plan_replies TO app_system;

-- A driver's suggestions arrive as a change set the crew votes on: its author is the link (an
-- external provider, never a member), and its trigger says where it came from. The error codes the
-- public page answers with join the catalogue, added to whatever the constraint lists now
-- (packages/db/test/permissions/cmd_results.test.ts cross-checks packages/domain).
DO $$
DECLARE
  current_values text[];
  merged text;
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('change_sets', 'change_sets_author_kind_check', 'author_kind', ARRAY['provider']),
      ('change_sets', 'change_sets_trigger_check', 'trigger', ARRAY['driver']),
      ('cmd_results', 'cmd_results_code_check', 'code', ARRAY['SHARE_EXPIRED', 'SHARE_REVOKED'])
    ) AS s (tbl, con, col, additions)
  LOOP
    SELECT array_agg(m[1] ORDER BY m[1]) INTO current_values
      FROM pg_constraint c,
           regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
     WHERE c.conname = spec.con AND c.conrelid = spec.tbl::regclass;
    SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
      FROM unnest(current_values || spec.additions) AS t;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', spec.tbl, spec.con);
    IF spec.col = 'code' THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I IS NULL OR %I IN (%s))',
        spec.tbl, spec.con, spec.col, spec.col, merged);
    ELSE
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I IN (%s))',
        spec.tbl, spec.con, spec.col, merged);
    END IF;
  END LOOP;
END
$$;
