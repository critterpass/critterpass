-- The recap's words, signatures and voice (docs/data-model.md §3.10, doc deltas):
-- `recaps.copy_version` is the version the guide's card copy and award words were written for (a
-- re-run that bumps `version` writes them again), `recaps.copy_fallback` marks copy the template
-- wrote because the model failed or answered out of bounds, and `recaps.narration` records the
-- recorded guide voice per locale and card (media key and the hash of the words it reads, so a
-- re-run with unchanged words records nothing). `user_settings.signature_media_key` is the stroke
-- a traveller drew once and signs every crew stamp with. The recap's domain events join the
-- allow-list, whatever else it holds by then, and a traveller's command may publish on the recap's
-- and the memory's own channels (`recap:{id}` signatures and votes, `memory:{id}` reactions);
-- everything else about `app.enqueue_rt` is unchanged.
ALTER TABLE recaps ADD COLUMN copy_version integer NOT NULL DEFAULT 0 CHECK (copy_version >= 0);
ALTER TABLE recaps ADD COLUMN copy_fallback boolean NOT NULL DEFAULT false;
ALTER TABLE recaps ADD COLUMN narration jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(narration) = 'object');

ALTER TABLE user_settings ADD COLUMN signature_media_key text
  CHECK (signature_media_key IS NULL OR char_length(signature_media_key) <= 300);

DO $$
DECLARE
  current_values text[];
  merged text;
BEGIN
  SELECT array_agg(m[1] ORDER BY m[1]) INTO current_values
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = 'domain_events_type_check' AND c.conrelid = 'domain_events'::regclass;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_values || ARRAY[
      'recap.ready', 'recap.signed', 'recap.mvp_voted', 'recap.mvp_closed',
      'recap.award_opted_out', 'memory.surfaced', 'memory.reacted'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enqueue_rt(channel text, payload jsonb, kind text DEFAULT 'publish') RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  caller_uid uuid := app.uid();
  new_id bigint;
BEGIN
  IF kind NOT IN ('publish', 'unsubscribe', 'disconnect') THEN
    RAISE EXCEPTION 'invalid rt_outbox kind: %', kind USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF kind <> 'publish' AND caller_uid IS NOT NULL THEN
    RAISE EXCEPTION 'only app_system or a trigger may enqueue kind %', kind USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF caller_uid IS NOT NULL THEN
    IF NOT (
      channel = app.channel_name('user', caller_uid::text)
      OR (channel LIKE 'crew%:%' AND app.is_crew_member(split_part(channel, ':', 2)::uuid))
      OR (channel LIKE 'trip%:%' AND app.is_trip_member(split_part(channel, ':', 2)::uuid))
      OR (channel LIKE 'poll:%' AND EXISTS (
        SELECT 1 FROM polls p
         WHERE p.id = split_part(channel, ':', 2)::uuid
           AND app.can_read_poll_scope(p.crew_id, p.trip_id)
      ))
      OR (channel LIKE 'swipe:%' AND EXISTS (
        SELECT 1 FROM swipe_sessions s
         WHERE s.id = split_part(channel, ':', 2)::uuid AND app.is_trip_member(s.trip_id)
      ))
      OR (channel LIKE 'proposal:%' AND EXISTS (
        SELECT 1 FROM proposals p
         WHERE p.id = split_part(channel, ':', 2)::uuid
           AND app.is_trip_member(p.trip_id)
           AND (p.sent_at IS NOT NULL OR app.is_trip_organiser(p.trip_id))
      ))
      OR (channel LIKE 'sos:%' AND EXISTS (
        SELECT 1 FROM help_sessions s
         WHERE s.id = split_part(channel, ':', 2)::uuid AND app.is_trip_member(s.trip_id)
      ))
      OR (channel LIKE 'recap:%' AND EXISTS (
        SELECT 1 FROM recaps r
         WHERE r.id = split_part(channel, ':', 2)::uuid AND app.is_recap_viewer(r.trip_id)
      ))
      OR (channel LIKE 'memory:%' AND EXISTS (
        SELECT 1 FROM memories m
         WHERE m.id = split_part(channel, ':', 2)::uuid AND app.was_recap_viewer(m.trip_id)
      ))
    ) THEN
      RAISE EXCEPTION 'not permitted to publish on channel %', channel USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  INSERT INTO rt_outbox (channel, payload, idem_key, kind)
  VALUES (channel, payload, gen_random_uuid(), kind)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- The ops console reads every non-C3 user setting, the signature stroke's key included.
GRANT SELECT (signature_media_key) ON user_settings TO admin_reader;
