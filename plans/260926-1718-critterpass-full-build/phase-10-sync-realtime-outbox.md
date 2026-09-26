---
phase: 10
title: Offline sync, command framework, realtime
status: pending
depends_on: [2, 8, 9, 12, 14]
wave: 4
features: [F-010, F-011]
screens: [3k-4, 3g-1, 3g-2, 3c-8, 3b-4, 3e-1]
tasks: 11
owns:
  - packages/domain/src/commands/registry-types.ts   # envelope.ts is owned by phase 08
  - packages/domain/src/commands/index.ts
  - packages/domain/src/realtime/
  - packages/domain/src/surfaces/app-group.ts
  - packages/db/src/command/
  - packages/db/migrations/<ts>_rt_outbox_notify.sql
  - packages/db/test/permissions/command-pipeline.test.ts
  - packages/db/test/permissions/sync-streams-core.test.ts
  - packages/db/test/helpers/stream-harness.ts
  - packages/db/test/permissions/rt-subscribe.test.ts
  - services/api/src/commands/_framework/
  - services/api/src/routes/cmd.ts
  - services/api/src/routes/sync-upload.ts
  - services/api/src/routes/cmd-results.ts
  - services/api/src/routes/media.ts
  - services/api/src/routes/internal-rt.ts
  - services/api/src/realtime/
  - services/worker/src/rt-relay/          # ownership released to phase 11 when this phase is done
  - services/media-worker/
  - infra/powersync/
  - infra/centrifugo/
  - infra/railway/powersync-*.toml
  - infra/railway/centrifugo.toml
  - apps/mobile/src/data/powersync/
  - apps/mobile/src/data/commands/
  - apps/mobile/src/data/realtime/
  - apps/mobile/src/data/status/
  - apps/mobile/modules/cp-app-group/     # from phase 2 scaffold; except src/snapshots/la/ (48), src/snapshots/widgets/ (49)
  - tools/scripts/sync-e2e/
---
# Phase 10 — Offline sync, command framework, realtime

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | §1 D4 (backend), D12 (offline), C1 (planning crew-visible), C3 (private values), C28 (no per-person opens) |
| `docs/system-architecture.md` | §2 topology (powersync-repl/api/storage, Centrifugo, Redis), §4.1 commands, §4.2 reads, §4.3 realtime, §4.8 extensions, §5 authz, §7.c offline sequence, §9 perf budgets, §11 S-SYNC / S-RT / S-DB |
| `docs/api-contracts.md` | §2 envelope + pipeline + tables, §3 error codes, §5.2 command/sync routes, §5.4 media, §5.7 Centrifugo proxies |
| `docs/api-contracts-async.md` | §1.1 rules, §1.2 namespace catalogue, §6 App Group, §7 phase map |
| `docs/data-model.md` | §2 roles + `withUser`/`withSystem` + RLS helpers + permission suite, §3.18 infra tables (`cmd_log`, `cmd_results`, `rt_outbox`, `domain_events`) |
| `docs/data-model-sync-and-privacy.md` | §1 private fields, §4 Sync Streams, §5 realtime rules, §7 table→phase |
| `docs/code-standards.md` | §1 working rules, DB rules (RLS + permission test per table), testing pyramid, Definition of Done |
| Reports | `plans/reports/researcher-260926-1649-custom-hono-backend-report.md` (PowerSync self-host, Centrifugo, outbox); master `design-analysis-260926-1143-master-synthesis-report.md` §2 rows F-010/F-011, §5 R8 (multi-surface write consistency) |
| Renders | `docs/design-renders/screens/3k-4_Offline_at_the_top.png`, `3g-1_Crew_chat.png`, `3g-2_Live_collab.png`, `3c-8_Pon_is_drafting.png` |

## Overview

Goal: the single write path (idempotent commands through three doors), local-first reads (self-hosted PowerSync + encrypted SQLite), and realtime hints (Centrifugo with subscribe/publish proxies and a transactional outbox) that every feature phase plugs into.

Done when: an offline client queues commands, restarts, reconnects and replays them exactly once with rejects surfaced per op; an outsider can neither read a crew's rows via sync nor subscribe to its channels; a membership removal unsubscribes the ex-member within 1 s; extension-queued envelopes in the App Group drain through the same pipeline.

## Requirements

### F-010 Realtime sync (channels, ACL, presence, typing, element-anchored cursors, versioned ops, fan-out)

| Aspect | Requirement |
|---|---|
| Channels | Namespace registry per async §1.2. This phase ships the framework + ACL for `user:#uid`, `crew*:{crew_id}` (member), `trip*:{trip_id}` (member/participant/organiser), `trip_presence`. Object namespaces (`poll`, `swipe`, `proposal`, `guide_thread`, `disruption`, `sos`, `recap`, `memory`, `trip_locations`, `trip_copresence`) are registered by their owning phases via `registerNamespace()` |
| Presence | Centrifugo presence + join/leave on ✓ namespaces; `info` carries display name + avatar key from subscribe proxy |
| Typing | client publish on `crew_chat` (≤1 per 3 s) through publish proxy; server drops over-rate |
| Element-anchored presence | `trip_presence` publish `here{screen, day}`, `cursor{anchor}` (anchor = stable element id, e.g. `plan_item:<id>`), ≤5 Hz, no history. Used by 3g-2 (Live collab) and 3e-1 (plan overview) in phase 29 |
| Versioned ops | `plan.ops{version, ops}` hint envelope on `trip_plan`; durable ops arrive via PowerSync; client applies hints only if `version` = local+1, else waits for sync |
| Fan-out | only via `rt_outbox` written in the command tx; relay publishes after commit; payload envelope `{v, id, type, at, data}` ≤8 KB; client dedupes on `id` |
| Recovery | history + `recover: true`; `(offset, epoch)` persisted per channel; `recovered:false` or epoch change → reconcile callback (PowerSync is the source of truth) |
| Revocation | membership/session change writes `rt_outbox(kind=unsubscribe|disconnect)` in the same tx; relay executes within 1 s; JWT `exp` 15 min bounds misses |
| Privacy | no C3 values on any channel; `proposal` never carries per-person opens (C28) — enforced by payload zod schemas per type |

### F-011 Offline store + outbox (encrypted local DB, UUIDv7 client ops, ordered flush, per-op conflict results)

| Aspect | Requirement |
|---|---|
| Local DB | PowerSync SQLite, SQLCipher-encrypted (key in Keychain / Android Keystore via expo-secure-store); local-only tables `commands` (insert-only upload queue), `local_private` (owner C3 via `GET /v1/me/private/{kind}` — endpoint content added by owning phases), overlay tables for optimistic rows |
| Ops | every write = `CommandEnvelope` with client UUIDv7 `op_id`, `actor.via` (`app`/`offline`/...), `device`, `client_ts`, `base_version?` |
| Ordered flush | `uploadData` sends ordered batches to `POST /sync/upload`; each op runs its handler in `withUser`; validation/business rejects → 2xx + `cmd_results` row; 5xx only transient → client retries with backoff; queue survives restarts |
| Idempotency | `cmd_log` PK `op_id`; same hash → stored result `duplicate`; different hash → `IDEMPOTENCY_MISMATCH` |
| Conflict results | `cmd_results` (stream `me`) drives per-op reconcile: applied → drop overlay when server row lands; rejected → roll back overlay, emit `RejectedCommand{op_id, cmd, code, summary}` for UI (copy key `errors.<code>`) |
| Queued state | headless hooks expose queued ops with human summary (e.g. "12 sunrise photos → crew album", "Your vote: Nusa Penida") and status `queued → sending → done|rejected` for the 3k-4 "SENDS WHEN YOU'RE BACK" list and chat pending marks |
| Account switch | uid change or `SESSION_REVOKED` → `disconnectAndClear()` + wipe `local_private` + App Group pending actions for old uid |
| Extensions | App Group `state/pending-actions.json` envelopes (op_id generated in extension) drained by the app on launch/foreground into the same upload queue |

### Undesigned states designed in code (headless here; visuals in owning UI phases)

| State | Contract delivered | Visual owner |
|---|---|---|
| Sync status: online / offline / connecting / catching up / last synced at | `useSyncStatus()` | phase 36 (3k-4, F-114), phase 07 app chrome |
| Queued list with per-op progress, clock → tick | `useQueuedCommands()` | 36, 24 (chat), 44 (album) |
| "Didn't go through" list with fix action per code | `useRejectedCommands()` + `dismissRejected(op_id)` | 36 |
| Realtime lossy recovery | `onChannelReset(channel)` | each feature |

Motion for 3k-4 (pink → night-blue slide with soft thud, clock mark → tick, banner lifts) is built in phase 36 on top of these hooks; this phase has no dependency on tokens/motion (phases 03/06).

### Applicable decisions

D4 (own stack, never Supabase), D12 (PowerSync local-first for all crew/trip data), D13 (no raw GPS trails — `trip_locations` history = last fix only), C1, C3, C28; master R8 (one idempotent path per intent, server-authoritative versions, collapse ids).

## Architecture & contracts

| Area | Delta (canonical doc) |
|---|---|
| Tables | none new; uses `cmd_log`, `cmd_results`, `rt_outbox`, `domain_events` and the phase 08 primitives (`claimOpId`, `recordCmdResult`, `appendDomainEvent`, `enqueueRealtime` over SECURITY DEFINER `app.*` fns — no table grants added here). Migration `<ts>_rt_outbox_notify.sql`: `NOTIFY rt_outbox` trigger + index `rt_outbox(published_at) WHERE published_at IS NULL` only |
| Publication | created by phase 08 (`ops_core_and_publication`); phase 09 tables are unpublished (C3/S); every later owning phase adds its tables with `ALTER PUBLICATION powersync ADD TABLE` in its own migration + `packages/db/src/publication.ts` entry. No publication migration here |
| Sync Streams | per-area files `infra/powersync/streams/<area>.yaml` (system-architecture §4.2, code-standards §13) merged by `infra/powersync/build-config.ts`; this phase ships `core.yaml` (`me`, `crews`, `crew_people`, `trip`, `trip_draft`, `catalog` over 08 tables), `entitlements.yaml` (phase 12 tables), `places.yaml` (`trip_pack`, `explore` + catalog additions for phase 14 tables); later phases add their own `<area>.yaml` + a test using `packages/db/test/helpers/stream-harness.ts`; parameters via `auth.user_id()` |
| Framework | `packages/db/src/command/execute.ts` `executeCommand(env, ctx)` = api-contracts §2.3 steps 1–7; `emitEvent(tx, …)`, `outbox(tx, channel, type, data)`, `revokeRealtime(tx, {uid, channels|all})`; handler module shape `{schema, authorize, entitle, handle}` at `services/api/src/commands/<domain>/<verb_noun>.ts`; registry `services/api/src/commands/_framework/registry.ts` shared with worker `dispatchSystem()` |
| HTTP | `POST /v1/cmd/{cmd}`, `POST /sync/upload`, `GET /v1/cmd-results?since=` (api §5.2); `/v1/actions` + action keys are phase 11 |
| Media | `POST /v1/media/presign`, multipart create/parts/complete, `POST /v1/media/read-urls` (api §5.4, R2); `services/media-worker` `GET /m/{key}?exp&sig` HMAC verify |
| Realtime | `infra/centrifugo/config.json` (JWT JWKS from `/api/auth/jwks`, `aud: rt`; namespaces with history/presence per catalogue; subscribe + publish proxies to api private URL; Redis 8 engine); `POST /internal/rt/subscribe`, `POST /internal/rt/publish` (api §5.7) with shared-header auth |
| Relay | `services/worker/src/rt-relay/` plain loop: `LISTEN rt_outbox` + 1 s sweep, `FOR UPDATE SKIP LOCKED` batches of 100, Centrifugo server API `publish`/`broadcast`/`unsubscribe`/`disconnect`, idempotency key = outbox id, `attempts` backoff (10 fast retries → leaves row for phase 11 DLQ). Phase 11 moves it onto pg-boss queue `rt.relay` |
| Client | `apps/mobile/src/data/`: `powersync/` (schema, connector, encryption), `commands/` (client, overlays, reconcile), `realtime/` (centrifuge-js client, subscription manager, presence hooks), `status/` (hooks) |
| App Group | `modules/cp-app-group` (Swift + Kotlin): atomic JSON read/write in `group.app.critterpass` (Android: `filesDir`), `drainPendingActions()`, `writeEndpointsConfig()`; zod schemas in `packages/domain/src/surfaces/app-group.ts` |
| Errors | reuse `packages/domain/src/errors.ts` (phase 08) |

## Tasks

### T1 — Command envelope, registry and execution pipeline
- Goal: one `executeCommand` implementing api-contracts §2.3 for every door.
- Files: `packages/domain/src/commands/{registry-types.ts,index.ts}`, `packages/db/src/command/{execute.ts,revoke.ts}` (imports `claimOpId`/`recordCmdResult`/`appendDomainEvent`/`enqueueRealtime` from `packages/db/src/events.ts`), `services/api/src/commands/_framework/{registry.ts,define-command.ts}`, `packages/db/migrations/<ts>_rt_outbox_notify.sql`, `packages/db/test/command/execute.test.ts`
- Steps: 1. Import phase 08 `CommandEnvelope`; add skew handling (future >5 min stored, not trusted). 2. `defineCommand({name, v, schema, authorize, entitle, handle, offline: boolean, actionScope?})`. 3. `executeCommand`: parse → overwrite `actor.uid` → `withUser` → `claimOpId` (sha256 of canonical JSON payload) → authorize → `entitle(tx, …)` from phase 12 `services/api/src/entitlements` → handle → `recordCmdResult` → commit. 4. Error mapping to `DomainError(code, detail)`. 5. NOTIFY trigger migration.
- Tests: `pnpm --filter @critterpass/db test -- command/execute` (Testcontainers PG18: applied, duplicate replay returns stored result, `IDEMPOTENCY_MISMATCH`, authorize deny → `FORBIDDEN` with no writes, handler throw rolls back outbox + events, uid spoof overwritten, failed handler after `entitle` leaves the quota counter unchanged — pipeline integration for phase 12 quota reservations).
- Done when: all cases pass; a test-file-registered command proves outbox + event rows exist only after commit.

### T2 — HTTP doors: `/v1/cmd/{cmd}`, `/sync/upload`, `/v1/cmd-results`
- Goal: three routes on the one registry with correct status semantics.
- Files: `services/api/src/routes/{cmd.ts,sync-upload.ts,cmd-results.ts}`, `services/api/test/routes/sync-upload.test.ts`, `services/api/test/routes/cmd.test.ts`
- Steps: 1. `/v1/cmd/{cmd}`: session (anonymous allowed where command says) → `executeCommand` → 200 `{status, result}` or error envelope with HTTP per api §3. 2. `/sync/upload`: batch `{ops[]}` ≤500 ops/≤1 MB, ordered, each op own tx; rejects → recorded, continue; any transient error → stop, return 503 with index of first unprocessed op (already-applied ops replay as duplicates). 3. `/v1/cmd-results?since` paginated own rows. 4. OpenAPI via `@hono/zod-openapi`; per-uid rate limit (Redis) → `RATE_LIMITED`.
- Tests: `pnpm --filter @critterpass/api test -- routes/sync-upload routes/cmd` (Hono `app.request` + Testcontainers).
- Done when: reject returns 2xx with `cmd_results.status=rejected`; retry of a partially applied batch yields `duplicate` for applied ops; `/openapi.json` lists the three routes.

### T3 — PowerSync service config, publication and core Sync Streams
- Goal: self-hosted PowerSync (Open Edition) replicating from PG18 with Better Auth JWKS, streams for existing tables.
- Files: `infra/powersync/{service.yaml,build-config.ts,README.md}`, `infra/powersync/streams/{core,entitlements,places}.yaml`, `infra/railway/powersync-repl.toml`, `infra/railway/powersync-api.toml`, `packages/db/test/helpers/stream-harness.ts`, `packages/db/test/permissions/{sync-streams-core,sync-streams-entitlements,sync-streams-places}.test.ts`
- Steps: 1. Service config: `powersync_repl` direct (non-PgBouncer) connection, Postgres bucket storage (Railway PG18), JWKS `https://api…/api/auth/jwks`, `aud: sync`. 2. Verify phase 08 publication (+ 12/14 `ALTER PUBLICATION` entries) via `check-publication`. 3. `streams/core.yaml` (`me`, `crews`, `crew_people`, `trip`, `trip_draft`, `catalog`), `entitlements.yaml` (`products`, `perks`, `user_entitlements`, `trip_entitlements`, `usage_counters`, `fx_snapshots`), `places.yaml` (`pois`, `map_regions` in `trip_pack`/`explore`); `deleted_at IS NULL`; `build-config.ts` merges `streams/*.yaml`. 4. Railway configs: repl ×1, api ×N. 5. `stream-harness.ts`: evaluates a stream's SQL with the 5 fixtures (outsider / ex-member / member / organiser / anonymous) against Testcontainers PG; used here and by later phases.
- Tests: `pnpm --filter @critterpass/db test -- permissions/sync-streams`; `docker compose -f infra/docker-compose.yml up powersync` then `pnpm --filter @critterpass/db exec tsx test/smoke/powersync-health.ts`.
- Done when: outsider/ex-member get zero rows for crew/trip streams; member gets rows; service reaches `ready` locally against compose Postgres.

### T4 — Mobile PowerSync client with SQLCipher and connector
- Goal: encrypted local DB, credentials and upload wiring.
- Files: `apps/mobile/src/data/powersync/{schema.ts,db.ts,connector.ts,encryption-key.ts,local-tables.ts}`, `apps/mobile/src/data/powersync/__tests__/connector.test.ts`
- Steps: 1. PowerSync RN SDK on op-sqlite with SQLCipher; 32-byte key generated once into secure store (`requireAuthentication: false`, `keychainAccessible: AFTER_FIRST_UNLOCK`). 2. Schema generated from Drizzle for published tables + local-only `commands`, `local_private`, `overlay_*`. 3. `fetchCredentials` → `GET /api/auth/token?aud=sync`. 4. `uploadData` reads `commands` in insertion order, posts `/sync/upload`, removes sent ops on 2xx, backoff on 5xx/offline. 5. `resetForUser(uid)` → `disconnectAndClear()` + `local_private` wipe, registered into phase 09 `registerOnSignOut()` (sign-out, merge, `SESSION_REVOKED`).
- Tests: `pnpm --filter @critterpass/mobile test -- data/powersync` (Jest; connector against msw-free Hono test server started in-process from `services/api` test harness).
- Done when: DB file is unreadable without key (test opens raw file and fails); ordered upload + retry behaviour verified.

### T5 — Command client, optimistic overlays and reconcile
- Goal: `useCommand` with optimistic writes, per-op reconcile and headless queued/rejected state.
- Files: `apps/mobile/src/data/commands/{client.ts,use-command.ts,overlays.ts,reconcile.ts,summaries.ts}`, `apps/mobile/src/data/status/{use-sync-status.ts,use-queued-commands.ts,use-rejected-commands.ts}`, `apps/mobile/src/data/commands/__tests__/*.test.ts`
- Steps: 1. `send(cmd, payload, {optimistic?})`: UUIDv7 `op_id`, envelope, insert into `commands` (+ overlay rows) in one local tx; online-only commands go to `/v1/cmd`. 2. Summary registry: each command registers `summarize(payload) → i18n message descriptor` (Lingui `msg` from phase 03; fallback to command name if absent). 3. Reconcile on `cmd_results` watch: applied → clear overlay once server row present; rejected → rollback overlay, push to rejected store. 4. Status hooks: online/offline (NetInfo), connecting, catching-up (PowerSync `hasSynced`/`downloading`), `lastSyncedAt`.
- Tests: `pnpm --filter @critterpass/mobile test -- data/commands data/status`.
- Done when: rejected op removes its overlay row and appears in `useRejectedCommands`; queued list survives DB reopen; statuses transition correctly in tests.

### T6 — Centrifugo config, subscribe and publish proxies
- Goal: authenticated realtime with ACL from the same policy functions.
- Files: `infra/centrifugo/config.json`, `infra/railway/centrifugo.toml`, `services/api/src/routes/internal-rt.ts`, `services/api/src/realtime/{namespaces.ts,acl.ts,publish-rules.ts,info.ts}`, `packages/domain/src/realtime/{envelope.ts,namespaces.ts,payloads/user.ts}`, `packages/db/test/permissions/rt-subscribe.test.ts`
- Steps: 1. Config: token JWKS + `aud: rt`, Redis engine, namespaces from catalogue with history size/TTL, `force_recovery`, presence/join_leave, `allow_user_limited_channels`, proxy endpoints + shared header. 2. `registerNamespace({name, acl(uid, id, tx), clientPublish?: {types, maxHz, maxBytes}})`; register `user`, `crew`, `crew_chat`, `crew_money`, `crew_bookings`, `crew_collection`, `trip`, `trip_setup`, `trip_draft` (organiser), `trip_plan`, `trip_dayof`, `trip_watch`, `trip_quests`, `trip_album`, `trip_presence`. 3. Subscribe proxy returns `{result:{info}}` or 403 (unknown namespace → 403). 4. Publish proxy: only `trip_presence`, `crew_chat` typing; per-client rate window in Redis; drop oversize.
- Tests: `pnpm --filter @critterpass/db test -- permissions/rt-subscribe` (5 fixtures × every registered namespace); `pnpm --filter @critterpass/api test -- routes/internal-rt`.
- Done when: matrix passes; publish of `message.created` by a client is dropped; typing at 2/s is rate-limited to ≤1/3 s.

### T7 — Outbox relay and server-side revocation
- Goal: commit-then-publish fan-out with unsubscribe/disconnect on membership or session change.
- Files: `services/worker/src/rt-relay/{relay.ts,centrifugo-api.ts,index.ts}`, `services/worker/test/rt-relay.test.ts`, `services/api/src/realtime/session-revoke-hook.ts`
- Steps: 1. `LISTEN rt_outbox` + 1 s sweep; `SELECT … FOR UPDATE SKIP LOCKED LIMIT 100` as `app_system`. 2. Map kinds: publish (single channel), broadcast (grouped), unsubscribe (user, channel), disconnect (user). 3. Mark `published_at`; failures increment `attempts` with capped backoff. 4. Better Auth session revoke/sign-out hook writes `disconnect` outbox row. 5. Graceful shutdown.
- Tests: `pnpm --filter @critterpass/worker test -- rt-relay` (Testcontainers PG + Centrifugo container: publish visible to a subscribed centrifuge-js Node client; membership removal → client receives unsubscribe < 1 s; rolled-back tx publishes nothing).
- Done when: all three behaviours pass; two relay instances never double-publish (test with concurrent relays checks message count).

### T8 — Mobile realtime client, recovery and presence hooks
- Goal: typed subscriptions with recovery, dedupe, presence, typing and anchored cursors.
- Files: `apps/mobile/src/data/realtime/{client.ts,subscriptions.ts,recovery-store.ts,use-channel.ts,use-presence.ts,use-typing.ts,use-anchored-presence.ts}`, `apps/mobile/src/data/realtime/__tests__/*.test.ts`
- Steps: 1. centrifuge-js with `getToken` → `/api/auth/token?aud=rt`, refresh before `exp`. 2. Ref-counted `useChannel(ns, id, handlers)`; persist `(offset, epoch)` in MMKV; `recovered:false`/epoch change → `onChannelReset`. 3. Dedupe on envelope `id` (LRU 500); zod-validate payload by `type`. 4. AppState: disconnect after 30 s background, reconnect on foreground. 5. `useTyping` throttle 1/3 s + 5 s expiry; `useAnchoredPresence(anchor)` ≤5 Hz, clears on blur; `usePresence` from presence + join/leave.
- Tests: `pnpm --filter @critterpass/mobile test -- data/realtime` (Jest against local Centrifugo via compose in CI job `rt-client`).
- Done when: reconnect after 2 min background recovers missed messages with no duplicates; lossy reset callback fires when history is exceeded.

### T9 — Media presign, multipart and signed reads
- Goal: R2 upload/read primitives used by avatars, photos, receipts, docs.
- Files: `services/api/src/routes/media.ts`, `services/api/src/media/{r2.ts,sign.ts,purposes.ts}`, `services/media-worker/{src/index.ts,wrangler.toml,test/index.test.ts}`, `services/api/test/routes/media.test.ts`
- Steps: 1. `purposes.ts`: allowed content types + max bytes per purpose; key `u/<uid>/<purpose>/<uuidv7>`. 2. Presign PUT (≤5 MB) with sha256 checksum; multipart create/parts/complete (parts ≥5 MiB). 3. Register `media_objects` row via internal command `register_media_upload`. 4. `read-urls`: authorize each key (owner, or membership of the object's crew/trip) → `HMAC-SHA256(secret, key+exp)`, TTL 15 min. 5. Worker verifies sig/exp in constant time, streams from R2 binding, `Cache-Control: private`.
- Tests: `pnpm --filter @critterpass/api test -- routes/media`; `pnpm --filter @critterpass/media-worker test` (Miniflare).
- Done when: outsider read-url request → `NOT_FOUND`; expired/tampered sig → 403 at worker; oversize presign → `PAYLOAD_TOO_LARGE`.

### T10 — App Group bridge and extension outbox drain
- Goal: extensions can queue commands offline and the app drains them through the normal pipeline.
- Files: `apps/mobile/modules/cp-app-group/{expo-module.config.json,ios/CpAppGroupModule.swift,ios/AppGroupStore.swift,android/src/main/java/app/critterpass/appgroup/CpAppGroupModule.kt,src/index.ts}`, `packages/domain/src/surfaces/app-group.ts`, `apps/mobile/src/data/commands/drain-extension-outbox.ts`, `apps/mobile/modules/cp-app-group/ios/Tests/AppGroupStoreTests.swift`
- Steps: 1. zod schemas for `state/pending-actions.json` and `config/endpoints.json` (`{schema, generated_at, …}`), codegen to Swift/Kotlin structs (script in `packages/domain/scripts/gen-surfaces.ts`). 2. Swift store: atomic temp+rename writes, `NSFileCoordinator`; Kotlin mirror in `filesDir`. 3. Config plugin adds App Group entitlement `group.app.critterpass`. 4. Drain on launch/foreground: move envelopes into `commands` (keep op_id, `actor.via` preserved), clear file. 5. Write `config/endpoints.json` on start.
- Tests: `xcodebuild test -scheme CpAppGroup` via `pnpm --filter @critterpass/mobile ios:test cp-app-group`; `pnpm --filter @critterpass/mobile test -- drain-extension-outbox`.
- Done when: an envelope written by the Swift store is uploaded once and file is emptied; concurrent write during drain is not lost (test).

### T11 — End-to-end sync harness and offline replay regression
- Goal: CI-runnable proof of the full loop with real services.
- Files: `tools/scripts/sync-e2e/{run.ts,scenarios/*.ts,README.md}`, `.github/workflows/sync-e2e.yml` (new file only)
- Steps: 1. Compose stack (PG18 logical, Redis, Centrifugo, PowerSync, api, worker). 2. Node client via `@powersync/node` + centrifuge-js using the same `apps/mobile/src/data` connector code (platform-neutral modules). 3. Scenarios: offline queue 50 ops → restart → replay exactly once; reject mid-batch continues; api 503 mid-batch → retry idempotent; two clients see realtime hint < 1 s p95 and rows via sync; member removal → unsubscribe + stream drops rows; uid switch clears local DB.
- Tests: `pnpm tsx tools/scripts/sync-e2e/run.ts --all`.
- Done when: all scenarios green locally and in the GitHub Actions job; p95 hint latency printed and < 1 s.

## Phase acceptance criteria

- [ ] `executeCommand` used by `/v1/cmd`, `/sync/upload` and worker `dispatchSystem` (grep shows no other write path in `services/api/src/routes`)
- [ ] Sync door returns 2xx for business rejects with a `cmd_results` row; replay returns `duplicate`
- [ ] Local SQLite is SQLCipher-encrypted; account switch clears it
- [ ] Permission suites (`command-pipeline`, `sync-streams-core`, `rt-subscribe`) pass for outsider/ex-member/member/organiser/anonymous
- [ ] Outbox publish only after commit; unsubscribe < 1 s after membership removal
- [ ] Centrifugo recovery after 2 min background with no duplicates; lossy reset triggers reconcile
- [ ] Extension pending actions drain exactly once
- [ ] Media signed reads enforce membership and expiry
- [ ] `tools/scripts/sync-e2e` all scenarios green in CI
- [ ] No plan/phase/feature ids in code, tests, migrations or commits

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| PowerSync self-host instability or slot loss on PlanetScale failover | S-SYNC drill result from phase 02; fallback PowerSync Cloud (config swap in `infra/powersync`, same streams) |
| Sync Streams subquery limits for `crew_people` | fallback denormalised `crew_member_users` table maintained by trigger (data-model-sync Q1) |
| Batch upload head-of-line blocking | per-op tx + rejects never block; transient-only 5xx |
| Centrifugo OSS lacks per-op rate limits | publish proxy + Redis windows |
| SQLCipher perf on low-end Android | measure in T4; budgets per system-architecture §9 |
| Relay lag | LISTEN wake + sweep; alert on oldest unpublished > 5 s (phase 19 wires alert) |

Rollback: each task is additive; migrations are expand-only; infra configs versioned per service.

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Railway SG project + private networking (api ↔ Centrifugo ↔ PowerSync) | run on compose locally; CI uses containers |
| PlanetScale Postgres with logical replication + `powersync_repl` role | Railway Postgres HA fallback (D4) |
| Cloudflare R2 bucket + media Worker route `media.critterpass.app` | presign tests run on Miniflare/R2 local; domain assumption D20 |
| Apple App Group `group.app.critterpass` + Keychain group on the App ID | module builds without entitlement in simulator tests; extension drain disabled until provisioned |

## Open questions

| Question | Default implemented |
|---|---|
| Upload batch size limits | ≤500 ops / ≤1 MB per batch |
| Queued/offline visuals ownership | headless hooks here; 3k-4 visuals in phase 36, chat pending mark in 24 (doc delta: note in system-architecture §4.2) |
| `recover` history sizes | catalogue values; tune from S-RT results |
| Anonymous sessions on `/v1/cmd` | allowed only for commands flagged `allowAnonymous` |
