-- Support tools: time-boxed entitlement grants resolved by the entitlement engine, admin_reader
-- reads for user lookup (join codes) and the device list, and the grant events.

-- ---------------------------------------------------------------------------------------------
-- ops.entitlement_grants: support's `grant_entitlement` / `revoke_entitlement`. Written by the
-- console's command pipeline as app_system, read by the console as admin_reader; the entitlement
-- loader reads active grants only through app.active_entitlement_grants below.
CREATE TABLE ops.entitlement_grants (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  perk text NOT NULL CHECK (perk IN ('pass_plus')),
  until timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text CHECK (length(revoke_reason) <= 500),
  CHECK (until > granted_at),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
CREATE INDEX entitlement_grants_active_idx ON ops.entitlement_grants (user_id, until)
  WHERE revoked_at IS NULL;
ALTER TABLE ops.entitlement_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.entitlement_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY entitlement_grants_system ON ops.entitlement_grants FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY entitlement_grants_admin_reader ON ops.entitlement_grants FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT, INSERT, UPDATE ON ops.entitlement_grants TO app_system;
GRANT SELECT ON ops.entitlement_grants TO admin_reader;

-- A user's active grants for the entitlement loader, from whichever role recomputes: app_system
-- for anyone, app_user only for themselves (a user transaction always carries app.uid).
CREATE OR REPLACE FUNCTION app.active_entitlement_grants(p_uid uuid)
RETURNS TABLE (perk text, until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT g.perk, g.until FROM ops.entitlement_grants g
  WHERE g.user_id = p_uid AND g.revoked_at IS NULL AND g.until > now()
    AND (app.uid() IS NULL OR app.uid() = p_uid)
  ORDER BY g.until DESC;
$$;
REVOKE EXECUTE ON FUNCTION app.active_entitlement_grants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.active_entitlement_grants(uuid) TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- admin_reader: join codes (support lookup by 6-character code) and devices (device list).
-- BEGIN GENERATED admin_reader grants
GRANT SELECT (app_version, attribution, bundle_id, capabilities, created_at, foreground, id, la_enabled, la_frequent, last_seen_at, locale, os_version, permission_state, platform, tz, updated_at, user_id) ON devices TO admin_reader;
CREATE POLICY devices_admin_reader ON devices FOR SELECT TO admin_reader USING (true);
GRANT SELECT (code, created_at, created_by, crew_id, expires_at, id, max_uses, status, target_id, target_kind, updated_at, uses) ON join_codes TO admin_reader;
CREATE POLICY join_codes_admin_reader ON join_codes FOR SELECT TO admin_reader USING (true);
-- END GENERATED admin_reader grants

-- ---------------------------------------------------------------------------------------------
-- domain_events: the support grant events join the catalogue (packages/domain/src/events/catalogue.ts).
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
  'entitlement.granted', 'entitlement.revoked'
));
