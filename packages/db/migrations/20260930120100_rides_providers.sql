-- Trip providers (docs/data-model.md §3.7): the driver, stay, restaurant, spa, clinic, tour guide
-- or boat a crew deals with on a trip, added by a member or the ops desk. The contact (phone,
-- WhatsApp, email) is an AES-256-GCM envelope from packages/db/src/crypto that app_user cannot
-- select; members read it decrypted through the api.
--
-- RLS class T (read), C1; writes go through command handlers as app_system.
CREATE TABLE providers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  kind text NOT NULL
    CHECK (kind IN ('driver', 'stay', 'restaurant', 'spa', 'clinic', 'tour_guide', 'boat')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  contact_enc text CHECK (char_length(contact_enc) <= 4000),
  -- Plate, colour and model for a driver; validated in packages/domain.
  vehicle jsonb CHECK (vehicle IS NULL OR (jsonb_typeof(vehicle) = 'object'
    AND pg_column_size(vehicle) <= 2048)),
  policies text CHECK (char_length(policies) <= 2000),
  added_by uuid REFERENCES users (id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX providers_trip_id_idx ON providers (trip_id);
CREATE INDEX providers_added_by_idx ON providers (added_by) WHERE added_by IS NOT NULL;
CREATE TRIGGER providers_touch_updated_at BEFORE UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers FORCE ROW LEVEL SECURITY;
CREATE POLICY providers_select ON providers FOR SELECT TO app_user
  USING (deleted_at IS NULL AND app.is_trip_member(trip_id));
CREATE POLICY providers_system ON providers FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT (id, trip_id, kind, name, vehicle, policies, added_by, deleted_at, version,
  created_at, updated_at) ON providers TO app_user;
GRANT SELECT, INSERT, UPDATE ON providers TO app_system;

-- Ops console reads (non-C3 columns, generated from the privacy map).
GRANT SELECT (added_by, contact_enc, created_at, deleted_at, id, kind, name, policies, trip_id,
  updated_at, vehicle, version) ON providers TO admin_reader;
CREATE POLICY providers_admin_reader ON providers FOR SELECT TO admin_reader USING (true);

-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList. The trip stream selects its columns
-- explicitly, so the contact envelope never reaches a device through sync.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'providers'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE providers;
  END IF;
END
$$;
GRANT SELECT ON providers TO powersync_repl;
