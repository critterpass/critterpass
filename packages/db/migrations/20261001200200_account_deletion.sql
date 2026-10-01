-- Account deletion (docs/data-model-sync-and-privacy.md §1 "Deletion", docs/api-contracts-you.md):
-- closing an account, restoring it inside the grace window, and the purge that erases it.
--
-- Expand only: a check and an index on account_deletions, grants the purge needs, and the
-- functions that reach what app_system cannot touch directly.

-- ---------------------------------------------------------------------------------------------
-- account_deletions: the reasons the hold sheet offers, and the purge's due-date scan.
ALTER TABLE account_deletions ADD CONSTRAINT account_deletions_reason_check
  CHECK (reason IS NULL OR reason IN
    ('trips_over', 'too_many_pings', 'crew_moved_apps', 'privacy', 'something_else'));
CREATE INDEX account_deletions_due_idx ON account_deletions (purge_at)
  WHERE restored_at IS NULL AND purged_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- The purge runs as app_system and follows packages/domain/src/account/purge-policy.ts. Every
-- table it deletes from grants app_system DELETE, and every column it clears grants UPDATE;
-- packages/db/test/purge/purge-policy-coverage.test.ts fails when a rule lacks its grant.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'location_fixes', 'visits', 'user_private', 'dietary_profiles', 'budget_defaults_private',
    'budget_max_private', 'calendar_days', 'calendar_sources', 'calendar_feed_tokens',
    'availability_asks', 'inbound_emails', 'inbound_sender_links',
    'insurance_policies', 'invite_prefill', 'mailbox_connections', 'payout_methods',
    'user_settings', 'notification_prefs', 'notifications', 'scheduled_deliveries', 'reminders',
    'roundups', 'ping_ledger', 'inbox_items', 'nudges', 'alarms', 'devices', 'app_open_hours',
    'briefing_items', 'briefings', 'personal_plan_ops', 'poll_reveals', 'room_prefs',
    'saved_items', 'saved_lists', 'phrase_progress', 'custom_phrase_cards',
    'queued_guide_questions', 'guide_messages', 'guide_threads', 'private_guide_threads',
    'import_candidates', 'paywall_impressions', 'user_entitlements', 'share_calcs',
    'participant_dietary_flags', 'crew_contact_cards', 'member_etas', 'location_shares',
    'invite_opens', 'affiliate_clicks', 'app_icon_unlocks', 'past_trips', 'data_exports',
    'stickers', 'stamps', 'taste_profiles', 'passes', 'avatars',
    'booking_attachments', 'push_tokens', 'collection_entries', 'crew_collection_counts',
    'device_activities', 'eggs', 'encounter_evidence', 'encounter_samples', 'encounters',
    'engagement_events', 'guide_skins', 'la_push_to_start_tokens', 'proposal_followups',
    'quest_signups', 'swipe_votes', 'swipe_yes_votes'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT DELETE ON public.%I TO app_system', t);
    END IF;
  END LOOP;
END
$$;
GRANT UPDATE (requested_by) ON availability_asks TO app_system;
GRANT UPDATE (actor_id) ON inbox_items TO app_system;
GRANT UPDATE (partner_id) ON room_prefs TO app_system;
GRANT UPDATE (resolved_by) ON import_candidates TO app_system;
GRANT UPDATE (user_id) ON store_transactions TO app_system;
GRANT UPDATE (app_user_id) ON billing_events TO app_system;
GRANT UPDATE (user_id) ON ai_usage TO app_system;
GRANT UPDATE (user_id) ON agent_jobs TO app_system;
GRANT UPDATE (user_id) ON boost_credits TO app_system;
GRANT UPDATE (asker_id) ON guide_crew_turns TO app_system;
GRANT UPDATE (reporter_id) ON moderation_reports TO app_system;
GRANT UPDATE (author_id) ON place_tips TO app_system;
GRANT UPDATE (status) ON join_codes TO app_system;
GRANT UPDATE (status) ON invites TO app_system;
GRANT UPDATE (status, left_at) ON crew_members TO app_system;
GRANT UPDATE (body, attachments, mentions, deleted_at) ON messages TO app_system;

-- ---------------------------------------------------------------------------------------------
-- Device action keys keep no DELETE grant for any role (revoked keys stay auditable for 30 days);
-- a purge runs a month after close, when every key of the account is long revoked, and removes
-- them through this function, the way anonymous GC does.
CREATE OR REPLACE FUNCTION app.purge_device_action_keys(p_user_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  DELETE FROM device_action_keys WHERE user_id = p_user_id;
$$;
REVOKE EXECUTE ON FUNCTION app.purge_device_action_keys(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_device_action_keys(uuid) TO app_system;

-- The command log and its results are closed to every role; a purge removes one account's rows
-- through this function, the way retention removes old ones.
CREATE OR REPLACE FUNCTION app.purge_command_log(p_user_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  DELETE FROM cmd_results WHERE uid = p_user_id;
  DELETE FROM cmd_log WHERE uid = p_user_id;
$$;
REVOKE EXECUTE ON FUNCTION app.purge_command_log(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_command_log(uuid) TO app_system;

-- Better Auth's rows for a purged account: the user, its sessions and linked accounts (cascade),
-- and any verification left for its e-mail or phone. The `auth` schema grants only its own role,
-- so the purge reaches it through this one function, the same way anonymous GC does.
CREATE OR REPLACE FUNCTION app.purge_account_auth(p_user_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_email text;
  v_phone text;
  v_deleted integer;
BEGIN
  SELECT email, phone_number INTO v_email, v_phone FROM auth."user" WHERE id = p_user_id;
  IF v_email IS NOT NULL THEN
    DELETE FROM auth.verification WHERE position(v_email IN identifier) > 0;
  END IF;
  IF v_phone IS NOT NULL THEN
    DELETE FROM auth.verification WHERE position(v_phone IN identifier) > 0;
  END IF;
  DELETE FROM auth.session WHERE user_id = p_user_id;
  DELETE FROM auth.account WHERE user_id = p_user_id;
  DELETE FROM auth."user" WHERE id = p_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.purge_account_auth(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_account_auth(uuid) TO app_system;

-- Whether an account can ever be signed back into (a verified phone, a linked Apple or Google
-- account, or a non-anonymous user): only such an account gets the 30-day grace; one that cannot
-- is purged on the next run, since nobody could restore it.
CREATE OR REPLACE FUNCTION app.account_has_identity(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth."user" u
     WHERE u.id = p_user_id AND (NOT u.is_anonymous OR u.phone_number_verified IS TRUE)
  ) OR EXISTS (
    SELECT 1 FROM auth.account a
     WHERE a.user_id = p_user_id AND a.provider_id IN ('apple', 'google')
  )
$$;
REVOKE EXECUTE ON FUNCTION app.account_has_identity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.account_has_identity(uuid) TO app_system;

-- What a restored account goes back to being: `anonymous` while Better Auth still counts it as
-- anonymous (a phone-verified pass keeps that flag), `registered` otherwise.
CREATE OR REPLACE FUNCTION app.account_open_status(p_user_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT CASE WHEN coalesce(
           (SELECT u.is_anonymous FROM auth."user" u WHERE u.id = p_user_id), false)
         THEN 'anonymous' ELSE 'registered' END
$$;
REVOKE EXECUTE ON FUNCTION app.account_open_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.account_open_status(uuid) TO app_system;

-- ---------------------------------------------------------------------------------------------
-- The account events join the catalogue (packages/domain/src/account/events.ts).
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
      'account.closed', 'account.restored', 'account.purged', 'trip.organiser_transferred'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;
