-- Profile, settings, app icons, travel history and the account deletion workflow
-- (docs/data-model.md §3.1, §3.17; docs/data-model-sync-and-privacy.md §1 "Deletion").
--
-- Expand only: new columns are nullable or defaulted, new tables are additive, and the users
-- username format check matches what `update_profile` already enforces.

-- ---------------------------------------------------------------------------------------------
-- users: spoken languages (3n-3) and the username change clock (one change per 30 days).
ALTER TABLE users ADD COLUMN languages text[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN username_changed_at timestamptz;
ALTER TABLE users ADD CONSTRAINT users_username_format_check
  CHECK (username IS NULL OR username ~ '^[a-z0-9_.]{3,20}$');
ALTER TABLE users ADD CONSTRAINT users_languages_max_check
  CHECK (cardinality(languages) <= 12);
GRANT SELECT (languages, username_changed_at) ON users TO admin_reader;

-- user_settings: guide sound and music (3n-7) and the home currency override (3n-8).
ALTER TABLE user_settings ADD COLUMN audio jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE user_settings ADD COLUMN home_currency_override text;
ALTER TABLE user_settings ADD CONSTRAINT user_settings_audio_object_check
  CHECK (jsonb_typeof(audio) = 'object');
ALTER TABLE user_settings ADD CONSTRAINT user_settings_home_currency_override_check
  CHECK (home_currency_override IS NULL OR home_currency_override ~ '^[A-Z]{3}$');
GRANT SELECT (audio, home_currency_override) ON user_settings TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- app_icon_unlocks: earned app icons (3n-5). RLS class O read / S write: only the unlock job
-- writes, the owner reads (and marks the NEW badge seen through `set_app_icon`'s system step).
CREATE TABLE app_icon_unlocks (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  icon_key text NOT NULL CHECK (icon_key ~ '^[a-z][a-z0-9-]{1,31}$'),
  source text NOT NULL CHECK (source IN ('form_found', 'crew_achievement', 'home_set')),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, icon_key)
);
CREATE TRIGGER app_icon_unlocks_touch_updated_at BEFORE UPDATE ON app_icon_unlocks
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE app_icon_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_icon_unlocks FORCE ROW LEVEL SECURITY;
CREATE POLICY app_icon_unlocks_owner_read ON app_icon_unlocks FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY app_icon_unlocks_system ON app_icon_unlocks FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON app_icon_unlocks TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_icon_unlocks TO app_system;

-- past_trips: self-reported travel history (Q-49). RLS class O; removal is a soft delete
-- (`app_user` holds no DELETE anywhere), the purge hard-deletes.
CREATE TABLE past_trips (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  place_id uuid,
  country text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX past_trips_user_id_idx ON past_trips (user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER past_trips_touch_updated_at BEFORE UPDATE ON past_trips
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE past_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE past_trips FORCE ROW LEVEL SECURITY;
CREATE POLICY past_trips_self ON past_trips FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY past_trips_system ON past_trips FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON past_trips TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON past_trips TO app_system;

-- ---------------------------------------------------------------------------------------------
-- account_deletions: the free-text reason behind SOMETHING ELSE (cleared at purge), when the N-52
-- reminder went out, and any provider-token revoke that failed at close (the console shows it).
ALTER TABLE account_deletions ADD COLUMN reason_note text
  CHECK (reason_note IS NULL OR char_length(reason_note) <= 500);
ALTER TABLE account_deletions ADD COLUMN reminded_at timestamptz;
ALTER TABLE account_deletions ADD COLUMN provider_revoke_error text;
ALTER TABLE account_deletions ADD CONSTRAINT account_deletions_reason_check
  CHECK (reason IS NULL OR reason IN
    ('trips_over', 'too_many_pings', 'crew_moved_apps', 'privacy', 'something_else'));
CREATE INDEX account_deletions_due_idx ON account_deletions (purge_at)
  WHERE restored_at IS NULL AND purged_at IS NULL;
-- The console's deletion panel reads the workflow columns (privacy map: every non-C3 column).
GRANT SELECT (reason_note, reminded_at, provider_revoke_error) ON account_deletions TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- The purge (services/worker/src/jobs/account/purge.ts) runs as app_system and deletes the rows
-- packages/domain/src/account/purge-policy.ts names; these are the tables that did not already
-- grant it DELETE.
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
    'saved_items', 'phrase_progress', 'custom_phrase_cards', 'queued_guide_questions',
    'guide_messages', 'guide_threads', 'import_candidates', 'paywall_impressions',
    'user_entitlements', 'share_calcs', 'participant_dietary_flags', 'crew_contact_cards',
    'member_etas', 'location_shares', 'invite_opens', 'affiliate_clicks', 'cmd_results',
    'cmd_log', 'stickers', 'stamps', 'taste_profiles', 'passes', 'avatars',
    'booking_attachments', 'media_objects', 'push_tokens'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT DELETE ON public.%I TO app_system', t);
    END IF;
  END LOOP;
END
$$;

-- Device action keys keep no DELETE grant for any role (revoked keys stay auditable for 30 days);
-- a purge runs a month after close, when every key of the account is long revoked, and removes
-- them through this function, the way anonymous GC does.
CREATE OR REPLACE FUNCTION app.purge_device_action_keys(p_user_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  DELETE FROM device_action_keys WHERE user_id = p_user_id;
$$;
REVOKE EXECUTE ON FUNCTION app.purge_device_action_keys(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_device_action_keys(uuid) TO app_system;

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

-- Where account e-mails (export ready, deletion confirmed, purge reminder) go: the verified e-mail
-- of a registered account, or nothing (anonymous and phone-only accounts carry a placeholder).
CREATE OR REPLACE FUNCTION app.account_email(p_user_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT email FROM auth."user"
   WHERE id = p_user_id AND NOT is_anonymous AND email_verified
     AND email NOT LIKE '%@anonymous.placeholder.invalid'
$$;
REVOKE EXECUTE ON FUNCTION app.account_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.account_email(uuid) TO app_system;

-- ---------------------------------------------------------------------------------------------
-- The profile, settings, icon, travel-history and account events join the catalogue
-- (packages/domain/src/you/events.ts, packages/domain/src/account/events.ts).
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
      'settings.changed', 'profile.icon_changed', 'profile.icon_unlocked', 'past_trip.added',
      'past_trip.removed', 'account.export_requested', 'account.export_ready', 'account.closed',
      'account.restored', 'account.purge_due_soon', 'account.purged',
      'trip.organiser_transferred', 'ledger.written_off'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- ---------------------------------------------------------------------------------------------
-- The two publishable tables join the powersync publication (stream `me`), same guarded pattern
-- as every earlier extension (packages/db/src/publication.ts is the source of truth).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_icon_unlocks', 'past_trips'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
    EXECUTE format('GRANT SELECT ON %I TO powersync_repl', t);
  END LOOP;
END
$$;
