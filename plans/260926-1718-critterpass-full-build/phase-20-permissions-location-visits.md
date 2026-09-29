---
phase: 20
title: Permission orchestrator, location engine, POI visits
status: in_progress
depends_on: [2, 7, 10, 11, 14]
wave: 6
features: [F-022, F-023, F-189]
screens: [3a-9, 3a-3, 3a-12, 3j-2, 3m-2, 3m-6, 3n-2, 3n-6, 3n-7, 3l-4, 3l-7, 3g-4, 3k-6, 3m-4, 3m-5, 3o-3]
tasks: 11
owns:
  - infra/powersync/streams/location.yaml
  - packages/domain/src/permissions/
  - packages/domain/src/location/
  - packages/db/src/schema/location.ts
  - packages/db/migrations/<ts>_location_shares_fixes_visits.sql
  - packages/db/test/permissions/{location_shares,location_fixes,member_etas,visits}.test.ts
  - services/api/src/commands/permissions/
  - services/api/src/commands/visits/
  - services/api/src/routes/loc.ts
  - services/api/test/location/
  - services/worker/src/jobs/location/
  - apps/mobile/modules/cp-permissions/
  - apps/mobile/modules/cp-location/
  - apps/mobile/plugins/with-location-permissions.ts
  - tools/scripts/check-permissions-manifest.ts
  - services/api/src/commands/consents/
  - apps/mobile/src/lib/permissions/
  - apps/mobile/src/lib/location/
  - apps/mobile/src/ui/permission-primer/
  - packages/i18n/locales/*/permissions.po
  - e2e/permissions/
  - e2e/location/
---
# Phase 20 — Permission orchestrator, location engine, POI visits

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D2, D13, C11, C25, C39, C45; §4 rows "Critter nearby at 50 m dwell", "Help tiles, SOS, 1-h location share", "Crew live map background positions"; Q-55, Q-5C |
| `docs/system-architecture.md` | §4.1 commands, §4.3 realtime, §4.8 extensions, §5 authz, §9 perf budgets, §11 spike "background location" (phase 02 T12 ADR), §12 retention |
| `docs/data-model.md` | §2 roles/RLS helpers, §3.12 `location_shares`, `location_fixes`, `member_etas`; §3.9 `visits`, `spawn_rules`; §3.17 consents |
| `docs/data-model-sync-and-privacy.md` | §1 private fields (`location_fixes`, `visits` = C3), §4 `trip`/`trip_pack` streams, §6 retention, §7 row "20" |
| `docs/api-contracts.md` | §3 `LOCATION_IMPLAUSIBLE`, §4.1 `update_device_permissions`, §4.12 `set_location_share` (P39), §4.13 `record_visit` |
| `docs/api-contracts-async.md` | §1.2 `trip_live:`, `trip_copresence:`, `sos:`; §2.3 `maint.purge`; §1.1 revocation on `location_share.changed(off)` |
| `docs/code-standards.md` | native module rules, DB rule (RLS + permission test per table), a11y, testing pyramid |
| Reports | `researcher-260926-1143-native-platform-monetization-report.md` (location options A/B/C, spoofing, Android FGS); `fact-check-…-native-platform-monetization-report.md` rows 17–24; `design-analysis-260926-1143-onboarding-home-report.md` §3a-9; master §2 F-022/F-023/F-189, §6.1 Location row, §10.4 Location, §11.1 R5 |
| Renders | `docs/design-renders/screens/3a-9_Permissions_in_context.png`, `3l-4_Encounter.png`, `3g-4_Crew_map.png`, `3k-6_Help.png`, `3n-2_Settings.png`, `3n-6_Settings_more.png` |

## Overview

Goal: one permission orchestrator that primes every OS permission with a live demo and asks only on toggle or at the moment of need; one location engine that is on only on trip days, runs a While-In-Use trip-day session by default with an optional Always upgrade, and feeds encounters, shares and POI visits within a battery budget; POI-level visits (arrived/left, no coordinates, TTL, opt-in).

Done when: the 3a-9 primer and every just-in-time primer drive the correct OS prompts on iOS 26 and Android 36 with denied/limited states and Settings deep links; the engine starts/stops by trip mode, survives lock with the session indicator, rotates geofences, flags mock fixes; `record_visit` stores POI-level visits only for opted-in users and purges them on TTL; permission tests prove no other user can read fixes or visits.

## Requirements

### F-022 Permission orchestrator

| Aspect | Behaviour |
|---|---|
| Primer (3a-9) | Three cards: ALARMS AND PINGS (demo: "LEAVE BY 03:10" card drops in/out, 4000 ms loop), LOCATION, ON TRIPS (green ping ring behind locked silhouette, 2000 ms), CALENDAR (availability bars + pulsing fit bar, 1400 ms). Toggle knob overshoot 380 ms `(.3,1.5,.5,1)`. OS prompt fires only when a toggle flips ON; result reflected (snap back + "Open Settings" if denied). "Ask me later" is real. Defaults: all toggles OFF until user flips (no pre-ticked consent) |
| Permission map | notifications (iOS alert/badge/sound + provisional + time-sensitive; Android 13+ POST_NOTIFICATIONS) · alarms (iOS 26 AlarmKit authorization; Android SCHEDULE_EXACT_ALARM via Settings intent + USE_FULL_SCREEN_INTENT status) · location (none/WIU/Always, precise vs approximate, temporary full accuracy) · calendar (iOS full access to events; Android READ_CALENDAR) · camera · microphone + speech recognition (3j-2) · photo library add-only (3m-6 save, postcards) vs read (album auto-ingest, 3m-2) · Live Activities enabled + frequent updates (read-only mirror) · contacts/dialer need no prompt (pickers) |
| Just-in-time triggers | first vote needing you → notifications; 3c date finding → calendar; trip start / landing / first encounter spawn → location; USE A REAL PHOTO (3a-3) → camera (library via picker, no prompt); voice (3j-2) → mic + speech; "save as image" (3m-6) → photos add-only; first leave-by → alarms. Each trigger shows the same card as a sheet first. Re-ask limits: a declined primer re-appears at most once per trigger kind per 7 d (server-configurable); after OS "denied" only the Settings path is shown |
| Mirror | `update_device_permissions` on change (app foreground diff); server uses it to route push vs inbox, gate LA starts (C-mirror of LA toggle, master §6.1), and to show crew "can't ring" hints without exposing others' permissions beyond derived capability |
| Denied / partial states (undesigned → design in code) | snap-back toggle + Settings row; approximate-only location ("critters need precise location near spots" + temporary full accuracy ask); WIU-only (encounters only while session runs); provisional notifications (quiet); Android exact-alarm off (alarm falls back to high-priority notification, copy says so); LA disabled (notification fallback). Settings (3n-2/3n-6) gets a "Permissions" section listing each with status + fix action |
| Help/SOS | Location share for Help/SOS never gated (C11/C45); if location denied, Help shows "Share needs location" with Settings link and still offers dial + text |
| Motion/feedback | toggles use feedback bus `toggle` haptic; reduced motion → demos render final frame |

### F-023 Location engine

| Aspect | Behaviour |
|---|---|
| Trip-mode gating | Engine runs only when the user has a trip in phase `in_trip` (or `pre_trip` on travel day for leave-by/pickup) AND local time within trip-day window; OFF at home (home country from home airport) unless explicit foreground-only "explore at home" opt-in (C39). Visible status chip in trip hub (consumer P36) |
| Default mode (D13) | iOS: WIU trip-day session = `CLBackgroundActivitySession` created in foreground + `CLServiceSession(authorization: .whenInUse)` recreated on relaunch + `CLLocationUpdate.liveUpdates`; blue pill visible. Android: foreground service `foregroundServiceType="location"` started from visible UI or notification/widget tap (background-start exemption), ongoing notification with stop action |
| Always upgrade | Offered contextually after first successful encounter or crew-map enable (never at onboarding). iOS: Always → `CLMonitor` (≤20 conditions, rotate nearest spots/POIs) relaunches terminated app. Android: `ACCESS_BACKGROUND_LOCATION` via separate Settings step + prominent disclosure screen; `GeofencingClient` (≤100, radius ≥150 m) |
| Geofence planner | picks nearest N candidates from registered candidate sources, radius ≥150 m; this phase registers plan POIs + stay (P14 data in `trip_pack`); spawn spots are a source P40 registers via `registerGeofenceSource('spawns', fn)` (P18 `spawn_rules` land in wave 7, after this phase), so P20 never reads `spawn_rules`; re-plans on significant move (≥1 km) or every 15 min |
| Accuracy & battery | high accuracy only inside a 150 m geofence or active share/encounter; stationary detection stops updates; per-day high-accuracy minute cap (server config, default 90 min); Low Power Mode / battery saver → coarse only; target <3 %/h during active encounter (phase 02 ADR number) |
| Consumers API | `subscribe(kind: encounter\|share\|visit\|leaveby, opts)` returning fixes/region events; share publishing to `POST /v1/loc` (used by P38 Help/SOS, P39 crew map); encounter dwell samples (P40) |
| Anti-spoof | iOS `CLLocation.sourceInformation.isSimulatedBySoftware` / `isProducedByAccessory`; Android `Location.isMock()`; plus speed/teleport plausibility; flags ride along in visit evidence and encounter samples; server rejects flagged fixes with `LOCATION_IMPLAUSIBLE` only for encounter and visit evidence (and only `isSimulatedBySoftware` / `isMock` / plausibility failures — `isProducedByAccessory` is an external GPS and is accepted, flag kept); share and SOS fixes on `POST /v1/loc` are always accepted with the flag stored in `mock_flags` (SOS is never gated, C11/C45) |
| Privacy (C25, §10.4) | never stores raw trails; fixes only while a share is active (TTL minutes); lock-screen payloads ETA only; no fixes persisted locally beyond ring buffer of 5 min |

### F-189 POI visits

| Aspect | Behaviour |
|---|---|
| Model | `Visit{poi, arrived_at, left_at, source geofence\|expense\|manual}`; no coordinates; `expires_at` = trip archived + 30 d |
| Opt-in | `CONSENT(visit_detection)`; consent sheet (undesigned → design in code) with copy "Places you checked in at, never a trail of coordinates"; toggle in Settings privacy rows; off → no geofence-source visits, existing rows deletable |
| Detection | arrived = inside POI radius (category default 60–150 m) for dwell ≥ 3 min with accuracy ≤ 50 m; left = outside radius + 60 m hysteresis for ≥ 2 min; offline-queued as `record_visit` command |
| Other sources | expense at POI (P33 calls `record_visit` with source expense), manual check-in (P41/P52 surfaces) |
| Consumers | quests 3l-7 ("five different warungs"), awards 3m-4/3m-5 ("back twice in one day"), rate-the-trip deck 3o-3, temple mute (feedback bus P06 reads `useCurrentVisit()` category) , copresence `trip_copresence:` (P40) |

## Architecture & contracts

| Area | Delta (refs) |
|---|---|
| Tables (data-model §3.12, §3.9) | `location_shares`, `location_fixes`, `member_etas`, `visits` exactly as documented; `visits` adds `detection_version smallint`; `location_fixes` adds `mock_flags smallint` (doc delta) |
| RLS | `location_fixes`: no SELECT for `app_user`; read only through `SECURITY DEFINER app.can_see_location(share_id)` (share active, viewer is trip participant, reason allows); `visits`: owner only (X), `guide_reader` none, excluded from PowerSync publication; `location_shares`: T; `member_etas`: T (reason gate evaluated in P39) |
| Commands | `update_device_permissions` (A,O), `record_visit` (O bg; checks consent, POI exists in trip destination, dwell plausibility), `delete_visit {visit_id}` (self; doc delta), `set_consent {purpose, granted, copy_version}` (O; upserts the P08 `consents` row; purposes `visit_detection`, `analytics`, `marketing`; this phase owns the handler — onboarding P22, You P45 and the P19 analytics gate call it; **doc delta** api-contracts §4) |
| HTTP | `POST /v1/loc` `{share_id, fixes[{lat,lng,acc,activity,at,mock}]}` ≤ 1 req/5 s/user, not via PowerSync; validates active share (never rejects on `mock`; SOS shares bypass the rate limit), writes `location_fixes`, publishes to Centrifugo `trip_live:`/`sos:` directly (latency path, not outbox). **Doc delta:** add to api-contracts §5 |
| Jobs | `location.fixes_ttl` every minute (drop fixes > 15 min unless open SOS); `visits.ttl` hourly; register in async §2.3 (catalogue already lists them under `maint.purge`) |
| Sync | `location_shares` → `trip` stream (own file `infra/powersync/streams/location.yaml`, merged by `build-config.ts`); visits/fixes never synced (client keeps own pending visits in local-only table) |
| Native | `cp-permissions` (status + request per kind, AlarmKit auth, exact-alarm/FSI status, LA `areActivitiesEnabled`/frequent, open Settings URLs); `cp-location` (sessions, CLMonitor/GeofencingClient, liveUpdates/Fused, mock flags, events to JS via Expo module events) |
| Config | `with-location-permissions` plugin writes every key explicitly. iOS Info.plist: `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSLocationTemporaryUsageDescriptionDictionary`, `UIBackgroundModes: [location]`, `NSAlarmKitUsageDescription`, `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`, `NSPhotoLibraryAddUsageDescription` (3m-6), `NSPhotoLibraryUsageDescription` (album read, 3m-2), `NSCalendarsFullAccessUsageDescription`, `NSSupportsLiveActivities`, `NSSupportsLiveActivitiesFrequentUpdates`. Android manifest: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`, `CAMERA`, `RECORD_AUDIO`, `READ_CALENDAR`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VISUAL_USER_SELECTED`. Prebuild check `tools/scripts/check-permissions-manifest.ts` asserts each key/permission is present with non-empty copy |
| Analytics | `permission_primer_shown{kind,trigger}`, `permission_result{kind,status}`, `location_session{mode,minutes}`, `visit_recorded{source}` (no POI id in analytics) |

## Tasks

### T1 — Permission and location domain logic
- Goal: pure, tested rules shared by app and api.
- Files: `packages/domain/src/permissions/{kinds,status,triggers,reask-policy}.ts`, `packages/domain/src/location/{trip-mode,visit-machine,battery-budget,plausibility,geofence-plan}.ts`, `__tests__/*.test.ts`.
- Steps: 1. Permission kinds + normalized status enum (not_determined/denied/restricted/limited/provisional/granted, location level none/wiu/always, precise bool). 2. Trigger catalogue + re-ask policy (per kind, 7 d, OS-denied → settings_only). 3. `isTripMode(trip, now, home, exploreAtHome)`. 4. Visit state machine (outside→candidate→inside→leaving→left) with dwell/hysteresis params. 5. Battery budget accountant. 6. Plausibility (speed > 250 km/h, teleport, mock flag, accuracy). 7. Geofence planner (nearest-N over registered candidate sources, rotation thresholds; POI + stay sources registered here).
- Tests: `pnpm --fail-if-no-match --filter @cp/domain test -- permissions location`.
- Done when: 100 % branch coverage on visit machine and trip-mode; property test that visit machine never emits `left` before `arrived`.
- Status: done — 42d380fc

### T2 — Location tables, RLS backstop, permission tests
- Goal: four tables with privacy guarantees.
- Files: `packages/db/src/schema/location.ts`, `packages/db/migrations/<ts>_location_shares_fixes_visits.sql`, `packages/db/test/permissions/{location_shares,location_fixes,member_etas,visits}.test.ts`, append to `packages/domain/src/privacy.ts` class map (single-line entries).
- Steps: 1. Drizzle schema + SQL with FORCE RLS, grants per role. 2. `app.can_see_location(share_id)` definer fn. 3. Exclude `location_fixes`, `visits` from publication and `guide_reader`. 4. Permission matrix per actor (self, co-participant, crew non-participant, outsider, guide_reader, powersync_repl).
- Tests: `pnpm --fail-if-no-match --filter @cp/db test -- permissions/location_shares permissions/location_fixes permissions/member_etas permissions/visits`; `pnpm tsx tools/scripts/check-publication.ts`.
- Done when: outsider and co-participant cannot SELECT fixes directly or visits of others; publication check passes.
- Status: done — 42d380fc (merge rules for the four tables added in the same PR)

### T3 — API: permissions mirror, visits, fix ingest, TTL jobs
- Goal: server side of all three features.
- Files: `services/api/src/commands/permissions/update-device-permissions.ts`, `services/api/src/commands/visits/{record-visit,delete-visit}.ts`, `services/api/src/routes/loc.ts`, `services/worker/src/jobs/location/{fixes-ttl,visits-ttl}.ts`, `services/api/test/location/*.test.ts`.
- Steps: 1. Handlers via phase-10 registry (idempotent op_id). 2. `record_visit` checks consent, POI in trip destination, plausibility → `LOCATION_IMPLAUSIBLE`; `set_consent` handler. 3. `POST /v1/loc` with rate limit (SOS exempt), share check, flagged fixes stored not rejected, Centrifugo publish. 4. TTL jobs registered with pg-boss cron.
- Tests: `pnpm --fail-if-no-match --filter @cp/api test -- location`; `pnpm --fail-if-no-match --filter @cp/worker test -- jobs/location`.
- Done when: replayed `record_visit` is a no-op; SOS share accepts a mock-flagged fix (test); visit with software-simulated evidence → `LOCATION_IMPLAUSIBLE`, accessory-produced evidence accepted; `set_consent` upserts one row per purpose; fix for inactive share → 403; TTL job deletes 16-min-old fixes but keeps open-SOS fixes.
- Status: done — 42d380fc (TTL purge proven by services/worker/test/jobs/location/location-ttl.db.test.ts; `POST /v1/loc` broadcasts once `CENTRIFUGO_API_URL` + `CENTRIFUGO_HTTP_API_KEY` are set on the api service)

### T4 — cp-permissions native module
- Goal: one API for every permission's status/request/settings on both OSes.
- Files: `apps/mobile/modules/cp-permissions/{expo-module.config.json,index.ts,ios/CpPermissionsModule.swift,android/src/main/java/app/critterpass/permissions/CpPermissionsModule.kt}`, `apps/mobile/modules/cp-permissions/__tests__/index.test.ts`.
- Steps: 1. Wrap expo-notifications/expo-location/expo-calendar/expo-camera where adequate; native for AlarmKit authorization, exact alarm (`canScheduleExactAlarms`), FSI (`canUseFullScreenIntent`), LA enabled/frequent, photos add-only, speech. 2. `openSettings(kind)` (app settings, exact-alarm, notification channel). 3. Emit `change` on app foreground diff.
- Tests: `pnpm --fail-if-no-match --filter @cp/mobile test -- modules/cp-permissions`; `xcodebuild test` for Swift unit via `pnpm --fail-if-no-match --filter @cp/mobile ios:test-modules`; `./gradlew :cp-permissions:testDebugUnitTest`.
- Done when: dev screen lists live status for all kinds on the iOS 26 simulator and Android API 36 emulator (Maestro screenshots saved as CI artifacts); `tools/scripts/check-permissions-manifest.ts` passes after `npx expo prebuild --no-install`. Physical iPhone + Pixel check moves to the M4 milestone checklist.
- Status: done — dc93a97c, b01d8937 (Swift probes type-check under Swift 6 against the iOS 26 SDK and the status mapping passes `swift test` on the host; the Kotlin module type-checks against android-36 and its mapping passes JUnit; `check-permissions-manifest.ts` passes after `expo prebuild --no-install`. The dev-screen run on the iOS 26 simulator and Android 36 emulator waits for a development build that includes cp-permissions)

### T5 — Permission orchestrator (JS)
- Goal: single entry `requestWithPrimer(kind, trigger)` used by every feature.
- Files: `apps/mobile/src/lib/permissions/{orchestrator,store,mirror,use-permission}.ts`, tests.
- Steps: 1. Store (Zustand or project store per code-standards) of statuses + last primer per trigger (MMKV). 2. Flow: primer sheet → OS prompt → result → mirror command. 3. Re-ask policy from T1; server config overrides. 4. `usePermission(kind)` hook.
- Tests: `pnpm --fail-if-no-match --filter @cp/mobile test -- lib/permissions`.
- Done when: unit tests cover granted, denied, settings_only, provisional, limited; mirror emits exactly one command per change.
- Status: done — dc93a97c

### T6 — Primer UI, just-in-time sheet, denied states, Settings section
- Goal: 3a-9 cards with live demos and reusable sheet/denied components.
- Files: `apps/mobile/src/ui/permission-primer/{PrimerCard,PrimerSheet,DeniedRow,PermissionsSection,demos/{LeaveByDemo,CritterPingDemo,CalendarFitDemo,CameraDemo,MicDemo}}.tsx`, `packages/i18n/locales/en/permissions.po`, tests.
- Steps: 1. Cards per render with motion presets from P06. 2. Sheet variant for JIT triggers. 3. Denied/partial rows with Settings deep link. 4. `PermissionsSection` for 3n-2/3n-6 (phase 45 mounts it). 5. Reduced-motion static frames; a11y labels.
- Tests: `pnpm --fail-if-no-match --filter @cp/mobile test -- ui/permission-primer`; `maestro test e2e/permissions/primer.yaml`.
- Done when: RNTL tests assert toggle ON calls orchestrator and snap-back on denied; Maestro flow grants notifications and denies location on simulator.
- Status: done — dc93a97c (RNTL toggle/snap-back/sheet tests pass; `e2e/permissions/primer.yaml` waits for the new development build)

### T7 — cp-location iOS
- Goal: WIU trip-day session, Always upgrade, CLMonitor rotation, mock flags.
- Files: `apps/mobile/modules/cp-location/{expo-module.config.json,index.ts,ios/{CpLocationModule,SessionManager,MonitorRotation,FixStream}.swift}`, `apps/mobile/plugins/with-location-permissions.ts`.
- Steps: 1. `startTripSession()` creates `CLBackgroundActivitySession` + `CLServiceSession` in foreground; recreate on relaunch. 2. `liveUpdates` with accuracy config + stationary detection. 3. `CLMonitor` conditions (≤20) replaced from planner. 4. Temporary full accuracy request with purpose key. 5. Emit fixes/region events with mock flags.
- Tests: `pnpm --fail-if-no-match --filter @cp/mobile ios:test-modules -- CpLocation`; GPX walk `e2e/location/walk-ubud.gpx` on simulator via `maestro test e2e/location/session-ios.yaml`.
- Done when: simulator GPX run emits region enter/exit for planned conditions while app is backgrounded with session pill; terminated-app relaunch works only under Always.
- Status: done — f3fd21bf, 624392e5 (plan math passes `swift test`; the session, stream and CLMonitor code type-checks under Swift 6 against the iOS 26 SDK; `e2e/location/session-ios.yaml` passes on the iOS 27 simulator with e2e-test build 537c50ab (fingerprint dce23884); the Android run is open)

### T8 — cp-location Android
- Goal: FGS location session, background geofences, mock flags, disclosure.
- Files: `apps/mobile/modules/cp-location/android/src/main/java/app/critterpass/location/{CpLocationModule,TripLocationService,GeofencePlanner,GeofenceReceiver,FixStream}.kt`, `apps/mobile/src/ui/permission-primer/BackgroundLocationDisclosure.tsx`.
- Steps: 1. FGS type location with ongoing notification + stop action, started only from UI/notification. 2. Fused provider priorities (balanced → high inside geofence). 3. GeofencingClient ≤100, radius ≥150 m, receiver starts FGS (exemption). 4. `isMock()` flag. 5. Prominent disclosure screen before background permission (Play policy).
- Tests: `./gradlew :cp-location:testDebugUnitTest`; `maestro test e2e/location/session-android.yaml` (emulator mock route).
- Done when: emulator route triggers enter/exit with app in background; mock provider fixes carry `mock=true`.
- Status: done — 1803960f, 624392e5 (planner and fix mapping pass JUnit; the service, receiver and module type-check against android-36 + play-services-location; `e2e/location/session-android.yaml` passes on the Android emulator with e2e-test build 4ecd0486)

### T9 — Location engine (JS)
- Goal: orchestrate modes, budget and consumers.
- Files: `apps/mobile/src/lib/location/{engine,modes,planner-bridge,budget,share-publisher,subscriptions,use-location-status}.ts`, tests.
- Steps: 1. Trip-mode watcher from PowerSync trip rows. 2. Start/stop session; Always upsell trigger via orchestrator. 3. Planner feed from `trip_pack` POIs/spawns. 4. Budget enforcement + Low Power Mode. 5. Share publisher batching to `POST /v1/loc` with offline drop (fixes are live-only). 6. Consumer subscriptions API.
- Tests: `pnpm --fail-if-no-match --filter @cp/mobile test -- lib/location`.
- Done when: fake clock tests show engine OFF at home, ON on trip day, coarse after budget exhausted; share publisher never persists fixes to disk.
- Status: done — e94a3b80

### T10 — Visit detector, consent, temple mute signal
- Goal: POI visits end to end on device.
- Files: `apps/mobile/src/lib/location/visits/{detector,queue,consent,use-current-visit}.ts`, `apps/mobile/src/ui/permission-primer/VisitConsentSheet.tsx`, tests.
- Steps: 1. Feed region/fix events into T1 machine. 2. Queue `record_visit` via command client (offline ok). 3. Consent sheet + Settings toggle writing consent. 4. `useCurrentVisit()` exposing POI category for feedback bus quiet rules (temple mute). 5. Expense/manual helper `recordVisit(source)` for P33/P41.
- Tests: `pnpm --fail-if-no-match --filter @cp/mobile test -- lib/location/visits`; `maestro test e2e/location/visit-consent.yaml`.
- Done when: GPX dwell at a seeded POI produces one `record_visit` op; without consent none is queued.
- Status: done — f3e6121f (`e2e/location/visit-consent.yaml` waits for the new development build)

### T11 — Integration and policy verification
- Goal: prove the full path and store readiness.
- Files: `e2e/location/{trip-day-session,always-upgrade}.yaml`, `e2e/permissions/{jit-camera,denied-settings}.yaml`, `services/api/test/location/visit-e2e.test.ts`, `docs/runbooks/location-policy-evidence.md` (Play declaration video script + App Review notes).
- Steps: 1. Maestro flows across both platforms. 2. API e2e: device op → visit row → TTL purge. 3. Battery: simulator/emulator energy proxy (location update count + high-accuracy minutes per hour from the engine's budget accountant) recorded as artifact; on-device %/h measurement per phase-02 method is an M8 milestone checklist item. 4. Write review-notes runbook.
- Tests: `maestro test e2e/location e2e/permissions`; `pnpm --fail-if-no-match --filter @cp/api test -- location/visit-e2e`.
- Done when: all flows green on CI simulators/emulators; runbook lists the proxy numbers, the on-device measurement procedure and reviewer steps.
- Status: done — 98857023 (API visit end-to-end and the battery proxy pass; on iOS 27 simulator with e2e-test build 537c50ab (fingerprint dce23884) every flow in `e2e/permissions` (primer, jit-camera, denied-settings, the primer screenshots) and `e2e/location` (session-ios, trip-day-session, always-upgrade, visit-consent, reload-survives) passes; on the Android emulator with e2e-test build 4ecd0486 primer, jit-camera, denied-settings, session-android, trip-day-session, always-upgrade and visit-consent pass after Android flow fixes (dialog labels, the settings-page Always grant, back navigation, a longer cold start); reload-survives is iOS-only; the on-device %/h check is on the M8 checklist)

## Phase acceptance criteria

- [ ] Every permission kind in the map has status, request, Settings path on iOS and Android
- [ ] No OS prompt is shown without a preceding primer card or sheet (Maestro asserts)
- [ ] Engine OFF outside trip mode; ON with session indicator on trip days; Always only after contextual upsell
- [ ] Simulated fixes flagged; rejected with `LOCATION_IMPLAUSIBLE` for encounter/visit evidence only; share/SOS fixes accepted with flag (test)
- [ ] `visits` rows contain no coordinates; readable only by owner; purged by TTL job
- [ ] Permission tests green for 4 tables; publication check excludes fixes and visits
- [ ] Battery during active encounter measured < 3 %/h (or phase-02 ADR target)

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Always/background location rejected in review | Session-only mode stays default; copy "keep Critterpass open in your pocket"; server flag disables Always upsell |
| OEM task killers kill FGS | Documented "don't optimise" deep links per OEM; encounter drain grace absorbs gaps |
| Battery complaints | Budget config is server-driven; lower cap without release |
| Fix ingest load | Rate limit + Centrifugo direct publish; `location_fixes` partitioned by day if needed |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Apple LPSE entitlement request (crew map background) | Not used here; Always + CLMonitor path works without it |
| Play background-location declaration + ≤30 s video | Background geofences behind server flag off; FGS session path ships |
| Counsel review of visit consent copy (C25) | Ship default copy from C25 |
| Phase-02 background-location ADR numbers | Use defaults in T1 (dwell 3 min, 150 m, 90 min cap) |

## Open questions

| Question | Default |
|---|---|
| Fix TTL: data-model says 15 min, system-architecture §12 says "share window end + 24 h" (doc delta) | 15 min; SOS until resolved + 24 h |
| `POST /v1/loc`, `delete_visit`, `set_consent`, `visits.detection_version`, `location_fixes.mock_flags` absent from docs (doc delta) | Add as specified here |
| Spawn geofences before P40 registers its source | Planner runs on POIs + stay only; P40 adds `spawns` source (P40 scope note for controller) |
| Visit dwell per POI category | 3 min default; restaurants 10 min, temples 5 min (server config) |
| Show crew "can't ring" hints derived from permission mirror? | Yes, capability only ("alarm off"), never raw permission list |
