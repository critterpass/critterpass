-- Identity, crew, membership and the crew-membership epoch trigger (docs/data-model.md §3.1,
-- §3.2; sources reviewed separately in packages/db/sql/helpers-crew.sql).

-- Identity, crew and membership-epoch tables (docs/data-model.md §3.1, §3.2). RLS policies and
-- grants are added once the helper functions below exist (a policy's USING/CHECK expression is
-- parsed immediately, unlike a plpgsql function body, so the functions must come first).

CREATE TABLE users (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'anonymous',
  display_name text,
  username citext UNIQUE,
  home_airport text,
  home_country text,
  home_currency text,
  locale text,
  tz text,
  member_since date NOT NULL DEFAULT CURRENT_DATE,
  avatar_id uuid,
  app_icon text,
  purge_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE users IS 'Mirrors auth.user 1:1 by id; Better Auth owns auth.user and arrives in a later migration, so id has no FK yet. avatar_id likewise has no FK until avatars exists.';
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('anonymous', 'registered', 'closed', 'purged'));
ALTER TABLE users ADD CONSTRAINT users_tz_check CHECK (tz IS NULL OR app.valid_tz(tz));
CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE TABLE user_settings (
  user_id uuid PRIMARY KEY REFERENCES users (id),
  chattiness text,
  talk_out_loud boolean NOT NULL DEFAULT false,
  leave_by_through_dnd boolean NOT NULL DEFAULT false,
  crew_chat_mode text,
  location_mode text,
  email_import boolean NOT NULL DEFAULT false,
  price_display text NOT NULL DEFAULT 'home',
  time_format text,
  distance_unit text,
  app_locale text,
  hide_lockscreen_details boolean NOT NULL DEFAULT false,
  hide_taste_tags boolean NOT NULL DEFAULT false,
  hide_collection boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_settings ADD CONSTRAINT user_settings_price_display_check CHECK (price_display IN ('home', 'local', 'both'));
CREATE TRIGGER user_settings_touch_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings FORCE ROW LEVEL SECURITY;

CREATE TABLE consents (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  purpose text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted_at timestamptz,
  revoked_at timestamptz,
  copy_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, purpose)
);
ALTER TABLE consents ADD CONSTRAINT consents_purpose_check CHECK (purpose IN ('dietary_visibility', 'faces', 'mailbox_surfacing', 'insurance_to_clinic', 'help_auto_share', 'multi_member_publish', 'visit_detection', 'crew_phone_visible', 'analytics', 'marketing', 'ai_voice'));
CREATE TRIGGER consents_touch_updated_at BEFORE UPDATE ON consents
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents FORCE ROW LEVEL SECURITY;

CREATE TABLE media_objects (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL REFERENCES users (id),
  r2_key text NOT NULL,
  kind text NOT NULL,
  bytes bigint NOT NULL,
  sha256 text NOT NULL,
  trip_id uuid,
  purpose text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN media_objects.trip_id IS 'No FK yet: trips does not exist until a later migration.';
CREATE INDEX media_objects_owner_id_idx ON media_objects (owner_id);
CREATE TRIGGER media_objects_touch_updated_at BEFORE UPDATE ON media_objects
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE media_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_objects FORCE ROW LEVEL SECURITY;

CREATE TABLE crews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL,
  settlement_currency text,
  member_ceiling integer NOT NULL DEFAULT 16,
  membership_epoch integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crews ADD CONSTRAINT crews_member_ceiling_check CHECK (member_ceiling > 0);
CREATE TRIGGER crews_touch_updated_at BEFORE UPDATE ON crews
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE crews FORCE ROW LEVEL SECURITY;

CREATE TABLE crew_members (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  user_id uuid NOT NULL REFERENCES users (id),
  role text NOT NULL DEFAULT 'member',
  colour text,
  status text NOT NULL DEFAULT 'active',
  keep_in_chat boolean NOT NULL DEFAULT false,
  joined_epoch integer,
  left_at timestamptz,
  last_read_message_id uuid,
  notify_level text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (crew_id, user_id)
);
ALTER TABLE crew_members ADD CONSTRAINT crew_members_role_check CHECK (role IN ('organiser', 'member'));
ALTER TABLE crew_members ADD CONSTRAINT crew_members_status_check CHECK (status IN ('active', 'left', 'removed', 'former'));
CREATE INDEX crew_members_user_crew_active_idx ON crew_members (user_id, crew_id) WHERE status = 'active';
CREATE TRIGGER crew_members_touch_updated_at BEFORE UPDATE ON crew_members
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members FORCE ROW LEVEL SECURITY;

-- Provisioned early: the membership epoch trigger below needs somewhere to write an unsubscribe
-- notification. The command bookkeeping migration extends this table with its general write path
-- (app.enqueue_rt) and the worker/powersync_repl relay grants; nothing here should be recreated,
-- only added to.
CREATE TABLE rt_outbox (
  id bigserial PRIMARY KEY,
  channel text NOT NULL,
  payload jsonb NOT NULL,
  idem_key uuid NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
);
ALTER TABLE rt_outbox ADD CONSTRAINT rt_outbox_kind_check CHECK (kind IN ('publish', 'unsubscribe', 'disconnect'));
CREATE UNIQUE INDEX rt_outbox_idem_key_idx ON rt_outbox (idem_key);
ALTER TABLE rt_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE rt_outbox FORCE ROW LEVEL SECURITY;

-- Crew-membership RLS helpers and the membership epoch trigger (docs/data-model.md §2, §3.2).
-- These are STABLE SECURITY DEFINER so they can read crew_members despite its own FORCE ROW LEVEL
-- SECURITY: the definer role (app_owner) needs BYPASSRLS for that internal read to not recurse
-- back into the very policy that calls the function (a well-known Postgres RLS pattern: a
-- SECURITY DEFINER function only skips RLS when its owner can).
ALTER ROLE app_owner BYPASSRLS;

CREATE OR REPLACE FUNCTION app.is_crew_member(crew uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM crew_members
    WHERE crew_id = crew AND user_id = app.uid() AND status = 'active'
  )
$$;

-- Chat history stays visible to a former member who chose to keep it (docs/data-model.md §3.2).
CREATE OR REPLACE FUNCTION app.is_crew_chat_member(crew uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM crew_members
    WHERE crew_id = crew AND user_id = app.uid()
      AND (status = 'active' OR (status = 'former' AND keep_in_chat))
  )
$$;

-- Needed for the crew_members "organiser may manage any member" policy below; not naming it would
-- force that policy to inline the same recursive-RLS problem app.is_crew_member solves.
CREATE OR REPLACE FUNCTION app.is_crew_organiser(crew uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM crew_members
    WHERE crew_id = crew AND user_id = app.uid() AND role = 'organiser' AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION app.shares_crew(a uuid, b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM crew_members cm_a
    JOIN crew_members cm_b ON cm_b.crew_id = cm_a.crew_id
    WHERE cm_a.user_id = a AND cm_b.user_id = b
      AND cm_a.status = 'active' AND cm_b.status = 'active'
  )
$$;

REVOKE EXECUTE ON FUNCTION app.is_crew_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.is_crew_chat_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.is_crew_organiser(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.shares_crew(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.is_crew_member(uuid) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.is_crew_chat_member(uuid) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.is_crew_organiser(uuid) TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.shares_crew(uuid, uuid) TO app_user, app_system;

-- Channel name builder shared with packages/domain/src/channel-names.ts; introduced here because
-- the membership epoch trigger below is its first caller. `#` is reserved for the user-limited
-- `user:#{uid}` channel.
CREATE OR REPLACE FUNCTION app.channel_name(ns text, id text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN ns = 'user' THEN ns || ':#' || id ELSE ns || ':' || id END
$$;

REVOKE EXECUTE ON FUNCTION app.channel_name(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.channel_name(text, text) TO app_user, app_system;

-- Membership epoch (docs/data-model.md §3.2): joining (INSERT, or a rejoin transition into
-- 'active') bumps crews.membership_epoch and stamps joined_epoch; an active -> {left, removed,
-- former} transition bumps the epoch again and writes one unsubscribe rt_outbox row on the crew's
-- primary channel. The crew_chat/crew_money/crew_bookings/crew_collection and trip-scoped channels
-- join this fan-out once the tables that name them (chat, money, trips) exist. SECURITY DEFINER:
-- app_user has no direct grant on crews.membership_epoch or rt_outbox, both written here on its
-- behalf.
CREATE OR REPLACE FUNCTION app.crew_members_epoch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  bumped_epoch integer;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'active' AND NEW.status = 'active') THEN
    UPDATE crews SET membership_epoch = membership_epoch + 1
      WHERE id = NEW.crew_id
      RETURNING membership_epoch INTO bumped_epoch;
    NEW.joined_epoch := bumped_epoch;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status <> 'active' THEN
    UPDATE crews SET membership_epoch = membership_epoch + 1 WHERE id = NEW.crew_id;
    INSERT INTO rt_outbox (channel, payload, idem_key, kind)
    VALUES (
      app.channel_name('crew', NEW.crew_id::text),
      jsonb_build_object('user_id', NEW.user_id),
      gen_random_uuid(),
      'unsubscribe'
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.crew_members_epoch() FROM PUBLIC;

CREATE TRIGGER crew_members_epoch
  BEFORE INSERT OR UPDATE ON crew_members
  FOR EACH ROW EXECUTE FUNCTION app.crew_members_epoch();

-- RLS policies and grants (docs/data-model.md §3.1, §3.2), now that the helper functions exist.

-- Every RLS policy above is scoped `TO app_user` on purpose: with RLS forced, a role with no
-- applicable policy sees/writes nothing, regardless of table grants. app_system (worker, webhook
-- handlers, cron) is a trusted backend role, never reachable from a raw client request, so it gets
-- its own permissive policy per table rather than inheriting app_user's row scoping; cross-user
-- writes needing an actual invariant check still go through a SECURITY DEFINER function.
CREATE POLICY users_select ON users FOR SELECT TO app_user
  USING (id = app.uid() OR app.shares_crew(id, app.uid()));
CREATE POLICY users_insert ON users FOR INSERT TO app_user
  WITH CHECK (id = app.uid());
CREATE POLICY users_update ON users FOR UPDATE TO app_user
  USING (id = app.uid())
  WITH CHECK (id = app.uid());
CREATE POLICY users_system ON users FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON users TO app_user, app_system;

CREATE POLICY user_settings_owner ON user_settings FOR ALL TO app_user
  USING (user_id = app.uid())
  WITH CHECK (user_id = app.uid());
CREATE POLICY user_settings_system ON user_settings FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON user_settings TO app_user, app_system;

CREATE POLICY consents_owner ON consents FOR ALL TO app_user
  USING (user_id = app.uid())
  WITH CHECK (user_id = app.uid());
CREATE POLICY consents_system ON consents FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON consents TO app_user, app_system;

-- media_objects: RLS class S (docs/data-model.md §3.10) - no app_user policy at all, so the
-- default-deny with FORCE RLS leaves it unreadable/unwritable by app_user regardless of grants;
-- only app_system (and, later, a SECURITY DEFINER upload-confirmation path) touches this table.
CREATE POLICY media_objects_system ON media_objects FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON media_objects TO app_system;

CREATE POLICY crews_select ON crews FOR SELECT TO app_user
  USING (app.is_crew_member(id));
CREATE POLICY crews_insert ON crews FOR INSERT TO app_user
  WITH CHECK (created_by = app.uid());
CREATE POLICY crews_update ON crews FOR UPDATE TO app_user
  USING (app.is_crew_member(id))
  WITH CHECK (app.is_crew_member(id));
CREATE POLICY crews_system ON crews FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON crews TO app_user;
-- "mem (rename)": any member may rename a crew, but nothing else on it is app_user-writable at the
-- schema level (member_ceiling/membership_epoch are system/trigger-managed); a column-level grant
-- backstops that even though the row-level policy above would allow touching any column.
GRANT UPDATE (name) ON crews TO app_user;
GRANT SELECT, INSERT, UPDATE ON crews TO app_system;

CREATE POLICY crew_members_select ON crew_members FOR SELECT TO app_user
  USING (app.is_crew_member(crew_id));
CREATE POLICY crew_members_insert ON crew_members FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid());
CREATE POLICY crew_members_update ON crew_members FOR UPDATE TO app_user
  USING (user_id = app.uid() OR app.is_crew_organiser(crew_id))
  WITH CHECK (user_id = app.uid() OR app.is_crew_organiser(crew_id));
CREATE POLICY crew_members_system ON crew_members FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON crew_members TO app_user, app_system;

-- rt_outbox: RLS class S. No app_user/app_system grant or policy at all; only the SECURITY DEFINER
-- app.crew_members_epoch (owned by app_owner, which has BYPASSRLS) writes here for now.
