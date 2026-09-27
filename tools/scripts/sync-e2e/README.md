# End-to-end sync harness

Proves the whole write → sync → realtime loop against real services: Postgres 18 with logical
replication, Redis, Centrifugo, PowerSync (with its storage database), the api and the worker's
`rt_outbox` relay. The client side is the app's own local-first code
(`apps/mobile/src/data/powersync/local-first.ts`, the upload queue, command client, reconcile and
realtime client) running on Node over an encrypted SQLCipher-format database
(`apps/mobile/src/data/powersync/test-support/node-sync-client.ts`).

```sh
pnpm tsx tools/scripts/sync-e2e/run.ts --all                 # every scenario (~3 min)
pnpm tsx tools/scripts/sync-e2e/run.ts --scenario member-removal
pnpm tsx tools/scripts/sync-e2e/run.ts --list
```

Needs Docker with Compose 2.24 or newer. It exits non-zero when a scenario fails or when the
realtime hint p95 is 1 s or more.

## Scenarios

| Name | Proves |
|---|---|
| `offline-replay` | 50 ops queued with no connectivity survive the app being killed. On the next launch they upload in order and each runs exactly once (one `cmd_log` row and one handler side effect per op). Their synced results clear the queue, and a second restart sends nothing. |
| `reject-mid-batch` | A business reject in the middle of a batch comes back as a per-op result and lands in the "didn't go through" list with its code. The ops after it in the same batch still apply, with no retry. |
| `transient-retry` | The upload door answers 503 with `first_unprocessed`. The client keeps the earlier outcomes and resends only the rest, and every op runs once. Replaying the whole batch by hand returns `duplicate` for every op. |
| `realtime-fanout` | Two members of a crew each receive 30 rename hints from api → outbox → relay → Centrifugo, timed from the send and deduped by id. Both devices sync the final row. |
| `member-removal` | Removing a member closes their crew channel within 1 s (the membership trigger queues the unsubscribe and the relay runs it). The subscribe proxy refuses a new subscribe, and sync removes the crew's rows from their device. |
| `account-switch` | When the next launch signs in a different uid, the previous uid's synced rows, results, queued ops and `local_private` values are wiped before anything syncs. The new uid only ever sees its own rows. |

## How it runs

- `stack.ts` starts `infra/docker-compose.yml` with `compose.yml` layered on top. It runs as its own
  compose project, `cp-sync-e2e`, on separate host ports (Postgres 54330, Redis 63791, Centrifugo
  8010, PowerSync 8090) with data on tmpfs. It never touches a running `pnpm infra:up` stack. It
  applies the migrations with the repo's runner, then starts two host processes: the api
  (`api-server.ts`) on 8797 and the worker (`services/worker/src/index.ts`) on 8798. Override the
  ports with `CP_E2E_*_PORT` if they're taken.
- `api-server.ts` wires the real Hono app the same way `services/api/src/index.ts` does: Better
  Auth, the `/api/auth/token?aud=` and JWKS routes, the three command doors and the Centrifugo
  proxies. It registers only the harness commands in `commands.ts`. Those commands write the real
  `crews` and `crew_members` tables under RLS, their triggers and the outbox. `e2e_flaky_step`
  fails its first attempt per key, which stands in for a transient database error.
- Going offline means pointing the client's api and PowerSync URLs at a closed local port, so
  every request is really refused. A restart means closing the client and opening a new one on
  the same database file and key.
- When the run ends, or on Ctrl-C, the containers, volumes, host processes and temp databases
  are removed. If a run was killed hard, run
  `docker compose -p cp-sync-e2e -f infra/docker-compose.yml -f tools/scripts/sync-e2e/compose.yml down -v`
  to clean up.

CI runs the harness in `.github/workflows/sync-e2e.yml` whenever the client data layer, the api,
the worker, the database packages or the sync and realtime infra change.
