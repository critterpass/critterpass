-- A planned Pass+ pause (the App Store has none: the member turns renewal off and tells us when
-- they mean to come back) and its reminder a week before that date join the closed list of domain
-- event types. The resume date itself lives on the member's `subscriptions.resume_at`.
CREATE OR REPLACE FUNCTION pg_temp.widen_in_check(tbl regclass, con text, col text, extra text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  current_values text[];
  merged text;
BEGIN
  SELECT array_agg(m[1]) INTO current_values
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = con AND c.conrelid = tbl;
  IF current_values IS NULL THEN
    RAISE EXCEPTION 'constraint % on % not found', con, tbl;
  END IF;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_values || extra) AS t;
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', tbl, con);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%I IN (%s))', tbl, con, col, merged);
END
$$;
SELECT pg_temp.widen_in_check('domain_events', 'domain_events_type_check', 'type', ARRAY[
  'subscription.pause_intended', 'subscription.resume_due']);
