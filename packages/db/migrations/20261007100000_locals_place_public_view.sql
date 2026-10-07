-- A place's locals on the web (docs/api-contracts.md §5.6 `GET /v1/public/locals/{slug}`): the
-- page behind `/locals/{slug}`. `public_reader` reads it through the view below and nothing else.
--
-- The view answers only for the place named in the transaction's setting:
--   app.public_place  the destination's slug
-- and only for a place whose critter set is live. A day-trip area is not a place of its own.
--
-- What the open web may know (docs/product-decisions.md, public locals page): the place, the
-- country or area it belongs to, one credited photo, how many critters there are to find, and per
-- critter a rarity tier and a body shape for an unnamed silhouette. Columns are an explicit
-- allow-list. Never a critter's key, number, name, species, city, art, colours, notes or forms'
-- hints; never a spawn rule, place id or geofence; never who found anything.
--
--   critters[].rarity      the rarest tier the critter comes in (common when it has no live form)
--   critters[].silhouette  the body shape it is drawn from, shared by many critters
--   photo                  the place's first ready photo: the stored file nearest 1200 px wide,
--                          with the credit line its licence asks for
CREATE VIEW public.locals_place_public WITH (security_barrier = true) AS
SELECT d.slug,
       d.name,
       s.name AS area,
       (SELECT jsonb_build_object(
                 'key', v.variant ->> 'key',
                 'width', (v.variant ->> 'w')::int,
                 'height', (v.variant ->> 'h')::int,
                 'credit', m.credit,
                 'source_url', m.source_url)
          FROM media_assets m
         CROSS JOIN LATERAL (
                SELECT x.variant
                  FROM jsonb_array_elements(m.variants) AS x (variant)
                 WHERE x.variant ->> 'format' = 'webp'
                 ORDER BY abs((x.variant ->> 'w')::int - 1200), x.variant ->> 'key'
                 LIMIT 1) v
         WHERE m.status = 'ready'
           AND m.kind = 'photo'
           AND m.subject_keys @> ARRAY['destination:' || d.slug]
         ORDER BY m.rank, m.id
         LIMIT 1) AS photo,
       (SELECT coalesce(
                 jsonb_agg(
                   jsonb_build_object('rarity', l.rarity, 'silhouette', l.silhouette)
                   ORDER BY l.no),
                 '[]'::jsonb)
          FROM (SELECT c.no,
                       coalesce(c.art_params ->> 'b', 'sit') AS silhouette,
                       coalesce(
                         (SELECT f.rarity
                            FROM critter_forms f
                            JOIN content_releases fr
                              ON fr.id = f.release_id AND fr.status = 'published'
                           WHERE f.critter_id = c.id
                           ORDER BY array_position(
                                      ARRAY['common', 'rare', 'epic', 'legendary'], f.rarity) DESC
                           LIMIT 1),
                         'common') AS rarity
                  FROM critters c
                  JOIN content_releases cr ON cr.id = c.release_id AND cr.status = 'published'
                 WHERE c.set_id = s.id) l
       ) AS critters
  FROM destinations d
  JOIN critter_sets s ON s.id = d.critter_set_id
  JOIN content_releases sr ON sr.id = s.release_id AND sr.status = 'published'
 WHERE d.slug = nullif(current_setting('app.public_place', true), '')
   AND d.coverage <> 'area';

GRANT SELECT ON public.locals_place_public TO public_reader;
