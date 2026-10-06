-- Help articles are read over HTTP (`/v1/help/library`) and no phone reads guide tips from its own
-- database, so no stream reads either table any more: both leave the publication and replication
-- stops copying their rows.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['help_articles', 'place_tips']
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
