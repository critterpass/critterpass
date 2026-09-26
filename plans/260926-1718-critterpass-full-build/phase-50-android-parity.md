---
phase: 50
title: Android parity layer
status: pending
depends_on: [36, 48, 49]
wave: 21
features: [F-181]
screens: [5a-1, 5a-2, 5a-3, 5a-4, 5a-5, 5a-6, 5b-1, 5b-2, 5b-3, 5b-4, 5c-1, 5c-2, 5c-3, 5c-4, 5c-5, 3k-3, 3k-8, 3k-10]
effort: 10 sessions
owns:
  - apps/mobile/modules/cp-android-surfaces/
  - apps/mobile/plugins/with-android-surfaces.ts
  - apps/mobile/src/features/you/android-permissions/
  - packages/domain/src/surfaces/android-*.ts
  - services/worker/src/push/fcm-surfaces.ts
  - services/worker/test/android-surfaces/
  - docs/play-policy-declarations.md
  - e2e/android/
---
# Phase 50 — Android parity layer

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D2 (API 36 target; Live Updates 36+, MetricStyle 37+), §4 rows "Android lock-screen parity", "Full-screen custom leave-by alarm", "Tapping + opens the system widget sheet", "Alarm/SOS breaks DND"; Q-01, Q-04 |
| `docs/system-architecture.md` | §4.5 push (FCM data-only), §4.8 extensions (Android surfaces in Kotlin) |
| `docs/api-contracts-async.md` | §3.2 last row (Live Updates mapping), §3.3 FCM + channel list, §3.4 categories, §4 Android row, §5 action keys (Android: Keystore HMAC key — doc delta, EncryptedSharedPreferences is deprecated), §6 Android mirror (DataStore `cp_snapshot`) |
| `docs/data-model.md` | §3.11 `devices.permission_state` (alarm, promoted), `widget_push_tokens`, `installed_widgets`, `device_activities` |
| Phase files | 11 (`cp-notifications` FCM service, channels, MessagingStyle), 36 (`cp-alarm` scheduling), 45 (owns `cp-app-icon` incl. Android activity-alias — not touched here), 48 (LA orchestrator, content builders), 49 (snapshot, categories, widget refresh) |
| Reports | `design-analysis-260926-1143-off-app-native-surfaces-report.md` Android notes; `researcher-260926-1143-native-platform-monetization-report.md` + `fact-check-…` (Live Updates eligibility, FSI policy, exact alarm policy, Glance); master §2 F-181, §6.1 rows, R15 |
| Renders | all `docs/design-renders/screens/5a-*`, `5b-*`, `5c-*` |

## Overview

Goal: every off-app surface built in phases 36/48/49 has a policy-compliant Android equivalent driven by the same server payloads and commands.

Done when: on an API 36 device (and API 37 emulator) each session kind shows as a Live Update (ProgressStyle; MetricStyle on 37+) only on the device of the member who started or opted into it, and as a high-priority/ongoing notification for everyone else; vote/storm are high-priority notifications; the leave-by alarm rings full-screen when the user granted FSI and degrades cleanly by default; SOS bypasses DND when notification-policy access is granted; 7 Glance widgets update via FCM; vote actions work from the shade; Play policy declarations are written. (Alternate icons are phase 45.)

## Requirements

| iOS surface | Android equivalent (build) | Degrade / undesigned states (design in code) |
|---|---|---|
| LA LeaveBy / Flight / MeetUp / CritterNearby / SOS (48) — initiator rule below | Live Update (initiator/opted-in only): `Notification.ProgressStyle` with segments = legs / flight phases / ETA fraction / dwell ring; status-bar chip text (minutes); `requestPromotedOngoing`; MetricStyle (API 37+) for flight and leave-by metrics; actions I'M UP, SNOOZE, RUNNING LATE, ON MY WAY, PING ALL, COMING (SOS confirm opens app) | API <36 or promotion denied → standard ongoing notification with same content; `POST_PROMOTED_NOTIFICATIONS`/promotion setting off → banner in settings |
| LA Vote / Storm (48) | High-priority notifications (not Live Updates per policy), vote with actions | – |
| SOS received by other members (48) | High-priority notification on channel `cp_sos` (IMPORTANCE_HIGH, `setBypassDnd(true)`, alarm-style sound); COMING / call actions | notification-policy access (`ACCESS_NOTIFICATION_POLICY`, `Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS`) not granted → channel still HIGH but respects DND; settings banner + explainer |
| LA Alarm countdown + 5b-3 alarm (36) | `setAlarmClock` scheduling stays in `cp-alarm`; this phase adds full-screen-intent Activity (designed 5b-3 UI: warm glow pulse, Tokek hop, slide I'M UP, snooze once) on channel `cp_alarm` (USAGE_ALARM) | **Default path = not granted**: Critterpass is not a calling/alarm-clock app, so FSI is not auto-granted (Android 14+) and `SCHEDULE_EXACT_ALARM` is denied by default (API 33+). Default → heads-up alarm notification + Live Update + inexact `setAndAllowWhileIdle` with earlier warning notification; user grants via explainer → `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT` / `ACTION_REQUEST_SCHEDULE_EXACT_ALARM`; `canScheduleExactAlarms()` / `canUseFullScreenIntent()` re-checked on resume |
| Crew lock-screen offer 5a-6 | same RN sheet; Live Update only on members who tap to opt in (each member starts their own); others get an ongoing notification with an opt-in action | – |
| Communication notifications 5b-1 | already MessagingStyle in 11; add dynamic conversation shortcuts per guide/crew with avatar, bubbles off | – |
| Vote notification 5b-2 | BigPicture-style poster (baked frame) + actions → `BroadcastReceiver` → WorkManager expedited → `/v1/actions`; re-post with stamp | action while offline → queued in DataStore pending actions |
| Ping settings 5b-4 | same RN screen; OS banners read per-channel importance + `areNotificationsEnabled` + exact-alarm + FSI state; deep links to channel settings | – |
| Widgets 5c-1/5c-2 | Jetpack Glance: Countdown, Vote (interactive `actionRunCallback`), Today, Balances, Crew (Boost), Critterdex, Next flight (Pass+); same DataStore snapshot; FCM `widget.refresh` → `GlanceAppWidget.update` | locked tier states; stale |
| Lock screen / StandBy 5c-3/5c-4 | Lock-screen widget hub where a runtime probe confirms support (Android 16 QPR2+ `widgetCategory=keyguard`; limited, tablet/hub-first) using Countdown + Critterdex; DreamService "sleepy clock" (breathing Tokek, leave-by digits) — runs only while charging/docked, labelled so | **Default = hidden with explanation**; shown only when the probe passes (keyguard: SDK/QPR check + `AppWidgetManager` keyguard host availability; dream: always listed as "while charging") |
| Widget gallery 5c-5 | `AppWidgetManager.requestPinAppWidget` from "+" | launcher without pin support → how-to sheet |

Policy: Live Updates only for user-initiated ongoing activities (Play policy). Initiator rule per kind:

| Kind | Live Update on | Everyone else |
|---|---|---|
| LeaveBy | device of each member who set the leave-by/alarm | – (own alarm) |
| Flight | members who tracked the flight | high-priority notification on status change |
| MeetUp | member who started the meet-up + members who tapped ON MY WAY | high-priority notification |
| CritterNearby | member who started the critter hunt / opted in to nearby alerts | standard notification |
| SOS | sender | `cp_sos` high-priority notification (DND bypass when granted) |
| Boost offer 5a-6 | members who opt in | ongoing notification with opt-in action |

FSI: requested only for the user-set leave-by alarm, user-granted via settings, never assumed. Exact alarm: declare `SCHEDULE_EXACT_ALARM` only (user-granted, revocable); **never** `USE_EXACT_ALARM` (restricted to alarm-clock/calendar apps).

## Architecture & contracts

| Area | Delta |
|---|---|
| FCM payloads | `services/worker/src/push/fcm-surfaces.ts` maps phase-48 builders → `{type: "la.<kind>", op, state}` and phase-49 → `widget.refresh`; same content builders (DRY) |
| Android contract | `packages/domain/src/surfaces/android-live-update.ts`: zod `ProgressSpec {segments[], points[], progress, chip, style: progress\|metric}` derived from ContentState; generated Kotlin data classes |
| Native module | `modules/cp-android-surfaces` (Kotlin): LiveUpdateRenderer, NotificationActionReceiver, ActionWorker (signed `/v1/actions`), AlarmFullScreenActivity (Compose), SOS channel + DND-access flow, Glance widgets, DreamService, keyguard support probe, pin-widget API, permission state reporter → `update_device_permissions` |
| Config plugin | `plugins/with-android-surfaces.ts`: manifest permissions (`POST_PROMOTED_NOTIFICATIONS`, `USE_FULL_SCREEN_INTENT`, `SCHEDULE_EXACT_ALARM` — never `USE_EXACT_ALARM`, `ACCESS_NOTIFICATION_POLICY`, `FOREGROUND_SERVICE_LOCATION` reference only), receivers, widget providers, dream service |
| Commands | none new; `/v1/actions` with `via: notif_action\|widget\|la_intent` |
| Docs | `docs/play-policy-declarations.md` (FSI user-granted, exact alarm = `SCHEDULE_EXACT_ALARM` only with denied-by-default path, DND access for SOS, foreground service types, Live Updates initiator rule, Data safety pointers for 54) |

## Tasks

### T1 — Module scaffold, config plugin, shared snapshot + action signing
- Goal: Kotlin foundation.
- Files: `apps/mobile/modules/cp-android-surfaces/{expo-module.config.json,index.ts,android/src/main/java/app/critterpass/surfaces/{SnapshotStore,ActionSigner,ActionWorker,PendingActions}.kt}`, `apps/mobile/plugins/with-android-surfaces.ts`.
- Steps: 1. DataStore `cp_snapshot` mirror of App Group JSON. 2. Import the server-issued action-key secret into Android Keystore as a non-exportable `HmacSHA256` key (`KeyProperties.PURPOSE_SIGN`); key id/scope/expiry metadata in DataStore; revoke = delete Keystore entry. 3. WorkManager expedited worker + offline queue drain. 4. Verify the generated Gradle project name (follows the module package name) and record it in the module README; later tasks use that name (`<cp-surfaces-gradle>` below).
- Tests: `cd apps/mobile && npx expo prebuild -p android --no-install && cd android && ./gradlew projects` then `./gradlew :<cp-surfaces-gradle>:testDebugUnitTest`.
- Done when: Keystore signature matches the TS reference vector test; key is non-exportable (`KeyInfo.isInsideSecureHardware` logged, export attempt fails); queued action drains on connectivity.

### T2a — Live Update spec + FCM payloads (TS)
- Goal: server side of LA parity for 5 kinds.
- Files: `packages/domain/src/surfaces/android-live-update.ts`, `services/worker/src/push/fcm-surfaces.ts`, `services/worker/test/android-surfaces/*.test.ts`.
- Steps: 1. `ProgressSpec` derivation per kind from phase-48 ContentState. 2. Per-kind audience split per initiator rule (Live Update payload to initiator/opted-in devices; notification payload to others). 3. FCM op start/update/end mapping + Kotlin data class generation.
- Tests: `pnpm --filter @critterpass/worker test -- android-surfaces`.
- Done when: fixture sessions produce Live Update payloads only for initiator/opted-in devices and notification payloads for other members.

### T2b — Live Update renderer (Kotlin)
- Goal: render ProgressStyle / MetricStyle / fallback.
- Files: `apps/mobile/modules/cp-android-surfaces/android/.../liveupdate/*.kt`.
- Steps: 1. Renderer with API gates (36 ProgressStyle, 37 MetricStyle, else ongoing). 2. `requestPromotedOngoing` + promotion-denied fallback. 3. Op start/update/end handling.
- Tests: `./gradlew :<cp-surfaces-gradle>:testDebugUnitTest --tests '*LiveUpdate*'`.
- Done when: leave-by spec renders segments per leg on API 36 emulator screenshot test; API 35 shows ongoing notification.

### T3 — Notification actions + vote poster
- Goal: §3.4 parity from the shade.
- Files: `.../actions/{NotificationActionReceiver,Categories}.kt` (generated from `notification-categories.ts`), `.../vote/VotePosterNotification.kt`.
- Steps: 1. Category → action set. 2. Receiver → worker → re-post with stamp. 3. Remote-input reply for chat.
- Tests: `./gradlew :<cp-surfaces-gradle>:connectedDebugAndroidTest --tests '*Actions*'`; Maestro `e2e/android/vote-action.yaml`.
- Done when: vote action from locked shade creates ballot `source: notification`.

### T4 — Full-screen alarm, SOS DND channel + permission flows
- Goal: 5b-3 on Android and SOS DND bypass, both with denied-by-default degrade paths.
- Files: `.../alarm/{AlarmFullScreenActivity,AlarmUi}.kt`, `.../sos/SosChannel.kt`, `apps/mobile/src/features/you/android-permissions/**`.
- Steps: 1. Compose UI per render; slide I'M UP → `set_readiness`; snooze once → second snooze crew knock. 2. Explainer + settings deep links for exact alarm (`SCHEDULE_EXACT_ALARM`), FSI, promoted notifications, DND access. 3. `cp_sos` channel with `setBypassDnd(true)` once `isNotificationPolicyAccessGranted`; recreate channel after grant. 4. Degrade matrix with denied as the default row.
- Tests: `./gradlew :<cp-surfaces-gradle>:connectedDebugAndroidTest --tests '*Alarm*' --tests '*Sos*'`; `pnpm --filter @critterpass/mobile test -- android-permissions`.
- Done when: fresh install (nothing granted) → alarm posts heads-up + Live Update at an inexact time with earlier warning; with FSI + exact alarm granted the Activity shows over lock screen on time; SOS in DND rings only when policy access is granted, otherwise posts HIGH notification + settings banner.

### T5 — Glance home widgets (free)
- Goal: Countdown, Vote, Today, Balances, Critterdex.
- Files: `.../widgets/{Countdown,Vote,Today,Balances,Critterdex}Widget.kt`, `res/xml/*_widget_info.xml` via plugin.
- Steps: 1. Glance layouts with baked drawables. 2. `actionRunCallback` for vote, nudge, packing check. 3. FCM refresh + `installed_widgets` sync.
- Tests: `./gradlew :<cp-surfaces-gradle>:testDebugUnitTest --tests '*Widget*'` (Glance testing APIs).
- Done when: widget unit tests cover empty/stale/active states; vote callback posts action.

### T6 — Crew, Next flight, keyguard, dream, pin
- Goal: tiered widgets and extras.
- Files: `.../widgets/{Crew,NextFlight}Widget.kt`, `.../hub/{LockScreenWidgets,SleepyClockDream}.kt`, `.../PinWidget.kt`.
- Steps: 1. Locked states → offer deep links. 2. Keyguard support probe; hidden-with-explanation default. 3. DreamService ("while charging" copy). 4. `requestPinAppWidget` bridged to gallery.
- Tests: `./gradlew :<cp-surfaces-gradle>:testDebugUnitTest --tests '*Tiered*' --tests '*Probe*'`; Maestro `e2e/android/widget-pin.yaml`.
- Done when: pin request dialog appears from gallery "+" on Pixel emulator; probe returns unsupported on API 36 phone emulator (hidden state shown); verified-device list (device, OS build, keyguard yes/no, dream yes/no) recorded in `apps/mobile/modules/cp-android-surfaces/README.md`.

### T7 — Conversation shortcuts
- Goal: sender identity polish (alternate icons are owned by phase 45).
- Files: `.../shortcuts/ConversationShortcuts.kt`.
- Steps: 1. Dynamic long-lived shortcuts per guide/crew with avatars, bubbles off. 2. Link MessagingStyle notifications (phase 11) via `setShortcutId`.
- Tests: `./gradlew :<cp-surfaces-gradle>:testDebugUnitTest --tests '*Shortcut*'`.
- Done when: a crew message notification is shown as a conversation with the crew avatar.

### T8 — Play policy declarations doc
- Goal: submission-ready declarations.
- Files: `docs/play-policy-declarations.md`.
- Steps: 1. One section per sensitive permission with justification text, UX evidence path (screenshot route), fallback. 2. Link from `docs/README.md` table (one row edit).
- Tests: `pnpm tsx tools/scripts/docs/check-lines.ts docs/play-policy-declarations.md` (≤800 lines).
- Done when: covers FSI (user-granted), exact alarm (`SCHEDULE_EXACT_ALARM` only, denied-default path), DND access for SOS, promoted notifications + Live Updates initiator rule, foreground service types, background location.

### T9 — Android end-to-end parity suite
- Goal: prove parity.
- Files: `e2e/android/{leave-by,flight,meetup,sos,widgets,alarm}.yaml`.
- Steps: 1. Maestro flows on API 36 + 37 emulators with FCM test sends via `tools/scripts/push/send-test.ts` (phase 11). 2. Screenshot assertions.
- Tests: `maestro test e2e/android/`.
- Done when: suite green on both API levels.

## Phase acceptance criteria
- [ ] Live Updates only on initiator/opted-in devices per kind; other members and vote/storm get notifications
- [ ] API gates 36/37 verified; fallback ongoing notification below 36
- [ ] Alarm FSI + exact alarm denied-by-default path proven; SOS DND bypass only with policy access
- [ ] 7 Glance widgets update via FCM; keyguard/dream shown only when the support probe passes
- [ ] All §3.4 actions work from the notification shade
- [ ] `docs/play-policy-declarations.md` complete

## Risks & rollback
| Risk | Mitigation |
|---|---|
| OEM kills background work | expedited WorkManager + FCM high priority for actions; Maestro on Pixel + Samsung |
| Play rejects FSI | denied path is the default; server flag `android.fsi.enabled` |
| Keyguard widgets unsupported on most phones | probe + hidden default; verified device list |
| Live Updates promotion denied by system | ongoing notification with same content |

## Non-code dependencies
| Item | If not ready |
|---|---|
| Play Console declarations (FSI, exact alarm) | submit with justification; code already degrades |
| Physical Samsung + Pixel devices | Firebase Test Lab device run |

## Open questions
1. Ownership split: `cp-alarm` (36) schedules; this phase owns the FSI Activity UI — default assumed.
2. Doc delta: add `android-live-update` spec + initiator rule to async §3.2 Android note; async §5 action-key storage → Android Keystore HMAC (EncryptedSharedPreferences deprecated).
3. Doc delta: `product-decisions` §4 "Full-screen custom leave-by alarm" row should state FSI/exact alarm are user-granted, not default.
