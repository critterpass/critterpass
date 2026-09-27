-- Durable jobs (docs/api-contracts-async.md §2, docs/data-model.md §3.18). pg-boss installs and
-- migrates its own tables inside `pgboss` when the worker starts; this migration only creates the
-- schema, owned by app_system, so every table pg-boss creates belongs to app_system as well.
-- app_user and guide_reader get nothing here: a command transaction enqueues through
-- packages/db/src/jobs/send-in-tx.ts, which switches to app_system for that one statement.
CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION app_system;
REVOKE ALL ON SCHEMA pgboss FROM PUBLIC;
