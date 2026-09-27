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
