# PowerSync Service (self-hosted Open Edition)

Replicates the `powersync` publication from the app Postgres into bucket storage and streams rows to
clients over Sync Streams. Pinned image: `journeyapps/powersync-service:1.26.1`.

| File | Role |
|---|---|
| `service.yaml` | Service config shared by every environment; values come from `PS_*` variables |
| `streams/<area>.yaml` | Sync Streams per area (`core`, `entitlements`, `places`, ...), hand-written |
| `build-config.ts` | Merges `streams/*.yaml` into `sync-streams.yaml` |
| `sync-streams.yaml` | Generated; loaded by `service.yaml` (`sync_config.path`). Never edit by hand |

## Streams

Filters mirror each table's RLS SELECT policy. PowerSync reads through logical replication, which
bypasses RLS, so a stream's WHERE clause is the only thing that keeps a row off a device.

| Stream | Subscribe | Parameters | Tables |
|---|---|---|---|
| `me` | auto | `auth.user_id()` | `users` (self), `user_settings`, `consents`, `account_deletions`, `cmd_results`, `user_entitlements`, `usage_counters` (user) |
| `crews` | auto | active crew memberships | `crews`, `crew_members`, `trips` |
| `crew_people` | auto | active co-members | `users` |
| `trip` | client, `{trip_id}` | trip of an active crew | `trips`, `trip_participants`, crew-visible `itinerary_versions`/`plan_days`/`plan_items`/`change_sets`, `guide_actions`, `activity_events`, `trip_entitlements`, `usage_counters` (trip) |
| `trip_draft` | client, `{trip_id}` | organiser seat + active crew | organiser-visible `itinerary_versions`/`plan_days`/`plan_items`/`change_sets` |
| `trip_pack` | client, `{trip_id}` | destination of a member trip | `pois` (editorial, not hidden, not merged), `map_regions` |
| `explore` | client, `{destination_id}` | public | `pois` (editorial, not hidden, not merged) |
| `catalog` | auto | none | `guides`, `destinations`, `client_config`, `products`, `perks` |
| `fx` | auto | home, settlement and trip currencies | `fx_snapshots` |

Rules for a new area (a phase that publishes new tables):

1. Add the table to the publication in its own migration and to `packages/db/src/publication.ts`.
2. Add queries to `streams/<area>.yaml`. A stream named in several files gets the union of their
   queries; every file must agree on `auto_subscribe`/`priority`. Global CTE `my_crews` (core) is
   shared; a CTE cannot reference another CTE, so repeat the membership filter inline inside one.
3. Rows need an `id` column: alias a different key with `SELECT *, key AS id` (alias after `*`).
4. Run `pnpm tsx infra/powersync/build-config.ts` and commit `sync-streams.yaml`.
5. Add `packages/db/test/permissions/sync-streams-<area>.test.ts` using
   `packages/db/test/helpers/stream-harness.ts` (outsider / ex-member / member / organiser / anonymous).
   `sync-streams-core.test.ts` fails when `sync-streams.yaml` is stale, when a stream reads an
   unpublished table, or when a published table has no stream.

Stream filters cannot use `now()`, so time windows (e.g. recent FX days) need a flag column
maintained by a job; `fx` is bounded by currency instead.

## Local

```sh
pnpm infra:up                                   # Postgres, PowerSync + its storage database
pnpm --filter @cp/db migrate                    # publication + tables the streams read
pnpm tsx tools/scripts/check-publication.ts     # publication equals the allow-list
pnpm --filter @cp/db exec tsx test/smoke/powersync-health.ts
```

The health smoke waits for readiness, a connected source, finished initial replication and an
active sync config equal to `sync-streams.yaml` with no errors. After editing streams, regenerate
and `docker compose -f infra/docker-compose.yml restart powersync`.

## Railway

One image (`infra/railway/powersync.Dockerfile`, bakes `service.yaml` + `sync-streams.yaml`), two
services with config-as-code files set in the dashboard: `powersync-repl`
(`infra/railway/powersync-repl.toml`, `PS_ROLE=sync`, exactly one replica: it owns the replication
slot) and `powersync-api` (`infra/railway/powersync-api.toml`, `PS_ROLE=api`, scaled out; public
domain for clients).

| Variable | Value (names only; values live in Railway) |
|---|---|
| `PS_ROLE` | `sync` (repl) or `api` |
| `PS_DATA_SOURCE_URI` | PlanetScale replication role on the **direct port `5432`** |
| `PS_DATA_SOURCE_SSLMODE` | `verify-full` (PowerSync accepts only `verify-full`, `verify-ca`, `disable`) |
| `PS_STORAGE_URI` | `${{Postgres.DATABASE_URL}}` (Railway PG18, bucket storage only, rebuildable) |
| `PS_STORAGE_SSLMODE` | `disable` on the private network, else `verify-full` |
| `PS_PORT`, `PORT` | `8080` (Railway health checks `/probes/readiness` on `PORT`) |
| `PS_JWKS_URI` | `https://<api host>/api/auth/jwks` (Better Auth; tokens carry `aud: sync`) |
| `PS_ADMIN_API_TOKEN` | random 32+ bytes; bearer token for `/api/admin/v1/diagnostics` |

**Never point `PS_DATA_SOURCE_URI` at PgBouncer (`:6432`).** Logical replication needs a replication
connection and a session that outlives a transaction; a transaction pooler provides neither. The
api keeps using `DATABASE_URL` (PgBouncer) for requests.

Replication role (PlanetScale, per branch): `REPLICATION` plus `USAGE` on `public` and `SELECT` on
the published tables, granted by `app_owner` (which owns the publication and tables; publication
name is hard-coded to `powersync`). A PlanetScale switchover drops the logical slot; PowerSync
recreates it and re-snapshots (see `docs/runbooks/db-switchover-drill.md`).
