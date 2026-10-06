---
phase: 36
title: Trip hub, briefing, day-of, leave-by & alarm, offline
status: in_progress
depends_on: [11, 13, 14, 15, 18, 20, 25, 32, 34]
wave: 17
features: [F-012, F-110, F-111, F-112, F-113, F-114]
screens: [3k-1, 3e-1, 3k-2, 3k-3, 3k-4, 3n-2, 5b-3, 5c-2, 5c-4]
tasks: 11
owns:
  - infra/powersync/streams/trip-day.yaml
  - packages/domain/src/trip-day/**
  - packages/planner/src/leave-by/**
  - packages/db/src/schema/trip-day.ts
  - packages/db/migrations/*_trip_day_leave_by_alarms.sql
  - packages/db/test/permissions/{briefings,briefing-items,packing-items,leave-bys,readiness,alarms,offline-bundles}.test.ts
  - packages/ai/src/routes/briefing/**
  - packages/ai/evals/briefing/**
  - services/api/src/commands/trip-day/**
  - services/api/src/routes/offline-bundle.ts
  - services/api/test/trip-day/**
  - services/worker/src/jobs/trip-day/**
  - apps/mobile/modules/cp-alarm/**
  - apps/mobile/targets/widgets/Alarm/**
  - apps/mobile/src/app/(tabs)/trips/**
  - apps/mobile/src/app/(trip)/hub/**
  - apps/mobile/src/features/trip/{hub,trip-list,briefing,day-of,leave-by,alarm,offline,bundle}/**
  - packages/i18n/locales/en/trip/{hub,day-of,alarm,offline}.po
  - e2e/trip/{hub,day-of,alarm,offline}/**
---
# Phase 36 — Trip hub, briefing, day-of, leave-by & alarm, offline

> **Status, 6 Oct 2026:** open: T11, the seeded end-to-end flows (hub phases and switcher, readiness, packing, alarms, airplane mode, conflict); only lab and fresh-user flows exist in `e2e/trip/`.

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D2 (iOS 26, Android 36), D5 (Sonnet briefing), D12 (offline), D13 (location), C1 (trip phase), C10 (pips free), C14 (countdown source), C15 (leave-by), C17 (5a-1 canonical LA), C18 (sender avatars), C47 (queued question in briefing); Q-07 (trip list), Q-56 (briefing vs roundup), Q-85 (always gets through), Q-5C; §4 rows "Full-screen custom leave-by alarm", "Android lock-screen parity"; entitlement matrix (leave-by LA + alarm + pips free, offline maps free) |
| `docs/system-architecture.md` | §4.1–4.5, §4.8 extensions, §7.a I'M UP from lock screen, §7.c offline outbox, §9 perf |
| `docs/data-model.md` | §3.11 `leave_bys`, `readiness`, `alarms`, `device_activities`; §3.12 `briefings`, `briefing_items`, `packing_items`; §3.7 bookings/attachments; §3.13 `map_regions` |
| `docs/data-model-sync-and-privacy.md` | §4 `trip`, `trip_me`, `trip_pack`, `catalog` streams; §7 row 36 |
| `docs/api-contracts.md` | §4.12 `set_readiness`, `snooze_leave_by`, `check_packing_item`, `act_briefing_item`, `report_running_late`; §5.5 `/v1/trips/{id}/offline-bundle`, `/v1/routes/eta`, `/v1/fx/snapshot`; §6 tools `plan_read`, `bookings_read`, `balances_read`, `flight_status`, `weather`, `schedule_nudge` |
| `docs/api-contracts-async.md` | §1.2 `trip:`, `trip_dayof:`; §2.3 `briefing.build`, `leaveby.schedule`, `daybundle.build`; §3.4 `cp.leaveby`; §5 action-key scopes `readiness`, `trip_day`; §6 App Group |
| `docs/design-system.md` | tg-count, conic ring, status chips, slideOff, pen-stroke strike, marquee, dotted hero, night variant |
| Reports | `design-analysis-260926-1143-during-trip-report.md` §3 3k-1…3k-4, §4 F1–F7, §5, §6, §8 risks 2,4,7,8; `design-analysis-260926-1143-off-app-native-surfaces-report.md` 5b-3, 5c-2, 5c-4; `researcher-260926-1143-native-platform-monetization-report.md` + fact-check (AlarmKit claims 5–6, Android claim 21); master §2 F-012, F-110…F-114, §8 AI-27, N-19…N-21 |
| Renders | `docs/design-renders/screens/3k-1_Trip_hub.png`, `3k-2_Day-of.png`, `3k-3_Lock_screen.png`, `3k-4_Offline_at_the_top.png`, `5b-3_Leave-by_alarm.png`, `5a-1_Leave-by.png` |

## Overview

Goal: the TRIPS tab becomes a phase-aware trip hub (and trip switcher when several trips are active), each member gets a per-trip morning briefing with actionable chips, each early-start day has a leave-by with crew readiness, packing list and an OS alarm that rings through Do Not Disturb (snooze once, then crew knock), and every trip day is saved to the phone so the day works with no signal, with a truthful offline UI of what still works and what will send.

Done when: on a seeded Bali trip, the hub renders pre/in/travel/post phases; the briefing job produces validated items with template fallback; leave-by computes from routing and fires a real AlarmKit alarm on iOS 26 and an exact alarm + full-screen activity on Android 36 for not-up members only; `I'M UP` from the alarm updates every crew device's readiness within 2 s; airplane-mode Maestro flow shows the offline state with bundle contents and replays queued sends on reconnect.

## Requirements

### F-110 Trip hub + trip list (3k-1, 3e-1 entry)
| Item | Behaviour |
|---|---|
| Trip list | TRIPS root = list/switcher when > 1 non-archived trip (Q-07: "Bali · in progress" + "Kyoto · voting"); 1 trip → hub directly; zoom entry from Home card |
| Header | meta "OCT 12–19 · 6 GOING"; destination wordmark in guide colour (C5); countdown per C14 (viewer's first outbound departure, else trip start 00:00 dest tz) `tg-count` 1 Hz tabular |
| Phases (design in code) | planning: countdown hidden, "Voting" CTA; pre_trip: "WHEELS UP IN"; travel day: flight card (status from phase 34) + "LAND IN 3H 10M"; in_trip: "DAY 4 OF 8" + next item card; post_trip: "HOME SINCE {date}" + recap CTA |
| Briefing card | see F-111 |
| Tiles 2×2 | PLAN (days / open votes), BOOKINGS (count / "all offline" when bundle complete), MONEY (viewer net: "+$186 owed to you" / "you owe $42" / "all settled"), QUESTS (live count / crew level) — tile registry: this phase renders PLAN/BOOKINGS/MONEY; QUESTS tile registers from phase 41; slot collapses to a 3-tile row until registered for the trip |
| Ticker | 36 px strip, `activity_events` via `trip:` channel, marquee 22 000 ms linear, duplicated content, new events join next cycle; tap item → deep link to object (design in code); empty ticker hidden |
| Guide button | tab-bar centre: tap = guide chat sheet (phase 32); long-press = Help is registered by phase 38 on the phase-07 `onGuideLongPress` hook (this phase does not wire Help) |
| States | skeleton, briefing generating/empty/failed/stale-offline, 0 bookings, empty ticker, unboosted trip, guest-guide destination, concurrent trips |

### F-111 Morning briefing (3k-1, 5c-2)
- Per user per trip per local date (Q-56). Scheduled `briefing.build` at user's local 07:00 or 60 min before first item (whichever earlier, ≥ 05:00); pre-trip at T−30 d…T−1 daily.
- Deterministic candidate builder (plan, bookings with free-cancel deadlines, flights, balances, crew readiness facts such as visa cash, pending host info, unread queued guide answer C47, open votes) → Sonnet words ≤ 3 items in persona; model cannot add items or numbers (validator rejects numbers not in candidates).
- Item action types: DONE (green; `act_briefing_item{done}` slides off with check), NUDGE (dark/yellow; targets named members → `schedule_nudge` → notification; chip flaps "SENT", toast "Nudged Dev and Alex about visa cash."), SET (cream; confirms a scheduled guide action; "SET ✓"), OPEN (deep link).
- Event-inserted items (source=event) from other domains (e.g. phase 37 "Rin's flight moved… I moved her pickup") appended with same shape; dedupe key = source_event_id; an item is pushed once (Q-56), roundup (phase 49) skips items already in today's briefing.
- Visibility: items naming other members only state crew-visible facts (§10.4 matrix); NUDGE visible to organiser and to members the fact concerns; once nudged, all viewers' matching items show "SENT" (via `briefing.item_acted`).
- Unmetered; template fallback when LLM fails (`fallback_used`).

### F-112 Day-of + leave-by engine + readiness (3k-2)
| Item | Behaviour |
|---|---|
| Leave-by | C15: `leave_at` = item start (or pickup_at) − travel (Valhalla; Mapbox `driving-traffic` with `depart_at` when available) − buffer (default 10 min; organiser editable); pickup vs leave distinction ("Pickup at the villa gate, 03:30" while leave-by 03:10) stored in `pickup jsonb`; created for items with start before 08:00 or flagged "early"/transfer/flight; recomputed on plan change, flight change, traffic re-check at T−3 h and T−45 min |
| Hero | pink hero, meta "THU OCT 15 · DAY 4", point forecast "9° AT THE TOP" (phase 15 elevation-aware; tap → forecast 3k-7 owned by phase 37), "LEAVE BY 03:10" 132 px, guide note (pre-generated evening before, bundled offline) |
| Ring | 96 px conic ring draining over window (window = leave_at − 30 min → leave_at), `tg-count` ms inside |
| Readiness row | avatars of item participants; not-up at 55 % opacity with snore bob (1800 ms, 600 ms stagger); up → pop awake; "4 OF 6 ARE UP"; "Tokek rings Alex and Dev at 03:00" (alarm at leave_at − lead for not-up members); in-app I'M UP button (design in code) plus LA/alarm/widget/notification sources (C10 free) |
| Packing | chips per day: shared rows + personal rows (owner-only); guide-suggested from activity + point forecast, user add/remove; pen-stroke strike animation (Skia path draw 260 ms + pop), `check_packing_item` |
| Timeline | mono time, title, subline ("Tickets in Bookings" → booking detail; subgroup items show only for participants or dimmed "Maya, Rin") |
| States | before window, in window, at/after leave_at (transit face: "On the way · pickup ETA"), overdue with members asleep, all up, normal day without early start, viewer not in item, empty pack list, offline |

### F-113 Leave-by alarm (5b-3, 5c-4)
- iOS (AlarmKit, iOS 26): request authorization in context (phase-20 orchestrator, `NSAlarmKitUsageDescription`); schedule fixed-date alarm at leave_at − lead (C15, default 10 min) only while viewer not up; title "Leave by 03:10 · Batur", guide-colour tint, system stop = "I'M UP" (`stopIntent` → `set_readiness{up, source: alarm}` via App Group outbox + action key), secondary = Snooze 5 min countdown (once; after first snooze the rescheduled alarm has no secondary); countdown presentation view in `targets/widgets/Alarm/` with baked Tokek art. System-drawn alert UI (no slide control) is the truthful equivalent.
- Android: `setAlarmClock` when the user has granted `SCHEDULE_EXACT_ALARM` (never `USE_EXACT_ALARM`, which Play reserves for alarm/clock apps); DEFAULT path = high-priority `cp_alarm` notification with I'M UP/SNOOZE actions + Live Update (API 36+). Full-screen-intent Activity is behind server flag `android_fsi_alarm` (off until the Play `USE_FULL_SCREEN_INTENT` declaration is approved; Play limits FSI to calling/alarm core use) and also requires `NotificationManager.canUseFullScreenIntent()`: FSI Activity (Compose) with the designed UI (night bg + orange glow, pulsing 440 px disc, "03:10", place + pickup line, Tokek hop on beat, speech bubble, slide-to-confirm "SLIDE, I'M UP" with knob nudge, "Snooze 5 min (Tokek will sigh)"); alarm channel `cp_alarm`, alarm audio; exact alarm not granted → inexact `setAndAllowWhileIdle` + the same notification + in-app explanation; boot/time-change receivers reschedule.
- Second snooze or not up by T0 → server `snooze_leave_by` count ≥ 2 → N-21 crew knock (ALWAYS) to up members: "Alex might need a knock."; snooze screen state "Crew was pinged" (design in code).
- Offline: alarms are scheduled locally from synced `leave_bys`; the guide line is local; readiness from alarm queues in outbox and drains on reconnect.
- Rescheduled/cancelled on plan change (background push `leave_by.changed` → app re-sync), up elsewhere (cancel on all own devices), trip left. Hardware-button dismiss on Android = snooze (counts); iOS system stop = up.
- StandBy (5c-4) and LA faces are phase 48; this phase supplies `leave_bys`/`readiness` data and App Group snapshot keys.

### F-012 Trip/day offline bundle (3k-4, 3n-2)
- Bundle per trip + date: plan (already local via PowerSync), booking attachments (PDF/barcodes from R2 via signed URLs), contacts (vendors, crewmates per Q-5C, stay host), phrase audio for trip language (content from phase 18), FX snapshot (Q-51 labelled date), help context (emergency numbers + facilities are synced via `catalog`/`trip_pack`; bundle adds offline reverse-geocode labels for itinerary places), map region PMTiles + POI subset (phase-14 pack API), point forecasts for today.
- Triggers: `daybundle.build` night before (20:00 local), geofence exit from stay (phase-20 engine subscription), leave-by window start (wake), manual "Save today offline" in Settings > Offline (3n-2: storage used, per trip remove, auto-download toggle — offline maps free).
- Versioned manifest; client downloads delta only; background via BGTaskScheduler / WorkManager with network constraint; files in app sandbox with iOS `completeUntilFirstUserAuthentication`, Android internal storage; low-storage and partial-download states.

### F-114 Offline mode UI (3k-4)
- App-wide state from phase-10 `useSyncStatus()` + NWPathMonitor/ConnectivityManager: top card cross-fades to night blue with thud + light haptic; NO SIGNAL chip with 1400 ms blink; headline "OFFLINE AT THE TOP" built from nearest itinerary place label (offline); guide float 4600 ms.
- STILL WORKS list from bundle manifest ("Today's plan and the 09:00 pickup with Ketut", "Trail map, downloaded at 03:02", "Phrase cards and Ketut's number", "Hot spring tickets for 09:30"); SENDS WHEN YOU'RE BACK list from local `commands` queue summaries (photos, chat, votes, expenses) with clock glyph drop-in; tap an item → inspect, cancel or edit (chat text) (design in code). Cancel = remove the PowerSync CRUD entry AND roll back the optimistic local row in the same local transaction (each command registers an inverse local op; if none, trigger a bucket re-sync for that row); UI returns to the pre-op state.
- Reconnect: chip → "BACK ONLINE" green 300 ms + pop; clocks tick-in staggered (350 ms + 330 ms × n) as acks arrive (real acks, not timers); label flaps "SENT" ~1400 ms; toast "Back online. 12 photos and a message sent."; banner lifts (400 ms).
- Rejects/conflicts: `cmd_results` rejects ("Vote closed while you were offline — Nusa Penida won") listed with fix actions.
- States: offline without bundle, partial bundle, captive/slow network ("Signal is weak — sending slowly"), guide chat offline (question queued, phase 32 handles send), Help offline (phase 38 works from synced catalog), money entry offline (queued), footer "Last synced 03:02 at the villa".

### Undesigned flows to design in code
Hub phase layouts (planning/travel day/in-trip/post), trip switcher, briefing failure/empty, in-app I'M UP, readiness overdue/all up, post-snooze alarm screen without snooze, "crew was pinged" state, alarm permission denied fallback, offline queued-item inspect/cancel, conflicts list, Settings > Offline storage page, Android exact-alarm grant explainer.

## Architecture & contracts

| Kind | Delta |
|---|---|
| Migration `*_trip_day_leave_by_alarms.sql` | `briefings`, `briefing_items`, `packing_items`, `leave_bys`, `readiness`, `alarms` exactly per data-model §3.11/§3.12; add `leave_bys.buffer_min smallint default 10`, `leave_bys.guide_note text`, `briefing_items.dedupe_key text` (uk per briefing) **(doc delta)**; add `offline_bundles(trip_id, local_date, version, manifest jsonb, built_at)` sys-written, T read **(doc delta: not in data-model)** |
| RLS | `briefings`/`briefing_items`: owner only (O), not in `guide_reader`; `packing_items`: T, personal rows owner-only; `leave_bys`: T, organiser edit via command; `readiness`: T read, write own via command/action key; `alarms`: O |
| Streams | `trip_me` gets `briefings`, `briefing_items`; `trip` gets `leave_bys`, `readiness`, `packing_items`, `offline_bundles`; `alarms` in `me` |
| Commands | §4.12 `set_readiness`, `snooze_leave_by`, `check_packing_item`, `act_briefing_item`, `report_running_late`; new `add_packing_item`/`remove_packing_item`, `set_leave_by_buffer` (organiser), `mirror_alarm_state{device_id, leave_by_id, state, fire_at}` **(doc delta)**; readiness + snooze accept device action keys (scopes `readiness`, `trip_day`) |
| HTTP | `GET /v1/trips/{id}/offline-bundle?date` → `{version, assets[{kind, key, bytes, url, expires_at}], map_region_ref}` (signed media-worker URLs, 24 h) |
| Realtime | `trip:` (`activity`, `tiles`), `trip_dayof:` (`readiness`, `packing.checked`, `leave_by.changed`) |
| Jobs | `briefing.build` (per user local morning via `scheduled_events`), `leaveby.schedule` (create/recompute; events at T−8 h for LA push-to-start handoff to phase 48 `push.la`, T−lead alarm re-sync background push, T0 knock check), `leaveby.recompute` (on `plan.changed`, `flight.changed`), `daybundle.build` |
| Push | N-20 (LOCAL alarm + ALWAYS fallback push when device alarm not confirmed), N-21 crew knock (ALWAYS), briefing push (BUDGET, once), background `leave_by.changed` content-available/FCM data |
| AI | AI-27 route `packages/ai/src/routes/briefing/` (Sonnet, structured output `{items[{candidate_id, text, icon}]}`), evals 20 fixtures (no invented numbers, persona voice, privacy §10.4) |
| Native | `modules/cp-alarm` (Swift AlarmKit + Kotlin AlarmManager/FSI Activity); `targets/widgets/Alarm/` AlarmKit countdown presentation; uses `cp-app-group` outbox + action keys (phase 10/11) |

## Tasks

### T1 — Trip-day schema, streams and permission tests
- Goal: tables, RLS, publication.
- Files: `packages/db/src/schema/trip-day.ts`, `packages/db/migrations/<ts>_trip_day_leave_by_alarms.sql`, `packages/db/test/permissions/{briefings,briefing-items,packing-items,leave-bys,readiness,alarms,offline-bundles}.test.ts`, `infra/powersync/streams/trip-day.yaml`.
- Steps: 1. Drizzle + SQL, FORCE RLS, grants. 2. Stream entries. 3. Permission matrix: self, co-participant, non-participant crew member, outsider, guide_reader, powersync_repl.
- Tests: `pnpm --filter @cp/db test -- permissions/briefings permissions/readiness permissions/packing-items permissions/leave-bys permissions/alarms permissions/briefing-items permissions/offline-bundles`; `pnpm tsx tools/scripts/check-publication.ts`
- Done when: co-participant cannot read another's briefing or personal packing rows; guide_reader has no briefing access; `offline_bundles` readable by trip participants only and not writable by `app_user`; publication check passes.
- Status: done — 7e7f0e4c

### T2 — Leave-by engine (pure) and scheduler job
- Goal: correct leave-by times and schedules in destination tz.
- Files: `packages/planner/src/leave-by/{compute,window,escalation,readiness-summary,index}.ts` + tests, `packages/domain/src/trip-day/{leave-by,readiness,briefing,packing}.ts`, `services/worker/src/jobs/trip-day/{leaveby-schedule,leaveby-recompute}.ts`, `services/worker/test/trip-day/leave-by.test.ts`.
- Steps: 1. `computeLeaveBy(item, pickup, route, buffer, tz)`; eligibility rules. 2. Escalation machine (scheduled → window → alerting → departed/cancelled; knock at 2nd snooze or T0 with not-up). 3. Worker creates/updates `leave_bys` on plan/flight events; schedules `scheduled_events` T−8 h, T−3 h traffic re-check, T−45 min re-check, T−lead, T0. 4. Route via phase-14 `/routes/eta` internal client (Mapbox traffic when configured, else Valhalla, flag stored in `legs`).
- Tests: `pnpm --filter @cp/planner test -- leave-by`; `pnpm --filter @cp/worker test -- trip-day/leave-by`
- Done when: fixtures (Batur 03:30 pickup, airport run, dest tz ≠ device tz, DST) produce expected `leave_at`; plan change reschedules events exactly once.
- Status: done — 761491ff (routes through the `RouteEtaProvider` port on Mapbox `driving-traffic`; without `MAPBOX_TOKEN` travel is a flagged straight-line estimate, Valhalla is not wired for leave-bys; the T−8 h Live Activity timer is left to the Live Activities phase)

### T3 — Trip-day commands, crew knock and realtime
- Goal: readiness/snooze/packing/briefing actions end to end.
- Files: `services/api/src/commands/trip-day/{set-readiness,snooze-leave-by,check-packing-item,add-packing-item,remove-packing-item,act-briefing-item,report-running-late,set-leave-by-buffer,mirror-alarm-state}.ts`, `services/api/test/trip-day/commands.test.ts`.
- Steps: 1. Handlers with authz (participant on item; organiser for buffer). 2. Action-key scopes for readiness/snooze. 3. Events → `trip_dayof` publish, N-21 on 2nd snooze/T0, N-23 + chat message for running late, nudge via `schedule_nudge`. 4. Idempotency + offline replay tests.
- Tests: `pnpm --filter @cp/api test -- trip-day`
- Done when: action-key `set_readiness` from a simulated extension succeeds and publishes within the test; 2nd snooze emits exactly one N-21 to up members.
- Status: done — a880d26a

### T4 — Morning briefing job (AI-27) with evals
- Goal: validated, persona-worded briefings with fallback.
- Files: `services/worker/src/jobs/trip-day/{briefing-build,briefing-candidates,briefing-insert-event}.ts`, `packages/ai/src/routes/briefing/{prompt,schema,validate,fallback}.ts`, `packages/ai/evals/briefing/{promptfooconfig.yaml,fixtures/*.json}`, `services/worker/test/trip-day/briefing.test.ts`.
- Steps: 1. Candidate builder via `app_system` + LLM views (no C3). 2. Sonnet call via phase-13 gateway (Langfuse trace). 3. Validator: only candidate ids, numbers must equal candidate numbers, ≤ 3 items. 4. Template fallback. 5. Event insert API used by other phases (`insertBriefingItem(event)`), dedupe. 6. Schedule per user local morning.
- Tests: `pnpm --filter @cp/worker test -- trip-day/briefing`; `pnpm --filter @cp/ai eval -- briefing`
- Done when: eval pass rate ≥ 95 % on 20 fixtures; forced model failure yields fallback briefing with `fallback_used=true`.
- Status: done — b113504d (20 cases: 18 recorded live from DeepSeek at 20/20, 2 seeded validator slips; runs on the existing `briefing.daily` route)

### T5 — cp-alarm iOS (AlarmKit) + countdown presentation
- Goal: real AlarmKit alarms with I'M UP and snooze-once.
- Files: `apps/mobile/modules/cp-alarm/{expo-module.config.json,index.ts,src/types.ts,ios/CpAlarmModule.swift,ios/AlarmScheduler.swift,ios/ImUpIntent.swift,ios/SnoozeIntent.swift}`, `apps/mobile/targets/widgets/Alarm/{LeaveByAlarmCountdown.swift,AlarmMetadata.swift}`, `apps/mobile/plugins/with-alarmkit.ts`.
- Steps: 1. Authorization + status. 2. `schedule({leaveById, fireAt, title, tint, snoozeAllowed})`, `cancel`, `list`. 3. Stop intent writes `set_readiness{up}` to App Group outbox and posts with action key when network allows. 4. Snooze intent → countdown 5 min, reschedules without secondary, queues `snooze_leave_by`. 5. Countdown view with baked Tokek asset (phase 05 bake output).
- Tests: `pnpm --filter @cp/mobile ios:test cp-alarm` (XCTest for scheduler mapping + intent → outbox write); simulator e2e in T11.
- Done when: XCTests pass; on the iOS 26 simulator `schedule` → `list` returns the alarm and invoking `ImUpIntent.perform()` produces a `cmd_results` success row. Physical-device ring-through-silent/Focus check → founder device checklist (Non-code dependencies).
- Status: done — fdbd3fa1

### T6 — cp-alarm Android (exact alarm + full-screen UI)
- Goal: designed full-screen alarm on Android with truthful fallback.
- Files: `apps/mobile/modules/cp-alarm/android/src/main/java/app/critterpass/alarm/{CpAlarmModule,AlarmScheduler,AlarmReceiver,BootReceiver,LeaveByAlarmActivity,AlarmScreen,SlideToConfirm,AlarmSound,FallbackNotifier}.kt`, `apps/mobile/modules/cp-alarm/android/src/test/**`.
- Steps: 1. `setAlarmClock` with exact-alarm check; Settings deep link for grant. 2. FSI Activity in Compose (show when locked, turn screen on), designed layout/motion, baked Tokek drawable. 3. Slide = up, snooze once, hardware button = snooze. 4. Default notification path (actions + Live Update); FSI Activity only when flag `android_fsi_alarm` on and `canUseFullScreenIntent()`. 5. Boot/time-change reschedule from stored schedule. 6. Outbox write via cp-app-group.
- Tests: `./gradlew :cp-alarm:testDebugUnitTest`; Robolectric test for fallback branch.
- Done when: unit tests pass; flag off → notification with I'M UP/SNOOZE appears on emulator API 36; flag on + FSI permission → full-screen alarm on lock screen; no exact-alarm grant → inexact path + notification.
- Status: done — fdbd3fa1

### T7 — Alarm orchestration, day-of screen and packing
- Goal: JS layer keeps OS alarms in sync; 3k-2 UI.
- Files: `apps/mobile/src/features/trip/alarm/{use-alarm-sync,alarm-permission-sheet,post-snooze-state}.ts|tsx`, `apps/mobile/src/features/trip/day-of/{screen,leave-by-hero,countdown-ring,readiness-row,im-up-button,pack-chips,pen-strike,timeline,states/*}.tsx`, `apps/mobile/src/features/trip/leave-by/use-leave-by.ts`, `apps/mobile/src/app/(trip)/hub/[tripId]/day/[date].tsx`, `packages/i18n/locales/en/trip/{day-of,alarm}.po`.
- Steps: 1. Alarm sync: schedule only when not up, cancel on up (any source), reschedule on `leave_by.changed`, mirror state via `mirror_alarm_state`. 2. Day-of hero, ring, readiness with snore bob/pop, pack chips with Skia pen stroke, timeline, all listed states. 3. Permission sheet via orchestrator.
- Tests: `pnpm --filter @cp/mobile test -- features/trip/day-of features/trip/alarm`
- Done when: RNTL tests cover each state; sync unit tests prove no alarm scheduled for an up member and cancel on remote up.
- Status: done — b3fad4ea (without the native module the alarm rings as a local notification, or as the app's own alarm screen when notifications are refused)

### T8 — Trip hub, trip list and briefing card
- Goal: 3k-1 phase-aware hub and switcher.
- Files: `apps/mobile/src/app/(tabs)/trips/{index,_layout}.tsx`, `apps/mobile/src/app/(trip)/hub/[tripId]/index.tsx`, `apps/mobile/src/features/trip/{hub/{screen,phase-header,countdown,tiles,tile-registry,ticker,states/*},trip-list/{screen,trip-row},briefing/{briefing-card,briefing-row,chip-actions}}.tsx|ts`, `packages/i18n/locales/en/trip/hub.po`.
- Steps: 1. Trip list with Q-07 rule. 2. Phase header variants + C14 countdown. 3. Tiles from PowerSync queries; tile registry API. 4. Ticker marquee from `trip:` channel + synced `activity_events`. 5. Briefing chips with slideOff/flap/toast, optimistic commands.
- Tests: `pnpm --filter @cp/mobile test -- features/trip/hub features/trip/trip-list features/trip/briefing`
- Done when: RNTL snapshots for 5 phases, money tile 3 states, 2-trip switcher; NUDGE shows SENT on a second client via channel test.
- Status: done — 31c1c60d

### T9 — Offline bundle server and builder job
- Goal: versioned per-day bundle manifest.
- Files: `services/api/src/routes/offline-bundle.ts`, `services/worker/src/jobs/trip-day/{daybundle-build,daybundle-triggers}.ts`, `services/api/test/trip-day/offline-bundle.test.ts`.
- Steps: 1. Builder collects assets (attachments, phrase audio keys, FX snapshot, place labels, today point forecasts, map region ref) into `offline_bundles`. 2. Route returns signed URLs (media-worker HMAC). 3. Triggers: 20:00 local cron via `scheduled_events`, `stay_exit` event from location engine, leave-by window start. 4. Authz participant only.
- Tests: `pnpm --filter @cp/api test -- trip-day/offline-bundle`; `pnpm --filter @cp/worker test -- trip-day/daybundle`
- Done when: outsider gets 403; manifest version bumps only when content hash changes.
- Status: done — 89dc3fa8 (composed into the bookings endpoint as a `days` section with today's and later days, so there is one endpoint; an outsider gets that endpoint's `NOT_FOUND`; the stay-exit trigger stays on the device)

### T10 — Offline bundle client and offline UI
- Goal: 3k-4 state app-wide with real queue data.
- Files: `apps/mobile/src/features/trip/bundle/{bundle-manager,background-prefetch,storage-settings}.ts|tsx`, `apps/mobile/src/features/trip/offline/{offline-card,still-works-list,sends-list,queued-item-sheet,reconnect-sequence,conflicts-list}.tsx`, `apps/mobile/src/app/(trip)/hub/[tripId]/offline.tsx`, `packages/i18n/locales/en/trip/offline.po`.
- Steps: 1. Delta downloader with resume, sandbox file protection, low-storage handling. 2. Background task registration (expo-background-task) + geofence trigger subscription. 3. Offline card, lists from manifest + `commands` table, inspect/cancel/edit sheet. 4. Reconnect sequence driven by acks; conflicts list from `cmd_results`. 5. Settings > Offline page (storage per trip, remove, auto toggle).
- Tests: `pnpm --filter @cp/mobile test -- features/trip/offline features/trip/bundle`
- Done when: tests prove ticks follow real ack order; cancelling a queued op removes it before upload AND the local row/query result equals its pre-op value (vote, chat message, expense fixtures).
- Status: done — c4c6f417 (bundle downloads run on foreground, every 30 min while open and at each leave-by window; no OS background task in this build)

### T11 — End-to-end flows
- Goal: prove phase on both platforms.
- Files: `e2e/trip/hub/{phases.yaml,switcher.yaml}`, `e2e/trip/day-of/{readiness.yaml,packing.yaml}`, `e2e/trip/alarm/{android-fullscreen.yaml,ios-alarm-schedule.yaml}`, `e2e/trip/offline/{airplane-mode.yaml,conflict.yaml}`, seed script `tools/scripts/seed-trip-day.ts`.
- Steps: 1. Seed Bali trip with early day, 6 members (5 simulated via API). 2. Maestro flows incl. airplane mode toggle, reconnect, alarm fire on Android emulator with time shift, iOS alarm scheduled (list API assertion). 3. Crew readiness propagation assertion via second client.
- Tests: `maestro test e2e/trip/`
- Done when: all flows green in CI on iOS 26 simulator + Android API 36 emulator.
- Status: blocked — fa08582c. `tools/scripts/seed-trip-day.ts` joins five simulated travellers through the api (the runner's `/scenario?name=trip-day`), on a trip the flow builds in the app. Green on Android: hub/phases, hub/switcher and offline/airplane-mode-android (https://github.com/critterpass/critterpass/actions/runs/37444846354) and day-of/packing (https://github.com/critterpass/critterpass/actions/runs/37438092121). Not written: day-of/readiness (I'M UP shows only before the day's first leave-by, and a trip built today starts after noon, so it needs a morning run or a seeded early day), offline/conflict (needs a write the server rejects after reconnect), alarm/android-fullscreen (needs a leave-by ahead and a clock shift) and alarm/ios-alarm-schedule (waits for AlarmKit in the native batch)

## Phase acceptance criteria
- [ ] Hub renders all 5 phases; trip switcher when > 1 active trip; countdown follows C14
- [ ] Briefing: ≤ 3 validated items, fallback path, NUDGE/SET/DONE work, dedupe with event inserts
- [ ] Leave-by recomputes on plan/flight/traffic changes; alarms only for not-up members; snooze once then N-21 knock
- [ ] AlarmKit alarm (iOS 26) and exact alarm + full-screen UI (Android 36) fire through DND; fallback when not granted
- [ ] I'M UP from alarm/app reaches all crew devices within 2 s online and replays offline
- [ ] Offline bundle downloads per day, works in airplane mode; SENDS list reflects the real queue; conflicts shown
- [ ] Permission tests green for 6 tables; publication check passes
- [ ] Maestro suite green on both platforms

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| AlarmKit secondary intent unavailable before first unlock after reboot | stop = I'M UP still works; document; Time Sensitive push fallback N-20 when mirror shows alarm not scheduled |
| Play FSI/exact-alarm policy denial | notification + Live Update is the shipped default; FSI only via server flag `android_fsi_alarm` after declaration approval; no `USE_EXACT_ALARM` |
| Wrong leave-by (routing error) | buffer default 10 min, organiser edit, traffic re-check; show "without live traffic" label when Mapbox absent |
| Bundle size on low storage | per-asset priority (tickets > phrases > map), skip map when < 200 MB free with notice |
| Briefing cost | Sonnet ≤ 1 call/user/day, skip when no candidates |

## Non-code dependencies
- AlarmKit usage string + App Review note; Play full-screen-intent declaration — until approved `android_fsi_alarm` stays off and the notification path ships.
- Founder device checklist (agent cannot run physical devices): iOS 26 device alarm rings in silent mode + Focus and I'M UP writes `cmd_results`; Android 36 device FSI on lock screen once flag is on.
- Mapbox Directions account for traffic-aware leave-by — absent: Valhalla only with label.
- Phrase audio for each destination language (phase 18 content) — absent: phrase text cards without play button.

## Open questions
1. Tables `offline_bundles`, columns `leave_bys.buffer_min`, `guide_note`, `briefing_items.dedupe_key`, commands `add/remove_packing_item`, `set_leave_by_buffer`, `mirror_alarm_state` — default add (doc delta).
2. `targets/widgets/Alarm/` lives inside the widget extension owned by phase 48 — default: this phase adds only that subfolder; if the widget target scaffold from phase 02 is missing, T5 creates the minimal target config (doc delta in phase 48 owns).
3. Pack list per person or shared — default both (shared rows + personal rows).
4. Leave-by eligibility beyond "before 08:00 / transfer / flight" — default also any item whose travel > 45 min.
5. plan.md delta: this phase moves to wave 15 (it consumes phase 32's C47 queued-answer data, same former wave 14) and depends_on adds 14, 15, 18, 32; phase 37 moves to wave 16 accordingly. Help long-press wiring moved to phase 38.
