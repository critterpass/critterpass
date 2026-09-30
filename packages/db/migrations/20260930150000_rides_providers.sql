-- Rides (docs/data-model.md §3.7, 3h-3): Grab's fare estimates as the traveller saw them and the
-- rides a crew logged afterwards. We never book or track a car: a quote is Grab's own estimate with
-- its deep link, and a ride row is what someone logged after the trip (with its split expense).
--
-- Both are RLS class T (read), C1, and ride the trip stream; every write goes through the api as
-- app_system (the quote route and `log_ride`).

-- ---------------------------------------------------------------------------------------------
-- ride_quotes: one Grab Farefeed estimate (the lead service), kept 7 days so the card can show the
-- last quote offline with its time. The pickup is a place id or nothing (the phone's position is
-- never stored).
CREATE TABLE ride_quotes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  provider text NOT NULL CHECK (provider IN ('grab')),
  from_poi_id uuid REFERENCES pois (id),
  to_poi_id uuid NOT NULL REFERENCES pois (id),
  service_name text NOT NULL CHECK (char_length(service_name) BETWEEN 1 AND 80),
  fare_low_minor bigint NOT NULL CHECK (fare_low_minor >= 0),
  fare_high_minor bigint NOT NULL CHECK (fare_high_minor >= fare_low_minor),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  eta_min integer NOT NULL CHECK (eta_min BETWEEN 0 AND 600),
  surge text NOT NULL DEFAULT 'none' CHECK (surge IN ('none', 'low', 'high', 'fractional')),
  fetched_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ride_quotes_trip_fetched_idx ON ride_quotes (trip_id, fetched_at DESC);
CREATE INDEX ride_quotes_user_id_idx ON ride_quotes (user_id);
CREATE INDEX ride_quotes_from_poi_idx ON ride_quotes (from_poi_id) WHERE from_poi_id IS NOT NULL;
CREATE INDEX ride_quotes_to_poi_idx ON ride_quotes (to_poi_id);
ALTER TABLE ride_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_quotes FORCE ROW LEVEL SECURITY;
CREATE POLICY ride_quotes_select ON ride_quotes FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY ride_quotes_system ON ride_quotes FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON ride_quotes TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ride_quotes TO app_system;
GRANT SELECT ON ride_quotes TO admin_reader;
CREATE POLICY ride_quotes_admin_reader ON ride_quotes FOR SELECT TO admin_reader USING (true);

-- ---------------------------------------------------------------------------------------------
-- rides: a leg someone logged ("LOG IT" after the ride). One row per ride id the app chose; the
-- expense it created, if any, is linked so the budget counts it once.
CREATE TABLE rides (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  leg_ref text NOT NULL CHECK (char_length(leg_ref) BETWEEN 1 AND 120),
  provider text NOT NULL
    CHECK (provider IN ('grab', 'gojek', 'uber', 'taxi', 'transfer', 'driver')),
  mode text NOT NULL
    CHECK (mode IN ('app_link', 'grab_estimate', 'transfer_booking', 'guide_driver', 'street')),
  provider_id uuid REFERENCES providers (id),
  booking_id uuid REFERENCES bookings (id),
  quote_id uuid REFERENCES ride_quotes (id) ON DELETE SET NULL,
  eta_text text CHECK (char_length(eta_text) <= 40),
  status text NOT NULL DEFAULT 'logged' CHECK (status IN ('logged')),
  price_minor bigint CHECK (price_minor > 0),
  currency char(3) CHECK (currency ~ '^[A-Z]{3}$'),
  expense_id uuid REFERENCES expenses (id),
  attendee_ids uuid[] NOT NULL DEFAULT '{}'::uuid[] CHECK (cardinality(attendee_ids) BETWEEN 1 AND 16),
  logged_by uuid NOT NULL REFERENCES users (id),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((price_minor IS NULL) = (currency IS NULL)),
  CHECK (expense_id IS NULL OR price_minor IS NOT NULL)
);
CREATE INDEX rides_trip_id_idx ON rides (trip_id);
CREATE INDEX rides_logged_by_idx ON rides (logged_by);
CREATE INDEX rides_provider_id_idx ON rides (provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX rides_booking_id_idx ON rides (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX rides_quote_id_idx ON rides (quote_id) WHERE quote_id IS NOT NULL;
CREATE UNIQUE INDEX rides_expense_id_idx ON rides (expense_id) WHERE expense_id IS NOT NULL;
CREATE TRIGGER rides_touch_updated_at BEFORE UPDATE ON rides
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides FORCE ROW LEVEL SECURITY;
CREATE POLICY rides_select ON rides FOR SELECT TO app_user USING (app.is_trip_member(trip_id));
CREATE POLICY rides_system ON rides FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON rides TO app_user;
GRANT SELECT, INSERT, UPDATE ON rides TO app_system;
GRANT SELECT ON rides TO admin_reader;
CREATE POLICY rides_admin_reader ON rides FOR SELECT TO admin_reader USING (true);

-- ---------------------------------------------------------------------------------------------
-- Grab Farefeed waits on Grab's partner approval: its switch starts off, and the app shows plain
-- "Open Grab" links and the phrase card until the console turns it on.
ALTER TABLE ops.partner_adapters DROP CONSTRAINT partner_adapters_partner_check;
ALTER TABLE ops.partner_adapters ADD CONSTRAINT partner_adapters_partner_check CHECK (partner IN (
  'agoda_demand', 'klook_activity', 'trip_com_at', 'viator_booking', 'gyg_api', 'grab_farefeed',
  'whatsapp_business'
));
INSERT INTO ops.partner_adapters (partner, enabled, copy_mode, approved_at)
VALUES ('grab_farefeed', false, 'link', NULL)
ON CONFLICT (partner) DO NOTHING;
INSERT INTO ops.ops_config (key, value, is_public)
SELECT 'supplier.' || partner || '.' || field, value, true
FROM ops.partner_adapters,
  LATERAL (VALUES ('enabled', to_jsonb(enabled)), ('copy_mode', to_jsonb(copy_mode))) AS f (field, value)
WHERE partner = 'grab_farefeed'
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- The ride events join the catalogue (packages/domain/src/suppliers/events.ts), added to whatever
-- the constraint lists now so a sibling migration's types are kept.
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
    FROM unnest(current_values || ARRAY['ride.logged']) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList: quotes and rides ride the trip stream.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY['ride_quotes', 'rides'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON ride_quotes, rides TO powersync_repl;
