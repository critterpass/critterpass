-- The meet-up Live Activity names the members who tapped ON MY WAY, which is recorded only as
-- `crew.pinged` events. domain_events has no grant to any role; like app.domain_event_for_routing
-- and app.domain_events_after, this SECURITY DEFINER function is the worker's one way in. It
-- returns member ids for one meet-up and nothing else from the log (no payloads, no other event
-- types). Privacy: the ids are C1, the same crew membership the worker already reads.
CREATE OR REPLACE FUNCTION app.meetup_on_my_way(p_meetup uuid)
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce(array_agg(DISTINCT e.actor_id), '{}'::uuid[])
  FROM public.meetups m
  JOIN public.domain_events e
    ON e.aggregate_kind = 'trip' AND e.aggregate_id = m.trip_id
  WHERE m.id = p_meetup
    AND e.type = 'crew.pinged'
    AND e.actor_id IS NOT NULL
    AND e.payload ->> 'kind' = 'on_my_way'
    AND e.payload ->> 'meetup_id' = m.id::text
$$;
REVOKE EXECUTE ON FUNCTION app.meetup_on_my_way(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.meetup_on_my_way(uuid) TO app_system;
