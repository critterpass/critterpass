---
phase: 11
title: Job runner, notification router, push
status: in_progress
depends_on: [5, 10]
wave: 5
features: [F-014, F-016, F-017]
screens: [5b-1, 5b-4, 3c-8, 3f-1, 3k-5]
tasks: 11
owns:
  - services/worker/src/boss/
  - services/worker/src/jobs/sched/
  - services/worker/src/jobs/maint/
  - services/worker/src/jobs/ops/
  - services/worker/src/jobs/notify/
  - services/worker/src/jobs/push/
  - services/worker/src/jobs/roundup/
  - services/worker/src/push/
  - packages/db/src/jobs/
  - packages/db/migrations/<ts>_jobs_scheduling.sql
  - packages/db/migrations/<ts>_devices_notifications.sql
  - packages/db/migrations/<ts>_devices_action_key_fk.sql   # expand-only: device_action_keys.device_id FK → devices (table owned by phase 09)
  - packages/db/test/permissions/devices-notifications.test.ts
  - packages/domain/src/notifications.ts
  - packages/domain/src/push-payload.ts
  - packages/domain/src/time/local-schedule.ts
  - packages/i18n/locales/en/notifications/
  - services/api/src/commands/device/
  - services/api/src/routes/actions.ts
  - services/api/src/routes/action-keys.ts
  - services/api/src/routes/notifications.ts
  - apps/mobile/src/data/push/
  - apps/mobile/modules/cp-notifications/
  - apps/mobile/targets/notification-service/
  - apps/mobile/targets/_shared/ActionKey/
  - apps/mobile/targets/_shared/PushPayload/
  - e2e/notifications/
  - infra/powersync/streams/notifications.yaml
  - services/worker/src/rt-relay/                # sole owner after phase 10 is done (created there); this phase moves the loop onto pg-boss `rt.relay`
---
# Phase 11 — Job runner, notification router, push

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D4 (pg-boss, node-apn, firebase-admin), D5 (durable AI jobs with progress), D8 (reset 00:00 device tz), C12 (Pass+ spoken read-out), C47, Q-56, Q-84 (roundup tz), Q-85 (ALWAYS set) |
| `docs/system-architecture.md` | §4.4 jobs, §4.5 push routing, §4.8 extensions, §10 ops (backup, alerts) |
| `docs/api-contracts.md` | §4.1 `register_device`, §5.2 `/v1/actions` + action keys, §5.5 `GET /v1/notifications/{id}` |
| `docs/api-contracts-async.md` | §2.1 rules, §2.2 `rt.relay`/`notify.route`/`push.send`, §2.3 `sched.enqueue_due`, `maint.purge`, `maint.anon_gc`, `powersync.compact`, `ops.backup`, §3.1 APNs, §3.3 FCM, §5 action keys, §7 phase map |
| `docs/data-model.md` | §3.11 `devices`, `push_tokens`, `notifications`, `notification_prefs`, `ping_ledger`, `roundups`, `inbox_items`, `scheduled_deliveries`, `scheduled_events`, `device_action_keys`; §3.18 `ai_usage`, `pgboss.*` |
| Master | `design-analysis-260926-1143-master-synthesis-report.md` §2 rows F-014/F-016/F-017, §7 notification budget rules + N-01…N-52 table, §5 platform row "Notifications with sender identity" |
| Reports | `researcher-260926-1649-custom-hono-backend-report.md` (pg-boss, node-apn, FCM); `researcher-260926-1143-native-platform-monetization-report.md` + `fact-check-…-native-platform-monetization-report.md` (Communication Notifications, NSE limits); `design-analysis-260926-1143-off-app-native-surfaces-report.md` (5b-1, 5b-4) |
| Renders | `docs/design-renders/screens/5b-1_In_the_guide_s_voice.png`, `5b-4_How_much_we_ping.png`, `3c-8_Pon_is_drafting.png`, `3k-5_Flight_delayed.png` |

## Overview

Goal: durable jobs with progress, a notification router that enforces classes/budget/quiet hours/roundup per user timezone, and push delivery (APNs + FCM) where every notification comes from a named sender with its avatar.

Done when: a domain event mapped to a notification key produces exactly one correctly-classed delivery (or roundup line) per recipient; BUDGET overflow and quiet hours defer into the 20:00 roundup while ALWAYS bypasses both; iOS shows a Communication Notification with the guide or crewmate avatar and Android a MessagingStyle notification with the same sender; jobs retry, dead-letter and report progress.

## Requirements

### F-014 Agent job runner (durable steps, progress stream, retries, compensation, idempotent side effects, push on completion)

| Aspect | Requirement |
|---|---|
| Durability | pg-boss 12 in `services/worker`; enqueue inside command tx (`sendInTx`) → exactly-once handoff |
| Steps + progress | `runSteps(job, [{id, run, compensate?}])`: persists step state (`agent_jobs.steps` when the job is an AI job — table from phase 13; generic jobs store in pg-boss `output`), publishes `job.progress{job_id, step, pct}` via `rt_outbox` to `user:#uid` or a supplied channel (e.g. `trip_draft:{id}` for 3c-8 "Pon is drafting") |
| Retries / DLQ | defaults `retryLimit 3, retryBackoff, retryDelay 10 s`; per-queue overrides from catalogue; `<queue>.dlq` + `redrive(queue, jobIds)` function (admin read + `redrive_jobs`: phase 58; screen: phase 59) |
| Compensation | on final failure run `compensate` of completed steps in reverse (e.g. `quota.release`) |
| Idempotency | `singletonKey` per catalogue; handlers re-read state; side effects keyed by `op_id`/`job_id` |
| Completion push | `notifyOnComplete: {key, audience}` emits the mapped domain event (e.g. `draft_ready` only if app backgrounded — decided by router using device `last_seen_at` foreground flag) |
| Scheduling | `scheduled_events` + `sched.enqueue_due` every minute; `localSchedule(localTime, tz)` handles DST gaps/overlaps |
| Relay | `rt.relay` moves onto pg-boss (LISTEN wake retained) |

### F-016 Notification router

| Aspect | Requirement |
|---|---|
| Catalogue | `packages/domain/src/notifications.ts`: all 52 master §7 notifications under semantic keys (`draft_ready`, `flight_delayed`, `vote_closing`, …; the N-id ↔ key map lives in docs only, never in code) with class (ALWAYS/BUDGET/ROUNDUP/SILENT/LOCAL, incl. "BUDGET small → ROUNDUP" and "ALWAYS if plan-changing else ROUNDUP" variants), category (async §3.4), Android channel, sender kind, collapse key template, expiry, interruption level, passive flag. Copy templates + event mappings are registered by owning feature phases via `registerNotification()` |
| Pipeline | `notify.route` (per `(event_id, uid)`): audience → per-category prefs → class → quiet hours (default 22:00–07:00, holds BUDGET) → daily budget from `ping_ledger` (default 5, 1–10) → paywall governor (≤1 paywall-class push/day) → dedupe (`notifications (user_id, dedupe_key)`) / collapse / expiry → `push.send` or roll into roundup |
| ALWAYS set (Q-85) | SOS, leave-by alarm, crew knock, own flight boarding/gate/delay, running-late affecting you, booking/free-cancel deadlines < 24 h, billing failure, disruption approvals — bypass budget and quiet hours |
| Roundup | `roundup.build` per tz bucket at user time −10 min (default 20:00); tz = trip tz while on a trip, else device tz (Q-84); one roundup across crews; ≤5 items ranked (needs-you first); skip if empty; one push from the active guide ("Tokek's evening roundup · 3 things for tomorrow", 5b-1); template composition here; guide-voice lines added in phase 49 |
| Ledger | every notification (remote or LOCAL mirror) recorded in `ping_ledger` per local date; LOCAL mirrors reported by the app via `register_local_notification` path of `register_device` heartbeat (see Contracts) |
| Localisation | text rendered server-side from Lingui notification catalog in user locale |
| Guide voice rewrite | hook `rewrite?: (ctx) => Promise<string>` with cache; default = template copy; phase 13 plugs the Haiku rewriter |
| Spoken read-out (C12, Pass+) | payload flag `cp.readout: true` when prefs `voice_readout` and entitlement; playback built in phase 49 |

### F-017 Push + sender identity

| Aspect | Requirement |
|---|---|
| APNs | `@parse/node-apn` token auth (.p8), HTTP/2 pool, topics per push type (alert, background now; `liveactivity`, broadcast, `widgets` transports exposed as provider methods used by phases 48/49); env sandbox/prod per token |
| FCM | `firebase-admin` HTTP v1, data-only messages; high priority for ALWAYS |
| Payload | `cp` block ≤1 KB (async §3.1) zod-validated; `full:false` minimal-payload mode for private content → NSE fetches `GET /v1/notifications/{id}` with action key |
| Token hygiene | APNs 410/`BadDeviceToken`, FCM `UNREGISTERED` → `invalid_at`; purge +7 d |
| iOS NSE | `targets/notification-service`: `INSendMessageIntent` + `INPerson` (handle `cp-guide:<id>` / `cp-user:<uid>`, avatar from App Group `assets/avatars/` or signed URL), `conversationIdentifier` = crew id or `guide:<id>:<uid>`, `speakableGroupName` = crew name, AI disclosure in guide display name ("Tokek · AI guide"); `thread-id` = crew id; fallback image attachment when Communication Notifications unavailable; 30 s budget, ≤24 MB memory |
| Android | `FirebaseMessagingService` in `modules/cp-notifications`: channels (`cp_always`, `cp_alarm`, `cp_crew_chat`, `cp_votes`, `cp_money`, `cp_trip`, `cp_guide`, `cp_critters`, `cp_roundup`, `cp_sos`), `MessagingStyle` + `Person` with avatar icon, dynamic conversation shortcuts per crew/guide, thread grouping |
| Sender avatars | guide avatars from phase 05 bake (`critter-bake` outputs `avatars/guide-<id>@2x/@3x.png`) copied into App Group / Android assets; crewmate avatars rendered by `media.process` (phase 44/45) — until a user has a render, their pass critter avatar from bake is used |
| Device registry | `register_device` (async §4.1) upserts `devices` + `push_tokens`; on every launch and token rotation; `last_seen_at`, foreground flag |
| Action keys | table + issue/rotate/revoke + HMAC verification middleware come from phase 09 (`services/api/src/auth/action-keys/`); here: `devices` FK, `/v1/devices/{id}/action-keys` routes, `/v1/actions` door with scope allow-list (async §5), device-removal revoke hook, Swift signer |
| Tap routing | `cp.deeplink` → expo-router; foreground presentation rules (suppress chat push when that chat is on screen) |

### Undesigned flows/states designed in code

| Item | Design |
|---|---|
| Notification permission denied / provisional | router still writes `notifications` + inbox-eligible rows; device `permission_state` stops `push.send` for alert (Silent/LA still per OS); banner UI in phase 49 |
| Roundup with zero eligible items | skipped (no push), `roundups.fallback_used=false`, nothing sent |
| Budget exhausted mid-day | overflow → roundup; ledger `queued` counter |
| DLQ ops alert | pg-boss DLQ insert → Sentry event + phase 19 alert hook |

## Architecture & contracts

| Area | Delta |
|---|---|
| Migrations | `<ts>_jobs_scheduling.sql`: `pgboss` schema owned by `app_system`, `scheduled_events` (`ai_usage` ships with the LLM gateway phase's own migration); `<ts>_devices_notifications.sql`: `devices`, `push_tokens`, `notifications`, `notification_prefs`, `ping_ledger`, `roundups`, `inbox_items`, `scheduled_deliveries` (data-model §3.11 columns, RLS FORCE, publication additions for stream `me`); `<ts>_devices_action_key_fk.sql` (FK only) |
| Sync | stream `me` additions `devices`, `notifications` (30 d), `notification_prefs`, `ping_ledger`, `roundups`, `inbox_items`, `scheduled_deliveries` in own file `infra/powersync/streams/notifications.yaml` (phase 10 layout + `stream-harness`) |
| Commands | `register_device` (A); `set_notification_prefs` handler shell (schema + persistence; UI + Pass+ voice gate phase 49); `issue_action_key` via route |
| HTTP | `POST /v1/devices/{id}/action-keys`, `DELETE …`, `POST /v1/actions` (K), `GET /v1/notifications/{id}` (K scope `read_notification`) |
| Queues | `rt.relay`, `sched.enqueue_due`, `notify.route`, `push.send`, `roundup.build`, `maint.purge`, `maint.anon_gc`, `powersync.compact`, `ops.backup`, `quota.release` (interface) |
| Realtime | `user:#uid` payloads `job.progress`, `badge.counts` |
| Native | `targets/notification-service` (SwiftUI target, via apple-targets tooling chosen in phase 02), `targets/_shared/{ActionKey,PushPayload}` Swift; `modules/cp-notifications` (Kotlin FCM service + JS bridge for tap events) |

## Tasks

### T1 — pg-boss runtime, queue registry, enqueue-in-tx, DLQ
- Goal: durable job infrastructure used by every later phase.
- Files: `services/worker/src/boss/{boss.ts,queues.ts,define-job.ts,dlq.ts,shutdown.ts}`, `packages/db/src/jobs/{send-in-tx.ts,index.ts}`, `packages/db/migrations/<ts>_jobs_scheduling.sql`, `services/worker/test/boss.test.ts`
- Steps: 1. Boot pg-boss 12 as `app_system` (schema `pgboss`), create queues from registry with retry/expire/DLQ options. 2. `defineJob({queue, schema, handler, singletonKey})`. 3. `sendInTx(tx, queue, data, opts)` via Drizzle adapter. 4. DLQ subscriber → Sentry + `redrive()`. 5. Move phase-10 relay loop into `rt.relay` handler keeping LISTEN wake.
- Tests: `pnpm --filter @cp/worker test -- boss` (Testcontainers: rollback drops job; retry then DLQ; singleton dedupe; redrive).
- Done when: all pass; worker starts/stops cleanly with in-flight jobs finishing or returning to queue.
- Status: done — 27da3d0 (suite is `boss.db.test.ts`: `pnpm --filter @cp/worker test:db -- boss`; keyed queues use policy `exclusive` because pg-boss ignores `singletonKey` on `standard`; the relay test moved onto the `rt.relay` job)

### T2 — Step runner with progress and compensation
- Goal: `runSteps` for long jobs with live progress.
- Files: `services/worker/src/boss/steps.ts`, `packages/domain/src/realtime/payloads/job-progress.ts`, `services/worker/test/steps.test.ts`
- Steps: 1. Persist step results in job output (resume skips done steps on retry). 2. Publish `job.progress` via `rt_outbox` per step with pct. 3. Reverse `compensate` on final failure. 4. `notifyOnComplete` emits domain event through `emitEvent`.
- Tests: `pnpm --filter @cp/worker test -- steps`.
- Done when: a job failing at step 3 on first attempt resumes at step 3; final failure compensates steps 2→1; progress rows appear in order.
- Status: done — 3fc2e91 (suite is `steps.db.test.ts`)

### T3 — Local-time scheduling and `sched.enqueue_due`
- Goal: per-object timers in local time.
- Files: `packages/domain/src/time/local-schedule.ts`, `packages/domain/test/local-schedule.test.ts`, `services/worker/src/jobs/sched/enqueue-due.ts`, `packages/db/src/jobs/schedule-event.ts`, `services/worker/test/enqueue-due.test.ts`
- Steps: 1. `localSchedule({date, time, tz})` → UTC; DST gap → next valid minute; overlap → first occurrence. 2. `scheduleEvent(tx, {kind, ref_id, local, tz})` / `cancel` / `reschedule`. 3. Cron `* * * * *` moves due rows (SKIP LOCKED) to target queues, stores `pgboss_job_id`.
- Tests: `pnpm --filter @cp/domain test -- local-schedule` (property tests across tz list incl. Asia/Saigon, Europe/Berlin DST); `pnpm --filter @cp/worker test -- enqueue-due`.
- Done when: DST cases pass; due events enqueue once under two concurrent workers.
- Status: done — 822f227 (worker suite is `enqueue-due.db.test.ts`; permission test `packages/db/test/permissions/scheduled_events.test.ts`; `app.valid_tz` rejects backward-link zones such as `Asia/Saigon` in the Postgres image, so stored timers use `Asia/Ho_Chi_Minh`)

### T4 — Maintenance and ops crons
- Goal: retention and resilience jobs.
- Files: `services/worker/src/jobs/maint/{purge.ts,anon-gc.ts,retention-rules.ts}`, `services/worker/src/jobs/ops/{backup.ts,powersync-compact.ts}`, `services/worker/test/maint.test.ts`
- Steps: 1. `retention-rules.ts` registry `{table, column, ttl, where}`; seed rules for tables existing now (`cmd_log` 30 d, `cmd_results` 14 d, `rt_outbox` 7 d after publish, `domain_events` 400 d, `notifications` 90 d, `ping_ledger` 30 d, `roundups` 30 d, `push_tokens` invalid +7 d, `scheduled_events` 30 d after fire); later phases append. 2. `maint.anon_gc` per phase-09 rules (anonymous, inactive 90 d, no crew). 3. `ops.backup`: `pg_dump -Fc` streamed to R2 with date key, keep 35 daily; fixed outbound IP not required. 4. `powersync.compact` via service admin API.
- Tests: `pnpm --filter @cp/worker test -- maint`; backup tested against Testcontainers + MinIO (R2-compatible) restore round-trip.
- Done when: purge deletes only expired rows in batches ≤5k; restored dump row counts match.
- Status: done — f3253f6 (suites `maint.db.test.ts` and `backup.db.test.ts`, backup against RustFS; `powersync.compact` is a Railway cron service documented in `infra/railway/README.md`, since self-hosted PowerSync has no compaction API)

### T5 — Device registry and push token lifecycle
- Goal: devices + tokens synced and kept fresh.
- Files: `packages/db/migrations/<ts>_devices_notifications.sql`, `packages/db/test/permissions/devices-notifications.test.ts`, `services/api/src/commands/device/register-device.ts`, `apps/mobile/src/data/push/{register.ts,tokens.ts,use-push-lifecycle.ts}`, `infra/powersync/streams/notifications.yaml`
- Steps: 1. Migration for §3.11 tables in this phase (FORCE RLS, grants, publication). 2. `register_device` handler: upsert device, token by `(kind, token)` (reassign on uid change), capabilities, tz, locale. 3. Mobile: native APNs/FCM token via expo-notifications `getDevicePushTokenAsync`, register on launch/foreground/token change; `last_seen_at` heartbeat (≤1/10 min). 4. Stream `me` additions.
- Tests: `pnpm --filter @cp/db test -- permissions/devices-notifications`; `pnpm --filter @cp/api test -- commands/device`; `pnpm --filter @cp/mobile test -- data/push`.
- Done when: outsider cannot read others' devices/notifications; token moved between uids is detached from the old uid.
- Status: done — e029297

### T6 — Device action keys and `/v1/actions` door
- Goal: extensions and receivers can run scoped commands without the app.
- Files: `packages/db/migrations/<ts>_devices_action_key_fk.sql`, `services/api/src/routes/{action-keys.ts,actions.ts,notifications.ts}`, `apps/mobile/targets/_shared/ActionKey/{ActionKeyStore.swift,SignedRequest.swift}`, `apps/mobile/src/data/push/action-key.ts`, `services/api/test/routes/actions.test.ts`
- Steps: 1. FK migration; `/v1/devices/{id}/action-keys` POST/DELETE call phase 09 `issueKey`/`revokeKey`. 2. Mount phase 09 verify middleware on `/v1/actions` and `/v1/notifications/{id}`. 3. `/v1/actions` → `executeCommand` only for commands whose `actionScope` ∈ key scopes, else `ACTION_KEY_SCOPE`; returns `{status, result}` (snapshot added by phase 49). 4. `GET /v1/notifications/{id}` for owner. 5. Client rotation on foreground when <7 d; device-removal revoke hook (sign-out/deletion/merge hooks live in phase 09). 6. Swift signer + shared Keychain group store.
- Tests: `pnpm --filter @cp/api test -- routes/actions` (valid, skew, replayed sig with same op_id → duplicate, wrong scope, revoked); Swift `SignedRequestTests` via `pnpm --filter @cp/mobile ios:test shared`.
- Done when: all cases pass; Swift and TS produce identical signatures for a fixed vector.
- Status: done — 655154a, 4bd8eed

### T7 — Notification catalogue and router policy
- Goal: pure, tested routing decisions.
- Files: `packages/domain/src/notifications.ts`, `services/worker/src/jobs/notify/{policy.ts,route.ts,audience.ts,register.ts,governor.ts}`, `services/worker/test/notify-policy.test.ts`, `services/worker/test/notify-route.test.ts`
- Steps: 1. Catalogue of the 52 master §7 notifications under semantic keys (class, variants, category, channel, sender kind, collapse, expiry, passive). 2. `registerNotification({key, event, audience, template, dedupeKey})` API for feature phases. 3. Pure `decide({class, prefs, localNow, quiet, ledger, governor, onTrip})` → `send | roundup | drop(reason)`. 4. `notify.route` job: load prefs/tz (trip tz while on trip, Q-84), write `notifications` row (state), update `ping_ledger`, enqueue `push.send` or mark `rolled_into_roundup`. 5. Rewrite hook interface with cache key `(key, template_id, locale, guide_id, vars_hash)`.
- Tests: `pnpm --filter @cp/worker test -- notify-policy notify-route` (property tests: ALWAYS never deferred; budget never exceeded; quiet hours hold BUDGET; governor ≤1/day; dedupe idempotent on replay).
- Done when: property tests pass 1k runs; replaying the same event yields one notification per uid.
- Status: done — 6508073

### T8 — Evening roundup builder
- Goal: one roundup per user per local date.
- Files: `services/worker/src/jobs/roundup/{build.ts,rank.ts,template.ts}`, `packages/i18n/locales/en/notifications/roundup.po`, `services/worker/test/roundup.test.ts`
- Steps: 1. Cron every 5 min selects users whose roundup time −10 min falls in the window per tz bucket. 2. Collect `rolled_into_roundup` + ROUNDUP-class items for local date across crews; rank needs-you first, then recency; cap 5. 3. Skip if empty; else create `roundups` row + one push from the user's active guide (sender kind guide), body "N things for tomorrow" + numbered lines; `apns-collapse-id` = `roundup:<date>`. 4. Items beyond 5 stay in inbox (phase 25).
- Tests: `pnpm --filter @cp/worker test -- roundup` (tz trip vs device, DST day, empty skip, exactly-once under retry).
- Done when: all pass.
- Status: done — 3e2f895, 3c08c01

### T9 — APNs + FCM delivery (`push.send`)
- Goal: reliable delivery with correct payloads and token hygiene.
- Files: `services/worker/src/push/{apns.ts,fcm.ts,payload.ts,render.ts,providers.ts}`, `services/worker/src/jobs/push/send.ts`, `packages/domain/src/push-payload.ts`, `packages/i18n/locales/en/notifications/common.po`, `services/worker/test/push-send.test.ts`
- Steps: 1. node-apn provider (token auth, prod + sandbox), methods `alert`, `background`, `liveActivity`, `broadcast`, `widgets`. 2. firebase-admin `send` data-only; priority by class. 3. `cp` builder ≤1 KB, `full:false` when template marked private; interruption level, relevance, `thread-id`, collapse id. 4. Lingui server render by locale. 5. Error handling: invalidate tokens; retry transient 5×.
- Tests: `pnpm --filter @cp/worker test -- push-send` (HTTP/2 APNs mock server via `node:http2` and FCM emulator endpoint — transport-level test doubles only; payload snapshot tests; oversize → truncate body then fail).
- Done when: payload schema tests pass; 410 marks token invalid; sandbox tokens go to sandbox host.
- Status: done — 9fd432c

### T10 — iOS Notification Service Extension with Communication Notifications
- Goal: every iOS notification shows its sender with avatar.
- Files: `apps/mobile/targets/notification-service/{NotificationService.swift,SenderIdentity.swift,AvatarLoader.swift,Info.plist,expo-target.config.js}`, `apps/mobile/targets/_shared/PushPayload/CPPayload.swift`, `apps/mobile/targets/notification-service/Tests/SenderIdentityTests.swift`
- Steps: 1. Decode `cp`; if `full:false` fetch `/v1/notifications/{id}` with action key (timeout 8 s, keep original on failure). 2. Build `INPerson` + `INSendMessageIntent`, donate, `content.updating(from:)`; group name via `snapshot/crews.json`. 3. Avatar: App Group `assets/avatars/<key>@3x.png`, else signed URL download (≤2 s), else guide default. 4. Fallback: attachment image when intent update throws. 5. Entitlement `com.apple.developer.usernotifications.communication` + `NSUserActivityTypes` `INSendMessageIntent` in app Info.plist via config plugin.
- Tests: `pnpm --filter @cp/mobile ios:test notification-service` (XCTest on payload fixtures); build `eas build --profile dev-sim --platform ios --local`.
- Done when: tests pass; simulator push via `xcrun simctl push` fixture shows sender name + avatar.

### T11 — Android messaging, app tap routing and Maestro flows
- Goal: Android sender parity and tap-to-route on both platforms.
- Files: `apps/mobile/modules/cp-notifications/{expo-module.config.json,android/src/main/java/app/critterpass/notifications/{CpMessagingService.kt,Channels.kt,SenderStyle.kt,ConversationShortcuts.kt},android/src/test/java/…/SenderStyleTest.kt,src/index.ts}`, `apps/mobile/src/data/push/{routing.ts,foreground.ts}`, `e2e/notifications/{ios-sender.yaml,android-sender.yaml,tap-routes.yaml}`, `e2e/notifications/fixtures/*.json`
- Steps: 1. Create channels at app start (ids from `packages/domain/src/notifications.ts` via codegen). 2. Render data-only messages: `MessagingStyle` + `Person` (IconCompat from asset/URL), dynamic shortcuts per conversation, group per crew, action buttons slots (actions wired in phase 49). 3. Tap → emit deep link to JS → expo-router navigate; foreground suppression when the conversation route is active. 4. Maestro flows push fixtures (`xcrun simctl push`, `adb shell cmd notification`/FCM test send) and assert sender + route.
- Tests: `pnpm --filter @cp/mobile android:test cp-notifications`; `maestro test e2e/notifications/`.
- Done when: JUnit + Maestro flows pass on iOS 26 simulator and API 36 emulator.

## Phase acceptance criteria

- [ ] Job enqueued in a rolled-back tx never runs; failed jobs land in `<queue>.dlq` and can be redriven
- [ ] `runSteps` resumes and compensates; `job.progress` observed on `user:#uid`
- [ ] Router property tests: ALWAYS bypasses budget + quiet hours; BUDGET ≤ user budget per local date; paywall ≤1/day
- [ ] Roundup: one per user per local date in trip tz on trips, device tz otherwise; skipped when empty; ≤5 items
- [ ] APNs/FCM payloads validate against `packages/domain/src/push-payload.ts`; invalid tokens pruned
- [ ] iOS NSE shows Communication Notification with avatar; fallback attachment path tested
- [ ] Android MessagingStyle with Person + conversation shortcut
- [ ] `/v1/actions` enforces key scopes, timestamp skew, revocation
- [ ] Permission suite passes for all tables created here
- [ ] Nightly backup restore round-trip test green

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Apple rejects guide personas as Communication Notification senders | fallback: plain alert + avatar attachment (already implemented; flag `push.comm_notifications`) |
| NSE memory/time limits with avatar downloads | App Group cache first; 2 s download cap |
| pg-boss load on primary | worker concurrency caps; archive 7 d; separate queue policies |
| Budget/roundup tz bugs | pure policy + property tests; ledger per local date |
| APNs key compromise | .p8 in Railway secrets; rotation runbook |

Rollback: additive migrations; router can be switched to "send all BUDGET" via `ops_config` flag only for incident use.

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| APNs auth key (.p8), Team ID, bundle ids for app + NSE | sandbox tests with transport double; delivery disabled per env |
| Communication Notifications entitlement on App ID | fallback attachment path active |
| Firebase project + service account, `google-services.json` | Android FCM send disabled; local rendering tested via adb |
| App Group + shared Keychain group provisioning | action keys stored app-only; NSE skips `full:false` fetch |
| R2 bucket for backups (off-provider) | backup job fails loudly (alert), no silent skip |

## Open questions

| Question | Default implemented |
|---|---|
| Roundup tz (Q-84 vs async doc unresolved #3) | trip tz while on a trip, device tz otherwise (product-decisions precedence); doc delta: update api-contracts-async unresolved #3 |
| `roundup.build` owner (async §2.3 lists phase 49) | doc delta: phase 11 builds scheduling + template composition; phase 49 adds guide-voice lines + settings UI |
| `action keys` routes attributed "P11, P48" | built fully here; 48/49 add scopes' commands |
| Quiet hours default | 22:00–07:00 local (master §7) |
| `draft_ready` "only if backgrounded" signal | device foreground flag from heartbeat + app state report; if unknown → send |
| LOCAL notification mirror reporting | app reports scheduled local notifications in `register_device` heartbeat `local_scheduled[]`; doc delta for api §4.1 payload |
