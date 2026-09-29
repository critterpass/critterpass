-- The Settled Tokek grant serialises on the trip row with FOR NO KEY UPDATE, not FOR UPDATE. Each
-- confirm has already inserted its ledger entry, whose trip_id foreign key holds FOR KEY SHARE on
-- that row. FOR UPDATE conflicts with KEY SHARE, so two racing final confirms each waited on the
-- other's key share and one was aborted as a deadlock. NO KEY UPDATE still lets only one grant check
-- run at a time, and the later one sees the earlier one's committed entry.
CREATE OR REPLACE FUNCTION app.grant_settled_if_square(p_trip uuid, p_at timestamptz)
RETURNS TABLE (granted_user uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  trip_crew uuid;
BEGIN
  SELECT t.crew_id INTO trip_crew FROM trips t WHERE t.id = p_trip FOR NO KEY UPDATE;
  IF trip_crew IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM payments p
     WHERE p.trip_id = p_trip AND p.status IN ('pending', 'requested', 'marked_paid', 'disputed')
  ) OR NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e.trip_id = p_trip) OR EXISTS (
    SELECT 1 FROM (
      SELECT e.creditor_id AS member, e.currency, e.amount_minor AS delta
        FROM ledger_entries e WHERE e.trip_id = p_trip
      UNION ALL
      SELECT e.debtor_id, e.currency, -e.amount_minor FROM ledger_entries e WHERE e.trip_id = p_trip
    ) moves
    GROUP BY moves.member, moves.currency
    HAVING sum(moves.delta) <> 0
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    INSERT INTO stickers AS s (user_id, crew_id, trip_id, kind, granted_at)
    SELECT tp.user_id, trip_crew, p_trip, 'settled', p_at
      FROM trip_participants tp
      JOIN crew_members m ON m.crew_id = trip_crew AND m.user_id = tp.user_id AND m.status = 'active'
     WHERE tp.trip_id = p_trip AND tp.rsvp <> 'out'
    ON CONFLICT (user_id, trip_id) WHERE kind = 'settled' DO NOTHING
    RETURNING s.user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.grant_settled_if_square(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.grant_settled_if_square(uuid, timestamptz) TO app_system;
