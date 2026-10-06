-- A published crew plan on the web (docs/api-contracts.md §5.6 `GET /v1/public/plan/{token}`):
-- the page behind an unlisted plan link (`/p/{token}`). `public_reader` reads it through the view
-- below and nothing else.
--
-- The view answers only for the link named in the transaction's setting:
--   app.public_plan  sha-256 hex of the link's token (plan_links.token_hash)
-- and only while that link is live and the plan it was made for is published, so a revoked link, a
-- plan still waiting on consent and an unpublished plan all show nothing.
--
-- Columns are an explicit allow-list cut from the plan's materialised projection (already limited
-- to what every traveller agreed to publish): the destination, the days with their themes and
-- place names, the crew's size and, when the crew turned names on, first names. Never the trip,
-- the requester, the consent list, costs, photo keys, tips or place ids.
CREATE VIEW public.shared_plan_public WITH (security_barrier = true) AS
SELECT s.id AS shared_plan_id,
       s.title,
       s.projection ->> 'destination_name' AS destination_name,
       s.days_count::int AS days_count,
       s.travel_month::int AS travel_month,
       s.travel_year::int AS travel_year,
       s.crew_size::int AS crew_size,
       CASE WHEN jsonb_typeof(s.projection -> 'crew_names') = 'array'
            THEN s.projection -> 'crew_names' END AS crew_names,
       s.travelled,
       s.tags,
       (SELECT coalesce(
                 jsonb_agg(
                   jsonb_build_object(
                     'day_no', d.day -> 'day_no',
                     'theme', d.day -> 'theme',
                     'places', (SELECT coalesce(
                                         jsonb_agg(
                                           jsonb_build_object(
                                             'name', p.place -> 'name',
                                             'category', p.place -> 'category')
                                           ORDER BY p.position),
                                         '[]'::jsonb)
                                  FROM jsonb_array_elements(d.day -> 'places')
                                       WITH ORDINALITY AS p (place, position)
                                 WHERE p.position <= 12))
                   ORDER BY d.position),
                 '[]'::jsonb)
          FROM jsonb_array_elements(s.projection -> 'days') WITH ORDINALITY AS d (day, position)
       ) AS days,
       s.rating_avg::float8 AS rating_avg,
       s.rating_count,
       s.copies_count
  FROM plan_links l
  JOIN shared_plans s ON s.id = l.shared_plan_id
 WHERE l.token_hash = nullif(current_setting('app.public_plan', true), '')
   AND l.revoked_at IS NULL
   AND s.status = 'published';

GRANT SELECT ON public.shared_plan_public TO public_reader;
