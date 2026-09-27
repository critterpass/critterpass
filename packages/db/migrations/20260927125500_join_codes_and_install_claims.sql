-- join_codes and the claim fields of install_attributions (docs/data-model.md §3.1, §3.2).

-- join_codes: RLS class M. Six-character codes over the ambiguity-safe alphabet
-- (packages/domain/src/links/codes.ts), pointing at a crew, a trip (via its crew) or a referrer.
-- Crew and trip codes carry crew_id so crew members can read them; a referral code has no crew and
-- is readable by its creator only. Writes belong to app_system (command handlers and jobs); anyone
-- outside the crew resolves a code only through app.lookup_join_code below.
CREATE TABLE join_codes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  code text NOT NULL CHECK (code ~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$'),
  target_kind text NOT NULL CHECK (target_kind IN ('crew', 'trip', 'referral')),
  target_id uuid NOT NULL,
  crew_id uuid REFERENCES crews (id),
  created_by uuid NOT NULL REFERENCES users (id),
  expires_at timestamptz,
  max_uses integer CHECK (max_uses > 0),
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired', 'exhausted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT join_codes_crew_matches_kind CHECK ((target_kind = 'referral') = (crew_id IS NULL))
);
-- A code is unique among live codes only, so a retired code's value can be minted again later.
CREATE UNIQUE INDEX join_codes_active_code_key ON join_codes (code) WHERE status = 'active';
CREATE INDEX join_codes_crew_id_idx ON join_codes (crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX join_codes_created_by_idx ON join_codes (created_by);
CREATE TRIGGER join_codes_touch_updated_at BEFORE UPDATE ON join_codes
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE join_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE join_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY join_codes_member_read ON join_codes FOR SELECT TO app_user
  USING ((crew_id IS NOT NULL AND app.is_crew_member(crew_id)) OR created_by = app.uid());
CREATE POLICY join_codes_system ON join_codes FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON join_codes TO app_user;
GRANT SELECT, INSERT, UPDATE ON join_codes TO app_system;

-- The only way a non-member reads a code: the live code's public subset, nothing about who made
-- it or how often it was used, and no row at all once it is revoked, expired or used up. Reading
-- never counts as a use.
CREATE OR REPLACE FUNCTION app.lookup_join_code(lookup_code text)
RETURNS TABLE (code text, target_kind text, target_id uuid, crew_id uuid, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT jc.code, jc.target_kind, jc.target_id, jc.crew_id, jc.expires_at
    FROM join_codes jc
   WHERE jc.code = lookup_code
     AND jc.status = 'active'
     AND (jc.expires_at IS NULL OR jc.expires_at > now())
     AND (jc.max_uses IS NULL OR jc.uses < jc.max_uses)
$$;
REVOKE EXECUTE ON FUNCTION app.lookup_join_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lookup_join_code(text) TO app_user, app_system;

-- PowerSync publication (docs/code-standards.md §13): crew members sync their crew's codes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'join_codes'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE join_codes;
  END IF;
END
$$;
GRANT SELECT ON join_codes TO powersync_repl;

-- install_attributions claim fields: how the install was attributed (`via`), the link it was
-- claimed from and that link's kind. Still RLS class S: no app_user grant.
ALTER TABLE install_attributions
  ADD COLUMN via text CHECK (via IN ('referrer', 'paste', 'code', 'phone', 'clip', 'link')),
  ADD COLUMN claimed_url text,
  ADD COLUMN link_kind text CHECK (
    link_kind IN ('invite', 'plan_share', 'referral', 'plan', 'guide', 'locals', 'app')
  );

-- Keep in sync with packages/domain/src/events/catalogue.ts#DOMAIN_EVENT_TYPES: the first human
-- open of an invite link and a device's install attribution claim.
ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (
  'crew.member_joined', 'crew.member_left', 'crew.member_removed',
  'trip.created', 'trip.status_changed',
  'plan.version_created',
  'change_set.proposed', 'change_set.applied', 'change_set.reverted', 'change_set.rejected',
  'rsvp.changed',
  'auth.merged',
  'invite.opened', 'attribution.claimed'
));
