-- Ops console data capture: what the console's history, queues and operator views need recorded
-- from the first day, because none of it can be backfilled later.

-- ---------------------------------------------------------------------------------------------
-- ops.admin_audit: every row now carries the standard detail (summary, changes, via, roles). The
-- console looks rows up by command op_id, lists one action over time and reads one config key's
-- history.
CREATE INDEX admin_audit_op_id_idx ON ops.admin_audit (op_id);
CREATE INDEX admin_audit_action_at_idx ON ops.admin_audit (action, at DESC);
CREATE INDEX admin_audit_detail_key_idx ON ops.admin_audit ((detail ->> 'key'));

-- A console command whose handler writes its own audit row (a handler shared with another door)
-- publishes the pipeline's context on the transaction; this fills op_id, the standard detail and
-- the hashed IP on that row as it is inserted. Rows that already carry an op_id are left alone, and
-- the table stays insert-only for app_system.
CREATE FUNCTION ops.admin_audit_fill_context() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  context jsonb := nullif(current_setting('app.admin_audit_context', true), '')::jsonb;
BEGIN
  IF context IS NULL OR NEW.op_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  NEW.op_id := (context ->> 'op_id')::uuid;
  NEW.ip_hash := coalesce(NEW.ip_hash, context ->> 'ip_hash');
  NEW.detail := (context -> 'detail')
    || jsonb_build_object('summary', (context -> 'detail' ->> 'summary')
         || CASE WHEN NEW.target_id IS NULL THEN '' ELSE ' · ' || NEW.target_id::text END)
    || CASE WHEN jsonb_typeof(NEW.detail) = 'object' THEN NEW.detail ELSE '{}'::jsonb END;
  RETURN NEW;
END;
$$;
CREATE TRIGGER admin_audit_fill_context BEFORE INSERT ON ops.admin_audit
  FOR EACH ROW EXECUTE FUNCTION ops.admin_audit_fill_context();
