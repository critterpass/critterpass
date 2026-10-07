-- The crew's vote on a driver's terms is his terms from then on: applying an `assign_provider` op
-- that carries terms also writes them to the driver's `provider_terms` row, so the comparison and
-- the pick sheet show the price the crew agreed, not the one first shortlisted. A pick without
-- terms, or with terms that name no price, leaves the row as it is.
--
-- A pick may also arrive in a change set a driver's link proposed (`author_kind = 'provider'`,
-- `author_id` the link): the day is then set by the member who made the link. Whoever approved
-- comes next (an organiser's apply), then an organiser of the trip (a vote names no approver), so
-- `provider_assignments.assigned_by` is always a member of the trip.
--
-- Same signature, rights and callers as before.
CREATE OR REPLACE FUNCTION app.apply_provider_assignments(cs_id uuid) RETURNS integer
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  cs change_sets%ROWTYPE;
  op jsonb;
  terms jsonb;
  driver uuid;
  assigner uuid;
  written integer := 0;
  touched integer;
BEGIN
  SELECT * INTO cs FROM change_sets WHERE id = cs_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'change set % not found', cs_id;
  END IF;
  assigner := COALESCE(
    CASE cs.author_kind
      WHEN 'user' THEN cs.author_id
      WHEN 'provider' THEN (SELECT s.created_by FROM driver_plan_shares s
                             WHERE s.id = cs.author_id AND s.trip_id = cs.trip_id)
    END,
    cs.approved_by,
    (SELECT p.user_id FROM trip_participants p
      WHERE p.trip_id = cs.trip_id AND p.role = 'organiser' ORDER BY p.user_id LIMIT 1)
  );

  FOR op IN SELECT value FROM jsonb_array_elements(cs.ops) AS value
    WHERE value->>'op' = 'assign_provider'
      AND COALESCE((value->>'accepted')::boolean, true)
  LOOP
    driver := (op->>'target')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM providers
       WHERE id = driver AND trip_id = cs.trip_id AND kind = 'driver' AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'provider % is not a driver of trip %', driver, cs.trip_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF assigner IS NULL THEN
      RAISE EXCEPTION 'change set % has nobody to set its driver', cs_id
        USING ERRCODE = 'not_null_violation';
    END IF;
    terms := NULLIF(op->'assignment'->'terms', 'null'::jsonb);

    INSERT INTO provider_assignments (trip_id, day_date, provider_id, window_start, window_end,
      pickup, agreed, change_set_id, assigned_by)
    SELECT cs.trip_id, (day->>'date')::date, driver, day->>'window_start', day->>'window_end',
      day->>'pickup',
      COALESCE(
        terms,
        (SELECT jsonb_build_object('price_minor', t.price_minor, 'currency', t.currency,
           'price_unit', t.price_unit, 'included_hours', t.included_hours,
           'includes', t.includes, 'overtime_minor', t.overtime_minor)
           FROM provider_terms t WHERE t.provider_id = driver)
      ),
      cs.id, assigner
    FROM jsonb_array_elements(op->'assignment'->'days') AS day
    ON CONFLICT (trip_id, day_date) DO UPDATE SET provider_id = EXCLUDED.provider_id,
      window_start = EXCLUDED.window_start, window_end = EXCLUDED.window_end,
      pickup = EXCLUDED.pickup, agreed = EXCLUDED.agreed,
      change_set_id = EXCLUDED.change_set_id, assigned_by = EXCLUDED.assigned_by;
    GET DIAGNOSTICS touched = ROW_COUNT;
    written := written + touched;

    IF touched > 0 AND (terms->>'price_minor')::bigint > 0 AND terms->>'currency' IS NOT NULL THEN
      UPDATE provider_terms SET
        price_minor = (terms->>'price_minor')::bigint,
        currency = terms->>'currency',
        price_unit = terms->>'price_unit',
        included_hours = (terms->>'included_hours')::numeric,
        includes = COALESCE(NULLIF(terms->'includes', 'null'::jsonb), '{}'::jsonb),
        overtime_minor = (terms->>'overtime_minor')::bigint
      WHERE provider_id = driver;
    END IF;
  END LOOP;

  RETURN written;
END;
$$;
