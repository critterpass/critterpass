-- AI estimates for popular places.
--
-- place_profiles.estimates: Authz "sys", RLS "R" (unchanged), privacy class C0. `{visit, best_times,
-- busy, fee, tips, dress}`, each `{value, basis: 'cited' | 'estimate', source?}` (shape:
-- `@cp/domain` places/estimates.ts). Written by the `places.profile` job for a destination's
-- popular places only; every other place keeps `{}`. No user data.
--
-- crowd_forecasts.source gains `estimate`: hourly curves made from a popular place's estimated busy
-- windows, replaced as a set by each profile run, read only where no `visits` or approved
-- `editorial` curve exists and always labelled as an estimate.
ALTER TABLE place_profiles ADD COLUMN IF NOT EXISTS estimates jsonb NOT NULL DEFAULT '{}'::jsonb
  CONSTRAINT place_profiles_estimates_check CHECK (jsonb_typeof(estimates) = 'object');
GRANT SELECT (estimates) ON place_profiles TO admin_reader;

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

SELECT pg_temp.widen_in_check('crowd_forecasts', 'crowd_forecasts_source_check', 'source',
  ARRAY['estimate']);
