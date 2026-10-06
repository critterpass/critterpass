-- Finding a driver (docs/data-model.md §3.7, 6a–6f): what a member shared to be read into a driver
-- card, each candidate driver's quoted terms, the days a driver is set on, and each member's "not
-- now" on a day that needs one. Users bring drivers in; we never read or post to groups, and every
-- WhatsApp message is sent by the user from their own app.
--
-- Every write goes through the api as app_system (the driver commands).

-- ---------------------------------------------------------------------------------------------
-- provider_intake: RLS class S, C2. A pasted message, a screenshot's text or a contact card, kept
-- until it is read and then 30 days (the purge job). It carries a third party's phone number, so
-- app_user has no grant and the table is never published: members read it through the api.
CREATE TABLE provider_intake (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  shared_by uuid NOT NULL REFERENCES users (id),
  kind text NOT NULL CHECK (kind IN ('text', 'link', 'image', 'contact')),
  raw_text text CHECK (char_length(raw_text) <= 8000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'parsed', 'failed', 'used')),
  parsed jsonb CHECK (parsed IS NULL OR (jsonb_typeof(parsed) = 'object'
    AND pg_column_size(parsed) <= 16384)),
  provider_id uuid REFERENCES providers (id),
  parsed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_intake_trip_created_idx ON provider_intake (trip_id, created_at DESC);
CREATE INDEX provider_intake_shared_by_idx ON provider_intake (shared_by);
CREATE INDEX provider_intake_provider_id_idx ON provider_intake (provider_id)
  WHERE provider_id IS NOT NULL;
CREATE INDEX provider_intake_purge_idx ON provider_intake (parsed_at) WHERE raw_text IS NOT NULL;
CREATE TRIGGER provider_intake_touch_updated_at BEFORE UPDATE ON provider_intake
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE provider_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_intake FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_intake_system ON provider_intake FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON provider_intake TO app_system;
GRANT SELECT ON provider_intake TO admin_reader;
CREATE POLICY provider_intake_admin_reader ON provider_intake FOR SELECT TO admin_reader
  USING (true);

-- ---------------------------------------------------------------------------------------------
-- provider_terms: RLS class T (read), C1. A candidate driver's quoted terms, one row per driver
-- provider. `confirmed_fields` lists what the traveller checked against the source; nothing
-- reaches the crew's shortlist until every line is confirmed. A private tour keeps only its
-- product id and the price shown, never the supplier's words.
CREATE TABLE provider_terms (
  provider_id uuid PRIMARY KEY REFERENCES providers (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  source text NOT NULL CHECK (source IN ('found', 'private_tour', 'crews')),
  status text NOT NULL DEFAULT 'shortlisted' CHECK (status IN ('shortlisted', 'archived')),
  area text CHECK (char_length(area) <= 80),
  languages text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(languages) <= 8),
  car text CHECK (char_length(car) <= 80),
  seats integer CHECK (seats BETWEEN 1 AND 60),
  price_minor bigint CHECK (price_minor > 0),
  currency char(3) CHECK (currency ~ '^[A-Z]{3}$'),
  price_unit text CHECK (price_unit IN ('day', 'hours', 'trip', 'car', 'group')),
  included_hours numeric(4, 1) CHECK (included_hours > 0 AND included_hours <= 24),
  -- fuel, parking, tolls, entry: yes | no | unknown.
  includes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(includes) = 'object'
    AND pg_column_size(includes) <= 512),
  overtime_minor bigint CHECK (overtime_minor >= 0),
  licence_shown boolean,
  confirmed_fields text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(confirmed_fields) <= 16),
  supplier_ref text CHECK (char_length(supplier_ref) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((price_minor IS NULL) = (currency IS NULL)),
  CHECK (source <> 'private_tour' OR supplier_ref IS NOT NULL)
);
CREATE INDEX provider_terms_trip_id_idx ON provider_terms (trip_id);
CREATE TRIGGER provider_terms_touch_updated_at BEFORE UPDATE ON provider_terms
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE provider_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_terms FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_terms_select ON provider_terms FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY provider_terms_system ON provider_terms FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON provider_terms TO app_user;
GRANT SELECT, INSERT, UPDATE ON provider_terms TO app_system;
GRANT SELECT ON provider_terms TO admin_reader;
CREATE POLICY provider_terms_admin_reader ON provider_terms FOR SELECT TO admin_reader
  USING (true);

-- ---------------------------------------------------------------------------------------------
-- provider_assignments: RLS class T (read), C1. One driver per trip day (by date, so a new plan
-- version keeps it), with the window and the terms agreed. Set directly or by an applied crew vote
-- (`change_set_id`).
CREATE TABLE provider_assignments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  day_date date NOT NULL,
  provider_id uuid NOT NULL REFERENCES providers (id),
  window_start text CHECK (window_start ~ '^[0-2][0-9]:[0-5][0-9]$'),
  window_end text CHECK (window_end ~ '^[0-2][0-9]:[0-5][0-9]$'),
  pickup text CHECK (char_length(pickup) <= 200),
  agreed jsonb CHECK (agreed IS NULL OR (jsonb_typeof(agreed) = 'object'
    AND pg_column_size(agreed) <= 2048)),
  change_set_id uuid REFERENCES change_sets (id),
  assigned_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX provider_assignments_trip_day_uk ON provider_assignments (trip_id, day_date);
CREATE INDEX provider_assignments_provider_id_idx ON provider_assignments (provider_id);
CREATE INDEX provider_assignments_assigned_by_idx ON provider_assignments (assigned_by);
CREATE INDEX provider_assignments_change_set_idx ON provider_assignments (change_set_id)
  WHERE change_set_id IS NOT NULL;
CREATE TRIGGER provider_assignments_touch_updated_at BEFORE UPDATE ON provider_assignments
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE provider_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_assignments_select ON provider_assignments FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY provider_assignments_system ON provider_assignments FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON provider_assignments TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON provider_assignments TO app_system;
GRANT SELECT ON provider_assignments TO admin_reader;
CREATE POLICY provider_assignments_admin_reader ON provider_assignments FOR SELECT
  TO admin_reader USING (true);

-- ---------------------------------------------------------------------------------------------
-- pickup_gap_dismissals: RLS class O, C1. A member's NOT NOW on a day that needs a driver; the
-- card folds to a NO RIDE flag for them only.
CREATE TABLE pickup_gap_dismissals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  day_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pickup_gap_dismissals_uk ON pickup_gap_dismissals (user_id, trip_id, day_date);
CREATE INDEX pickup_gap_dismissals_trip_id_idx ON pickup_gap_dismissals (trip_id);
ALTER TABLE pickup_gap_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_gap_dismissals FORCE ROW LEVEL SECURITY;
CREATE POLICY pickup_gap_dismissals_select ON pickup_gap_dismissals FOR SELECT TO app_user
  USING (user_id = app.uid() AND app.is_trip_member(trip_id));
CREATE POLICY pickup_gap_dismissals_system ON pickup_gap_dismissals FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON pickup_gap_dismissals TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON pickup_gap_dismissals TO app_system;
GRANT SELECT ON pickup_gap_dismissals TO admin_reader;
CREATE POLICY pickup_gap_dismissals_admin_reader ON pickup_gap_dismissals FOR SELECT
  TO admin_reader USING (true);

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList: terms, assignments and the member's
-- own dismissals ride the trip stream; provider_intake is never published.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY['provider_terms', 'provider_assignments',
    'pickup_gap_dismissals'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON provider_terms, provider_assignments, pickup_gap_dismissals TO powersync_repl;
