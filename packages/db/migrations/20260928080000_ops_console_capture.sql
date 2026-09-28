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

-- ---------------------------------------------------------------------------------------------
-- moderation_reports: the reported subject's author (resolved by the kind handler at intake), who
-- is working the report, when it is due (first filing + `moderation.sla_hours`, default 24) and how
-- many filings gave each reason. Written by app_system only; admin_reader reads them (class C2).
ALTER TABLE moderation_reports ADD COLUMN author_id uuid;
ALTER TABLE moderation_reports ADD COLUMN assignee_admin_id uuid;
ALTER TABLE moderation_reports ADD COLUMN due_at timestamptz;
ALTER TABLE moderation_reports ADD COLUMN reason_counts jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(reason_counts) = 'object');
UPDATE moderation_reports SET
  due_at = created_at + interval '24 hours',
  reason_counts = jsonb_build_object(reason, report_count);
CREATE INDEX moderation_reports_author_idx ON moderation_reports (author_id) WHERE author_id IS NOT NULL;
CREATE INDEX moderation_reports_open_due_idx ON moderation_reports (due_at) WHERE status = 'open';
GRANT SELECT (author_id, assignee_admin_id, due_at, reason_counts) ON moderation_reports
  TO admin_reader;

-- ops.moderation_filings.note: the reporter's optional note (≤ 280 characters, C2), with contact
-- details and links cut out at intake.
ALTER TABLE ops.moderation_filings ADD COLUMN note text CHECK (length(note) BETWEEN 1 AND 280);

-- ---------------------------------------------------------------------------------------------
-- ops.work_claims: who is working an item of a console queue (desk, moderation and the queues
-- later areas register). One holder per item; written by console commands as app_system, read by
-- the console as admin_reader; app_user has no access (ops schema). Class C2 (operator ids).
CREATE TABLE ops.work_claims (
  queue text NOT NULL CHECK (queue ~ '^[a-z][a-z0-9_]*$' AND length(queue) <= 40),
  item_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (queue, item_id)
);
CREATE INDEX work_claims_admin_idx ON ops.work_claims (admin_id);
ALTER TABLE ops.work_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.work_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY work_claims_system ON ops.work_claims FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY work_claims_admin_reader ON ops.work_claims FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.work_claims TO app_system;
GRANT SELECT ON ops.work_claims TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- auth.session.console: set by the ops console's Better Auth instance (`additionalFields`), so
-- the operators view counts console sessions and clearing an operator's roles ends only those,
-- never the person's app sessions.
ALTER TABLE auth.session ADD COLUMN console boolean NOT NULL DEFAULT false;
CREATE INDEX session_console_user_idx ON auth.session (user_id, created_at DESC) WHERE console;
