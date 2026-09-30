-- Flight status (docs/data-model.md §3.7): one row per flight segment of a flight booking, with the
-- scheduled times from the booking and whatever the status providers (FlightAware AeroAPI alerts,
-- AeroDataBox schedule polls) or the traveller's own "landed" report said since. Crewmates see a
-- personal flight's number and times unless its owner opted out; co-travellers are the crew's
-- segments with the same carrier, number and scheduled departure.

CREATE TABLE flight_segments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  booking_id uuid NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  owner_id uuid NOT NULL REFERENCES users (id),
  crew_visible boolean NOT NULL,
  segment_no smallint NOT NULL DEFAULT 1 CHECK (segment_no BETWEEN 1 AND 8),
  carrier text NOT NULL CHECK (carrier ~ '^[A-Z0-9]{2,3}$'),
  flight_no text NOT NULL CHECK (flight_no ~ '^[0-9]{1,4}[A-Z]?$'),
  dep_airport char(3) NOT NULL CHECK (dep_airport ~ '^[A-Z]{3}$'),
  arr_airport char(3) NOT NULL CHECK (arr_airport ~ '^[A-Z]{3}$'),
  sched_dep_at timestamptz NOT NULL,
  sched_arr_at timestamptz,
  est_dep_at timestamptz,
  est_arr_at timestamptz,
  act_dep_at timestamptz,
  act_arr_at timestamptz,
  -- Boarding as the airline announced it, else departure − 40 min labelled as an estimate.
  boarding_at timestamptz,
  boarding_estimated boolean NOT NULL DEFAULT true,
  gate text CHECK (char_length(gate) <= 8),
  terminal text CHECK (char_length(terminal) <= 8),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'on_time', 'delayed', 'boarding', 'departed', 'landed',
                      'cancelled', 'diverted')),
  delay_min integer CHECK (delay_min BETWEEN -1440 AND 10080),
  status_source text NOT NULL DEFAULT 'schedule'
    CHECK (status_source IN ('aerodatabox', 'flightaware', 'manual', 'schedule')),
  status_at timestamptz,
  la_phase text CHECK (la_phase IN ('check_in', 'boarding', 'departed', 'landed', 'pickup')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, segment_no)
);
CREATE INDEX flight_segments_flight_idx ON flight_segments (carrier, flight_no, sched_dep_at);
CREATE INDEX flight_segments_trip_id_idx ON flight_segments (trip_id);
CREATE INDEX flight_segments_owner_id_idx ON flight_segments (owner_id);
CREATE TRIGGER flight_segments_touch_updated_at BEFORE UPDATE ON flight_segments
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- flight_watches: a provider subscription for one segment (an AeroAPI alert id, or the AeroDataBox
-- poll schedule), live until the flight landed a day ago. One alert may serve several travellers
-- on the same flight, so the alert id is indexed, not unique.
CREATE TABLE flight_watches (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  flight_segment_id uuid NOT NULL REFERENCES flight_segments (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('flightaware', 'aerodatabox')),
  provider_alert_id text NOT NULL CHECK (char_length(provider_alert_id) BETWEEN 1 AND 128),
  provider_flight_id text CHECK (char_length(provider_flight_id) <= 128),
  active_until timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flight_segment_id, provider)
);
CREATE INDEX flight_watches_alert_idx ON flight_watches (provider, provider_alert_id);
CREATE INDEX flight_watches_active_idx ON flight_watches (active_until) WHERE ended_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- Row-level security. Segments: the owner, and the trip's crew when crew-visible (RLS T). Watches
-- are the server's (RLS S).
ALTER TABLE flight_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_segments FORCE ROW LEVEL SECURITY;
CREATE POLICY flight_segments_select ON flight_segments FOR SELECT TO app_user
  USING (owner_id = app.uid() OR (crew_visible AND app.is_trip_member(trip_id)));
CREATE POLICY flight_segments_system ON flight_segments FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON flight_segments TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON flight_segments TO app_system;

ALTER TABLE flight_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_watches FORCE ROW LEVEL SECURITY;
CREATE POLICY flight_watches_system ON flight_watches FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON flight_watches TO app_system;
REVOKE ALL ON flight_watches FROM guide_reader, powersync_repl;

-- Ops console reads (non-C3 columns, generated from the privacy map).
GRANT SELECT (act_arr_at, act_dep_at, arr_airport, booking_id, boarding_at, boarding_estimated,
  carrier, created_at, crew_visible, delay_min, dep_airport, est_arr_at, est_dep_at, flight_no, gate,
  id, la_phase, owner_id, sched_arr_at, sched_dep_at, segment_no, status, status_at, status_source,
  terminal, trip_id, updated_at, version) ON flight_segments TO admin_reader;
CREATE POLICY flight_segments_admin_reader ON flight_segments FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT (active_until, created_at, ended_at, flight_segment_id, id, provider, provider_alert_id,
  provider_flight_id) ON flight_watches TO admin_reader;
CREATE POLICY flight_watches_admin_reader ON flight_watches FOR SELECT TO admin_reader USING (true);

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'flight_segments'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE flight_segments;
  END IF;
END
$$;
GRANT SELECT ON flight_segments TO powersync_repl;
