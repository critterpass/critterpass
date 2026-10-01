---
phase: 40
title: Critters: hatch, Critterdex, encounters, legendaries
status: in_progress
depends_on: [5, 6, 9, 14, 15, 18, 20, 25, 31, 34]
wave: 18
features: [F-122, F-123, F-124, F-125, F-126, F-127, F-128]
screens: [3l-1, 3l-2, 3l-3, 3l-4, 3l-5, 3l-6, 3l-8, 3l-9, 3l-10]
tasks: 11
owns:
  - packages/domain/src/critters/**
  - packages/db/src/schema/critters.ts
  - packages/db/migrations/<ts>_critter_collection_encounters.sql
  - packages/db/test/permissions/{eggs,encounters,collection-entries,stickers,guide-skins,crew-collection-counts}.test.ts
  - services/api/src/commands/critters/**
  - services/api/test/critters/**
  - services/worker/src/jobs/critters/**
  - services/worker/src/jobs/rewards/{index,registry}.ts
  - services/worker/src/jobs/reminders/{conditional,conditions}.ts (conditional-reminder files only; P25 owns the `reminders` table and its other jobs)
  - services/worker/src/jobs/critters/crew-counts.ts
  - services/worker/test/critters/**
  - apps/mobile/src/app/(tabs)/pass.tsx
  - apps/mobile/src/app/critters/**
  - apps/mobile/src/app/(trip)/encounter/**
  - apps/mobile/src/app/(modal)/hatch/**
  - apps/mobile/src/features/critters/** (except quests/ and stickers/, owned by phase 41)
  - packages/i18n/locales/en/critters/**
  - e2e/critters/** (except sticker-lab.yaml from phase 5, quests*.yaml from phase 41)
  - tools/scripts/gpx/critters/**
---
# Phase 40 — Critters: hatch, Critterdex, encounters, legendaries

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D2, D12, D13; C4 (setGroup vs rarity), C19 (dwell = eligibility, hold optional, grace + slow drain), C20 (Golden Tokek), C21 (true silhouettes, names server-side), C22 (counts), C36 (crew visibility), C38 (stickers not in dex), C39 (home set + explore-at-home opt-in), C40 (spawn kinds, epic pose + pink edge) |
| `docs/system-architecture.md` | §4 commands/reads/realtime/jobs/push; native modules; authz |
| `docs/code-standards.md` | motion, a11y, DB, native, testing, Definition of Done |
| `docs/data-model.md` | §3.9 `critter_sets`, `critters`, `critter_forms`, `spawn_rules`, `eggs`, `encounters`, `encounter_samples`, `collection_entries`, `stickers`, `visits`, `reminders`; §3.10 `stamps` |
| `docs/data-model-sync-and-privacy.md` | §3.4 Encounter state machine; trip `pre_trip → in_trip` (egg hatch); streams `me`, `crew_people`, `trip`, `catalog`, `trip_pack`; realtime rules; retention (`encounter_samples` 7 d, evidence 30 d) |
| `docs/api-contracts.md` | §3 `LOCATION_IMPLAUSIBLE`, `ATTESTATION_FAILED`; §4.13 `hatch_egg`, `start_encounter`, `report_encounter_samples`, `befriend_critter`, `set_legendary_reminder` |
| `docs/api-contracts-async.md` | `crew_collection:{crew_id}`, `trip_copresence:{trip_id}`; queues `critter.verify`, `reward.fanout`, `flight.event` (landed → `hatch_egg`), `season.ingest`, `reminders.conditional`; N-15, N-30, N-49; LA `CritterNearby` (phase 48); App Group `assets/critters/*` |
| `docs/design-system.md` | rarity colours (rare recolour, epic orange + pink edge, legendary gold die-cut), motion presets (slap, thud, burst, fly-to-slot) |
| Phases | P4/P5 renderer + `ui/sticker` + share images; P6 feedback bus/SFX/haptics; P9 attestation (`apps/mobile/src/lib/attestation.ts`); P14 POIs + geofences; P15 `crowd_forecasts`, season windows; P18 critter content + `spawn_rules` + `critter_public`; P20 `cp-location` consumer API `subscribe('encounter')`, visits, anti-spoof flags; P25 `reminders`; P31 stages; P34 flight tracking/boarding; P31 3f-5 slide-to-board (emits `participant.boarded`; this phase only consumes it — 3f-5 is not built here) |
| Reports | `design-analysis-260926-1143-critters-after-report.md` §2 (3l-1…3l-10), §4, §5, §7 risks 2/5, §8 Q2/Q15/Q16; `design-analysis-260926-1143-critter-render-engine-report.md`; `researcher-260926-1143-native-platform-monetization-report.md` location/camera rows; master §2 F-122…F-128, §6.1 location/camera rows, R5, R10, AI-33 |
| Renders | `docs/design-renders/screens/{3f-5_Slide_to_board,3l-1_Egg_hatch,3l-2_Your_pass,3l-3_Critter_detail,3l-4_Encounter,3l-5_It_wandered_off,3l-6_Befriended,3l-8_Vietnam_set,3l-9_Once_a_year,3l-10_Sakura_Pon,5a-4_Critter_nearby}.png` |

## Overview

Goal: the collectible loop that only works by physically being there. Every traveller gets an egg at boarding that hatches on landing; locals appear at real spots and are befriended by dwelling 50 m nearby (ring fills in background when permitted, optional hold ceremony in camera); the PASS tab Critterdex shows sets, counts, true silhouettes and legendary windows; crews unlock a co-presence legendary together. All evaluation runs offline on device, and the server verifies signed evidence before an entry becomes permanent.
Done when: a GPX replay at a seeded POI on iOS and Android produces `accruing → ready → befriended → verified` with a `collection_entries` row, mock-location replay is revoked, the dex/detail/legendary screens match renders, and all permission, unit, API and Maestro suites below pass.

## Requirements

### F-122 Egg + arrival hatch (3f-5, 3l-1)
| Item | Behaviour |
|---|---|
| Grant | On `participant.boarded` (emitted by P31 slide-to-board 3f-5) → system `grant_egg` (doc delta) creates one `eggs` row per (user, trip); form = destination guide's common form (content `starter_form_id` per destination, else set rank-1 common). 3f-5 and its egg drop are built by P31 (consumer-only here); it reads `eggs` via `me` stream |
| Hatch triggers | first of: `flight.event{landed}` (P34) for the member's flight (`hatch_egg{trigger:landed}`, S); device arrival geofence at destination (`hatch_egg{trigger:arrived}`, self, P20 region event); manual "Hatch it" button once trip is `in_trip` and member's local date ≥ start date (undesigned; design in code) |
| Hatch result | `eggs.hatched_at`, `collection_entries(source='hatch', verification='verified')`; N-15 "landed" push (hatched copy); music theme switches to guide theme (P6 music engine) |
| Motion 3l-1 | wobble → crack → pop, confetti at crack, critter lands with squash + stretch; plays once (loops only in dev lab); Reduce Motion: cross-fade + haptic + SFX kept |
| States (design in code) | egg waiting (pre-landing card on PASS + trip hub), hatch offline (queued `hatch_egg`, animation plays; entry pending), multi-leg trips (hatch on final-leg landing), dropout (no egg if RSVP out), already-hatched on another device (idempotent) |

### F-123 Critterdex / PASS tab + sets (3l-2, 3l-8)
| Item | Behaviour |
|---|---|
| Order | here-now card (destination you are in) on top → legendary falling on your dates → home set (C39) → every place set by `critter_sets.rank` |
| Counts (C22) | dex = distinct critters found ("9/150"); forms counted separately (4 corner dots per critter lit in tier colour); set bar fills one segment per critter; avatar grid = owned forms |
| Silhouettes (C21) | true silhouettes from P5 bake; locked slots show the city/spot, never the name (`critter_public` nulls names until a `collection_entries` row exists); legendary silhouettes gold not grey; locked slots breathe (`pulse` low amplitude) |
| Filters | ALL / FOUND / NEAR ME (NEAR ME = spawn rules within 5 km of last coarse position or current trip destination; works offline from `trip_pack`) + search by place (undesigned) |
| Crew | "Maya has 14": crew counts from the worker-maintained `crew_collection_counts` table (PowerSync cannot replicate views; rows for members with `hide_collection` are deleted server-side, never synced); `crew_collection` realtime `critter.befriended`, `first_spotter` hints |
| Motion | new forms fly in from encounter and land in slot with thump; scroll perf: FlashList, cached sticker images (P5) |
| Hint line | AI-33 template "where it lives, never its name" (rules engine, no LLM call at runtime) |
| Home set (C39) | country of home airport; collecting at home requires explicit foreground-only "Explore at home" toggle (doc delta: `user_settings.explore_at_home`) |
| Sticker shelf | slot rendered by phase 41 component outside the dex grid (C38) |

### F-124 Critter detail (3l-3)
- Card flips from the pass; tapping a found form spins sticker and recolours card (rare colour, epic pose + pink edge at every size, legendary gold); locked forms shake + `requirement_copy`.
- Make-it-my-guide: owned form becomes the skin of the guide sticker everywhere the guide appears (chat, hub, LA via App Group avatar render); `set_guide_skin{guide_id, form_id}` (doc delta) requires owned form; guide colour stays canonical (C5).
- Share: P5 `ShareImageSheet` critter card (post + 9:16), OG via P51; names shown only for found forms.
- Stats: found date, place (POI name from curated DB), trip, first-in-crew badge.

### F-125 Encounter engine (3l-4, 3l-5, 5a-4)
| Item | Behaviour |
|---|---|
| Spawn rules (C40) | `presence` (at POI), `any_of` (e.g. "three water temples" copy "At a water temple"), `set_count` (n forms of set), `window` (calendar / solar `after_dark` / `by_sunrise` computed on device per POI), `co_presence` (F-128) |
| Eligibility | inside 50 m (rule `geofences.radius_m`) with accuracy ≤ 35 m; dwell accrues to `dwell_s`; hysteresis exit = radius + max(20 m, accuracy); background accrual when Always granted (P20 CLMonitor/FGS), foreground session otherwise |
| Drain (C19) | leave radius → 90 s grace (no loss) → slow drain at ⅓ fill rate → `wandered_off` at 0; return during drain resumes; all constants server config (`ops_config.encounter`) |
| Offline | rules + windows + forms in `trip_pack`; engine runs without network; commands queued (O) via PowerSync upload; local entry shows "pending" |
| Evidence | per encounter: dwell aggregates (count, mean accuracy, max speed, duration), samples hash, mock flags (iOS `isSimulatedBySoftware`/`isProducedByAccessory`, Android `isMock`), device clock vs server skew; never raw fixes (C25). Offline-safe signing: at capture the evidence hash is signed locally by an attested device key — iOS App Attest `generateAssertion` (key attested online at install by P9; assertion needs no network), Android hardware-backed Keystore key whose attestation chain was registered online by P9. At upload the client adds a fresh Play Integrity token (request hash = evidence hash) on Android; no token (offline too long, API error) → `attestation: unavailable`, not failed. `encounter_samples` = per-sample `{encounter_id, at, distance_band (0–10/10–25/25–50/50+ m), accuracy_m, speed_mps}` — NO lat/lng columns |
| Verify | `critter.verify` job: speed/teleport vs previous verified encounters + flight continuity (P34 flights), device-key signature check + attestation (unavailable = soft signal), mock flags, skew → `verified` (creates `collection_entries`, `critter.befriended` event) or `revoked` (UX "This one slipped away", entry removed) |
| Rotation | spawn rotation per POI per day seeded (trip_id, date) so the crew sees the same local; one active encounter at a time |
| Battery | high accuracy only inside 150 m of an eligible spawn (P20 policy) |
| Undesigned states | approximate location only ("Critters need precise location near spots" + temporary full accuracy), permission denied, indoors low accuracy, trip not started, home without opt-in, rule window closed mid-dwell, revoked evidence |

### F-126 Encounter UI (3l-4, 3l-5, 3l-6, 3l-10)
| Item | Behaviour |
|---|---|
| Scene | vision-camera preview with Skia critter overlay hopping between spots and edging closer as dwell grows; camera denied/unavailable → illustrated scene (same logic, no camera) |
| Hold ceremony | press-and-hold ring fills 1500 ms linear (`spawn_rules.hold_ms`; legendary slower, gold ring), release drains 450 ms, ring scales .94 on press, critter scales 1→1.3; complete → thud + confetti(40) + 300 ms burst to 3l-6 |
| Accessible alternative (C19) | when `ready`, "Befriend" button (VoiceOver/TalkBack action); Switch Control friendly; no hold required |
| Wandered off 3l-5 | critter hops to frame edge, looks back, footprints; card offers next quiet window from P15 `crowd_forecasts` + "Remind me" (`reminders target_kind=quiet_window`) instead of retry; fallback copy when no forecast; offer "add to plan" when window fits |
| Befriended 3l-6 | rays rotate, sticker slaps with spin, confetti, XP chip counts up (form `xp` from catalog; ledger write is phase 41), ADD TO YOUR PASS flies sticker to its slot (shared-element to PASS) |
| Legendary 3l-10 | per-legendary scene layer (petals, lanterns sway), gold die-cut edge, sparkles pulse, slower gold ring |
| Nearby | 5a-4 LA is phase 48; this phase exposes `encounterEngine.state$` + writes `assets/critters/*` silhouette stage keys to App Group |

### F-127 Legendary windows + reminders (3l-9, 3l-10)
- 12-month calendar strip: months with a legendary glint gold; month overlapping your next trip filled; gold silhouettes; windows from `spawn_rules.windows` (incl. solar rules) refreshed by `season.ingest` (P15).
- REMIND ME → `set_legendary_reminder{window_id,on}` → `reminders` a month before each window (fire in user tz); `reminders.conditional` fires N-30 only if condition holds (window still active; not already found). Reschedule on `season.ingest` changes.
- States (design in code): no upcoming trip, window passed, notifications denied (in-app inbox only), reminder already set.

### F-128 Crew co-presence legendary (3l-3, 3l-7, 3l-9)
- `spawn_rules.kind=co_presence`: all `min_members` (default all `in` participants) at the spot inside the time window.
- Each member's device runs a normal encounter; server groups verified evidence per (rule, trip, window) and grants only when all required members have overlapping verified dwell (overlap ≥ 60 s); grant to all in one `reward.fanout` with same server ts.
- `trip_copresence:{trip_id}` shows "3 of 6 here" counts only, never coordinates; dropouts excluded from N; organiser sees who is missing by name (crew-visible participation, not location).

### Cross-cutting
- Entitlements: all free (no gates).
- Multiplayer: crew counts, first spotter, co-presence; Centrifugo hints, rows via PowerSync.
- i18n: `packages/i18n/locales/en/critters/*.po`; a11y: every animation has Reduce Motion parity; silhouettes have labels "Unknown local at {place}".
- Android parity: same RN UI; native via P20 `cp-location` (FGS) and P9 Play Integrity.

## Architecture & contracts

| Area | Delta |
|---|---|
| Tables | create `eggs`, `encounters`, `encounter_samples`, `collection_entries`, `stickers` per data-model §3.9; table `crew_collection_counts(crew_id, user_id, critters, forms, updated_at)` written only by `app_system` (worker job `crew-counts` on `critter.befriended`, `critter.revoked`, `hide_collection` change; rows deleted when hidden) **(doc delta: replaces the view — views cannot be replicated by PowerSync)**; `encounter_samples` columns fixed to `distance_band, accuracy_m, speed_mps, at` (no coordinates); expand `trip_participants.egg_id`; doc delta: move `guide_skins` creation to this phase (P45 consumes); doc delta: `user_settings.explore_at_home bool default false` |
| RLS backstop | `eggs`/`encounters`/`collection_entries`: owner read; trip members read hatch status only (column-limited sync query on the `eggs` table; no view in the publication); writes only via `app_system` in handlers except `encounters` insert by owner; `encounter_samples` no `app_user` access; `guide_reader` sees none of `encounters.evidence` |
| Sync | `me`: eggs, encounters (no evidence), collection_entries, stickers, guide_skins; `crew_people`: `crew_collection_counts`; `trip`: eggs hatch status; `catalog`: sets/forms/`critter_public`; `trip_pack`: spawn_rules for destination. Evidence excluded from publication |
| Commands | `grant_egg{trip_id,uid}` S (doc delta), `hatch_egg`, `start_encounter`, `report_encounter_samples`, `befriend_critter`, `set_legendary_reminder`, `set_guide_skin` A,O (doc delta), `set_explore_at_home` A,O (doc delta); all idempotent by `op_id` |
| Events | `egg.granted`, `egg.hatched`, `encounter.started`, `critter.befriended`, `critter.revoked`, `copresence.completed` |
| Jobs | `critter.verify` (encounter id), `reward.fanout` (handler registry `services/worker/src/jobs/rewards/registry.ts`; P41 registers XP, P45 icon unlocks, P43 stamps if needed), `reminders.conditional`, consumer of `participant.boarded` → `grant_egg`, consumer of `flight.event{landed}` → `hatch_egg`, `critter.crew_counts` (maintains `crew_collection_counts`), `copresence.evaluate` (per rule/window; doc delta) |
| Realtime | `crew_collection:{crew_id}` `critter.befriended`, `sighting`, `first_spotter`; `trip_copresence:{trip_id}` `{rule_id, here, needed}` |
| Push | N-15 hatch, N-30 legendary reminder, N-49 befriended (crew, governed by `notification_prefs.critters_nearby`) |
| Native | none new: consumes `cp-location`, `cp-app-group`, vision-camera, P9 attestation |

## Tasks

### T1 — Domain: spawn evaluator, encounter machine, dex counts
- Goal: pure-TS rules shared by app and worker.
- Files: `packages/domain/src/critters/{spawn-rules.ts,encounter-machine.ts,solar.ts,dex-counts.ts,home-set.ts,config.ts,index.ts}`, `packages/domain/test/critters/*.test.ts`
- Steps: 1. zod schemas for five spawn kinds + windows. 2. Encounter reducer `(state, event{fix|tick|hold|leave}) → state` with hysteresis, accuracy gate, grace, drain, ready, wandered_off. 3. Solar sunrise/sunset per lat/lng/date (NOAA algorithm, no network). 4. Count derivations (C22) and home set (C39). 5. Defaults in `config.ts` overridable by server config.
- Tests: `pnpm --filter @cp/domain test -- critters`
- Done when: table-driven tests cover every §3.4 transition, grace/drain timing, solar within ±2 min of reference tables, and counts for fixtures.
- Status: done — b2753e1ef

### T2 — Schema, RLS backstop, publication
- Goal: critter collection tables with permission contract tests.
- Files: `packages/db/src/schema/critters.ts`, `packages/db/migrations/<ts>_critter_collection_encounters.sql`, `packages/db/test/permissions/{eggs,encounters,collection-entries,stickers,guide-skins,crew-collection-counts}.test.ts`
- Steps: 1. Drizzle tables + indexes per §3.9 (+ `guide_skins`, `trip_participants.egg_id`, `user_settings.explore_at_home`). 2. RLS policies + grants for `app_user`, `app_system`, `guide_reader`, `powersync_repl` (evidence column excluded). 3. `crew_collection_counts` table (app_user read for crew members, no write). 4. Publication entries (counts table in `crew_people`; no views published). 5. Schema test: `encounter_samples` has no lat/lng/geometry column.
- Tests: `pnpm --filter @cp/db test -- permissions/eggs permissions/encounters permissions/collection-entries permissions/stickers permissions/guide-skins permissions/crew-collection-counts`; `pnpm tsx tools/scripts/check-publication.ts`
- Done when: non-owner cannot read evidence or others' entries; crew sees counts only; `hide_collection` hides counts; publication excludes evidence and lists no views; `encounter_samples` schema test proves no coordinate columns.
- Status: done — 77172eeaa

### T3 — Commands: egg, encounter, befriend, skin, settings
- Goal: server handlers for all critter commands.
- Files: `services/api/src/commands/critters/{grant-egg,hatch-egg,start-encounter,report-encounter-samples,befriend-critter,set-guide-skin,set-explore-at-home}.ts`, `services/api/test/critters/commands.test.ts`
- Steps: 1. Handlers with app-layer policy (participant, owned form, trip state). 2. `befriend_critter` stores evidence, sets `verification=pending`, enqueues `critter.verify` in txn. 3. `hatch_egg` idempotent across triggers. 4. Domain events + `rt_outbox` rows.
- Tests: `pnpm --filter @cp/api test -- critters`
- Done when: replayed `op_id` is a no-op; offline-order batch via `/sync/upload` yields the same end state; rejects return 2xx + `cmd_results`.
- Status: done — 8ad2efc34

### T4 — Verification, rewards fan-out, hatch triggers
- Goal: server truth for encounters and hatches.
- Files: `services/worker/src/jobs/critters/{verify,grant-on-boarded,hatch-on-landed,crew-hints,crew-counts}.ts`, `services/worker/src/jobs/rewards/{index,registry}.ts`, `services/worker/test/critters/verify.test.ts`
- Steps: 1. Plausibility scoring (speed, teleport vs flights, attestation, mock, skew) with thresholds in config. 2. verify → `collection_entries` + `critter.befriended`; revoke → remove pending entry + `critter.revoked`. 3. `reward.fanout` registry with same-ts grant. 4. `participant.boarded` consumer → `grant_egg`; `flight.event{landed}` consumer → `hatch_egg`. 5. `crew_collection` hints + first-spotter. 6. `crew-counts` job maintaining `crew_collection_counts`.
- Tests: `pnpm --filter @cp/worker test -- critters`
- Done when: fixtures with mock flag, bad device-key signature or 900 km/h hop are revoked; clean fixtures verified (also with `attestation: unavailable`); boarded event grants one egg; landed webhook fixture hatches every crew member on that flight once; counts row updates on befriend/revoke and disappears when `hide_collection` is on.
- Status: done — bf55802cf

### T5 — Legendary windows, reminders, co-presence
- Goal: F-127 and F-128 server side.
- Files: `services/api/src/commands/critters/set-legendary-reminder.ts`, `services/worker/src/jobs/reminders/{conditional,conditions}.ts`, `services/worker/src/jobs/critters/{copresence,season-reschedule}.ts`, `services/worker/test/critters/{reminders,copresence}.test.ts`
- Steps: 1. Reminder scheduling a month before window in user tz; conditions registry (`window_active_not_found`, `quiet_window`, `crew_planning_again` used by phase 43). 2. Reschedule on `season.ingest` output. 3. Co-presence grouping + overlap check + grant to all + `trip_copresence` counts.
- Tests: `pnpm --filter @cp/worker test -- critters/reminders critters/copresence`
- Done when: 6-member fixture grants all six with identical `found_at`; 5-of-6 grants none; reminder fires only when condition holds.
- Status: done — 4ae305db3

### T6 — Client encounter engine (offline)
- Goal: device-side engine driving UI, commands and App Group.
- Files: `apps/mobile/src/features/critters/engine/{engine.ts,evidence.ts,spawn-feed.ts,use-encounter.ts}`, `apps/mobile/src/features/critters/engine/__tests__/*.test.ts`, `tools/scripts/gpx/critters/{temple-dwell,walk-off-return,mock-teleport}.gpx`
- Steps: 1. Subscribe `cp-location` `encounter` kind; feed domain reducer. 2. Load spawn rules from local PowerSync `trip_pack`; rotation seed. 3. Build evidence bundle (aggregates + local device-key signature via `lib/attestation`; Play Integrity token added at upload time, missing → `unavailable`). 4. Queue `start_encounter`/`report_encounter_samples`/`befriend_critter`. 5. Write silhouette stage + distance band to App Group for LA/widgets.
- Tests: `pnpm --filter @cp/mobile test -- features/critters/engine`
- Done when: GPX fixtures replayed in Jest produce expected states and queued commands with no network; no raw fixes leave the device.
- Status: done — 1d96ae784

### T7 — Hatch + PASS tab Critterdex
- Goal: 3l-1, 3l-2, 3l-8.
- Files: `apps/mobile/src/app/(modal)/hatch/[tripId].tsx`, `apps/mobile/src/app/(tabs)/pass.tsx`, `apps/mobile/src/app/critters/set/[setId].tsx`, `apps/mobile/src/features/critters/{hatch,dex}/**`, `packages/i18n/locales/en/critters/{hatch,dex}.po`
- Steps: 1. Hatch choreography (P6 patterns) + egg-waiting card + manual hatch. 2. Dex sections order, set rows, corner dots, bar, breathing locked slots, gold legendary silhouettes, filters + search. 3. Crew counts + realtime hints. 4. Home set + explore-at-home toggle. 5. Fly-in landing slot.
- Tests: `pnpm --filter @cp/mobile test -- features/critters/hatch features/critters/dex`
- Done when: RNTL snapshots per state (empty, waiting egg, hatched, filters, hidden crew counts) pass and names never render for unfound critters.
- Status: done — a9b73e1ef

### T8 — Critter detail, make-it-my-guide, share
- Goal: 3l-3.
- Files: `apps/mobile/src/app/critters/[critterId].tsx`, `apps/mobile/src/features/critters/detail/**`, `services/api/src/commands/critters/set-guide-skin.ts` (from T3, wiring only), `packages/i18n/locales/en/critters/detail.po`
- Steps: 1. Flip-in, form spin + recolour, locked shake + requirement copy. 2. Make-it-my-guide with confirm + revert; triggers avatar render for surfaces. 3. Share via `ui/share-image`.
- Tests: `pnpm --filter @cp/mobile test -- features/critters/detail`
- Done when: tapping each owned form changes skin across guide chat header in a test harness; locked forms cannot be set.
- Status: done — 4a864bb51

### T9 — Encounter camera UI, hold ceremony, wandered-off, befriended
- Goal: 3l-4, 3l-5, 3l-6, 3l-10.
- Files: `apps/mobile/src/app/(trip)/encounter/[id].tsx`, `apps/mobile/src/features/critters/encounter/**`, `packages/i18n/locales/en/critters/encounter.po`
- Steps: 1. vision-camera scene + Skia overlay; illustrated fallback. 2. Hold ring (Gesture Handler 3 + Reanimated) with timings above; accessible Befriend action. 3. Wandered-off card with quiet window + reminder. 4. Befriended ceremony + XP chip + fly-to-pass. 5. Legendary scene layers.
- Tests: `pnpm --filter @cp/mobile test -- features/critters/encounter`
- Done when: hold completes only when state `ready`; accessibility action path befriends without hold; Reduce Motion variant renders final frames.
- Status: done — 0e260c322

### T10 — Legendary calendar + co-presence UI
- Goal: 3l-9 + co-presence progress.
- Files: `apps/mobile/src/app/critters/legendaries.tsx`, `apps/mobile/src/features/critters/{legendary,copresence}/**`, `packages/i18n/locales/en/critters/legendary.po`
- Steps: 1. 12-month strip with gold glint, trip-overlap fill, reminder toggles. 2. Co-presence card "3 of 6 here" from `trip_copresence`, who-is-missing list, simultaneous reveal on grant.
- Tests: `pnpm --filter @cp/mobile test -- features/critters/legendary features/critters/copresence`
- Done when: reminder toggle queues `set_legendary_reminder` offline; co-presence card updates from a mocked Centrifugo client in tests without coordinates in payloads.
- Status: done — 67bd69253

### T11 — End-to-end flows
- Goal: Maestro coverage on both platforms.
- Files: `e2e/critters/{hatch,dex-filters,encounter-dwell,encounter-wander,encounter-accessible,legendary-reminder,copresence}.yaml`, `services/api/test/critters/e2e-sync.test.ts`
- Steps: 1. Simulator/emulator GPX injection per flow. 2. Seeded content fixture (P18 test release). 3. Sync e2e: offline befriend → upload → verified.
- Tests: `maestro test e2e/critters`; `pnpm --filter @cp/api test -- critters/e2e-sync`
- Done when: all flows pass on iOS 26 simulator and Android API 36 emulator.
- Status: blocked — lab and functional flows plus e2e/happy/critters.yaml are in (3d72fb627, d60714f92); the GPX-driven encounter flows need a staging trip seed with spawn rules at a real POI, and the api e2e-sync suite belongs to the server side

## Phase acceptance criteria
- [ ] Every §3.4 encounter transition covered by domain tests; grace/drain constants come from server config
- [ ] Permission tests prove evidence and other users' entries are unreadable; crew sees counts only
- [ ] Offline befriend replays idempotently and verifies server-side; mock/teleport fixtures are revoked with "slipped away" UX
- [ ] Egg hatches exactly once per member via landed, arrival or manual trigger
- [ ] Names of unfound critters never reach the client (`critter_public`), silhouettes are true silhouettes
- [ ] Co-presence grants all members with identical server timestamp; payloads carry counts, no coordinates
- [ ] Accessible befriend path works with VoiceOver/TalkBack; Reduce Motion parity for hatch, encounter, befriended
- [ ] Maestro `e2e/critters` passes on iOS and Android

## Risks & rollback
| Risk | Mitigation / rollback |
|---|---|
| GPS jitter causes false wander-off | hysteresis + accuracy gate + 90 s grace; constants server-tunable without release |
| False-positive spoof revokes | revoke only on hard signals (mock flag, attestation fail, impossible speed); soft signals flag for ops review in P17 console |
| Background location denied/rejected in review | foreground session default; encounter works with app open |
| Battery | high accuracy only within 150 m; measured in P20 budget |
| Camera unavailable | illustrated scene, same logic |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| All critter forms, spawn rules, legendary windows (P18 content factory, founder approval) | seed release for tests; launch blocked until approved release is published |
| App Attest / Play Integrity setup (P9) | verification uses mock flags + plausibility only; attestation marked `unavailable` (not failed) |
| Critter-name trademark check (legal) | names ship as approved by counsel |
| Background location store declarations (P20) | foreground-only encounters |

## Open questions
1. `grant_egg`, `set_guide_skin`, `set_explore_at_home`, `copresence.evaluate`, `user_settings.explore_at_home` and moving `guide_skins` here are doc deltas — default: add to `docs/api-contracts.md` §4.13 and `docs/data-model.md` §3.9 in T2/T3.
2. Grace/drain values (C19 gives shape only) — default 90 s grace, ⅓ drain rate, accuracy gate 35 m.
3. Egg form choice — default destination guide's common form; content can override per destination.
4. Co-presence N when members drop out mid-trip — default: participants with `rsvp=in` and landed.
5. Manual hatch abuse — default: allowed only when trip `in_trip` and member's local date ≥ start date.
6. plan.md delta: depends_on adds 6, 9, 14, 15, 25 (all earlier waves; wave unchanged). Doc delta: `crew_collection_counts` becomes a table; `encounter_samples` columns; `participant.boarded` is the only boarding event.
