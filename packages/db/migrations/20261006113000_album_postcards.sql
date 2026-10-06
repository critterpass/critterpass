-- Postcards sent to the crew and printed mailings, and reported album photos (docs/api-contracts.md §4.14): the domain events
-- they append, merged into the allow-list whatever else it holds by then. A mailing's per-recipient
-- progress lives in `postcard_mailings.tracking.orders` (print order reference, status, carrier
-- link; never an address).
DO $$
DECLARE
  current_values text[];
  merged text;
BEGIN
  SELECT array_agg(m[1] ORDER BY m[1]) INTO current_values
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = 'domain_events_type_check' AND c.conrelid = 'domain_events'::regclass;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_values || ARRAY[
      'postcard.saved', 'postcard.sent', 'postcard.ordered', 'postcard.address_requested',
      'postcard.address_saved', 'postcard.mailing_updated'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- A payer's one mailing per trip: found by trip and payer whatever its status.
CREATE INDEX postcard_mailings_trip_payer_idx ON postcard_mailings (trip_id, payer_id);

-- Reported album photos reach the ops console: the moderation preview reads them as admin_reader.
GRANT SELECT ON photos TO admin_reader;
CREATE POLICY photos_admin_reader ON photos FOR SELECT TO admin_reader USING (true);
