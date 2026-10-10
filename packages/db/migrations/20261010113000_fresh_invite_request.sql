-- Asking for a fresh invite (docs/api-contracts.md §4.2 `request_fresh_invite`): someone holding a
-- crew or trip code that ran out, was replaced or was used up asks the person who shared it for a
-- new one. The caller is not in the crew, so the lookup runs as the definer and returns only ids:
-- the lapsed code's crew, who to ask (the code's creator while still in the crew, else the crew's
-- organiser) and whether this caller already asked about this code in the last day.
CREATE OR REPLACE FUNCTION app.lapsed_join_code(p_code text)
RETURNS TABLE (join_code_id uuid, crew_id uuid, trip_id uuid, ask_user uuid, asked_recently boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH code AS (
    SELECT jc.id, jc.crew_id, jc.created_by,
           CASE WHEN jc.target_kind = 'trip' THEN jc.target_id END AS trip_id
      FROM join_codes jc
     WHERE jc.code = p_code AND jc.target_kind IN ('crew', 'trip')
       AND (jc.status <> 'active' OR (jc.expires_at IS NOT NULL AND jc.expires_at <= now()))
       AND NOT EXISTS (SELECT 1 FROM join_codes live WHERE live.code = p_code
                        AND live.status = 'active'
                        AND (live.expires_at IS NULL OR live.expires_at > now()))
     ORDER BY jc.created_at DESC LIMIT 1
  )
  SELECT code.id, code.crew_id, code.trip_id,
         coalesce(
           (SELECT cm.user_id FROM crew_members cm WHERE cm.crew_id = code.crew_id
               AND cm.user_id = code.created_by AND cm.status = 'active'),
           (SELECT cm.user_id FROM crew_members cm WHERE cm.crew_id = code.crew_id
               AND cm.role = 'organiser' AND cm.status = 'active'
             ORDER BY cm.created_at, cm.id LIMIT 1)),
         EXISTS (SELECT 1 FROM domain_events e
                  WHERE e.type = 'invite.refresh_requested' AND e.actor_id = app.uid()
                    AND e.aggregate_id = code.id AND e.occurred_at > now() - interval '1 day')
    FROM code
$$;
REVOKE EXECUTE ON FUNCTION app.lapsed_join_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lapsed_join_code(text) TO app_user;

-- domain_events: the request joins the catalogue (packages/domain/src/crews/events.ts), added to
-- whatever the constraint lists now so a sibling migration's types are kept.
DO $$
DECLARE
  current_types text[];
  merged text;
BEGIN
  SELECT array_agg(m[1] ORDER BY m[1]) INTO current_types
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = 'domain_events_type_check' AND c.conrelid = 'domain_events'::regclass;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_types || ARRAY['invite.refresh_requested']) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;
