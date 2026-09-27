-- `monitoring_reader`: the Grafana Alloy collector's login (infra/monitoring/alloy). Server
-- statistics only through pg_monitor (pg_stat_activity, pg_stat_replication, pg_replication_slots,
-- pg_stat_statements, WAL positions); no schema usage and no table grant, so it can never read a
-- row of user data. Password provisioned out-of-band like every other login (Railway variable).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monitoring_reader') THEN
    CREATE ROLE monitoring_reader LOGIN NOBYPASSRLS;
  END IF;
END
$$;

DO $$
BEGIN
  GRANT pg_monitor TO monitoring_reader;
EXCEPTION WHEN insufficient_privilege THEN
  -- Some managed platforms reserve predefined-role grants for their own tooling; the platform
  -- runbook (infra/monitoring/README.md) grants it there instead.
  RAISE WARNING 'pg_monitor must be granted to monitoring_reader by the platform';
END
$$;
