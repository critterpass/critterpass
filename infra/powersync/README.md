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
| `crews` | auto | active crew memberships | `crews`, `crew_members`, `trips`, `trip_stops` |
| `crew_people` | auto | active co-members | `users` |
| `trip` | client, `{trip_id}` | trip of an active crew | `trip_places` (crew rows, sent as `pois`), `trips`, `trip_participants`, crew-visible `itinerary_versions` and `change_sets`, `plan_days`/`plan_items` of the live crew versions and the one each replaced, `guide_actions`, `activity_events`, `trip_entitlements`, `usage_counters` (trip) |
| `trip_draft` | client, `{trip_id}` | organiser seat + active crew | `trip_places` (organiser rows, sent as `pois`), organiser-visible `itinerary_versions`/`plan_days` (every draft), `plan_items`/`change_sets` of drafts not superseded |
| `trip_pack` | client, `{trip_id}` | destination of a member trip | `place_cards` (recommended places, sent as `pois`), `map_regions` |
| `explore` | client, `{destination_id}` | public | `place_cards` (recommended places, sent as `pois`) |
| `catalog` | auto | none | `guides`, `destinations` (never `coverage = 'area'`), `client_config`, `products`, `perks` |
| `fx` | auto | USD plus home, settlement and trip (own or destination) currencies | `fx_snapshots` |

Rules for a new area (a phase that publishes new tables):

1. Add the table to the publication in its own migration and to `packages/db/src/publication.ts`.
2. Add queries to `streams/<area>.yaml`. A stream named in several files gets the union of their
   queries; every file must agree on `auto_subscribe`/`priority`. Global CTE `my_crews` (core) is
   shared, and `trip_crew` is its counterpart for `{trip_id}` streams; a CTE cannot reference another
   CTE, so repeat the membership filter inline inside one.
3. Rows need an `id` column: alias a different key with `SELECT *, key AS id` (alias after `*`).
4. Run `pnpm tsx infra/powersync/build-config.ts` and commit `sync-streams.yaml`.
5. Add `packages/db/test/permissions/sync-streams-<area>.test.ts` using
   `packages/db/test/helpers/stream-harness.ts` (outsider / ex-member / member / organiser / anonymous).
   `sync-streams-core.test.ts` fails when `sync-streams.yaml` is stale, when a stream reads an
   unpublished table, or when a published table has no stream.

Stream filters cannot use `now()`, so time windows (e.g. recent FX days) need a flag column
maintained by a job; `fx` is bounded by currency instead.

What is synced: the crew's own data (trip, plan, ideas, money, bookings, chat, trip day, game), the
caller's own rows, and the small catalogue a trip day needs offline. Content that is the same for
every user (places, place pages, Explore browsing, tips, help articles, the ideas board, season
months and events, cost indices, crowd curves) is read from the api with a cached last good copy. Nothing new goes onto sync without that reason, and no table reaches a phone
twice through two streams.

A trip with several cities syncs its route (`trip_stops`, filtered on the row's own `crew_id`) on
`crews`, and a day's area rides `plan_days`. The links between destinations, a day-trip area's row
and its places are shared content, read over the api; `catalog` leaves out `coverage = 'area'`,
because installed builds offer every synced destination as a city to go to.

### Connection budget

PowerSync 1.26.1 allows 1,000 parameter results and 1,000 buckets per connection; past either the
whole sync request fails with `PSYNC_S2305` and nothing syncs. Every lookup row counts, before
de-duplication, again for each query shape of each subscription
(`api.parameters.max_parameter_query_results` in `service.yaml` would raise the limit; it stays at
the default so a stream that grows fails tests, not phones). So the `{trip_id}` streams check
membership with `trip_crew` (through the subscribed trip: 3 results whatever the caller's crews),
never `my_crews` (one result per crew, repeated per shape and per held trip). Every group edit
supersedes a plan version, so plan lookups use the not-superseded versions (plus, on `trip`, the
version each live one replaced); the trip stream's `change_sets` lookup is the one that still grows
by one result per edit.

`packages/db/test/permissions/sync-streams-parameter-bounds.test.ts` replays a connection exactly:
it compiles `sync-streams.yaml` with `@powersync/service-sync-rules` at the version inside the
pinned image (0.42.0 for 1.26.1; Renovate moves the image and the compiler together), indexes every
published row of the test database and counts with the compiler's own querier. Its budgets are half
of each limit for the subscriptions a phone holds by design (two trips in the offline window, one
on screen, one kept, the wallet's trip): a founder-shaped phone (5 crews, 6 trips, a 43-stop plan)
at most 400 results, and a heavy one (12 crews, 80 co-members, 120 stops and 150 ideas a trip,
3 destinations browsed) at most 500 results and 300 buckets. Until a trip's places sync as one
card each instead of one lookup and one bucket per place, the test holds today's cost instead
(founder 422 results and 211 buckets; heavy 1,614 results and 2,409 buckets, over the limits). It runs in CI's database job; on this
Mac, `pnpm test:remote @cp/db -- test/permissions/sync-streams-parameter-bounds.test.ts`.

The service logs each connection's cost; compare a replay with a line such as
`railway logs --service powersync-api --environment staging | grep param_results` (the client id,
`param_results` and `buckets` fields). No log alert watches it yet: Grafana alerting here reads
metrics only, and the service's logs are not shipped to Grafana.

## Trip places

A trip's places (stops of plan versions not superseded, live ideas, must-dos, swipe decks) reach the
phone as `trip_places` cards, written by `app.refresh_trip_places` (the worker's
`places.trip_refresh`, queued by the events that add or drop a reference). The stream selects
`poi_id AS id` and the `pois` column names `FROM trip_places AS pois`, so the cards land in the
phone's existing `pois` table and its readers keep `FROM pois`. Checked against PowerSync 1.26.1's
`@powersync/service-sync-rules` 0.42.0: the alias compiles, a crew card goes to the trip's own
`trip` bucket (the same bucket and membership lookup as the trip's other rows) and an organiser card
to `trip_draft`'s. On the phone, `powersync-sqlite-core`'s `sync_local` keeps the latest op for a
`(table, id)` across every bucket and deletes the row only when no bucket holds it, so a place in
two trips stays while either trip holds it. That only works while every bucket sends the same
content for an id: the cards carry exactly the columns of the recommended `pois` queries, copied
from the `pois` row, and nothing trip-specific (`roles`, `visibility` stay server-side).

## Recommended places

PowerSync keeps a current copy of every row of each table a stream reads, whatever the stream's
WHERE says, and copies it again for each new sync config. Streaming `FROM pois` therefore stored the
whole open-data catalogue (ten million rows on staging) to send about eleven thousand, and filled
the bucket storage. `trip_pack` and `explore` read `place_cards AS pois` instead: one card per
recommended place (editorial or picked, not hidden, not merged), kept by the `pois` trigger
`app.sync_place_card`. `pois` is out of the publication, and the phone schema generator keeps the
phone's `pois` table because streams still fill it by alias. A stream must never read a large
table directly; give it a small trigger-kept or job-kept table, as here and in `trip_places`.

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
