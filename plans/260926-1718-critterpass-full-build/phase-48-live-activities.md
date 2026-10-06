---
phase: 48
title: Live Activities & Dynamic Island
status: in_progress
depends_on: [2, 5, 11, 34, 36, 39, 40]
wave: 19
features: [F-170, F-171, F-172, F-173, F-174, F-175]
screens: [5a-1, 5a-2, 5a-3, 5a-4, 5a-5, 5a-6, 3k-3, 3k-8, 3k-10, 3h-1, 3h-3, 5b-3]
tasks: 10
owns:
  - packages/domain/src/live-activities.ts
  - packages/domain/src/surfaces/la-*.ts
  - packages/db/src/schema/live-activities.ts
  - packages/db/migrations/<ts>_live_activities.sql
  - packages/db/test/permissions/live-activities.test.ts
  - services/api/src/commands/live-activities/
  - services/api/test/live-activities/
  - services/worker/src/jobs/la/
  - services/worker/src/push/la-channels.ts
  - apps/mobile/modules/cp-live-activity/
  - apps/mobile/modules/cp-app-group/src/snapshots/la/
  - apps/mobile/targets/widgets/LiveActivities/
  - apps/mobile/targets/widgets/Intents/LiveActivity/
  - apps/mobile/targets/widgets/CPWidgetBundle.swift   # owner; phase 49 (runs after this phase) has an append-only grant to register its widgets
  - apps/mobile/targets/_shared/ActivityAttributes/
  - apps/mobile/src/features/trip/live-activities/
  - apps/mobile/src/app/(trip)/lock-screen-offer.tsx
  - packages/i18n/locales/en/trip/live-activities.po
  - e2e/trip/live-activities/
---
# Phase 48 — Live Activities & Dynamic Island

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D2 (iOS 26 min; Live Updates 36+), D4 (node-apn liveactivity + broadcast), C10 (own leave-by LA free incl. crew leave-by pips; crew meet-up LA Boost), C14 (countdown source), C17 (5a-1 canonical), C37 (flight LA free for any wallet flight; Pass+ = email auto-import badge), §4 platform adaptations rows "Tokek walks the LA trail", "Critter nearby at 50 m", "Interactive LA buttons on locked phone", "Alarm/SOS breaks DND"; entitlement matrix row "crew LA"; paywall trigger 5a-6 |
| `docs/system-architecture.md` | §4.5 push routing, §4.8 extensions, §5 authz, §9 perf budgets |
| `docs/data-model.md` | §3.11 `devices` (la_enabled, la_frequent), `la_push_to_start_tokens`, `device_activities`, `device_action_keys`, `readiness`; §3.x `flight_segments.la_phase`, `leave_bys`, `meetups`, `help_sessions` |
| `docs/data-model-sync-and-privacy.md` | §1 snapshot rule (no coordinates, no budget maxes), §7 row 48 (`device_activities`, `broadcast_channels`, `la_push_to_start_tokens`) |
| `docs/api-contracts.md` | §4.1 `register_device`, `update_device_permissions`, `register_la_token`; §5.2 `/v1/actions`; `GET /v1/widgets/snapshot` |
| `docs/api-contracts-async.md` | §3.1 APNs `liveactivity` + broadcast, §3.2 LA activity types (canonical), §4 LA intents → commands, §5 action keys, §6 App Group `state/la/*`, `assets/*` |
| `docs/design-system.md` | native-surface rules, guide colours (C5), update-transition presets |
| Phase files | 02 (apple-targets spike, App Group), 05 (baked art + `exportPng`), 11 (push.send, action keys, `/v1/actions`), 34 (flight_segments, AeroAPI), 36 (LeaveBy scheduler, AlarmKit via `cp-alarm`), 39 (meetups, ETAs, crew-map gate), 40 (spawns, encounter dwell) |
| Reports | `design-analysis-260926-1143-off-app-native-surfaces-report.md` (5a-*), `researcher-260926-1143-native-platform-monetization-report.md` + `fact-check-…` (ActivityKit limits, push-to-start, broadcast, budgets); master §2 F-170…F-175, §6.1 LA row, R7, R8 |
| Renders | `docs/design-renders/screens/5a-1_Leave-by.png`, `5a-2_Crew_live.png`, `5a-3_Flight_day.png`, `5a-4_Critter_nearby.png`, `5a-5_Dynamic_Island.png`, `5a-6_On_every_lock_screen.png`, `3k-3_Lock_screen.png`, `3k-8_Storm_warning.png`, `3k-10_Crew_SOS.png`, `5b-3_Leave-by_alarm.png` |

## Overview

Goal: one server-orchestrated Live Activity system (8 activity types, per-device tokens, push-to-start, broadcast channels per shared object, budget + 8 h/12 h lifetime handling, restart) rendering baked critter art in a single SwiftUI widget extension, with interactive App Intents that write through `/v1/actions`.

Done when: on two iOS 26 devices in one crew, a LeaveBy starts on both (local/scheduled/push-to-start), I'M UP on one lock screen fills the pip on both within 5 s, the flight LA flips to pickup on a simulated landing, crew-live runs only on boosted trips, and every other kind starts/updates/ends from its domain event with ≤2 s update transitions and no coordinates in any payload.

## Requirements

| Feature | Designed behaviour (build all) | States / undesigned (design in code) | Entitlement / decisions |
|---|---|---|---|
| F-170 orchestration | Activity registry mirroring async §3.2; server `la.orchestrate` decides start/update/end per (user, device, object); start paths: local (app foreground), scheduled `startDate` (iOS 26), push-to-start (per-type token); updates via per-activity token or broadcast channel (one per LeaveBy / MeetUp / Vote poll); priority budget (p10 only arrive/late/SOS/T0, else p5); `stale-date` + `relevance-score`; 8 h active limit → auto end + restart if the object still runs (e.g. overnight trek) within the 12 h lock-screen window; dedupe by `(device, kind, ref_id)`; mirror user LA toggles (`la_enabled`, `la_frequent`) from `ActivityAuthorizationInfo` and fall back to notifications when off | LA disabled banner in trip settings; "frequent updates off" → p5-only with coarser ETA; restart continuity (same content version); token rotation; device removed | D2, D4; R7 static art, R8 idempotency |
| F-171 leave-by LA + Dynamic Island + I'M UP | 5a-1: trail with legs (villa → pickup → trailhead → summit), Tokek position advances per leg (discrete, transition on update), `Text(timerInterval:)` countdown, crew pips fill green (pop = `.contentTransition(.numericText)` + scale transition ≤2 s); I'M UP `LiveActivityIntent` → `set_readiness{up, source: la}` updates own pip optimistically and every crewmate's LA via broadcast; 5a-5 compact: Tokek peeks left, minutes right; minimal: Tokek glyph; expanded: trail + I'M UP + SNOOZE; at T0 (03:10) alert with double haptic and yellow pulse (alert config on p10 update); 3k-3 lock screen composition | waiting / soon / go / late / done; offline tap (pending-actions queue, pip shows "sending"); second snooze → crew knock (server rule from 36); multi-leg without crew (solo) | Own LA free; crew pips for all members free on own LA per C10 (pips of crewmates' readiness), crew channel content Boost-gated only for ETA lane |
| F-172 flight-day LA → pickup | 5a-3: push-to-start T−3 h for **any** wallet flight (forward, scan, paste, manual, email); source badge "from your email" only for mailbox imports (C37); countdown turns orange at T−10 min to boarding; gate/delay from `flight.event`; on landing flips to pickup (driver/transfer name from bookings, Tokek holds a sign with the name); ends on pickup confirmed or +2 h | pre-boarding / boarding / departed / landed-pickup / cancelled (links to disruption flow in 37) / diverted; no pickup booked → "arrived" card with Grab CTA deep link (from 35) | Free (C37); badge copy Pass+ source only |
| F-173 critter-nearby LA | 5a-4: starts when an encounter dwell session begins — app in foreground → local `Activity.request`; app backgrounded/phone locked (the designed case; `Activity.request` fails in background) → server push-to-start triggered by P40's POI-level `encounter.dwell_started{spawn_id, poi_id, distance_band}` report (no coordinates, C25/D13); no push-to-start token or LA permission → time-sensitive notification fallback; dwell ring fills while within 50 m, silhouette blur stages 3→0 by ring fraction, wander-off drains ring slowly (server-confirmed dwell state); ends on catch (success art) or expiry | ring states quantised to 10 steps (payload budget); phone locked + WIU session only (D13); no coordinates in state (distance band enum) | Free |
| F-174 crew-live LA | 5a-2: whole crew on one line sliding toward the meet-up flag (positions = ETA-fraction buckets, not coordinates), furthest-out row with ETA, RUNNING LATE (`report_running_late{10}`), ON MY WAY, PING ALL, SOS (confirm) intents; starts T−30 min before meet-up via push-to-start on all members' devices of a boosted trip, ends itself on all-arrived or +30 min; 5a-6 offer sheet from crew map on an unboosted trip ("put this on the lock screen") shows mini live preview + Boost CTA + "keep just my leave-by" quiet option | Boost expired mid-activity → end with "boost ended" final state; member without LA permission → notification fallback; late state; SOS takes over (see F-175) | Boost (C10, matrix); 5a-6 → Boost offer (46 owns purchase) |
| F-175 other kinds | Vote closing (push-to-start T−24 h; tallies + "you voted" stamp, `CastBallotIntent`), Storm (3k-8: severity, window, action line; opens replan in 37), SOS (3k-10: recipients push-to-start p10; sender local; responders count, last-seen minutes; COMING intent), Alarm countdown (AlarmKit presentation for leave-by alarms scheduled in 36: countdown/paused/alerting with I'M UP secondary), Ride/pickup (3h-3: Grab fare + ETA line from 35's quote, deep link only; no live driver) | ended/expired per kind; concurrent-activity priority (SOS > Alarm > LeaveBy > Flight > MeetUp > Storm > Vote > CritterNearby); max 2 concurrent per device, lower ones become notifications | Free |

Rules: ContentState ≤4 KB, ETA/text/enums only, never coordinates or budget values; art only from bundled/App Group keys (phase 05 bakes); no continuous animation — only SwiftUI transitions on update ≤2 s; all copy localised via generated `.xcstrings`; guide tint per C5; Watch/CarPlay `.small` family gets the compact layout automatically (Q-83 default: accept automatic).

## Architecture & contracts

| Area | Delta |
|---|---|
| Kill switch | Every Live Activity start, update and broadcast checks `la.<kind>.enabled` for its kind through the shared reader (api: `createKillSwitches(pool)` `.middleware(key)` / `.assertOn(key)`; worker: `createKillSwitchReader` from `@cp/db`); off answers `STATE_INVALID {reason: 'switched_off', key}` (api-contracts §4.17), never retried, and the app shows its existing fallback |
| Migration `<ts>_live_activities.sql` | `device_activities` (data-model §3.11 columns), `broadcast_channels (id, kind, ref_id, apns_channel_id, env, created_at, deleted_at; uk (kind, ref_id, env))`, `la_push_to_start_tokens`; RLS FORCE: `device_activities` self select only, writes via `app_system`; `broadcast_channels` system only; not in PowerSync publication (device-local truth + server) — doc delta: data-model lacks `broadcast_channels` columns |
| Commands | `register_la_token` (A, L; upsert per device/type; `kind: update` binds `activity_push_token` to `device_activities` by `os_activity_id`), `report_la_state {os_activity_id, state: active\|ended\|dismissed, kind, ref_id}` (A; doc delta: new command, needed to detect user dismissal), `request_crew_lock_screen {trip_id}` (A; returns Boost gate or starts MeetUp push-to-start) — doc delta |
| Intents → commands | per async §4: `ImUpIntent`, `SnoozeIntent`, `RunningLateIntent`, `OnMyWayIntent`, `PingAllIntent`, `SOSIntent` (confirm), `CastBallotIntent`, `ComingIntent` (SOS respond) — all `LiveActivityIntent`, signed with device action key (scopes `readiness`, `trip_day`, `sos`, `ballot`) |
| Worker | queue `la.orchestrate` (event-driven: `leave_by.*`, `readiness.changed`, `meetup.*`, `eta.updated`, `flight.event`, `encounter.*`, `poll.*`, `storm_watch.*`, `sos.*`, `boost.*`), `la.lifecycle` cron (every minute: stale/end/8 h restart), `la.channels` (Channel Management API create/delete per object); pushes through phase-11 `push.send` with `push-type: liveactivity`; collapse by `(activity, seq)` |
| Content builder | `packages/domain/src/surfaces/la-<kind>.ts`: pure `(objectState, viewer) → ContentState` + zod schema; Swift `Codable` generated from zod (phase 11 codegen) into `targets/_shared/ActivityAttributes/`; size test ≤4 KB |
| Native | `modules/cp-live-activity` (Swift: `Activity.request` local/scheduled, `pushToStartTokenUpdates`, `pushTokenUpdates`, `activityStateUpdates`, authorization observer → JS events; Kotlin stub delegating to phase-50 module); widget extension `targets/widgets/LiveActivities/<Kind>LiveActivity.swift` + `CPWidgetBundle.swift` (bundle registration shared with phase 49, which appends widgets) |
| Realtime | none new; app UI mirrors via existing trip channels |
| Authz tests | Testcontainers: user cannot read another user's `device_activities`/tokens; `guide_reader` and `powersync_repl` have no access; action key without `sos` scope rejected for `SOSIntent` |

## Tasks

### T1 — LA contracts, content builders, schema
- Goal: typed activity registry + DB tables.
- Files: `packages/domain/src/live-activities.ts`, `packages/domain/src/surfaces/la-{leave-by,meetup,flight,vote,critter,storm,sos,alarm,ride}.ts` (+ `.test.ts`), `packages/db/src/schema/live-activities.ts`, `packages/db/migrations/<ts>_live_activities.sql`, `packages/db/test/permissions/live-activities.test.ts`.
- Steps: 1. zod Attributes/ContentState per async §3.2 (+ Ride). 2. Pure builders; priority + concurrency rules table. 3. Migration + RLS + grants. 4. Swift codegen run into `targets/_shared/ActivityAttributes/`.
- Tests: `pnpm --filter @cp/domain test -- surfaces/la`; `pnpm --filter @cp/db test -- permissions/live-activities`.
- Done when: every builder output ≤4 KB for 16-member crews, no field named/typed as lat/lng passes schema lint, permission tests green.
- Status: done — d5f14be10

### T2 — Device token + state commands
- Goal: register tokens and LA state from devices.
- Files: `services/api/src/commands/live-activities/{register-la-token,report-la-state,request-crew-lock-screen}.ts`, `services/api/test/live-activities/commands.test.ts`.
- Steps: 1. Handlers with app-layer policy (self device only). 2. Idempotent by op_id. 3. Boost check in `request_crew_lock_screen` returns `ENTITLEMENT_REQUIRED` with offer key.
- Tests: `pnpm --filter @cp/api test -- live-activities`.
- Done when: replayed op returns stored result; foreign device id rejected; unboosted trip returns offer payload.
- Status: done — ddd2554e4

### T3 — Orchestrator, broadcast channels, lifecycle cron
- Goal: server decides start/update/end for all kinds.
- Files: `services/worker/src/jobs/la/{orchestrate,lifecycle,channels}.ts`, `services/worker/src/push/la-channels.ts`, `services/worker/test/la/*.test.ts`.
- Steps: 1. Event → affected (user, device) set → builder → APNs payload (start needs `alert`, `attributes-type`, `input-push-channel`). 2. Channel create/delete via Channel Management API; per-object broadcast for shared kinds. 3. Priority budget + collapse; fallback to notification (phase-11 router) when `la_enabled=false` or token missing. 4. Minute cron: stale-date, end, 8 h restart, dismissed handling.
- Tests: `pnpm --filter @cp/worker test -- la` (Testcontainers Postgres + APNs HTTP/2 mock server from node-apn test harness).
- Done when: readiness change on a LeaveBy emits one broadcast update; 8 h-old active LeaveBy is ended and restarted with the same `last_content_version`; disabled LA yields a notification instead.
- Status: done — be828f0c9

### T4 — cp-live-activity native module
- Goal: JS control + token streams.
- Files: `apps/mobile/modules/cp-live-activity/{expo-module.config.json,index.ts,ios/*.swift,android/*.kt}`, `apps/mobile/src/features/trip/live-activities/{use-live-activities.ts,register.ts}`.
- Steps: 1. `start(kind, attrs, state, startDate?)`, `update`, `end`, `list`. 2. Emit push-to-start and update tokens → `register_la_token`; state changes → `report_la_state`; authorization → `update_device_permissions`. 3. Write `state/la/<id>.json` via cp-app-group.
- Tests: `pnpm --filter @cp/mobile test -- live-activities`; Xcode unit test target `CPLiveActivityTests` via `xcodebuild test -scheme CPLiveActivity`.
- Done when: dev build logs both tokens on device; JS receives dismissal event.
- Status: done — 805dbab8f

### T5 — Leave-by LA + Dynamic Island UI + I'M UP intent
- Goal: 5a-1, 5a-5, 3k-3 pixel-faithful.
- Files: `apps/mobile/targets/widgets/LiveActivities/LeaveByLiveActivity.swift`, `.../DynamicIsland/LeaveByIsland.swift`, `apps/mobile/targets/widgets/Intents/LiveActivity/{ImUpIntent,SnoozeIntent}.swift`, `apps/mobile/targets/widgets/CPWidgetBundle.swift`.
- Steps: 1. Lock-screen trail with leg markers, baked Tokek poses by leg, pips row. 2. Compact/minimal/expanded island. 3. Intent: optimistic App Group state + signed `/v1/actions`; offline → `pending-actions.json`. 4. T0 alert config.
- Tests: `xcodebuild test -scheme CPWidgets` (snapshot tests of each state, light/dark/tinted); Maestro `e2e/trip/live-activities/leave-by.yaml` (two simulators, second observes pip).
- Done when: snapshots match renders within tolerance; I'M UP updates other simulator's LA ≤5 s.
- Status: done — 899f04d04 (views and island), f9dfcc5a9 (I'M UP runs in the app), 40e60378c (outbox shape). Not built: SnoozeIntent, the FREE pill, ASK TOKEK in the expanded island, an optimistic "sending" pip; no snapshot or two-simulator run exists.

### T6 — Flight-day LA → pickup
- Goal: 5a-3 for any wallet flight.
- Files: `apps/mobile/targets/widgets/LiveActivities/FlightLiveActivity.swift`, `packages/domain/src/surfaces/la-flight.ts` (phases), `services/worker/src/jobs/la/flight.ts`.
- Steps: 1. T−3 h push-to-start from `flight_segments` for each traveller device. 2. Phase transitions from `flight.event`; orange at T−10 boarding (timer-based style switch via `Text(timerInterval:)` + scheduled update). 3. Landed → pickup variant with booked transfer name or Grab CTA.
- Tests: `pnpm --filter @cp/worker test -- la/flight` (AeroAPI fixture timeline); `xcodebuild test -scheme CPWidgets -only-testing:FlightSnapshots`.
- Done when: manual-entry flight starts an LA; source badge only on mailbox imports; landed event flips to pickup.
- Status: done — 899f04d04 (view), 9c410cf65 (server), 7a0c3f737 (ends by schedule). Not built: the PASS+ pill beside "from your email", the Grab hint when no pickup is booked (`grab_cta` is sent, the view ignores it), the guide holding the pickup sign.

### T7 — Critter-nearby LA
- Goal: 5a-4 dwell ring with locked phone.
- Files: `apps/mobile/targets/widgets/LiveActivities/CritterNearbyLiveActivity.swift`, `apps/mobile/src/features/trip/live-activities/critter-nearby.ts`.
- Steps: 1. Start path: foreground → local request; background → worker sends APNs push-to-start on `encounter.dwell_started` (POI id + distance band only) using the stored push-to-start token; missing token/permission → time-sensitive notification. 2. Ring/blur stage from server-confirmed dwell fraction (10 steps); drain on leave. 3. End on catch with found art / on expiry.
- Tests: `xcodebuild test -scheme CPWidgets -only-testing:CritterSnapshots`; `pnpm --filter @cp/mobile test -- critter-nearby`; `pnpm --filter @cp/worker test -- la/critter-start` (background dwell → push-to-start payload; no token → time-sensitive notification; payload contains no coordinates).
- Done when: simulated dwell sequence produces 10 ring states and drains without reset; backgrounded dwell start goes via push-to-start, never local `Activity.request`.
- Status: partly done — 8a48ec237d (the lock-screen view and the in-app start, ring and end, with `critter-nearby` tests). Not built: the worker's push-to-start when a dwell begins with the app in the background

### T8 — Crew-live LA + lock-screen offer (5a-2, 5a-6)
- Goal: boosted crew meet-up LA on every member's phone.
- Files: `apps/mobile/targets/widgets/LiveActivities/MeetUpLiveActivity.swift`, `apps/mobile/targets/widgets/Intents/LiveActivity/{RunningLateIntent,OnMyWayIntent,PingAllIntent,SOSIntent}.swift`, `apps/mobile/src/app/(trip)/lock-screen-offer.tsx`, `apps/mobile/src/features/trip/live-activities/lock-screen-offer/*`.
- Steps: 1. Lane with ETA buckets + straggler row. 2. Intents with server Boost check. 3. 5a-6 sheet with mini live preview (RN rendering of the same content state), Boost CTA (route to phase-46 purchase), quiet option.
- Tests: `pnpm --filter @cp/mobile test -- lock-screen-offer`; Maestro `e2e/trip/live-activities/crew-live.yaml`.
- Done when: unboosted trip shows offer, boosted trip starts MeetUp on all member devices; boost end ends the LA with final state.
- Status: done — 81f85bac75 (worker), 8a48ec237d (meet-up view and its four intents), 7e32959f98 (5a-6 sheet). Not written: Maestro `crew-live.yaml`

### T9 — Vote, Storm, SOS, Ride LAs
- Goal: F-175 kinds except alarm.
- Files: `apps/mobile/targets/widgets/LiveActivities/{Vote,Storm,SOS,Ride}LiveActivity.swift`, `apps/mobile/targets/widgets/Intents/LiveActivity/{CastBallotIntent,ComingIntent}.swift`, `services/worker/src/jobs/la/{vote,storm,sos,ride}.ts`.
- Steps: 1. Triggers per kind; concurrency demotion to notifications. 2. SOS p10 to recipients, local for sender. 3. Snapshots all states.
- Tests: `pnpm --filter @cp/worker test -- la`; `xcodebuild test -scheme CPWidgets`.
- Done when: SOS pre-empts a running LeaveBy on a device at the 2-activity cap; ballot intent returns tallies and shows the stamp.
- Status: partly done — 8a48ec237d (Vote, Storm, SOS and Ride views, the ballot and coming intents, the worker's vote and SOS loaders). Not built: worker loaders that start the Storm and Ride activities

### T10 — Alarm countdown presentation + E2E pass
- Goal: AlarmKit UI inside the widget extension; full LA regression.
- Files: `apps/mobile/targets/widgets/LiveActivities/AlarmPresentation.swift`, `e2e/trip/live-activities/{alarm,all-kinds}.yaml`.
- Steps: 1. `AlarmAttributes<CPAlarmMetadata>` countdown/paused/alert views with guide tint and I'M UP secondary (metadata from phase 36). 2. Maestro suite covering every kind start → update → end on iOS 26 simulator with push via `xcrun simctl push`.
- Tests: `maestro test e2e/trip/live-activities/`.
- Done when: suite green; no payload >4 KB logged (worker metric assertion).
- Status: partly done — fdbd3fa1dc, 8a48ec237d (the alarm countdown view, `Alarm/LeaveByAlarmCountdown.swift`). Not written: the `alarm` and `all-kinds` Maestro flows

## Phase acceptance criteria
- [ ] All 9 activity kinds render snapshot-matched states (light, dark, tinted) in `CPWidgets` tests
- [ ] Push-to-start, scheduled start and local start each proven on device
- [ ] Broadcast channel per LeaveBy/MeetUp/Vote created and deleted with the object
- [ ] I'M UP from lock screen updates all crew LAs ≤5 s, idempotent on replay
- [ ] Flight LA starts for manual/paste flights; source badge only for mailbox imports
- [ ] Crew-live gated by Boost server-side; 5a-6 offer + quiet option work
- [ ] 8 h restart and dismissal handling verified by worker tests
- [ ] No coordinates or budget fields in any ContentState (schema lint)
- [ ] Permission tests green for new tables

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| APNs broadcast priority budget throttling | p5 default, p10 only arrive/late/SOS/T0; server flag `la.broadcast.enabled` falls back to per-token updates |
| User disables LAs or frequent updates | mirrored in `devices`, notification fallback |
| apple-targets tooling breaks on Xcode 27 | phase-02 exit: bare workflow; targets are plain Swift folders |
| Payload >4 KB for 16-member crews | pips as uid hash + bool, bucketed ETAs; size test in CI |
| Per-kind regression | server flag per kind `la.<kind>.enabled` to disable without app release |

## Non-code dependencies
| Item | If not ready |
|---|---|
| Apple Push Notification key with Live Activity + broadcast capability (Channel Management API access) | per-token updates only; flag off broadcast |
| AlarmKit entitlement / usage description approval | alarm kind degrades to time-sensitive notification (36 owns alarm scheduling) |
| Designer "static + update transition" art variants | use phase-05 baked poses; founder reviews in app |

## Open questions
1. Alarm presentation ownership: 36 schedules via `cp-alarm`, 48 renders AlarmKit views in the widget extension — default assumed.
2. MeetUp push-to-start at T−30 min and Vote at T−24 h (async doc Q1) — default assumed.
3. Doc delta: `broadcast_channels` columns, `report_la_state` and `request_crew_lock_screen` commands, Ride activity type in async §3.2.
4. Watch/CarPlay presentation: automatic `.small` only (no custom layout) — default.
