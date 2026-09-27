# Runbook: PlanetScale Postgres switchover drill

Owner: platform on-call. Cadence: quarterly (system-architecture.md §10 "failover/switchover
drill in S-SYNC and quarterly (slot survives)"). Purpose: measure what a PlanetScale Postgres
primary switchover (planned maintenance, or PlanetScale-initiated failover) actually costs the
sync path — ideally the logical replication slot survives and the cost is a brief write pause;
the first real run (2026-09-27, see the drill log) found instead that the promoted replica does
not carry the slot, forcing a full re-snapshot. This drill exists to keep re-measuring that cost
release over release (as published tables grow) and to catch it becoming an incident (approaching
the RPO/RTO budget) rather than to assert it never happens.

## What "success" means

- **Ideal (slot survives):** the replication slot PowerSync holds keeps the **same name** before
  and after the switchover (`pg_replication_slots`), and `powersync-repl`'s logs show a brief
  reconnect (`Replication error` / retry) with no `Created replication slot` /
  fresh `Replicating "..." 0/?` for tables already caught up.
- **Observed instead (2026-09-27, see the drill log below):** the promoted replica does not carry
  the old primary's logical replication slot at all — PowerSync detects the slot is missing after
  its own retry/backoff window and creates a new one, forcing a full re-snapshot of every synced
  table. Treat this as the **expected** outcome on PlanetScale Postgres today, not a surprise
  each quarter, until support confirms otherwise (see the ADR's founder follow-ups).
- **Bar that still must hold regardless:** total sync-path gap stays comfortably inside RPO ≤5 min
  / RTO ≤2 h (system-architecture.md §10) for whatever data volume is under test — a re-snapshot
  taking minutes-to-hours because the published tables have grown large is the real regression to
  watch for release over release, not the presence of a re-snapshot itself. App-level writes
  (direct to Postgres, not through the replication connection) should barely be affected.
- No data loss for rows written before or during the gap: once replication resumes, every row
  the app successfully wrote is present.

## Prerequisites

- `pscale` CLI authenticated, `--org critterpass`.
- A PlanetScale Postgres branch with **replicas** (`pscale branch show critterpass <branch> --org
  critterpass --format json` → `replicas > 0`; a single-instance branch has nothing to fail over
  to and `pscale branch switchover` just restarts it in place — see "Fallback" below).
- Railway CLI authenticated, linked to the `critterpass` project, `staging` environment (the
  drill's own Railway services live in `staging` regardless of which PlanetScale branch they
  point at — see "Deploy the drill services").
- The `app_owner` role's current password for the target branch (`pscale role reset
  <db> <branch> <role-id> --org critterpass --force --format json` if not already on hand;
  rotating it is normal operational practice, not a destructive action, since nothing should
  depend on the *previous* password once rotated into the next deploy).

## Steps

### 1. Provision a scoped replication role on the target branch

```
pscale role create critterpass <branch> spike-s-sync --org critterpass \
  --inherited-roles postgres --with-replication --format json > <0600 scratch file>
```

Never print the JSON's `database_url`/`password` fields.

### 2. Set up the throwaway schema and grant the replication role access

The publication name is hardcoded by self-hosted PowerSync to `powersync` (not configurable —
`docs/decisions/20260927-self-hosted-powersync-sync.md` Finding #1) and, on every branch this
drill has run against, already carries real tables from schema migrations — `ALTER PUBLICATION`
needs the *owning* role (`app_owner`, via its `DATABASE_DIRECT_URL`-equivalent), not the
replication role (Finding #2). From `tools/spikes/`:

```
S_SYNC_STAGING_PUB_URL=<app_owner connection for the target branch> \
S_SYNC_REPL_USERNAME=<bare pscale role name for spike-s-sync, no .branch-id suffix> \
pnpm exec tsx <a small script calling ensureSpikeSchema(pool, replUsername) +
  addSpikeTableToPublication(pool) from src/s-sync/schema.ts>
```

(`assertNoSpikeTableInPublication` first, to confirm the branch's `powersync` publication has no
`spike.*` table left over from a previous run.)

### 3. Deploy the drill's own Railway services (staging environment, pointed at the target branch)

Three services, all pinned `southeast-asia=1 us-west=0 us-east=0 eu-west=0`:

| Service | Source | Key variables |
|---|---|---|
| `spike-sync-app` | `tools/spikes/s-sync-app.Dockerfile` | `DATABASE_URL=<app_owner connection>`, `PORT=8080` |
| `spike-powersync-repl` | `tools/spikes/s-sync-powersync.Dockerfile` | `PS_ROLE=sync`, `PS_DATA_SOURCE_URI=<spike-s-sync connection>`, `PS_DATA_SOURCE_SSLMODE=verify-full`, `PS_STORAGE_URI=${{Postgres.DATABASE_URL}}`, `PS_STORAGE_SSLMODE=disable`, `PS_JWKS_URI=http://spike-sync-app.railway.internal:8080/api/auth/jwks` |
| `spike-powersync-api` | same image, `PS_ROLE=api` | same as repl |

`railway up --service <name> --environment staging --ci`, then `railway domain --service
spike-sync-app --port 8080` and `railway domain --service spike-powersync-api --port 8080` for
public URLs. Confirm `spike-powersync-repl`'s logs show `Created replication slot spike_sync_*`
and `Replicating "spike"."messages"` before continuing.

### 4. Run the drill

```
S_SYNC_APP_URL=<spike-sync-app public URL> \
S_SYNC_SYNC_ENDPOINT=<spike-powersync-api public URL> \
S_SYNC_DATABASE_URL=<app_owner connection for the target branch> \
S_SYNC_SKIP_SETUP=true \
S_SYNC_DRILL_DATABASE=critterpass S_SYNC_DRILL_BRANCH=<branch> S_SYNC_DRILL_ORG=critterpass \
pnpm --filter @cp/spikes run s-sync:drill
```

`drill.ts` connects one real `@powersync/node` client as a watcher, starts a continuous writer
(one `/sync/upload` every `S_SYNC_WRITE_INTERVAL_MS`, default 500 ms), waits
`S_SYNC_BASELINE_MS` (default 20 s) for a steady baseline, records the replication slot name,
runs `pscale branch switchover <db> <branch> --org critterpass --format json`, waits
`S_SYNC_POST_SWITCHOVER_MS` (default 60 s), then reports: total/failed writes, the write gap
(last good write before the switchover to the first good write after), replication resume time
(switchover start to the watcher observing a post-switchover row), and whether the slot name
stayed the same.

### 5. Record the result

Append a dated entry below with: branch/cluster size, `switchoverResult` (candidate
promoted/unchanged), `writeGapMs`, `replicationResumeMs`, `slotNameStable`, and the verdict.

### 6. Clean up (every run, staging or drill)

```
# Publication + schema (owner role):
removeSpikeTableFromPublication(pool); dropSpikeSchema(pool); assertNoSpikeTableInPublication(pool);

# Replication slot + role (only needed if the repl service didn't already clean up its own slot
# on a graceful stop — check pg_replication_slots first):
select pg_drop_replication_slot('<slot name>');   -- run as the spike-s-sync role, which is what created it
pscale role delete critterpass <branch> <role-id> --org critterpass --force

# Railway:
railway service delete --service spike-sync-app --environment staging --yes
railway service delete --service spike-powersync-repl --environment staging --yes
railway service delete --service spike-powersync-api --environment staging --yes
```

Also drop the shared PowerSync storage service's (`${{Postgres.DATABASE_URL}}`) bookkeeping: it
self-manages a dedicated `powersync` schema there (`bucket_data`, `bucket_parameters`,
`current_data`, `custom_write_checkpoints`, `instance`, `locks`, `migrations`, `source_tables`,
`sync_rules`, `write_checkpoints`, `connection_report_events` — 11 tables as of Service 1.26.1),
not namespaced by data source, so a second deployment against the same storage database inherits
the first one's state (observed directly: a drill run reused and extended the end-to-end test's
storage state until both were cleaned up). `drop schema if exists powersync cascade` on the
storage database removes it in one step; that service has no public host, so run it from another
service already on the private network (`railway ssh -s api -- node -` with a short inline
script, or `railway connect postgres --ssh`).

## Fallback: no replicas available

If the target branch has no replicas, `pscale branch switchover` restarts the single instance in
place instead of promoting a standby — the drill still measures write-gap and slot survival
across a restart, but does not exercise promotion. Resize the branch to add replicas
(`pscale branch resize`) before a drill meant to validate the HA path specifically.

## Drill log

Full write-up: `docs/decisions/20260927-self-hosted-powersync-sync.md` ("Switchover drill").

| Date | Branch / cluster | Switchover result | Write gap | Replication resume | Slot stable | Verdict |
|---|---|---|---|---|---|---|
| 2026-09-27 | `main`, PS-5 (1 primary + 2 replicas) | Succeeded, 39.4 s (PlanetScale-reported `started_at`→`completed_at`) | 586 ms app-write gap; **~34.4 s sync-path gap** measured from repl logs (connection loss to data flowing again) — the drill's own timer undercounted this, see the ADR | Full re-snapshot after ~30 s of retry/detection (121 rows, near-instant to copy) | **No** — new slot (`spike_sync_2_c53e` → `spike_sync_3_9347`) | **FAIL** on slot survival; accepted as a bounded, budget-compliant operational gap (adjusted expectation, not a stack change) |
| <!-- filled after the first real run --> | | | | | | |
