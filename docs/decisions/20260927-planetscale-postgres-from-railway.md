# S-DB: PlanetScale Postgres from Railway SG — latency, pooling, extensions, HNSW

Date: 2026-09-27
Status: PASS on latency/pooling/extensions; **FAIL on HNSW build time** on the PS-DEV tier
(fallback not triggered — see Verdict)

## Context

D4 pins PlanetScale Postgres HA (ap-southeast-1) as the primary database, reached from Railway
api/worker in Singapore over PgBouncer (`:6432`, pooled) and direct (`:5432`, migrations/DDL).
`tools/spikes/src/s-db/` measures the real cross-provider path: a one-off Railway service in
`asia-southeast1-eqsg3a` running the probe against the actual staging PlanetScale branch, with
a Railway Postgres comparison for the documented fallback.

## Criteria (phase-02 §Requirements, S-DB)

| # | Criterion | Result |
|---|---|---|
| 1 | Railway SG → PlanetScale p50 < 3 ms (1k `select 1`) | **PASS** — p50 2.36 ms |
| 2 | p99 recorded (1k single-row tx) | PASS — p99 10.88 ms |
| 3 | `SET LOCAL`/`set_config('app.uid', …, true)` survive PgBouncer transaction pooling; no leak across two interleaved pooled clients | PASS |
| 4 | `vector`, `pg_trgm`, `unaccent` available | PASS (all three) |
| 5 | HNSW index build on 100k × 1024-d vectors; build time + query p95 | **FAIL** — did not complete in 1 h 31 m 36 s (terminated) |
| 6 | Price quote recorded | PASS (list price; region-specific quote is a founder follow-up) |
| 7 | Repeat against Railway Postgres for comparison | PASS |

## Method

- Harness: `tools/spikes/src/s-db/probe.ts` + `run.ts`, deployed as a one-off Railway service
  (`tools/spikes/s-db.Dockerfile`, `RAILWAY_DOCKERFILE_PATH`) in `asia-southeast1-eqsg3a`,
  pinned to the project's default single-region config (no multi-region scale needed for a
  one-shot probe). Measures, in order: `select 1` ×1000 (pooled), single-row insert tx ×1000
  (pooled, `BEGIN`/`INSERT`/`COMMIT`), a 10-statement named tx (`set_config` + 8×`select 1` +
  `current_setting` — the shape a real command handler's `withUser()` runs) ×1000 (pooled), a
  leak test (two interleaved pooled clients: client A sets `app.uid`, client B's next
  transaction on the same pooled endpoint must see it empty), extension check (direct), then
  the HNSW build (DDL on direct, bulk insert of 100k random 1024-d vectors via batched
  parameterized `insert … values ($1::vector), …` on pooled, `create index … using hnsw` on
  direct, then 200 nearest-neighbour queries on pooled).
- Target 1 — **PlanetScale staging** (PS-DEV tier, `aws-ap-southeast-1-2.pg.psdb.cloud`,
  `sslmode=verify-full`), via a scoped `pscale role create … --inherited-roles postgres` role,
  deleted after the run.
- Target 2 — **Railway Postgres** (fresh instance from Railway's Postgres template, same
  region), deleted after the run. No PgBouncer in front of it (see Findings).
- Rerun: deploy `tools/spikes/s-db.Dockerfile` as a Railway one-off with
  `DATABASE_URL_POOLED`/`DATABASE_URL_DIRECT`/`TARGET_LABEL` set, `S_DB_SKIP_HNSW=true` for a
  fast latency-only pass or unset for the full run (see Findings on how long that can take).

## Raw numbers

### PlanetScale staging (PS-DEV), Railway SG → PlanetScale ap-southeast-1

```json
{"target":"planetscale-staging",
 "selectOne":       {"count":1000,"p50Ms":2.36,"p95Ms":2.67,"p99Ms":3.50,"maxMs":36.45},
 "singleRowInsertTx":{"count":1000,"p50Ms":8.03,"p95Ms":9.01,"p99Ms":10.88,"maxMs":39.01},
 "namedTx":          {"count":1000,"p50Ms":27.76,"p95Ms":30.43,"p99Ms":34.09,"maxMs":42.77},
 "leakTest": {"isolated":true,"clientASawUid":"client-a-uid","clientBSawUidBeforeSet":""},
 "extensions":[{"name":"vector","installed":true},{"name":"pg_trgm","installed":true},{"name":"unaccent","installed":true}]}
```

`select 1` p50 **2.36 ms** clears the < 3 ms budget (system-architecture.md §9 "API → DB p50
< 3 ms"); p99 stays under 3.5 ms. The leak test's `clientBSawUidBeforeSet` is an empty string
(not null) — `current_setting('app.uid', true)` returns `''` when unset, which the harness
correctly treats as "not leaked".

### Railway Postgres (comparison), same region

```json
{"target":"railway-postgres-comparison",
 "selectOne":        {"count":1000,"p50Ms":2.23,"p95Ms":2.91,"p99Ms":4.30,"maxMs":18.83},
 "singleRowInsertTx":{"count":1000,"p50Ms":9.05,"p95Ms":17.11,"p99Ms":27.94,"maxMs":65.58},
 "namedTx":          {"count":1000,"p50Ms":26.82,"p95Ms":32.42,"p99Ms":38.90,"maxMs":51.95},
 "leakTest": {"isolated":true,"clientASawUid":"client-a-uid","clientBSawUidBeforeSet":null},
 "extensions":[{"name":"vector","installed":false},{"name":"pg_trgm","installed":false},{"name":"unaccent","installed":false}]}
```

Comparable `select 1`/`namedTx` latency to PlanetScale (both in-region); insert-tx has
noticeably higher p99 (27.9 ms vs 10.9 ms) and more variance. Extensions are absent because
this used Railway's plain Postgres template, not the documented pgvector-baked image
(researcher-260926-1649 §4.2: "pgvector 0.8.x baked into the official images") — not installed
here for time; a real fallback deployment would use that image.

### HNSW build (PlanetScale staging, PS-DEV)

100,000 rows × 1024 dimensions inserted successfully in the earlier full run (~6 minutes over
200 batches of 500 rows via the pooled endpoint). The subsequent
`create index … using hnsw (embedding vector_cosine_ops)` (default `m=16`, `ef_construction=64`)
was still `active`, continuously doing `DataFileRead` I/O (confirmed via `pg_stat_activity`
polled repeatedly, not merely "not yet checked"), when terminated via
`pg_terminate_backend()` at **1 hour 31 minutes 36 seconds** elapsed. It never produced an
index. Query p95 was not measured (no index to query against).

## Verdict

**PASS** on criteria 1–4, 6–7. **FAIL** on criterion 5 (HNSW build time) as measured against
the **PS-DEV** tier specifically. `docs/system-architecture.md` §9's < 3 ms p50 budget and
PgBouncer transaction-scoping both hold on the real cross-provider path from Railway SG.

The FAIL does not trigger the stated fallback (Railway Postgres HA) by itself: Railway
Postgres was not measured for HNSW build time in this session (time-boxed), and PS-DEV is
explicitly a small development tier, not the PS-5+ HA tier D4 actually specifies for
production. This result says "measure HNSW build time on the production-target tier before
launch," not "PlanetScale can't do it."

## Chosen path

Keep PlanetScale Postgres HA (D4) for launch. Before committing to it for any workload that
needs an HNSW build at migration time (vs. built once during content-factory ingestion,
off the request path), **re-run this same harness's HNSW step against a PS-5+ (or whatever
tier is actually provisioned for launch) branch**, with `S_DB_SKIP_HNSW` unset, and record a
real completion time there. If it is still impractically slow, prefer building the index with
`CREATE INDEX CONCURRENTLY` as a background maintenance job (accepting a slower ramp before
vector search is available) over blocking a migration on it, or reduce `m`/`ef_construction`,
or evaluate `ivfflat` (faster to build, slightly lower recall) for this dataset size.

## Findings (apply to the real database layer, phase 3 — not spike-only notes)

1. **Killing/redeploying the client does not stop an in-flight statement on PlanetScale.**
   The Railway container was redeployed twice (once to switch to the fast `S_DB_SKIP_HNSW`
   path, once to point at the Railway Postgres comparison target) while the original HNSW
   build kept running server-side for the full 1 h 31 m, invisible to `railway logs` because
   its owning container was already gone. Discovered only by querying
   `pg_stat_activity`/`pg_locks` directly and explicitly `pg_terminate_backend()`-ing it — a
   later `DROP SCHEMA … CASCADE` blocked on its lock until that happened. Long-running DDL run
   from a Railway one-off needs either a `statement_timeout` set up front or a documented
   manual-cleanup step; don't assume tearing down the container is enough.
2. **`current_setting(name, true)` returns `''` (empty string), not `null`,** when the setting
   was never set in that session — the leak-test assertion needs `!value || value.length === 0`,
   not a strict null check.
3. The probe originally reported nothing until every step (including HNSW) finished;
   added incremental `onProgress` logging and a `S_DB_SKIP_HNSW` escape hatch
   (`tools/spikes/src/s-db/probe.ts`, `run.ts`) after losing visibility into an hour-plus run.
   Keep both for any future rerun.

## Founder follow-ups

- **Region-specific price quote.** The public pricing checked here is PlanetScale's published
  **us-east-1** list price (PS-5 EBS HA from $15/mo up to PS-2560 at $5,599/mo; non-HA ~33%
  cheaper); the researcher report flagged ap-southeast-1 pricing as unverified. Get an actual
  ap-southeast-1 quote from PlanetScale (dashboard or sales) for the tier sized for launch.
- **Re-run the HNSW build on the actual launch-sized tier** (PS-5 HA or larger, not PS-DEV)
  before phase 3 relies on an HNSW index being available shortly after migration.

## Rerun

```
# From tools/spikes/, deploy as a Railway one-off (see infra/railway/README.md for the
# project/environment ids), with DATABASE_URL_POOLED / DATABASE_URL_DIRECT / TARGET_LABEL set:
railway up --service <spike-service> --environment staging --ci
# Fast pass (skips the HNSW build):
#   set S_DB_SKIP_HNSW=true
# Full pass (can take well over an hour on a small tier):
#   leave S_DB_SKIP_HNSW unset
```
