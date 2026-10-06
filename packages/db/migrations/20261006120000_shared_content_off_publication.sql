-- Season months and events, cost indices and crowd curves are read over HTTP
-- (`/v1/destinations/{id}/season`, `/v1/destinations/{id}/cost-indices`,
-- `/v1/places/{id}/crowd-forecasts`) and no stream reads them any more, so they leave the
-- publication and replication stops copying every row of them.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['season_months', 'season_events', 'destination_cost_indices', 'crowd_forecasts']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync DROP TABLE public.%I', tbl);
    END IF;
  END LOOP;
END
$$;
