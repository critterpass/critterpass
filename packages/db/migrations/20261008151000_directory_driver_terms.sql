-- A driver added to a trip from the directory used to get his `providers` row and no
-- `provider_terms` row, and the shortlist reads a driver through his terms: those drivers never
-- showed. This gives each of them the terms row `shortlist_listed_driver` writes today, from the
-- listing as it stands now.
--
-- The trip's copy carries the listing's sealed number byte for byte, and sealing is randomised, so
-- an equal `contact_enc` can only be that copy: a driver a crew typed in by hand never matches. A
-- driver whose listing has since changed its number or been deleted is left as he is. Rows that
-- already have terms are not touched, so running this twice changes nothing.
--
-- Both tables are system-written under forced row security, so the rows go in as app_system.
SET LOCAL ROLE app_system;

INSERT INTO provider_terms (provider_id, trip_id, source, area, languages, car, seats)
SELECT DISTINCT ON (p.id)
       p.id, p.trip_id, 'crews', left(l.areas[1], 80), l.languages[1:8],
       left(l.vehicle->>'model', 80), l.seats
  FROM providers p
  JOIN driver_listings l ON l.phone_e164_enc = p.contact_enc
 WHERE p.kind = 'driver'
   AND p.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM provider_terms t WHERE t.provider_id = p.id)
 ORDER BY p.id, l.created_at
ON CONFLICT (provider_id) DO NOTHING;

RESET ROLE;
