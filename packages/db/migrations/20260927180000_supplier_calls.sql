-- Supplier call audit (docs/api-contracts.md §7: "every outbound call ... `supplier_calls` audit row
-- (no PII bodies)"): one row per attempt of every outbound supplier request made through
-- `@cp/suppliers`' core. Only the supplier, a fixed endpoint label (never a URL, query string or
-- body), the outcome, HTTP status, latency and cost units are stored, so nothing here can carry a
-- key, a traveller's details or supplier content. RLS class S in the ops schema: no app_user grant.

CREATE TABLE ops.supplier_calls (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  supplier text NOT NULL,
  endpoint text NOT NULL,
  method text NOT NULL,
  attempt smallint NOT NULL DEFAULT 1,
  outcome text NOT NULL,
  status smallint,
  latency_ms integer NOT NULL,
  cost_units integer NOT NULL DEFAULT 0,
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ops.supplier_calls ADD CONSTRAINT supplier_calls_outcome_check
  CHECK (outcome IN ('ok', 'http_error', 'timeout', 'network_error'));
ALTER TABLE ops.supplier_calls ADD CONSTRAINT supplier_calls_method_check
  CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE'));
ALTER TABLE ops.supplier_calls ADD CONSTRAINT supplier_calls_endpoint_check
  CHECK (endpoint !~ '[?#]' AND endpoint !~ '^[a-z]+://');
ALTER TABLE ops.supplier_calls ADD CONSTRAINT supplier_calls_numbers_check
  CHECK (attempt >= 1 AND latency_ms >= 0 AND cost_units >= 0);
CREATE INDEX supplier_calls_supplier_at_idx ON ops.supplier_calls (supplier, at DESC);
ALTER TABLE ops.supplier_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.supplier_calls FORCE ROW LEVEL SECURITY;
CREATE POLICY supplier_calls_system ON ops.supplier_calls FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, DELETE ON ops.supplier_calls TO app_system;
-- The ops console reads supplier health (call volume, failures, latency) through admin_reader.
CREATE POLICY supplier_calls_admin_reader ON ops.supplier_calls FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT ON ops.supplier_calls TO admin_reader;
