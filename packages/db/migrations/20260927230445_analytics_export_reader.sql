-- The worker's analytics export reads domain events in id order (UUIDv7, so time order) after a
-- cursor. domain_events has no grant to any role; like app.domain_event_for_routing, this
-- SECURITY DEFINER function is the one way in, and it returns only the columns the exporter maps
-- (payloads are ids and enums by the event catalogue's contract). At most 1000 rows per call.
CREATE OR REPLACE FUNCTION app.domain_events_after(p_after uuid, p_limit integer)
RETURNS TABLE (
  id uuid, type text, payload jsonb, crew_id uuid, trip_id uuid, actor_kind text, actor_id uuid,
  occurred_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT e.id, e.type, e.payload, e.crew_id, e.trip_id, e.actor_kind, e.actor_id, e.occurred_at
  FROM public.domain_events e
  WHERE p_after IS NULL OR e.id > p_after
  ORDER BY e.id
  LIMIT least(greatest(p_limit, 1), 1000)
$$;
REVOKE EXECUTE ON FUNCTION app.domain_events_after(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.domain_events_after(uuid, integer) TO app_system;
