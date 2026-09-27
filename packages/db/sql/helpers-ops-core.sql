-- app.sync_client_config: keeps the public client_config table mirrored from ops.ops_config's
-- is_public rows (docs/data-model.md §3.14). Review copy: the applied source of truth is
-- packages/db/migrations/*_ops_core_and_publication.sql; keep this file in sync with the newest
-- migration when extending this function, not the other way around.

CREATE OR REPLACE FUNCTION app.sync_client_config() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM client_config WHERE key = OLD.key;
    RETURN OLD;
  END IF;

  IF NEW.is_public THEN
    INSERT INTO client_config (key, value) VALUES (NEW.key, NEW.value)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  ELSE
    DELETE FROM client_config WHERE key = NEW.key;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.sync_client_config() FROM PUBLIC;
