# Replication slot lag (P1)

**Signal:** `cp_pg_slot_lag_bytes` over 1 GB (rule `cp-p1-replication-slot-lag`) or every slot's lag growing for 15 minutes (`cp-p1-replication-slot-growing`). Retained WAL fills the primary's disk.

**Likely causes:** the slot's consumer (PowerSync replication) is down or stuck; an abandoned slot from a removed service; a long-running transaction holding back `confirmed_flush_lsn`.

**Checks**
1. Grafana → *CritterPass / Database*: which `slot_name` lags and whether `cp_pg_slot_active` is 0.
2. As `monitoring_reader`: `SELECT slot_name, active, pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) FROM pg_replication_slots;`
3. Long transactions: `SELECT pid, now() - xact_start, state FROM pg_stat_activity ORDER BY 2 DESC LIMIT 5;`

**Mitigation:** restore the consumer (restart `powersync-repl`). An inactive slot with no owner may be dropped by the database owner after confirming nothing uses it (`SELECT pg_drop_replication_slot('<name>')`); PowerSync then re-snapshots. End a runaway transaction with `pg_terminate_backend(pid)`.

**Rollback:** dropping a slot is not reversible; PowerSync recovers by re-snapshotting, which takes time but loses no data.
