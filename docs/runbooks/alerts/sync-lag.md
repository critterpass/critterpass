# Sync lag over 60 s (P1)

**Signal:** `powersync_replication_lag_seconds` above 60 for 5 minutes (rule `cp-p1-sync-lag`). Clients see changes a minute or more late.

**Likely causes:** `powersync-repl` stopped or restarting; a large transaction or backfill; bucket storage Postgres slow or full; the replication slot invalidated after a database switchover.

**Checks**
1. Railway → `powersync-repl` logs: replication errors, restarts, "slot" messages.
2. Grafana → *CritterPass / Database*: `cp_pg_slot_lag_bytes` and `cp_pg_slot_active` for the PowerSync slot.
3. Railway → `Postgres` (bucket storage): disk and CPU.
4. PowerSync diagnostics API (`PS_ADMIN_API_TOKEN`) for the replication status.

**Mitigation:** restart `powersync-repl`; if the slot was lost, let PowerSync recreate it and re-snapshot (clients keep working offline meanwhile). Scale bucket storage if it is saturated.

**Rollback:** revert the deploy that preceded the lag (sync rules or service config) and restart replication.
