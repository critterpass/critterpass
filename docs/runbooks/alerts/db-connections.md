# Database connections near the limit (P2)

**Signal:** client connections in `pg_stat_activity` (`cp_pg_connections_count`, background processes excluded) above 80 % of `pg_settings_max_connections` for 10 minutes (rule `cp-p2-db-connections`). At 100 % minus the superuser reserve, new connections fail with `remaining connection slots are reserved for roles with the SUPERUSER attribute`: pg-boss enqueues, Better Auth sign-ins and PgBouncer's new server connections all return errors.

**Likely causes:** a pool size raised past the budget in `infra/railway/README.md` ("Database connection budget"); an extra replica of the worker or api; the worker's handlers on the direct URL because its `DATABASE_URL` is unset; PgBouncer's `max_db_connections` unset or raised; a deploy stuck with old and new instances both running; a leak (connections `idle in transaction`).

**Checks**
1. Grafana → *CritterPass / Database*: connections by role and state; which role grew.
2. As `monitoring_reader`: `SELECT usename, application_name, state, count(*) FROM pg_stat_activity WHERE backend_type = 'client backend' GROUP BY 1, 2, 3 ORDER BY 4 DESC;` (`cp-worker-jobs` is the worker's pg-boss, `cp-api-jobs` the api's producer, no name with the app user is PgBouncer or the relay listener).
3. Railway: replica counts and any deployment that is still overlapping; `DB_POOL_MAX`, `AUTH_POOL_MAX`, `ADMIN_AUTH_POOL_MAX`, `JOBS_POOL_MAX` on api and worker.
4. PlanetScale → the branch's PgBouncer settings: `default_pool_size` and `max_db_connections`.

**Mitigation:** bring the pool variables back to the budget table and redeploy the service; set PgBouncer `max_db_connections` back to its budgeted value (applied with a live reload). End a leaked `idle in transaction` backend with `pg_terminate_backend(pid)` after checking what it holds. If the budget itself no longer fits, raise `max_connections` with a larger cluster size and update the table.

**Rollback:** pool variables and PgBouncer settings are plain configuration; restore the previous values and redeploy.
