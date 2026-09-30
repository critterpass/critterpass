-- A crew settles in its members' most common home currency until its organiser picks another
-- (changing it later re-rates the crew's money). The currency is written when the crew starts
-- (its creator's home currency) or, for a crew started before anyone had a home, when its money
-- first needs one. Crews that never got one fell back to USD everywhere; this fills them in.

-- The active members' most common home currency, ties to whoever joined first; NULL when no member
-- has a home yet. Reads other members' homes, so only the system role may call it.
CREATE OR REPLACE FUNCTION app.crew_home_currency(crew uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT upper(u.home_currency)
    FROM crew_members m
    JOIN users u ON u.id = m.user_id
   WHERE m.crew_id = crew AND m.status = 'active' AND u.home_currency IS NOT NULL
   GROUP BY upper(u.home_currency)
   ORDER BY count(*) DESC, min(m.created_at) ASC
   LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION app.crew_home_currency(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.crew_home_currency(uuid) TO app_system;

-- Crews whose money already started have it in USD (the old fallback): they stay there, and their
-- organiser can switch (which re-rates). Every other crew takes its members' home currency.
UPDATE crews c
   SET settlement_currency = 'USD'
 WHERE c.settlement_currency IS NULL
   AND (EXISTS (SELECT 1 FROM expenses e WHERE e.crew_id = c.id)
        OR EXISTS (SELECT 1 FROM ledger_entries l WHERE l.crew_id = c.id));

UPDATE crews
   SET settlement_currency = app.crew_home_currency(id)
 WHERE settlement_currency IS NULL;
