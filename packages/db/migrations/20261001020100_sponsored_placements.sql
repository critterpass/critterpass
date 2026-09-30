-- Sponsored picks (docs/data-model.md §3.13, docs/product-decisions.md §1): an affiliate
-- partner's featured place, labelled SPONSORED, at most one per Explore list, contextual only
-- (destination + list + category, never the person), shown only where sponsored(u,t) holds.
--
-- RLS class R for reading, C0: every signed-in reader may read an active placement; only the ops
-- console writes one (as app_system). Impressions and clicks are daily counts per placement with
-- no user attached (RLS class S). The whole feature waits behind `explore.sponsored`, off until
-- the store "Contains ads" declaration and privacy label are filed.

CREATE TABLE sponsored_placements (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  partner text NOT NULL CHECK (partner ~ '^[a-z0-9_]{2,40}$'),
  poi_id uuid NOT NULL REFERENCES pois (id),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  -- The partner's product for the bridge link on a click; never the partner's content.
  offer_ref text CHECK (char_length(offer_ref) BETWEEN 1 AND 200),
  list_kinds text[] NOT NULL CHECK (
    cardinality(list_kinds) BETWEEN 1 AND 3
    AND list_kinds <@ ARRAY['picks', 'map_carousel', 'search']::text[]
  ),
  -- Empty: any category of the list.
  categories text[] NOT NULL DEFAULT '{}' CHECK (cardinality(categories) <= 12),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  impression_cap integer CHECK (impression_cap > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX sponsored_placements_live_idx ON sponsored_placements (destination_id, starts_at)
  WHERE status = 'active';
CREATE INDEX sponsored_placements_poi_idx ON sponsored_placements (poi_id);
CREATE TRIGGER sponsored_placements_touch_updated_at BEFORE UPDATE ON sponsored_placements
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE sponsored_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsored_placements FORCE ROW LEVEL SECURITY;
CREATE POLICY sponsored_placements_read ON sponsored_placements FOR SELECT TO app_user
  USING (status = 'active');
CREATE POLICY sponsored_placements_system ON sponsored_placements FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY sponsored_placements_admin_reader ON sponsored_placements FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT ON sponsored_placements TO app_user;
GRANT SELECT, INSERT, UPDATE ON sponsored_placements TO app_system;
GRANT SELECT ON sponsored_placements TO admin_reader;
REVOKE ALL ON sponsored_placements FROM guide_reader, powersync_repl;

-- One row per placement, day, list and kind: a count, never a person.
CREATE TABLE sponsored_event_counts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  placement_id uuid NOT NULL REFERENCES sponsored_placements (id),
  day date NOT NULL,
  list_kind text NOT NULL CHECK (list_kind IN ('picks', 'map_carousel', 'search')),
  kind text NOT NULL CHECK (kind IN ('impression', 'click')),
  count bigint NOT NULL DEFAULT 0 CHECK (count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsored_event_counts_key UNIQUE (placement_id, day, list_kind, kind)
);
CREATE TRIGGER sponsored_event_counts_touch_updated_at BEFORE UPDATE ON sponsored_event_counts
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE sponsored_event_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsored_event_counts FORCE ROW LEVEL SECURITY;
CREATE POLICY sponsored_event_counts_system ON sponsored_event_counts FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY sponsored_event_counts_admin_reader ON sponsored_event_counts FOR SELECT
  TO admin_reader USING (true);
GRANT SELECT, INSERT, UPDATE ON sponsored_event_counts TO app_system;
GRANT SELECT ON sponsored_event_counts TO admin_reader;
REVOKE ALL ON sponsored_event_counts FROM guide_reader, powersync_repl;

-- The switch, public so the app can hide the "Why am I seeing this?" entry points too.
INSERT INTO ops.ops_config (key, value, is_public)
VALUES ('explore.sponsored', 'false'::jsonb, true)
ON CONFLICT (key) DO NOTHING;
