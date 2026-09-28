-- Statement statistics for the monitoring collector (infra/monitoring/postgres-queries.yaml exports
-- the top statements by query id, never their text; `monitoring_reader` reads them through
-- pg_monitor). The view only returns rows once the server preloads the library
-- (shared_preload_libraries), a platform setting outside SQL (infra/monitoring/README.md).
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;
