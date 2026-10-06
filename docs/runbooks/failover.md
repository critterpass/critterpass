# Database failover

PlanetScale Postgres runs one primary and two replicas in production. A failover (planned
switchover or PlanetScale-initiated) pauses writes for seconds; the risk is PowerSync's logical
replication slot, which today does not survive a switchover and forces a full re-snapshot
(details and the slot-keeping options: docs/runbooks/db-switchover-drill.md).

Targets: api and database writes back within 5 minutes; sync caught up within the 2 h RTO.

## Quarterly drill (staging)

```sh
DRILL_DATABASE_URL=<staging direct :5432 URL of a role that can read pg_replication_slots> \
API_BASE_URL=https://api-staging-de92.up.railway.app \
pnpm tsx tools/scripts/drills/failover.ts --staging --branch staging --dry-run   # health check only
# then without --dry-run
```

The script refuses `main`, checks the stack is healthy, runs `pscale branch switchover`, samples the
database, `/health` and `pg_replication_slots` every 5 s until all three are back, and prints
the downtime of each and whether the same slot came back. Staging needs replicas for a real
switchover (`pscale branch resize`); without them PlanetScale restarts the single node in place.

After the run:

1. Check `powersync-repl` logs: `Created replication slot` means a re-snapshot; time it until
   `sync-lag` is back under 60 s (Grafana sync dashboard).
2. Check the app on a device: sync resumes, a new expense appears for a crewmate.
3. Add a row to the log below.

## Real failover

1. Grafana alerts `api-down`, `sync-lag` or `replication-slot-lag` usually fire first; PlanetScale
   status shows the event.
2. api and worker reconnect on their own (pool retries). If the api stays down past 5 minutes,
   redeploy it in Railway.
3. If PowerSync re-snapshots: watch `replication-slot-lag` (the old slot is gone, so WAL is not
   held); clients keep working offline and catch up. If the re-snapshot will exceed 2 h, follow
   D4's fallback (Railway Postgres HA or PowerSync Cloud) in docs/runbooks/db-switchover-drill.md.
4. Afterwards drop any inactive logical slot left behind (`pg_drop_replication_slot`), or it
   holds WAL until the disk fills.

## Drill log

| Date | Branch | DB down | API down | Slot back | Same slot |
|---|---|---|---|---|---|
