-- The budget's price inputs read the newest rate of every currency pair, not "the rows of the
-- newest day". A day whose rows are still partial (a few currencies in, the rest to come) used to
-- hide every other currency's rate, so a crew settling in one of them could be priced in nothing.
-- Same function, same grants; only the `fx` list changes.
CREATE OR REPLACE FUNCTION app.setup_budget_inputs(p_trip uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  WITH trip AS (
    SELECT t.id, t.destination_id, t.start_date, t.end_date,
           coalesce(c.settlement_currency, 'USD') AS currency
      FROM trips t JOIN crews c ON c.id = t.crew_id WHERE t.id = p_trip
  ),
  members AS (
    SELECT m.user_id, upper(u.home_airport) AS home
      FROM app.setup_member_ids(p_trip) AS m(user_id) JOIN users u ON u.id = m.user_id
  )
  SELECT jsonb_build_object(
    'currency', t.currency,
    'start_date', t.start_date::text,
    'end_date', t.end_date::text,
    'members', (SELECT coalesce(jsonb_agg(jsonb_build_object('uid', m.user_id, 'home', m.home)
                  ORDER BY m.user_id), '[]'::jsonb) FROM members m),
    'fares', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('origin', f.origin_iata, 'month', f.month::text,
               'price_minor', f.price_minor, 'currency', f.currency, 'days', f.days)), '[]'::jsonb)
        FROM fare_cells f
       WHERE f.destination_id = t.destination_id AND t.start_date IS NOT NULL
         AND f.month = date_trunc('month', t.start_date)::date
         AND f.origin_iata IN (SELECT home FROM members WHERE home IS NOT NULL)
    ),
    'indices', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('stay_type', i.stay_type,
               'nightly_low_minor', i.nightly_minor_low, 'nightly_high_minor', i.nightly_minor_high,
               'food_pp_day_minor', i.food_pp_day_minor, 'fun_pp_day_minor', i.fun_pp_day_minor,
               'currency', i.currency) ORDER BY i.stay_type), '[]'::jsonb)
        FROM destination_cost_indices i
       WHERE i.destination_id = t.destination_id AND i.reviewed_at IS NOT NULL
    ),
    'fx', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'base', x.base, 'quote', x.quote,
               'rate', x.rate::text, 'as_of', x.as_of::text, 'source', x.source)), '[]'::jsonb)
        FROM (
          SELECT DISTINCT ON (s.base, s.quote) s.id, s.base, s.quote, s.rate, s.as_of, s.source
            FROM fx_snapshots s
           ORDER BY s.base, s.quote, s.as_of DESC, s.created_at DESC
        ) x
    )
  )
  FROM trip t
$$;
