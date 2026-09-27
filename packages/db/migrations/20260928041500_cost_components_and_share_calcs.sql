-- The persisted price truth of a trip (docs/data-model.md §3.4 `cost_components`, `share_calcs`,
-- plus `trip_share_totals`). All three are written only by the `cost.recompute` job (app_system)
-- from `@cp/cost-engine`; CHECK lists are copied from packages/cost-engine/src/quotes/quote-set.ts.
--
-- Privacy: a member's `share_calcs` row carries their own lines and personal option deltas (C2)
-- and is readable by that member only. Everyone else in the trip sees the member's total through
-- `trip_share_totals` (C1), a real table rather than a view because PowerSync logical replication
-- cannot carry views.

-- The components of the trip's current calc; the job replaces the set whenever its inputs change.
CREATE TABLE cost_components (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  calc_version text NOT NULL,
  component_key text NOT NULL,
  kind text NOT NULL,
  unit text NOT NULL,
  is_shared boolean NOT NULL,
  origin text,
  member_ids uuid[],
  amount_minor bigint,
  currency text NOT NULL,
  source text NOT NULL,
  quote_id uuid REFERENCES price_quotes (id),
  label text,
  seen_at timestamptz NOT NULL,
  frozen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, component_key)
);
ALTER TABLE cost_components ADD CONSTRAINT cost_components_kind_check
  CHECK (kind IN ('flight', 'stay', 'activity', 'transfer', 'food', 'fun'));
ALTER TABLE cost_components ADD CONSTRAINT cost_components_unit_check
  CHECK (unit IN ('person', 'room', 'group'));
ALTER TABLE cost_components ADD CONSTRAINT cost_components_source_check
  CHECK (source IN ('travelpayouts', 'viator', 'user', 'estimate', 'editorial', 'booking'));
ALTER TABLE cost_components ADD CONSTRAINT cost_components_currency_check
  CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE cost_components ADD CONSTRAINT cost_components_amount_check
  CHECK (amount_minor IS NULL OR amount_minor >= 0);
CREATE INDEX cost_components_quote_id_idx ON cost_components (quote_id);
CREATE TRIGGER cost_components_touch_updated_at BEFORE UPDATE ON cost_components
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE cost_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_components FORCE ROW LEVEL SECURITY;
CREATE POLICY cost_components_select ON cost_components FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY cost_components_system ON cost_components FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON cost_components TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON cost_components TO app_system;

-- One row per member per calc version (history kept for audit and for "was $1,310").
CREATE TABLE share_calcs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  version text NOT NULL,
  components jsonb NOT NULL,
  personal_option_deltas jsonb NOT NULL DEFAULT '[]',
  total_minor bigint NOT NULL,
  currency text NOT NULL,
  fx_snapshot_id uuid REFERENCES fx_snapshots (id),
  is_missing boolean NOT NULL DEFAULT false,
  is_estimated_origin boolean NOT NULL DEFAULT false,
  is_stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id, version)
);
ALTER TABLE share_calcs ADD CONSTRAINT share_calcs_currency_check CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE share_calcs ADD CONSTRAINT share_calcs_json_check
  CHECK (jsonb_typeof(components) = 'array' AND jsonb_typeof(personal_option_deltas) = 'array');
CREATE INDEX share_calcs_user_id_idx ON share_calcs (user_id);
CREATE INDEX share_calcs_fx_snapshot_id_idx ON share_calcs (fx_snapshot_id);
CREATE TRIGGER share_calcs_touch_updated_at BEFORE UPDATE ON share_calcs
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE share_calcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_calcs FORCE ROW LEVEL SECURITY;
CREATE POLICY share_calcs_select ON share_calcs FOR SELECT TO app_user
  USING (user_id = app.uid() AND app.is_trip_member(trip_id));
CREATE POLICY share_calcs_system ON share_calcs FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON share_calcs TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON share_calcs TO app_system;

-- Each member's current total, visible to the whole trip; never the lines behind it.
CREATE TABLE trip_share_totals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  total_minor bigint NOT NULL,
  currency text NOT NULL,
  calc_version text NOT NULL,
  is_missing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id)
);
ALTER TABLE trip_share_totals ADD CONSTRAINT trip_share_totals_currency_check
  CHECK (currency ~ '^[A-Z]{3}$');
CREATE INDEX trip_share_totals_user_id_idx ON trip_share_totals (user_id);
CREATE TRIGGER trip_share_totals_touch_updated_at BEFORE UPDATE ON trip_share_totals
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE trip_share_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_share_totals FORCE ROW LEVEL SECURITY;
CREATE POLICY trip_share_totals_select ON trip_share_totals FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY trip_share_totals_system ON trip_share_totals FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON trip_share_totals TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_share_totals TO app_system;

-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cost_components', 'share_calcs', 'trip_share_totals'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
    EXECUTE format('GRANT SELECT ON %I TO powersync_repl', t);
  END LOOP;
END
$$;
