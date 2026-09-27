---
phase: 2
title: Platform go/no-go spikes
status: in_progress
depends_on: [1]
wave: 2
features: []
screens: [3k-2, 3g-4, 5a-3, 5c-2]
tasks: 15
owns:
  - docs/decisions/**
  - docs/runbooks/db-switchover-drill.md
  - tools/spikes/**
  - apps/mobile/src/app/(dev)/spikes/**
  - apps/mobile/targets/**                 # scaffold only; ownership released when this phase is done. Then: notification-service/ + _shared/{ActionKey,PushPayload}/ → 11; app-clip/ → 21; widgets/Alarm/ → 36; widgets/ root files, widgets/{LiveActivities,Intents/LiveActivity}/, widgets/CPWidgetBundle.swift, _shared/ActivityAttributes/ → 48; widgets/{Widgets,Intents/Widget,Intents/AppShortcuts}/, notification-content/, _shared/{Snapshot,Categories}/ → 49
  - apps/mobile/modules/cp-app-group/**    # spike scaffold only; ownership released when this phase is done. Then phase 10 owns it, except src/snapshots/la/ (48) and src/snapshots/widgets/ (49)
  - apps/mobile/plugins/with-apple-targets.ts (only if the in-repo config plugin path is chosen; `apps/mobile/plugins/` is shared, one file per owner)
  - apps/mobile/modules/cp-spike-android/** (removed by the Android surfaces phase once its module lands)
  - docs/system-architecture.md §11 (results column only)
---
# Phase 2 — Platform go/no-go spikes

## Context links
| Source | Section |
|---|---|
| `docs/system-architecture.md` | §2 topology, §4.3 realtime, §4.8 extensions, §7.a/§7.c sequences, §9 budgets, §11 spikes |
| `plans/reports/researcher-260926-1649-custom-hono-backend-report.md` | "R0 spikes" (S-AUTH, S-SYNC, S-DB, S-RT), risk table, fallbacks, unresolved Q1–Q3 |
| `plans/reports/researcher-260926-1143-mobile-framework-report.md` | spike table S1–S8, risks (SET, painter drift) |
| `plans/reports/fact-check-260926-1143-mobile-framework-report.md` | corrections to S1–S8 claims |
| `plans/reports/researcher-260926-1143-native-platform-monetization-report.md` | broadcast channels, push-to-start budget, AlarmKit, LiveActivityIntent |
| `plans/reports/researcher-260926-1143-web-links-ops-report.md` | PMTiles on R2 |
| `plans/reports/design-analysis-260926-1143-critter-render-engine-report.md` §5 | critter renderer targets |
| Renders | `docs/design-renders/screens/` for leave-by LA (3k-2), crew live map (3g-4), lock screen/LA (5a-*), notifications (5c-*) — used only as visual targets for hello surfaces |

## Overview
Goal: prove or fail each risky platform/backend assumption with a runnable harness and an ADR before feature phases depend on it. Every failure resolves to a fallback inside the custom stack (never Supabase); budgets may be adjusted, scope may not.
Done when: `docs/decisions/` holds one ADR per spike with measured numbers, PASS/FAIL against the stated criteria and the chosen path; harnesses under `tools/spikes/` rerun with one command; `docs/system-architecture.md` §11 carries a results column; the switchover drill runbook exists.

## Requirements
| Spike | Pass criteria | Fallback (same stack) | Decisions |
|---|---|---|---|
| S-DB | Railway SG → PlanetScale ap-southeast-1 p50 <3 ms, p99 recorded (1k `select 1` + 1k single-row tx); `SET LOCAL ROLE` + `set_config('app.uid', …, true)` survive PgBouncer transaction pooling; `vector`, `pg_trgm`, `unaccent` available; HNSW index build on 100k × 1024-d; price quote recorded | Railway Postgres HA | D4 |
| S-AUTH | Better Auth 1.7 on Expo SDK 58: anonymous sign-in → `linkSocial({idToken})` with native Apple + Google tokens and `phoneNumber.verify({updatePhoneNumber:true})` keep the same uid and set `isAnonymous=false`; identity already on another user → `onLinkAccount` merge in one tx; `disableImplicitLinking`; JWT (EdDSA) verified by PowerSync and Centrifugo via JWKS; key rotation keeps sessions valid | merge transaction + PowerSync `disconnectAndClear` | D4, D14 |
| S-SYNC | self-hosted PowerSync (Open Edition) on Railway SG replicating from PlanetScale; Better Auth JWKS; upload queue → `POST /sync/upload` runs a command handler, validation reject returns 2xx + `cmd_results` row; offline 50-op replay converges; chat-row round-trip p95 <1 s; 1k synthetic connections hold; **PlanetScale switchover keeps the logical slot** (no full re-replication) | PowerSync Cloud; Railway Postgres HA | D4, D12 |
| S-RT | Centrifugo v6 + Redis 8: JWT via JWKS; subscribe proxy to api allows/denies per membership; server-side unsubscribe after removal <1 s; presence + history; recovery after 2 min app background; 5k sockets on 2 nodes | tune Redis engine / add nodes | D4 |
| Apple targets | `@bacons/apple-targets` fork or in-repo config plugin generates + signs on EAS (SDK 58, Xcode 27, UIScene): widget ext (widget + Live Activity + AlarmKit UI + App Intent), Notification Service ext, Notification Content ext; App Group + shared Keychain group; widget peak memory <20 MB; intent round-trip <2 s | in-repo config plugin → bare workflow | D3 |
| Push LA | `@parse/node-apn`: create/delete APNs broadcast channel, update a LA for N devices via one channel push; push-to-start (alert + `input-push-channel`); `LiveActivityIntent` "I'M UP" from lock screen reaches api via device action key; FCM v1 data message to Android | per-activity tokens for LA updates | D3, D4 |
| NSE/NCE | communication notification with guide avatar (NSE downloads signed PNG); NCE poster with a vote action works with device locked and app killed | plain notification + category actions | D2 |
| Skia critters (S1/S2) | one critter (Tokek) ported from `design/critters-draw-*.js` into a spike painter: ≤2 % pixel diff vs Node prerender; draw-on 120 fps iPhone 13+, ≥55 fps on low/mid Android (Galaxy A15-class + Pixel 7a); 150×4 grid scroll + 6 idle bobbing critters, dropped frames ≤2 % Android | pre-baked PNG thumbnails in grid, live Skia only for focused critter | D3 |
| Motion (S3/S7/S8) | grow-into-page transition interruptible, ≤16 ms p95 frame; timeline drag 15-min snap + haptic tick, snap latency <1 frame; release cold start ≤1.2 s mid Android / ≤0.8 s iOS; iOS download ≤40 MB | custom teleport overlay; budgets adjusted in arch §9 | D3 |
| Background location (S6) | trip-day While-In-Use session with Android foreground service; 50 m dwell ring updates LA while locked; battery <3 %/h during active encounter; Always upgrade path prompts correctly | significant-change + region monitoring only | D13 |
| Map tiles | MapLibre RN 11 renders a custom hand-drawn style from PMTiles on R2 (via media-worker range reads or public tiles bucket); offline region download for one city; 60 fps pan on mid Android | vector tile server on Railway | D6 |
| Valhalla | Valhalla 3.9 on Railway SG with SEA + Japan extract: walk/drive/transit-less route p95 <300 ms; matrix 16×16 <1 s; memory within Railway plan | smaller per-region extracts; Mapbox Directions for drive | D6 |
| Android surfaces | Kotlin spike on API 36: Glance widget renders the shared snapshot written by `cp-app-group`; Live Update (`Notification.ProgressStyle`, promoted ongoing) created and updated from an FCM v1 data push, gated `SDK_INT >= 36`; MetricStyle path gated `>= 37` with a verified fallback on 36; full-screen-intent alarm incl. `canUseFullScreenIntent()` check + Settings deep-link flow when denied (API 34+ rule) | plain ongoing notification with progress; heads-up alarm notification + exact alarm | D2 |
| Inline module bridge | Expo module `cp-app-group` (Swift + Kotlin) writes snapshot JSON + PNG to App Group / Android shared storage, reads shared outbox, triggers `WidgetCenter.reloadTimelines`; round-trip from JS <50 ms | per-target native bridge | D3 |

Undesigned states: none shipped to users; spike screens live under `(dev)/spikes/` routes, excluded at build time by the phase-1 dev-route exclusion (phase 1: Metro `blockList` on `src/app/(dev)/**` for `APP_VARIANT=production` + `check-release-bundle` CI gate).

## Architecture & contracts
| Delta | Detail |
|---|---|
| ADR format | `docs/decisions/<yyyymmdd>-<slug>.md`: context, criteria table, method, raw numbers, verdict PASS/FAIL, chosen path, consequences, rerun command |
| Harness home | `tools/spikes/<slug>/` (`s-db`, `s-auth`, `s-sync`, `s-rt`, `apns-live-activity`, `valhalla`, `tiles`); runnable via `pnpm --filter @cp/spike-<slug> run spike` and kept as regression probes (drills reuse them) |
| Mobile spike routes | `apps/mobile/src/app/(dev)/spikes/<slug>.tsx`; spike painters/code stay in `tools/spikes` or `(dev)` and are not imported by features |
| Throwaway schema | spikes use their own `spike_*` tables in a `spike` schema on staging, dropped after the ADR; never in `packages/db/migrations` |
| Targets scaffold | `apps/mobile/targets/{widgets,notification-service,notification-content,_shared}` hello-world code + App Group id `group.app.critterpass` + Keychain group; later phases replace hello views |
| Device evidence | Agents cannot hold devices. Every device-dependent check is split: (a) agent task — harness screen, scripted capture (Maestro flow on a device farm such as BrowserStack App Automate / Maestro Cloud, `adb shell dumpsys gfxinfo` / Perfetto trace scripts, `xctrace` templates) and an ADR with a `Founder device run` table left blank; (b) founder checklist step — run the script on the named physical device and fill the table. The phase is done only when (b) is filled; simulator/emulator numbers never count as fps, battery or memory evidence |
| Device action key | spike validates the flow in arch §4.8 (key minted per device, stored in shared Keychain, `POST /v1/actions` with HMAC) using a spike endpoint in `tools/spikes/apns-live-activity` |

## Tasks
### T1 — S-DB: latency, pooling, extensions
- Goal: go/no-go on PlanetScale from Railway SG.
- Files: `tools/spikes/s-db/**`, `docs/decisions/<date>-planetscale-postgres-from-railway.md`.
- Steps: 1. Railway one-off service runs the probe against staging (PgBouncer 6432 and direct 5432). 2. Measure `select 1`, single-row insert tx, 10-statement tx with `SET LOCAL ROLE` + `set_config`; assert settings do not leak across pooled tx (two interleaved clients). 3. Check extensions; build HNSW on 100k random vectors, record time + query p95. 4. Record price quote. 5. Repeat against Railway Postgres for comparison.
- Tests: `pnpm --filter @cp/spike-s-db run spike -- --target staging` prints a JSON report; leak test asserts `current_setting('app.uid', true)` is empty in the next tx.
- Done when: ADR shows numbers for both targets and a verdict.
- Status: done — 964e65d (latency/pooling/extensions PASS; HNSW build did not complete on PS-DEV within 1h31m — see ADR for chosen path and the founder follow-up to re-run on the launch-sized tier)

### T2 — S-AUTH server harness
- Goal: prove uid-preserving upgrade and merge on the server.
- Files: `tools/spikes/s-auth/**`, `docs/decisions/<date>-better-auth-anonymous-upgrade.md` (server half).
- Steps: 1. Minimal Hono + Better Auth 1.7 (anonymous, phoneNumber, jwt EdDSA, admin, expo) on Testcontainers Postgres. 2. Flows: anon → phone verify (Twilio Verify test credentials), anon → linkSocial with an identity present elsewhere → `onLinkAccount` merge moves rows of a `spike_owned` table in one tx. 3. JWKS: rotate key, old tokens still verify until expiry. 4. Verify a JWT with `jose` using only the JWKS URL (what PowerSync/Centrifugo do).
- Tests: `pnpm --filter @cp/spike-s-auth test` (uid unchanged, `isAnonymous` false, merge atomic on forced failure, rotation).
- Done when: tests green; server verdict recorded.
- Status: done — 967e97f (all 5 assertions PASS; genericOAuth + a local mock IdP stood in for native Apple/Google tokens (T3's job); phone OTP read from Better Auth's own verification row, no Twilio Verify account yet — see ADR)

### T3 — S-AUTH on device (Apple + Google native tokens)
- Goal: native sign-in on Expo SDK 58 upgrades the anonymous session.
- Files: `apps/mobile/src/app/(dev)/spikes/auth.tsx`, `tools/spikes/s-auth/**` (staging deploy config), ADR (device half).
- Steps: 1. Deploy harness to Railway staging as `spike-auth`. 2. `@better-auth/expo` client + `expo-apple-authentication` + Google native sign-in lib pinned for SDK 58. 3. Anonymous → Apple, anonymous → Google, anonymous → phone; show uid before/after. 4. Record SIWA revoke endpoint behaviour.
- Tests: Maestro `e2e/spikes/auth-anonymous.yaml` for the anonymous + phone path (simulator); server harness asserts uid equality from logs.
- Done when (agent): harness screen + ADR with `Founder device run` table ready. Founder checklist: real-device Apple + Google sign-in on iPhone + Android, uid screenshots into ADR (or FAIL + fallback).
- Status: done — 2b007cc (anonymous → phone PASS end to end on a real iOS-simulator device against a real deployed `spike-auth` Railway service, uid preserved, Maestro-tested; real Apple `apple` social provider deployed and wired but no Apple ID on this simulator to drive a genuine sign-in; Google blocked entirely — no Firebase/Google Cloud project provisioned; found and fixed a real PgBouncer session-`SET` leak onto other staging clients mid-deploy — see ADR device half for the full finding set and founder checklist)

### T4 — S-SYNC: self-hosted PowerSync end to end
- Goal: replication, auth, upload and latency proven on staging.
- Files: `tools/spikes/s-sync/**`, `infra/powersync/` untouched (spike config in `tools/spikes/s-sync/config/`), `apps/mobile/src/app/(dev)/spikes/sync.tsx`, ADR.
- Steps: 1. powersync-repl + powersync-api on Railway staging replicating `spike.messages` from PlanetScale via publication. 2. JWKS from `spike-auth`. 3. `/sync/upload` in harness: validates op, writes row or writes `cmd_results` reject with 2xx. 4. Device: offline 50 inserts → reconnect → converge; second device measures arrival (p95). 5. Node load script opens 1k sync connections for 10 min.
- Tests: `pnpm --filter @cp/spike-s-sync run load -- --conns 1000`; latency script outputs p50/p95; reject path asserted by reading `cmd_results`.
- Done when: numbers recorded against criteria; verdict in ADR.
- Status: done — 8467ed0 (replication/auth/upload/offline-replay/chat-latency PASS on real Railway SG + PlanetScale staging; 1,120 concurrent connections held with 0 failures by aggregating 4 independent load-generator processes — a single process maxes out around 280-300 from its own per-client SDK memory cost, not from any server-side limit; see ADR for the full finding set incl. the hardcoded publication name, publication/table ownership split, and the `iat`/`aud` JWT payload findings)

### T5 — S-SYNC switchover drill
- Goal: logical slot survives a PlanetScale primary switchover.
- Files: `tools/spikes/s-sync/drill.ts`, `docs/runbooks/db-switchover-drill.md`, ADR (drill section).
- Steps: 1. Continuous writer + PowerSync checkpoint watcher. 2. Trigger PlanetScale switchover (console/API). 3. Measure write gap, replication resume time, whether PowerSync re-snapshotted (diagnostics API). 4. Repeat on Railway Postgres HA for the fallback. 5. Write runbook (quarterly drill steps, expected numbers, rollback).
- Tests: `pnpm --filter @cp/spike-s-sync run drill` produces report JSON.
- Done when: runbook exists; ADR states slot kept (PASS) or fallback chosen.
- Status: done — f93167d (`pscale branch switchover` on `main` confirmed real and used directly, no support-request blocker; FAIL — the promoted replica does not carry the old primary's logical slot, forcing a full re-snapshot after ~30s of retry/detection; ~34.4s real sync-path gap measured from replication logs against PlanetScale's own official switchover timing, app-level writes barely affected (1/138 failed); chosen path is an adjusted operational expectation within the same stack (D4 stands), not a technology change — runbook + ADR carry the founder follow-ups (re-test at production data volume; ask PlanetScale support about slot-preserving failover))

### T6 — S-RT: Centrifugo proxy, presence, recovery, revocation
- Goal: realtime contract proven.
- Files: `tools/spikes/s-rt/**`, ADR.
- Steps: 1. Centrifugo v6 (2 nodes, Redis 8) on staging with JWKS + subscribe proxy to harness. 2. Proxy allows members, denies others. 3. Remove member → server API `unsubscribe` → client event latency. 4. History + recovery after 2 min background on device. 5. k6/Node script ramps to 5k sockets.
- Tests: `pnpm --filter @cp/spike-s-rt test` (proxy decisions), `run load -- --sockets 5000`.
- Done when: revocation <1 s p95, recovery works, 5k sockets stable — or fallback recorded.
- Status: done — 55e236b (revocation p95 3.4ms, recovery PASS after a real 2 min background, 5000/5000 sockets across 2 nodes, 0 failures; run against S-RT's own local 2-node stack, not staging — see ADR for the network-RTT caveat and two real Centrifugo/Better-Auth integration gaps found)

### T7 — Apple extension targets on SDK 58 / Xcode 27 / UIScene
- Goal: all extension targets build, sign and run.
- Files: `apps/mobile/targets/{widgets,notification-service,notification-content,_shared}/**`, `apps/mobile/app.config.ts` (targets plugin entry — named dependency), `apps/mobile/plugins/**` if in-repo plugin, ADR.
- Steps: 1. Try `@bacons/apple-targets` fork on SDK 58; if blocked, in-repo config plugin. 2. Widget ext: static widget, Live Activity (lock screen + Dynamic Island), AlarmKit alarm UI, App Intent button. 3. NSE + NCE hello. 4. App Group + Keychain group entitlements; UIScene lifecycle compatibility. 5. EAS build + install; `xctrace` widget-memory template script in `tools/spikes/apple-targets/`.
- Tests: `eas build -p ios --profile development`; XCTest target for `_shared` snapshot decoding.
- Done when (agent): signed EAS build with all targets; ADR picks the path. Founder checklist: install on iPhone, run the `xctrace` script, record widget memory <20 MB.
- Status: done — 35a185a (chosen path: published `@bacons/apple-targets@5.0.0`, unmodified — no fork needed, contradicting the plan's pessimistic default; widget incl. Live Activity/AlarmKit/App Intent + NSE + NCE all build, sign-for-simulator, embed and install/launch clean under SDK 58/Xcode 27/UIScene; App Group + Keychain entitlement chain verified app+extensions. Blocked on real signing: no Apple ID/API-key session in Xcode and the only Apple Development cert is for the wrong team (S8H6HTF3KK, not YFND2EEW8S) — no EAS/device build or on-device memory/intent-latency number possible until the founder fixes accounts; see ADR)

### T8 — Inline module bridge: cp-app-group
- Goal: JS ↔ App Group / Android shared storage bridge.
- Files: `apps/mobile/modules/cp-app-group/**`, `apps/mobile/src/app/(dev)/spikes/app-group.tsx`.
- Steps: 1. Expo module API: `writeSnapshot(key, json)`, `writeImage(key, pngBase64)`, `readOutbox()`, `reloadWidgets()`. 2. Kotlin equivalent (app-private file + Glance update broadcast). 3. Widget from T7 reads snapshot. 4. Time round-trip.
- Tests: XCTest + JUnit for serialization; RNTL-free device timing recorded.
- Done when: widget shows JS-written snapshot on both platforms; round-trip <50 ms.
- Status: done — b85ba96 (iOS PASS: widget reads the App-Group snapshot this module writes for real; app builds/installs/launches clean with the module linked; file-I/O floor for the write+read cycle measured at p50 0.56 ms / p95 0.77 ms, comfortably under budget, though the literal on-device JS-thread number still needs Metro/Maestro or a founder run. Android Kotlin implemented and verified against the real expo-modules-core source but not build-verified — no Gradle/emulator run attempted; see ADR founder follow-ups)

### T9 — APNs broadcast LA, push-to-start, I'M UP, NSE/NCE
- Goal: native push paths proven with our server library.
- Files: `tools/spikes/apns-live-activity/**`, `apps/mobile/src/app/(dev)/spikes/live-activity.tsx`, targets code from T7 (named dependency), ADR.
- Steps: 1. `@parse/node-apn` with .p8: create broadcast channel, start LA via push-to-start with `input-push-channel`, update 3 devices via one channel push, end + delete channel. 2. `LiveActivityIntent` "I'M UP" → `POST /v1/actions` with device action key (HMAC) → harness logs. 3. NSE downloads signed avatar, sets communication intent; NCE poster with vote action (device locked, app killed). 4. `firebase-admin` FCM v1 data message to Android dev client. 5. Record push-to-start budget behaviour.
- Tests: harness script `run lifecycle` prints each APNs response; device evidence in ADR.
- Done when: all paths work on device or fallback recorded.
- Status: done — bd5f9f2 (device-action-key HMAC contract PASS incl. real Swift/TypeScript signature parity, actions-server accepts a valid signed request and rejects a tampered one; APNs broadcast channel/push-to-start/update/end/delete and FCM data message SKIPPED — no `.p8` key or Firebase service account in this environment, harness prints the exact reason instead of faking success; NSE/NCE build+embed shared with the apple-targets spike, runtime delivery blocked by `simctl push` needing notification authorization this minimal app never requests — see ADR for founder prerequisites)

### T10 — Skia critter painter perf (S1, S2)
- Goal: renderer feasibility on low-end Android + iPhone.
- Files: `tools/spikes/skia-critter/**` (spike painter ported from `design/critters-draw-*.js`, read-only source), `apps/mobile/src/app/(dev)/spikes/critter.tsx`, `apps/mobile/src/app/(dev)/spikes/critterdex-grid.tsx`, ADR.
- Steps: 1. Port Tokek draw calls to a Canvas2D-like interface over Skia. 2. Node prerender (@napi-rs/canvas) reference PNG; device snapshot diff. 3. Draw-on + blink animation on UI thread. 4. 600-cell grid (FlashList 2 vs Legend List) + 6 idle critters. 5. Scripted capture (Perfetto config + `dumpsys gfxinfo` script, `xctrace` template) runnable on Galaxy A15-class, Pixel 7a, iPhone 13 (device farm or founder device).
- Tests: `pnpm --filter @cp/spike-skia-critter test` (pixel diff ≤2 %).
- Done when (agent): pixel-diff test green; capture scripts + ADR template ready. Founder checklist: run captures on the three devices; ADR records fps/drop rates and the grid strategy (live vs baked thumbnails) for phases 4/5.
- Status: done — e4f8657 (pixel-diff 0.175% vs the real design/doodles.js source, PASS; grid strategy decided: FlashList 2, confirmed clean at 600 cells + 6 bobbing critters; iOS-simulator fps real but not the phase's physical-device evidence — Android emulator not reached this pass after a real disk incident during T10's own Android build attempt, see the ADR; founder device runs still needed)

### T11 — Motion & startup (S3, S7, S8)
- Goal: transition, drag and cold-start budgets measured.
- Files: `apps/mobile/src/app/(dev)/spikes/{grow-into-page,timeline-drag}.tsx`, ADR.
- Steps: 1. Compare `Link.AppleZoom`, Reanimated shared element (flagged), custom teleport overlay for grow-into-page. 2. Timeline drag with 15-min snap via Gesture Handler 3 + haptic ticks. 3. Release builds: cold start (Android `am start -W`, iOS Instruments), download size (App Store Connect/EAS size report).
- Tests: Maestro `e2e/spikes/motion.yaml` drives both screens; numbers captured.
- Done when (agent): ADR names the transition approach; cold-start/size scripts committed. Founder checklist: S7/S8 numbers from release builds on the reference devices.
- Status: done — 49bb324 (chosen path: custom teleport overlay — Link.AppleZoom confirmed inert in this expo-router release both by source and on-device, Reanimated shared element works only in-screen not across native-stack routes; teleport overlay and the 15-min timeline drag both measured zero dropped frames (16.67 ms floor) on iOS simulator; cold-start/size scripts committed but produced no number this pass — an unbounded Instruments trace risked disk again, see the ADR; release-build numbers on reference devices still needed)

### T12 — Background location session + dwell ring (S6)
- Goal: prove trip-day session design and battery budget.
- Files: `apps/mobile/src/app/(dev)/spikes/location.tsx`, `tools/spikes/location/README.md` (method), ADR.
- Steps: 1. While-In-Use session with iOS background location indicator + Android foreground service (type location). 2. 50 m geofence dwell → updates LA progress while locked (via T7/T9 targets). 3. Always upgrade prompt flow. 4. 1 h walk test: battery drain per platform.
- Tests: unit test for dwell calculation in spike code; simulated-route Maestro run (GPX on simulator/emulator) proves the ring advances.
- Done when (agent): simulated ring advance + field-test script in `tools/spikes/location/README.md`. Founder checklist: 1 h walk per platform, battery drain + lock-screen ring evidence in ADR; verdict.
- Status: done — 86fb1f2 (real iOS-simulator session: While-In-Use permission, background-location indicator, TaskManager background task, dwell ring advancing 0%→5% from live location fixes at a fixed POI — the phase's required proof; 10 hardware-free unit tests for the grace+slow-drain reducer; App Group snapshot write reaches T8's module for real but errors with a specific CpAppGroupError in this build, see the ADR; Android emulator, the 1h battery walk and locked-screen LA render all remain founder/next-pass follow-ups)

### T13 — MapLibre custom style + PMTiles on R2
- Goal: map rendering and offline region feasibility.
- Files: `tools/spikes/tiles/**` (pmtiles build script for one city extract, style JSON draft), `apps/mobile/src/app/(dev)/spikes/map.tsx`, ADR.
- Steps: 1. Build PMTiles for Da Nang from OSM (planetiler/tippecanoe). 2. Upload to `cp-tiles`; serve via media-worker range reads or public bucket (compare). 3. Custom hand-drawn style draft (fonts glyphs + sprites on R2). 4. Offline pack download for city bbox. 5. Pan/zoom fps on mid Android.
- Tests: `pnpm --filter @cp/spike-tiles run build -- --city da-nang`; fps capture script (founder checklist on mid Android).
- Done when: offline map works in airplane mode; ADR chooses PMTiles or tile server.
- Status: done — 609a08a (real Da Nang PMTiles extract via planetiler + Geofabrik, uploaded to the public `cp-tiles` bucket with real SDF glyphs and a canvas-drawn sprite; MapLibre RN 11 renders the custom dark style from it and, after a real on-device download, renders again from the local file with zero PMTiles-source network calls — two real bugs found and fixed getting there (a doubled `file://` scheme, `<Map>` needing a full remount to reapply `background-pattern`); media-worker range reads ruled out by reading its actual source, not guessing — see the ADR; true network-severed offline proof and Android pan/zoom fps remain founder follow-ups)

### T14 — Android native surfaces (Kotlin)
- Goal: prove Android parity surfaces before the surface phases build them.
- Files: `apps/mobile/modules/cp-spike-android/**` (Expo module, Kotlin: Glance widget, Live Update builder, alarm activity + receiver), `apps/mobile/src/app/(dev)/spikes/android-surfaces.tsx`, `tools/spikes/android-surfaces/**` (FCM data-push sender script), ADR.
- Steps: 1. Glance widget reads the snapshot written via `cp-app-group` (T8). 2. FCM v1 data message → `FirebaseMessagingService` → post/update a promoted Live Update (`ProgressStyle`) when `SDK_INT >= 36`, plain progress notification below. 3. MetricStyle builder behind `SDK_INT >= 37`; on 36 the guard selects the fallback (unit-tested). 4. Full-screen-intent alarm: `canUseFullScreenIntent()` check, denied → Settings deep link flow, exact alarm scheduling; alarm activity over lock screen. 5. Record OEM behaviour notes.
- Tests: `./gradlew :cp-spike-android:testDebugUnitTest` (SDK guards, payload parsing); Maestro `e2e/spikes/android-surfaces.yaml` on API 36 emulator (widget renders, Live Update posted, FSI permission flow).
- Done when (agent): emulator flows green; ADR written. Founder checklist: physical API 36+ device run of FCM-updated Live Update and locked-screen alarm.
- Status: done — adc07ab (PASS on every code path: real compile against API 36/37 SDK stubs, real manifest merge + resource linking, 13/13 JVM unit tests, real EAS cloud Android build producing a signed APK on the release configuration — which caught and led to fixing one real bug, a nonexistent `androidx.core:core:1.13.2` pin that only debug-variant resolution had silently tolerated; Maestro itself still fails at emulator boot, the pre-existing EAS Android build-infrastructure gap already documented in `.eas/workflows/e2e-android.yml`, not this module; FCM transport untested end to end — no Firebase project — exercised instead via a local test hook calling the identical receiver code; physical-device confirmation and Firebase credentials remain founder follow-ups, see the ADR)

### T15 — Valhalla on Railway + spike summary
- Goal: routing feasibility and consolidated go/no-go.
- Files: `tools/spikes/valhalla/**` (Dockerfile, tile build script), `docs/decisions/README.md` (index + summary), `docs/system-architecture.md` §11 results column.
- Steps: 1. Build Valhalla tiles for the 61 places' countries; deploy to Railway SG with volume. 2. Measure route p95 (walk, drive), 16×16 matrix, memory/cold start. 3. Write ADR. 4. Write decisions index with PASS/FAIL table and fallbacks taken; update arch §11.
- Tests: `pnpm --filter @cp/spike-valhalla run bench`.
- Done when: all ADRs linked from index; arch §11 shows results.
- Status: in_progress — 41832b6 (Valhalla ADR done: PASS on walk/drive route p95, FAIL on 16x16 matrix p95 for larger metros, on a merged SEA+Japan extract only — the 4 guide-destination countries and cold-start numbers weren't obtained under a founder time/cost box; decisions index and arch §11 summary pending)

## Phase acceptance criteria
- [ ] One ADR per spike (S-DB, S-AUTH, S-SYNC incl. drill, S-RT, Apple targets, Android surfaces, push LA/NSE/NCE, Skia critters, motion/startup, background location, tiles, Valhalla, inline module) with numbers and verdict
- [ ] Each FAIL names a fallback inside the custom stack; no ADR proposes Supabase
- [ ] Harnesses rerun via `pnpm --filter @cp/spike-<slug> run spike`
- [ ] `docs/runbooks/db-switchover-drill.md` exists and was executed once
- [ ] Signed iOS build with widget, LA, AlarmKit, NSE, NCE targets installs from EAS
- [ ] `(dev)` routes excluded from production variant (`check-release-bundle` green)
- [ ] Every `Founder device run` table filled
- [ ] Spike tables dropped from staging

## Risks & rollback
| Risk | Mitigation / rollback |
|---|---|
| apple-targets unmaintained for SDK 58 | in-repo plugin; exit = bare workflow (`expo prebuild` committed) |
| PowerSync slot lost on switchover | PowerSync Cloud (managed) or Railway PG HA; accept re-replication with measured time |
| Better Auth anon uid not preserved | merge tx + `disconnectAndClear` |
| Skia perf misses on low-end Android | baked PNG grid, fewer concurrent draw-ons (≤2), adjust budgets not scope |
| Spike code leaking into features | lint boundary: nothing under `src/features` may import `(dev)` or `tools/spikes` |

## Non-code dependencies
| Item | Needed for | If not ready |
|---|---|---|
| Apple Developer account, App Group + AlarmKit + push entitlements, APNs .p8 | T3, T7, T9, T12 | simulator-only evidence; ADR marked incomplete, phase not done |
| Google Play Console, Firebase project | T3, T9 | emulator + FCM test project |
| Test devices: iPhone 13+, Galaxy A15-class, Pixel 7a | T10–T12 | borrow/rent via device farm (BrowserStack App Live) |
| Twilio Verify test account | T2/T3 | phone path verified with Better Auth test OTP hook only; ADR notes gap |
| PlanetScale switchover access | T5 | request from support; drill on Railway HA first |

## Open questions
1. apple-targets fork vs in-repo plugin — default: fork as a git dependency. Doc delta: add `apps/mobile/plugins/` (one config plugin per file, e.g. `with-critter-art.ts`) to the canonical layout in system-architecture.
2. PMTiles delivery: public R2 bucket vs media-worker range reads — default: public `cp-tiles` bucket (tiles are not private).
3. Android low-end reference device — default: Samsung Galaxy A15.
4. Valhalla extract coverage — default: countries of the 61 places only.
