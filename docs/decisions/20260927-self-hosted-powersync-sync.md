# S-SYNC: self-hosted PowerSync end to end, and a PlanetScale switchover drill

Date: 2026-09-27
Status: PASS on end-to-end criteria 1–6; **FAIL on the switchover drill (criterion 7)** — logical
slot does not survive a PlanetScale switchover, adjusted operational expectation chosen (see
"Switchover drill")

## Context

D4/D12 pin self-hosted PowerSync (Open Edition) on Railway SG, replicating from PlanetScale
Postgres, as the sync layer (system-architecture.md §2, §4.2, §7.c, §11). `tools/spikes/src/s-sync/`
proves the whole path for real: a deployed Railway app service (Better Auth JWKS + a
`/sync/upload` command-handler stand-in) and a deployed self-hosted PowerSync (`spike-powersync-repl`
+ `spike-powersync-api`) replicating a throwaway `spike.messages` table from PlanetScale staging,
driven by real `@powersync/node` clients (the same core sync protocol every PowerSync SDK speaks)
over the public internet — not a mocked client, not a loopback network.

## Criteria (phase-02 §Requirements, S-SYNC)

| # | Criterion | Result |
|---|---|---|
| 1 | Self-hosted PowerSync (Open Edition) on Railway SG replicating from PlanetScale | **PASS** |
| 2 | Better Auth JWKS used by PowerSync's `client_auth` | **PASS** |
| 3 | `/sync/upload` runs a command handler; validation reject returns 2xx + `cmd_results` row | **PASS** |
| 4 | Offline 50-op replay converges | **PASS** — 50/50 |
| 5 | Chat-row round-trip p95 < 1 s | **PASS** — p95 164.6 ms (real Railway SG ↔ PlanetScale ↔ public internet) |
| 6 | 1k synthetic connections hold | **PASS** — 1,120 concurrent, 0 failures (see "Connection count") |
| 7 | PlanetScale switchover keeps the logical slot | **FAIL** — new slot + full re-snapshot, ~34.4 s sync-path gap (see "Switchover drill") |

## Method

- Harness: `tools/spikes/src/s-sync/`. `schema.ts` (throwaway `spike` schema + `messages`/`cmd_log`/
  `cmd_results` tables, publication membership helpers), `upload-app.ts` (`POST /sync/upload`:
  idempotent by the PowerSync CRUD entry's own id, validation reject inserts a `cmd_results` row
  and still answers 2xx), `app.ts` (combines Better Auth — reused unmodified from `s-auth/harness.ts`
  — with the upload door and a spike-only `/internal/spike/token` mint endpoint), `client.ts`
  (`@powersync/node` schema + `PowerSyncBackendConnector`), `scenario.ts` (shared test logic for
  both the local and remote runners), `config/service.yaml` (spike-owned PowerSync config).
- Local regression probe (`run.ts`, `pnpm --filter @cp/spikes run s-sync`): S-SYNC's own
  Testcontainers Postgres (`startPostgres()` — Postgres 18, logical replication, empty `powersync`
  publication already created, same image every other spike's Testcontainers suite uses) as the
  replication source, a plain Postgres as PowerSync's bucket storage, and S-SYNC's own
  single-container PowerSync (`docker-compose.yml`) — free, always rerunnable, no cloud cost.
- Real deployment (`load.ts`, `pnpm --filter @cp/spikes run s-sync:load`): three Railway staging
  services from this branch's `tools/spikes/` — `spike-sync-app`
  (`s-sync-app.Dockerfile`; Better Auth + `/sync/upload` against PlanetScale staging),
  `spike-powersync-repl`/`spike-powersync-api` (`s-sync-powersync.Dockerfile`, `PS_ROLE=sync|api`,
  the spike's own `config/service.yaml` baked in), all pinned `southeast-asia=1` and reachable at
  public `*.up.railway.app` domains (matching how a real mobile client reaches `sync.critterpass.app`
  over the internet, not a private-network shortcut). Replication source: PlanetScale staging via
  a role created with `pscale role create critterpass staging spike-s-sync --org critterpass
  --inherited-roles postgres --with-replication --format json`.
- Connection-count run (`load-gen.ts`, `s-sync-loadgen.Dockerfile`, service `spike-sync-loadgen`):
  a one-shot job that ramps real `@powersync/node` clients against the deployed
  `spike-powersync-api`, run from Railway's own container(s) rather than the dev machine (see
  "Connection count").
- Rerun (local): `pnpm --filter @cp/spikes run s-sync`.
- Rerun (staging, after redeploying the three services per "Findings" #1 below):
  `S_SYNC_APP_URL=... S_SYNC_SYNC_ENDPOINT=... S_SYNC_DATABASE_URL=<app_owner DATABASE_DIRECT_URL>
  pnpm --filter @cp/spikes run s-sync:load -- --conns 20`.

## Raw numbers (staging, real Railway SG ↔ PlanetScale ap-southeast-1, client on the dev machine over the public internet)

```json
{
  "replicationAndReject": {
    "replicatedWithinTimeout": true,
    "acceptedStatus": "applied",
    "rejectHttpOk": true,
    "rejectStatus": "rejected",
    "rejectCode": "MESSAGE_EMPTY"
  },
  "chatLatency": { "count": 40, "meanMs": 148.7, "p50Ms": 146.8, "p95Ms": 164.6, "p99Ms": 176.0 },
  "offlineReplay": { "opsCount": 50, "queuedBeforeConnect": 50, "convergedCount": 50, "converged": true },
  "connections": { "targetConnections": 20, "connected": 20, "failures": 0, "firstSynced": 20,
    "connect": { "p50Ms": 1899.2, "p95Ms": 2529.7, "p99Ms": 2542.3 } }
}
```

`chatLatency` p50 146.8 ms / p95 164.6 ms is a sender's `POST /sync/upload` to a *second*,
independently connected client's live query observing the row — real network distance in both
directions (dev machine → Railway SG → PlanetScale ap-southeast-1 → logical replication →
PowerSync bucket storage → WebSocket push → dev machine), clearing the < 1 s budget with more than
5× headroom. `offlineReplay` inserts 50 rows into a disconnected local client (no connector
attached, matching "queue persists across app restarts"), then reconnects and lets the SDK's
`uploadData` drain the queue automatically — all 50 converge with the correct content.

## Connection count

Self-hosted PowerSync's Open Edition `api.parameters.max_concurrent_connections` config caps a
**single `powersync-api` process** at a default of 200 (`config/service.yaml`'s comment) — this
is exactly system-architecture.md §2's documented `powersync-api ... ≤200 conns each` scaling row,
now confirmed as a real, configurable default rather than an assumption. Raised to 1200 in the
spike's own config to measure the client side's ceiling separately from this default (Finding #10).

**PASS, 1,120/1,120, 0 failures.** A single real `@powersync/node` client process maxes out
around 280–300 concurrent connections before its own event loop starves under per-client V8
worker-thread memory pressure (Finding #9) — that ceiling belongs to the *load generator*, not to
`powersync-api`. Four independent load-generator processes (`spike-sync-loadgen`, scaled to 4
Railway replicas in `southeast-asia`, `TARGET_CONNECTIONS=280` each) connected simultaneously
against the *same* `spike-powersync-api` instance:

```json
[
  {"connected": 280, "failures": 0, "connect": {"p50Ms": 1761.5, "p95Ms": 2360.1, "p99Ms": 2657.3}},
  {"connected": 280, "failures": 0, "connect": {"p50Ms": 2080.1, "p95Ms": 3051.0, "p99Ms": 3128.6}},
  {"connected": 280, "failures": 0, "connect": {"p50Ms": 3827.6, "p95Ms": 5237.9, "p99Ms": 5402.5}},
  {"connected": 280, "failures": 0, "connect": {"p50Ms": 6977.6, "p95Ms": 15114.5, "p99Ms": 15155.4}}
]
```

**1,120 total concurrent connections, 0 failures.** `spike-powersync-api`'s own resource use while
holding all 1,120: **542 MB memory (2.2% of its 24 GB Railway limit), 0.11 vCPU (0.5% of its 24
vCPU limit)** (`railway metrics`) — the server had essentially unused headroom; connect-latency
growth across the four replicas (1.8 s → 7.0 s median) reflects the *load generators* contending
with each other for CPU/network on the dev-machine-adjacent side, not server strain. This
independently confirms the real, deployed, self-hosted `powersync-api` instance holds well over
1,000 concurrent authenticated sync connections; the practical limit any single load-generating
process hits first is its own per-client SDK memory cost (Finding #9), which real mobile clients
never share (each is a separate physical device).

## Findings (apply to the real sync build, phase 10 — not spike-only workarounds)

1. **Self-hosted PowerSync's Postgres replication module hardcodes the publication name to
   `powersync`** — verified against the pinned image tag (`journeyapps/powersync-service:1.26.1`
   = `powersync-ja/powersync-service@v1.26.1`): `PUBLICATION_NAME = 'powersync'` in `WalStream.ts`,
   used for `checkSourceConfiguration`, the replication slot's `publication_names` option, and the
   per-table publication check. There is no `publication_name` field in
   `BasePostgresConnectionConfig` (only `slot_name_prefix`, defaulting to `powersync_` — overridden
   here to `spike_sync_` for identification and cleanup). Every environment sharing one Postgres
   instance with a self-hosted PowerSync deployment must share this one publication name; a
   second, independently-named PowerSync deployment (a second spike, a second environment) cannot
   point at the same Postgres instance without joining the same publication.
2. **`ALTER PUBLICATION ... ADD TABLE` requires the calling role to own *both* the publication and
   the table** — a plain Postgres rule, not something PlanetScale's `postgres`-tier inherited role
   bypasses. Discovered empirically in two steps against PlanetScale staging: first `must be owner
   of publication powersync` (the spike's own `--inherited-roles postgres --with-replication` role
   does not own the publication `app_owner`'s migration created), then, after creating the spike's
   table under that role instead, `must be owner of table messages`. The working shape: schema
   creation, table creation and publication membership all run as `app_owner`
   (`DATABASE_DIRECT_URL`, the same role real schema migrations use — infra/railway/README.md),
   which then `GRANT`s the replication role only `USAGE` on the schema and `SELECT` on the table
   (plain logical-replication requirements: the replicating role needs `REPLICATION` plus `SELECT`
   on what it replicates, not ownership of anything). `schema.ts`'s `ensureSpikeSchema` takes an
   optional `replicationRoleUsername` to do this grant.
3. **`pscale role create`'s JSON `username` field is `<role>.<branch-id>`**
   (e.g. `pscale_api_oua4wu8hge6u.bvls2mz86del`), a PgBouncer/proxy routing identifier — `pg_roles`
   only knows the role by the part before the dot. Using the field verbatim in a `GRANT ... TO
   "<username>"` statement fails with `role "<username>" does not exist`.
4. **`storage.sslmode` (and every `sslmode` field PowerSync's Postgres connection config decodes)
   only accepts `verify-full`, `verify-ca` or `disable`** — not `require`, despite Railway's
   Postgres template image being named `postgres-ssl`. `disable` is correct for the
   Railway-internal path between `powersync-repl`/`powersync-api` and the `Postgres` service (same
   private network, never leaves Railway); `PS_DATA_SOURCE_SSLMODE` (PlanetScale, public endpoint)
   stays `verify-full`.
5. **Unlike Centrifugo (S-RT finding #3), self-hosted PowerSync's JWKS verification does not
   require the `use: "sig"` field** Better Auth's `jwt` plugin omits. Pointing
   `client_auth.jwks_uri` directly at Better Auth's `/jwks` endpoint worked with no rewrite proxy —
   a real, useful contrast: the S-RT-style `jwks-rewrite.ts` workaround is Centrifugo-specific, not
   a general "self-hosted stack" requirement.
6. **Self-hosted PowerSync rejects a connection JWT with no `iat` claim**
   (`PSYNC_S2101 "JWT payload is missing a required claim \"iat\""`). Better Auth's low-level
   `jwt` plugin API (`auth.api.signJWT`) only calls `setIssuedAt()` when the caller's payload
   includes `iat` — its own `getJwtToken()` wrapper (what the real `/api/auth/token` endpoint
   calls) always fills it in first, so **real production tokens are unaffected**; this only bit a
   spike convenience endpoint that called the low-level API directly (same API S-RT's harness
   uses for Centrifugo, which does not require `iat`). Fixed in `app.ts`'s `/internal/spike/token`.
7. **Passing `aud` in the `signJWT` payload overrides the `jwt` plugin's configured default
   audience for that one call** (`better-auth/src/plugins/jwt/sign.ts`:
   `payload.aud ?? options.jwt.audience`). This means one Better Auth instance can mint both
   `aud: rt` (Centrifugo, S-RT) and `aud: sync` (PowerSync, this spike) tokens without two
   separate `jwt` plugin mounts — worth carrying into phase 9/10's real `/api/auth/token` design
   (an explicit `?aud=` or per-surface endpoint) rather than assuming two Better Auth instances are
   needed.
8. **A `@powersync/node` client's `dbFilename` must be unique per concurrent instance — `:memory:`
   is not safe to share.** Five concurrent clients all opened with `dbFilename: ':memory:'` (same
   `dbLocation`) hang indefinitely (confirmed: 0/5 ever connect, even after 10+ minutes; a single
   client with `:memory:` works fine). The SDK appears to key some internal per-database
   coordination off the literal `(dbLocation, dbFilename)` pair regardless of the `:memory:`
   convention's usual "always a fresh, independent database" semantics. `client.ts` always passes
   a unique on-disk filename per client.
9. **Real per-client memory cost of a `@powersync/node` connection is ~50–58 MB RSS**
   (`readWorkerCount: 1`, the lightest supported configuration; a unique on-disk SQLite file) —
   dominated by a fresh worker-thread V8 isolate per client, not by the SQLite storage itself. See
   "Connection count" for what this means for a same-process ramp toward 1,000.
10. **`api.parameters.max_concurrent_connections` (default 200 per `powersync-api` process,
    per its own config schema docstring) is a real, load-bearing default, not just documentation:
    a client past the 200th active WebSocket on one process is rejected with
    `PSYNC_S2304 "Maximum active concurrent connections limit has been reached"`, and the SDK
    retries this rejection forever in the background rather than surfacing it as a rejected
    `connect()` promise** (a caller must race a real success signal — `waitForFirstSync()` — against
    a timeout to detect this; `client.ts`'s `connectAndWaitForSync` does, and disconnects on
    timeout to stop the retry loop, which otherwise floods logs past Railway's log-rate limit).
    This default is exactly system-architecture.md §2's documented `powersync-api ... ≤200 conns
    each` scaling row — now confirmed as the real mechanism, and confirmed configurable
    (`config/service.yaml`'s `api.parameters.max_concurrent_connections`) rather than a fixed
    Open Edition ceiling.

## Switchover drill (criterion 7, T5)

**FAIL — the logical replication slot does not survive a `pscale branch switchover` on
PlanetScale Postgres.** Full write-up and quarterly procedure: `docs/runbooks/db-switchover-drill.md`.

### Method

Founder-approved target: PlanetScale branch `main` (PS-5, 1 primary + 2 replicas, idle
pre-launch, schema limited to extensions + an empty `powersync` publication — phase 1 only).
`pscale help`/`pscale branch --help` confirmed `pscale branch switchover <db> <branch>` is a real,
supported operation ("the primary steps down and a replica is promoted in its place"), so the
phase's non-code-dependency fallback ("request from support; drill on Railway HA first") did not
trigger — the real mechanism was tested directly. `tools/spikes/src/s-sync/drill.ts`: a real
`@powersync/node` watcher client plus a continuous writer (one `/sync/upload` every 500 ms)
against the same three Railway services as the end-to-end test (this time pointed at `main`,
via a fresh `spike-s-sync --with-replication` role and `app_owner`'s reset password), a 20 s
baseline, `pscale branch switchover critterpass main --org critterpass`, then 60 s of
observation, recording the replication slot name before/after and correlating with
`spike-powersync-repl`'s own logs and PlanetScale's own switchover record
(`pscale branch switchover show`).

### Raw numbers

PlanetScale's own record for the switchover (`pscale branch switchover show critterpass main
<id> --format json`): `started_at 02:47:49.135Z`, `completed_at 02:48:28.559Z` — **39.4 s**
official duration, `state: succeeded`.

`spike-powersync-repl`'s logs, chronologically:

```
02:48:05.667  error  [spike_sync_2_c53e] Replication error postgres query failed
02:48:05.668  error  cause postgres eof unexpectedly              <- old primary connection dies
02:48:35.766  info   [spike_sync_2_c53e] Initial replication already done   <- reconnected (new primary)
02:48:35.792  error  Replication slot spike_sync_2_c53e is missing         <- confirmed: not carried over
02:48:39.994  info   [spike_sync_3_9347] Created replication slot spike_sync_3_9347
02:48:40.069  info   To replicate: "spike"."messages" 0/~64        <- full re-snapshot, not a resume
02:48:40.104  info   powersync_3 Flushed 121 + 0 + 1 updates       <- data flowing again
```

**Replication-visible outage: ~34.4 s** (connection loss to data flowing again), of which ~30 s
was PowerSync's own reconnect/retry backoff before it even discovered the slot was gone, not
extra time caused by the re-snapshot itself (the 121-row re-snapshot took well under a second).
`drill.ts`'s own instrumentation reported a much smaller `writeGapMs: 586` /
`replicationResumeMs: 529` — both anchored to *when the switchover command was issued*
(02:47:47.061), not to when the actual cutover executed; `pscale branch switchover` returns a
`state: "pending"` ticket immediately (2.2 s command latency) and the real disruption did not
start until ~18.6 s later. The drill's writer kept succeeding through that gap (only 1 failed
write out of 138 total — `app_owner`'s own connection to `/sync/upload` reconnected to the new
primary far faster than the separate replication connection did), so **app-level writes were
barely affected; only the sync/replication path saw the ~34 s gap**. The official PlanetScale
`started_at`/`completed_at` window is the trustworthy number for future drills; a rerun should
anchor its own gap measurement to `pscale branch switchover show`'s timestamps rather than the
CLI call's return time.

### Verdict and why it is not a PowerSync problem

**FAIL** on "keeps the logical slot (no full re-replication)" as literally stated. The root
cause is PlanetScale's specific HA/switchover implementation, not the sync engine choice: nothing
in this result is specific to *self-hosted* PowerSync — PowerSync Cloud replicating from the same
PlanetScale branch would hit the identical wall, since the promoted replica simply does not carry
the old primary's logical replication slot (no Postgres slot-synchronization feature observed in
effect here). The phase-02 fallback column's "PowerSync Cloud; Railway Postgres HA" therefore does
not apply to this specific failure — switching sync engine or database provider would not fix it.

### Chosen path (drill)

Keep PlanetScale Postgres HA (D4) and self-hosted PowerSync (D4/D12) as designed; **adjust the
operational expectation, not the stack** (phase-02's own rule: "budgets may be adjusted, scope
may not"). A switchover causes a bounded, measured sync-path gap (~34 s observed here, for a
121-row table) while app writes keep succeeding — comfortably inside the RPO ≤5 min / RTO ≤2 h
targets (system-architecture.md §10) for a table this size. `docs/runbooks/db-switchover-drill.md`
documents this as the expected quarterly-drill outcome, not an incident, and specifies scheduling
real switchovers (planned maintenance) during low-traffic windows.

### Founder follow-ups

- **Re-run this drill against a production-sized dataset** before launch: the re-snapshot itself
  was near-instant for 121 rows; the ~30 s reconnect/detection delay is likely dataset-size-
  independent, but the *snapshot* phase scales with table size, and large published tables could
  push the total gap well past what was measured here.
- **Answered 2026-09-29: it exists.** Failover-enabled slots registered in the cluster's Logical slot
  name parameter, with `hot_standby_feedback` and `sync_replication_slots` on, survive a switchover;
  the production procedure is in `docs/runbooks/db-switchover-drill.md` ("Keeping the slot through a
  switchover"). Original follow-up: **Ask PlanetScale support directly** whether a logical-slot-preserving failover mode exists or
  is planned (Postgres 17's slot synchronization between primary and physical replicas needs to be
  explicitly enabled and is not observed in effect on this PS-5 branch) — the phase's own non-code
  dependency table anticipated needing this ask.
- Size the quarterly drill cadence and alerting (system-architecture.md §10) around "sync-path gap
  of tens of seconds to low minutes on switchover" as the expected signal, not zero.

## Verdict

**PASS** on criteria 1–6; **FAIL** on criterion 7 (see "Switchover drill" — fallback is an
adjusted operational expectation within the same stack, not a technology change).

## Chosen path

Self-hosted PowerSync (Open Edition) on Railway SG, replicating from PlanetScale, as designed
(D4/D12). No fallback (PowerSync Cloud) needed for criteria 1–6. `powersync-api`'s per-instance
`max_concurrent_connections` (Finding #10) should be set explicitly for launch (not left at the
200 default) once real per-instance capacity is sized against expected MAU, rather than relying
purely on horizontal replica count. Carry findings 1–10 into phase 10's real
deployment verbatim, in particular #2 (schema/publication ownership split), #4 (storage sslmode),
#6/#7 (JWT payload shape for the real `/api/auth/token` → `sync` audience path), and the
switchover drill's operational-expectation adjustment above.

## Cleanup

- Railway staging: `spike-sync-app`, `spike-powersync-repl`, `spike-powersync-api`,
  `spike-sync-loadgen` (T4) and `spike-sync-app`, `spike-powersync-repl`, `spike-powersync-api`
  (T5, redeployed pointed at `main`) all deleted after measurements were recorded.
- PlanetScale staging: `spike` schema dropped, `spike.messages` removed from the `powersync`
  publication (verified via `assertNoSpikeTableInPublication` — the publication's 17 real
  core-schema tables were left untouched throughout), replication role `spike-s-sync` deleted,
  its replication slot confirmed gone.
- PlanetScale main: same — `spike` schema dropped, publication back to 0 tables (its pre-drill
  state), replication role `spike-s-sync` deleted, both replication slots it used
  (`spike_sync_2_c53e`, auto-cleaned by the repl service's shutdown; `spike_sync_3_9347`, dropped
  manually) confirmed gone; `app_owner`'s password was rotated (`pscale role reset`, the
  documented way to obtain working credentials — infra/railway/README.md) since no production
  service exists yet to depend on the previous one.
- Shared PowerSync bucket-storage database (`${{Postgres.DATABASE_URL}}`, staging): PowerSync
  self-manages a dedicated `powersync` schema there (`bucket_data`, `sync_rules`,
  `source_tables`, etc. — 11 tables, not namespaced per deployment), created by this spike's own
  first-ever PowerSync deployment against it; dropped in full after both T4 and T5 (verified zero
  non-system tables remaining) — see Finding #1 and the runbook for why this matters for any
  future spike or deployment sharing that storage database.
- No scratchpad credential files committed; role JSON lived under the session scratchpad
  (0600) only.

## Rerun

```
# Local, free:
pnpm --filter @cp/spikes run s-sync

# Against a fresh staging deployment (see Method for the three services + role to create first):
S_SYNC_APP_URL=https://<spike-sync-app>.up.railway.app \
S_SYNC_SYNC_ENDPOINT=https://<spike-powersync-api>.up.railway.app \
S_SYNC_DATABASE_URL=<app_owner DATABASE_DIRECT_URL, from the api service's Railway variables> \
S_SYNC_REPLICATION_ROLE_USERNAME=<bare pscale role name, no .branch-id suffix> \
pnpm --filter @cp/spikes run s-sync:load -- --conns 20

# Switchover drill (see docs/runbooks/db-switchover-drill.md for the full procedure):
S_SYNC_APP_URL=... S_SYNC_SYNC_ENDPOINT=... S_SYNC_DATABASE_URL=<app_owner connection> \
S_SYNC_SKIP_SETUP=true S_SYNC_DRILL_DATABASE=critterpass S_SYNC_DRILL_BRANCH=<branch> \
S_SYNC_DRILL_ORG=critterpass pnpm --filter @cp/spikes run s-sync:drill
```
