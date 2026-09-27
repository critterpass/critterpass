-- Core helper functions shared by every later migration (docs/data-model.md §2).
-- app.uid() is the identity every RLS policy trusts, so it is STABLE SECURITY DEFINER with a
-- pinned search_path (defence against a caller search_path shadowing current_setting); the rest
-- need no elevated access and stay SECURITY INVOKER.

CREATE OR REPLACE FUNCTION app.uid() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT NULLIF(current_setting('app.uid', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.device() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT NULLIF(current_setting('app.device', true), '')
$$;

CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.valid_tz(tz text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = tz)
$$;

REVOKE EXECUTE ON FUNCTION app.uid() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.device() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.touch_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.valid_tz(text) FROM PUBLIC;

-- guide_reader calls app.uid()/app.device() indirectly through llm.* view predicates, added once the guide's AI context views exist.
GRANT EXECUTE ON FUNCTION app.uid() TO app_user, app_system, guide_reader;
GRANT EXECUTE ON FUNCTION app.device() TO app_user, app_system, guide_reader;
GRANT EXECUTE ON FUNCTION app.touch_updated_at() TO app_user, app_system;
GRANT EXECUTE ON FUNCTION app.valid_tz(text) TO app_user, app_system;
