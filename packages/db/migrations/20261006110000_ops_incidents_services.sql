-- Ops console incidents and third-party service monitoring. All three tables live in the ops
-- schema: written by app_system (console commands and worker crons), read by admin_reader,
-- unreachable for app_user.

-- ---------------------------------------------------------------------------------------------
-- ops.incidents: the incident and maintenance banners every console page shows, newest first.
-- A `read_only` maintenance window makes the api refuse console commands except updating or
-- resolving the banner itself; the owner's emergency CLI still works. Class C2 (operator ids).
CREATE TABLE ops.incidents (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('incident', 'maintenance')),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 400),
  runbook_url text CHECK (runbook_url ~ '^https://' AND length(runbook_url) <= 500),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  read_only boolean NOT NULL DEFAULT false,
  posted_by uuid NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz,
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (read_only = false OR kind = 'maintenance'),
  CHECK ((resolved_by IS NULL) = (resolved_at IS NULL))
);
CREATE INDEX incidents_open_idx ON ops.incidents (starts_at DESC) WHERE resolved_at IS NULL;
ALTER TABLE ops.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.incidents FORCE ROW LEVEL SECURITY;
CREATE POLICY incidents_system ON ops.incidents FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY incidents_admin_reader ON ops.incidents FOR SELECT TO admin_reader USING (true);
GRANT SELECT, INSERT, UPDATE ON ops.incidents TO app_system;
GRANT SELECT ON ops.incidents TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- ops.service_health: one snapshot per service per collector tick (every 60 s), kept 30 days
-- (the collector deletes older rows). A value nobody measured stays NULL, never a guess.
-- Class C0 (no personal data).
CREATE TABLE ops.service_health (
  service text NOT NULL CHECK (service ~ '^[a-z][a-z0-9_]*$' AND length(service) <= 40),
  at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL CHECK (state IN ('ok', 'degraded', 'down', 'unknown')),
  p95_ms integer CHECK (p95_ms >= 0),
  error_rate numeric(6, 5) CHECK (error_rate BETWEEN 0 AND 1),
  quota_used_pct numeric(5, 2) CHECK (quota_used_pct >= 0),
  calls integer CHECK (calls >= 0),
  PRIMARY KEY (service, at)
);
CREATE INDEX service_health_at_idx ON ops.service_health (at);
ALTER TABLE ops.service_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.service_health FORCE ROW LEVEL SECURITY;
CREATE POLICY service_health_system ON ops.service_health FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY service_health_admin_reader ON ops.service_health FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT, INSERT, DELETE ON ops.service_health TO app_system;
GRANT SELECT ON ops.service_health TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- ops.vendor_spend_daily: what each vendor cost per day, from its billing API, computed from our
-- own usage (AI, SMS) or entered by the owner for fixed monthly plans (`set_vendor_cost`, booked
-- on the month's first day). Class C2 (business spend; the note may name an operator).
CREATE TABLE ops.vendor_spend_daily (
  service text NOT NULL CHECK (service ~ '^[a-z][a-z0-9_]*$' AND length(service) <= 40),
  day date NOT NULL,
  amount_micros bigint NOT NULL CHECK (amount_micros >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  source text NOT NULL CHECK (source IN ('api', 'manual', 'computed')),
  note text CHECK (length(note) <= 280),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service, day, source)
);
ALTER TABLE ops.vendor_spend_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.vendor_spend_daily FORCE ROW LEVEL SECURITY;
CREATE POLICY vendor_spend_daily_system ON ops.vendor_spend_daily FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY vendor_spend_daily_admin_reader ON ops.vendor_spend_daily FOR SELECT
  TO admin_reader USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.vendor_spend_daily TO app_system;
GRANT SELECT ON ops.vendor_spend_daily TO admin_reader;
