-- Location sharing and POI visits (docs/data-model.md §3.12 `location_shares`, `location_fixes`,
-- `member_etas`; §3.9 `visits`).
--
-- Privacy: fixes are C3 and live for minutes. app_user holds no SELECT on them at all; a viewer
-- reads a share's fixes only through `app.shared_location_fixes`, which checks
-- `app.can_see_location` (share active, viewer a participant of the trip, reason allows). Visits
-- are C3 too: owner-only, POI-level (no coordinates), never published, never in `llm`, deleted on
-- TTL. Neither table is ever in the PowerSync publication.

-- ---------------------------------------------------------------------------------------------
-- location_shares: one window per member and reason (crew map, Help, SOS). `ends_at` null = until
-- resolved (an open SOS).
CREATE TABLE location_shares (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  reason text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  paused boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE location_shares ADD CONSTRAINT location_shares_reason_check
  CHECK (reason IN ('crew_map', 'help', 'sos'));
ALTER TABLE location_shares ADD CONSTRAINT location_shares_window_check
  CHECK (ends_at IS NULL OR ends_at > starts_at);
CREATE INDEX location_shares_trip_reason_idx ON location_shares (trip_id, reason);
CREATE INDEX location_shares_user_id_idx ON location_shares (user_id);
CREATE TRIGGER location_shares_touch_updated_at BEFORE UPDATE ON location_shares
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE location_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_shares FORCE ROW LEVEL SECURITY;
CREATE POLICY location_shares_select ON location_shares FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY location_shares_insert ON location_shares FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.is_trip_member(trip_id));
CREATE POLICY location_shares_update ON location_shares FOR UPDATE TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY location_shares_system ON location_shares FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON location_shares TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON location_shares TO app_system;

-- ---------------------------------------------------------------------------------------------
-- location_fixes: written by `POST /v1/loc` only while the writer's share is active; purged by
-- `location.fixes_ttl` after 15 minutes (an SOS share's fixes stay until it resolves + 24 h).
CREATE TABLE location_fixes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  share_id uuid NOT NULL REFERENCES location_shares (id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy_m real NOT NULL,
  activity text NOT NULL DEFAULT 'unknown',
  mock_flags smallint NOT NULL DEFAULT 0,
  at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE location_fixes ADD CONSTRAINT location_fixes_coords_check
  CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180 AND accuracy_m >= 0);
ALTER TABLE location_fixes ADD CONSTRAINT location_fixes_activity_check
  CHECK (activity IN ('unknown', 'stationary', 'walking', 'running', 'cycling', 'automotive'));
ALTER TABLE location_fixes ADD CONSTRAINT location_fixes_mock_flags_check
  CHECK (mock_flags BETWEEN 0 AND 7);
CREATE INDEX location_fixes_share_at_idx ON location_fixes (share_id, at DESC);
CREATE INDEX location_fixes_created_at_idx ON location_fixes (created_at);
CREATE INDEX location_fixes_user_id_idx ON location_fixes (user_id);
CREATE INDEX location_fixes_trip_id_idx ON location_fixes (trip_id);
ALTER TABLE location_fixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_fixes FORCE ROW LEVEL SECURITY;

-- The caller's own share, open right now (a paused crew-map share takes no fixes; Help and SOS
-- ignore pause).
CREATE OR REPLACE FUNCTION app.is_own_active_share(share uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM location_shares s
    WHERE s.id = share AND s.user_id = app.uid()
      AND s.starts_at <= now() AND (s.ends_at IS NULL OR s.ends_at > now())
      AND (NOT s.paused OR s.reason IN ('help', 'sos'))
  )
$$;

-- Whether the caller may see the fixes of `share`: the share is open, the caller is its owner or a
-- participant of its trip (not answered `out`, still in the crew), and the reason allows it: Help
-- and SOS always, the crew map only while the trip is boosted.
CREATE OR REPLACE FUNCTION app.can_see_location(share uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM location_shares s
    WHERE s.id = share
      AND s.starts_at <= now() AND (s.ends_at IS NULL OR s.ends_at > now())
      AND (NOT s.paused OR s.reason IN ('help', 'sos'))
      AND (
        s.user_id = app.uid()
        OR (
          app.is_trip_member(s.trip_id)
          AND EXISTS (
            SELECT 1 FROM trip_participants p
            WHERE p.trip_id = s.trip_id AND p.user_id = app.uid()
              AND (p.rsvp <> 'out' OR p.role = 'organiser')
          )
        )
      )
      AND (
        s.reason IN ('help', 'sos')
        OR EXISTS (
          SELECT 1 FROM trip_entitlements e WHERE e.trip_id = s.trip_id AND e.boost_active
        )
      )
  )
$$;

-- The only read path to fixes: the latest fixes of one visible share, newest first.
CREATE OR REPLACE FUNCTION app.shared_location_fixes(share uuid, max_rows integer DEFAULT 20)
RETURNS TABLE (
  user_id uuid, lat double precision, lng double precision, accuracy_m real, activity text,
  mock_flags smallint, at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT f.user_id, f.lat, f.lng, f.accuracy_m, f.activity, f.mock_flags, f.at
  FROM location_fixes f
  WHERE f.share_id = share AND app.can_see_location(share)
  ORDER BY f.at DESC
  LIMIT least(greatest(max_rows, 1), 200)
$$;

REVOKE ALL ON FUNCTION app.is_own_active_share(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.can_see_location(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.shared_location_fixes(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_own_active_share(uuid) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.can_see_location(uuid) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.shared_location_fixes(uuid, integer) TO app_user, app_system;

CREATE POLICY location_fixes_insert ON location_fixes FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.is_own_active_share(share_id));
CREATE POLICY location_fixes_system ON location_fixes FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT INSERT ON location_fixes TO app_user;
GRANT SELECT, INSERT, DELETE ON location_fixes TO app_system;

-- ---------------------------------------------------------------------------------------------
-- member_etas: system-computed ETA per member (crew map meetups, Help sessions); realtime only,
-- never synced. `meetup_id` references `meetups` once that table exists.
CREATE TABLE member_etas (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  meetup_id uuid,
  user_id uuid NOT NULL REFERENCES users (id),
  distance_m integer,
  eta_min integer,
  mode text,
  status_text text,
  progress real,
  sharing text NOT NULL DEFAULT 'off',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id)
);
ALTER TABLE member_etas ADD CONSTRAINT member_etas_sharing_check
  CHECK (sharing IN ('live', 'paused', 'off'));
ALTER TABLE member_etas ADD CONSTRAINT member_etas_mode_check
  CHECK (mode IS NULL OR mode IN ('pedestrian', 'motor_scooter', 'auto', 'multimodal'));
ALTER TABLE member_etas ADD CONSTRAINT member_etas_values_check
  CHECK ((distance_m IS NULL OR distance_m >= 0) AND (eta_min IS NULL OR eta_min >= 0)
    AND (progress IS NULL OR progress BETWEEN 0 AND 1));
CREATE INDEX member_etas_user_id_idx ON member_etas (user_id);
CREATE TRIGGER member_etas_touch_updated_at BEFORE UPDATE ON member_etas
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE member_etas ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_etas FORCE ROW LEVEL SECURITY;
CREATE POLICY member_etas_select ON member_etas FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY member_etas_system ON member_etas FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON member_etas TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON member_etas TO app_system;

-- ---------------------------------------------------------------------------------------------
-- visits: POI-level check-ins, opt-in (`consents.purpose = 'visit_detection'` for detected ones).
-- The id is the client's UUIDv7 so a replayed or re-queued `record_visit` lands on one row.
-- `expires_at` is set when the trip is archived (+30 d) by `visits.ttl`, which also deletes.
CREATE TABLE visits (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  poi_id uuid NOT NULL REFERENCES pois (id),
  source text NOT NULL,
  arrived_at timestamptz NOT NULL,
  left_at timestamptz,
  detection_version smallint NOT NULL DEFAULT 1,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE visits ADD CONSTRAINT visits_source_check
  CHECK (source IN ('geofence', 'expense', 'manual'));
ALTER TABLE visits ADD CONSTRAINT visits_window_check
  CHECK (left_at IS NULL OR left_at >= arrived_at);
CREATE INDEX visits_user_trip_idx ON visits (user_id, trip_id);
CREATE INDEX visits_trip_id_idx ON visits (trip_id);
CREATE INDEX visits_poi_id_idx ON visits (poi_id);
CREATE INDEX visits_expires_at_idx ON visits (expires_at) WHERE expires_at IS NOT NULL;
CREATE TRIGGER visits_touch_updated_at BEFORE UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits FORCE ROW LEVEL SECURITY;
CREATE POLICY visits_owner_select ON visits FOR SELECT TO app_user USING (user_id = app.uid());
-- A detected visit also needs the owner's live visit consent (backstop to the command's check).
CREATE POLICY visits_owner_insert ON visits FOR INSERT TO app_user
  WITH CHECK (
    user_id = app.uid()
    AND app.is_trip_participant(trip_id)
    AND (
      source <> 'geofence'
      OR EXISTS (
        SELECT 1 FROM consents c
        WHERE c.user_id = app.uid() AND c.purpose = 'visit_detection'
          AND c.granted_at IS NOT NULL AND c.revoked_at IS NULL
      )
    )
  );
CREATE POLICY visits_owner_update ON visits FOR UPDATE TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY visits_system ON visits FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON visits TO app_user;
GRANT UPDATE (left_at) ON visits TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON visits TO app_system;

-- Owners delete their own visits (app_user never holds DELETE on any table).
CREATE OR REPLACE FUNCTION app.delete_own_visit(visit uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH gone AS (DELETE FROM visits WHERE id = visit AND user_id = app.uid() RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM gone)
$$;
REVOKE ALL ON FUNCTION app.delete_own_visit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.delete_own_visit(uuid) TO app_user;

-- ---------------------------------------------------------------------------------------------
-- domain_events: the device permission mirror and visit events join the catalogue
-- (packages/domain/src/events/catalogue.ts).
ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (
  'crew.member_joined', 'crew.member_left', 'crew.member_removed',
  'trip.created', 'trip.status_changed',
  'plan.version_created',
  'change_set.proposed', 'change_set.applied', 'change_set.reverted', 'change_set.rejected',
  'rsvp.changed',
  'auth.merged',
  'invite.opened', 'attribution.claimed',
  'guide_action.undone',
  'fare.dropped', 'forecast.changed', 'hazard.changed',
  'moderation.decided',
  'entitlement.granted', 'entitlement.revoked',
  'device.permissions_changed', 'visit.recorded'
));

-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList: only `location_shares`.
-- `location_fixes`, `visits` (C3) and `member_etas` (realtime only) stay out.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'location_shares'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE location_shares;
  END IF;
  GRANT SELECT ON location_shares TO powersync_repl;
END
$$;
