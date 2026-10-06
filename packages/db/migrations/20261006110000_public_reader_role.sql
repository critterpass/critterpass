-- Public web previews (docs/api-contracts.md §5.6 `GET /v1/public/{kind}/{token}`): the web
-- Worker shows strangers holding a link a public-safe slice of what it points at. The api reads
-- that slice as `public_reader`, a NOLOGIN role that holds SELECT on the public views below and
-- nothing else: no base table, no app.* function, never app_system.
--
-- Each view is owned by the migration role (like the llm.* views) and answers only for the link
-- named in the transaction's settings, so a reader cannot list other trips by dropping a filter:
--   app.public_code  a trip join code, as normalised by normalizeJoinCode (upper case)
--   app.public_seat  sha-256 hex of a personal invite's seat token
-- A code that is not live (switched off, expired, used up) or a seat that is no longer open shows
-- nothing.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'public_reader') THEN
    CREATE ROLE public_reader NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT public_reader TO app_owner;
GRANT USAGE ON SCHEMA public TO public_reader;

-- The trip a live trip link points at. Crew codes carry no trip, and a cancelled or archived trip
-- has nothing to preview.
CREATE VIEW public.public_link_trip WITH (security_barrier = true) AS
SELECT t.id AS trip_id
  FROM trips t
 WHERE t.status NOT IN ('cancelled', 'archived')
   AND t.id IN (
     SELECT jc.target_id
       FROM join_codes jc
      WHERE jc.code = nullif(current_setting('app.public_code', true), '')
        AND jc.target_kind = 'trip'
        AND jc.status = 'active'
        AND (jc.expires_at IS NULL OR jc.expires_at > now())
        AND (jc.max_uses IS NULL OR jc.uses < jc.max_uses)
     UNION
     SELECT i.trip_id
       FROM invites i
      WHERE i.seat_token_hash = nullif(current_setting('app.public_seat', true), '')
        AND i.trip_id IS NOT NULL
        AND i.status IN ('pending', 'later')
        AND i.expires_at > now()
   );

-- The proposal's draft as the invite ticket shows it: each day's number, date and theme, and up to
-- three stop names. Read from the version the organiser sent (or, once there is one, the crew's
-- current plan); never an organiser's unsent draft. No prices, notes, attendees, bookings or
-- providers.
CREATE VIEW public.proposal_public WITH (security_barrier = true) AS
WITH shown AS (
  SELECT lt.trip_id,
         coalesce(
           (SELECT p.version_id
              FROM proposals p
             WHERE p.trip_id = lt.trip_id
               AND p.status IN ('sent', 'locked')
               AND p.sent_at IS NOT NULL
               AND p.version_id IS NOT NULL
             ORDER BY p.sent_at DESC
             LIMIT 1),
           t.current_version_id
         ) AS version_id
    FROM public.public_link_trip lt
    JOIN trips t ON t.id = lt.trip_id
)
SELECT d.day_no,
       to_char(d.date, 'YYYY-MM-DD') AS date,
       nullif(trim(d.theme), '') AS theme,
       (SELECT count(*)::int FROM plan_days dd WHERE dd.version_id = s.version_id) AS days_total,
       ARRAY(
         SELECT coalesce(po.name, pi.custom_place ->> 'name')
           FROM plan_items pi
           LEFT JOIN pois po ON po.id = pi.poi_id
          WHERE pi.day_id = d.id
            AND coalesce(po.name, pi.custom_place ->> 'name') IS NOT NULL
          ORDER BY pi.starts_at NULLS LAST, pi.created_at, pi.id
          LIMIT 3
       ) AS stops
  FROM shown s
  JOIN plan_days d ON d.version_id = s.version_id;

GRANT SELECT ON public.public_link_trip, public.proposal_public TO public_reader;
