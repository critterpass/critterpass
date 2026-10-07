-- A trip recap's public link (docs/data-model.md §3.10, docs/api-contracts.md §5.6
-- `GET /v1/public/recap/{token}`): the page behind `/rc/{token}`.

-- ---------------------------------------------------------------------------------------------
-- recap_links: RLS class T (the recap's viewers), C2 (`token_hash` C3). Only the hash of the token
-- is kept; the token itself is shown once, to the traveller who made the link. Nobody writes a
-- link directly: the `create_recap_link` and `revoke_recap_link` commands do, as the system.
CREATE TABLE recap_links (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  recap_id uuid NOT NULL REFERENCES recaps (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recap_links_recap_live_idx ON recap_links (recap_id) WHERE revoked_at IS NULL;
CREATE INDEX recap_links_trip_idx ON recap_links (trip_id);
CREATE INDEX recap_links_created_by_idx ON recap_links (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX recap_links_revoked_by_idx ON recap_links (revoked_by) WHERE revoked_by IS NOT NULL;
CREATE TRIGGER recap_links_touch_updated_at BEFORE UPDATE ON recap_links
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE recap_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE recap_links FORCE ROW LEVEL SECURITY;
CREATE POLICY recap_links_select ON recap_links FOR SELECT TO app_user
  USING (app.is_recap_viewer(trip_id));
CREATE POLICY recap_links_system ON recap_links FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT (id, recap_id, trip_id, created_by, revoked_at, revoked_by, created_at, updated_at)
  ON recap_links TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON recap_links TO app_system;
REVOKE ALL ON recap_links FROM guide_reader, powersync_repl, public_reader;

-- ---------------------------------------------------------------------------------------------
-- The public projection. `public_reader` reads it and nothing else of a recap.
--
-- The view answers only for the link named in the transaction's setting:
--   app.public_recap  sha-256 hex of the link's token (recap_links.token_hash)
-- and only while that link is live and its recap is ready, so a revoked link and a recap that is
-- still building or failed show nothing.
--
-- Columns are an explicit allow-list. Where and when in the roughest terms (the destination's
-- name, the month and year the trip began, how many days), totals (travellers, distance, critter
-- counts), the catalogue places on the trail by name, and first names. Never the trip or crew,
-- the receipt or any amount, awards, card copy, narration, photos, exact dates or times, place
-- ids, or anyone's id.
--
-- Places: only stops that are catalogue places (a place the crew typed in itself is never a stop),
-- and never where the crew slept or a clinic. First names: travellers of the recap who are still
-- active in the crew with a live account, who have not hidden their award on this recap and do
-- not hide their collection or taste tags from their crew.
CREATE VIEW public.recap_public WITH (security_barrier = true) AS
SELECT r.id AS recap_id,
       d.name AS destination_name,
       CASE WHEN r.stats ->> 'start_date' ~ '^\d{4}-(0[1-9]|1[0-2])-\d{2}$'
            THEN substring(r.stats ->> 'start_date' FROM 6 FOR 2)::int END AS travel_month,
       CASE WHEN r.stats ->> 'start_date' ~ '^\d{4}-(0[1-9]|1[0-2])-\d{2}$'
            THEN substring(r.stats ->> 'start_date' FROM 1 FOR 4)::int END AS travel_year,
       CASE WHEN jsonb_typeof(r.stats -> 'days') = 'number'
            THEN floor((r.stats -> 'days')::numeric)::int END AS days,
       CASE WHEN jsonb_typeof(r.stats -> 'travellers') = 'number'
            THEN floor((r.stats -> 'travellers')::numeric)::int END AS travellers,
       (SELECT coalesce(jsonb_agg(n.first_name ORDER BY n.first_name), '[]'::jsonb)
          FROM (SELECT (regexp_split_to_array(btrim(u.display_name), '\s+'))[1] AS first_name
                  FROM recap_views v
                  JOIN users u ON u.id = v.user_id AND u.status IN ('anonymous', 'registered')
                  JOIN crew_members m
                    ON m.crew_id = r.crew_id AND m.user_id = v.user_id AND m.status = 'active'
                  LEFT JOIN user_settings s ON s.user_id = v.user_id
                 WHERE v.recap_id = r.id
                   AND btrim(coalesce(u.display_name, '')) <> ''
                   AND NOT coalesce(s.hide_collection, false)
                   AND NOT coalesce(s.hide_taste_tags, false)
                   AND NOT EXISTS (SELECT 1 FROM recap_awards a
                                    WHERE a.recap_id = r.id AND a.user_id = v.user_id
                                      AND a.opted_out)
                 ORDER BY 1
                 LIMIT 32) n
       ) AS crew_names,
       CASE WHEN jsonb_typeof(r.stats -> 'distance_m') = 'number'
            THEN floor((r.stats -> 'distance_m')::numeric)::int END AS distance_m,
       coalesce(r.stats -> 'distance_estimated' = 'true'::jsonb, false) AS distance_estimated,
       places.places_count,
       places.places,
       CASE WHEN jsonb_typeof(r.stats -> 'critters' -> 'forms_found') = 'number'
            THEN floor((r.stats -> 'critters' -> 'forms_found')::numeric)::int END AS critters_found,
       CASE WHEN jsonb_typeof(r.stats -> 'critters' -> 'new_critters') = 'number'
            THEN floor((r.stats -> 'critters' -> 'new_critters')::numeric)::int END AS new_critters
  FROM recap_links l
  JOIN recaps r ON r.id = l.recap_id
  JOIN trips t ON t.id = r.trip_id
  LEFT JOIN destinations d ON d.id = t.destination_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS places_count,
           coalesce(
             jsonb_agg(jsonb_build_object('name', p.name, 'category', p.category)
                       ORDER BY p.position)
               FILTER (WHERE p.place_rank <= 12),
             '[]'::jsonb) AS places
      FROM (SELECT q.name, q.category, q.position,
                   row_number() OVER (ORDER BY q.position) AS place_rank
              FROM (SELECT DISTINCT ON (s.stop ->> 'name')
                           s.stop ->> 'name' AS name,
                           s.stop ->> 'category' AS category,
                           s.position
                      FROM jsonb_array_elements(
                             CASE WHEN jsonb_typeof(r.route -> 'stops') = 'array'
                                  THEN r.route -> 'stops' ELSE '[]'::jsonb END)
                           WITH ORDINALITY AS s (stop, position)
                     WHERE jsonb_typeof(s.stop -> 'poi_id') = 'string'
                       AND btrim(coalesce(s.stop ->> 'name', '')) <> ''
                       AND coalesce(s.stop ->> 'category', 'other') NOT IN ('stay', 'health')
                     ORDER BY s.stop ->> 'name', s.position) q) p
  ) places
 WHERE l.token_hash = nullif(current_setting('app.public_recap', true), '')
   AND l.revoked_at IS NULL
   AND r.status = 'ready';

GRANT SELECT ON public.recap_public TO public_reader;

-- install_attributions: an install may be claimed from a recap link.
ALTER TABLE install_attributions DROP CONSTRAINT install_attributions_link_kind_check;
ALTER TABLE install_attributions ADD CONSTRAINT install_attributions_link_kind_check CHECK (
  link_kind IN ('invite', 'plan_share', 'referral', 'plan', 'guide', 'locals', 'app', 'recap_share')
);

-- domain_events: making and switching off a recap link join the catalogue
-- (packages/domain/src/recap/events.ts), added to whatever the constraint lists now so a sibling
-- migration's types are kept.
DO $$
DECLARE
  current_types text[];
  merged text;
BEGIN
  SELECT array_agg(m[1] ORDER BY m[1]) INTO current_types
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = 'domain_events_type_check' AND c.conrelid = 'domain_events'::regclass;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_types || ARRAY['recap_link.created', 'recap_link.revoked']) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;
