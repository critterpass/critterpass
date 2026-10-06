---
phase: 39
title: Crew live map
status: in_progress
depends_on: [12, 14, 20]
wave: 7
features: [F-051]
screens: [3g-4]
tasks: 6
owns:
  - infra/powersync/streams/live-map.yaml
  - packages/domain/src/live-map/**
  - packages/db/src/schema/meetups.ts
  - packages/db/migrations/*_meetups_and_crew_map_gate.sql
  - packages/db/test/permissions/{meetups,crew-map-gate}.test.ts
  - services/api/src/commands/live-map/**
  - services/api/src/routes/live-map.ts
  - services/api/src/routes/loc.ts (phase-20 file; single-line edit only: channel constant `trip_live:` → `trip_locations:`)
  - services/api/test/live-map/**
  - services/worker/src/jobs/live-map/**
  - apps/mobile/src/app/(trip)/map/**
  - apps/mobile/src/features/crew/live-map/**
  - packages/i18n/locales/en/crew/live-map.po
  - e2e/crew/live-map/**
  - tools/scripts/live-map-sim/**
---
# Phase 39 — Crew live map

> **Status, 6 Oct 2026:** open: T6, the moving-crewmate flows (runner orchestration for `tools/scripts/live-map-sim/sim.ts` and a Developer tools seed for the boosted and unboosted trips).

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D4 (Centrifugo, pg-boss), D6 (MapLibre, Valhalla, Mapbox traffic), D7 (Boost), D13 (WIU default, no trails stored), C8 (Boost scope), C9 (FTF), C10 (leave-by pips free, meet-up LA Boost), C11/C45 (Help/SOS map free — not this phase), C46 (Boost window); §4 row "Crew live map background positions"; Q-5C |
| `docs/system-architecture.md` | §4.3 realtime, §4.4 jobs, §5 authz, §7.a crew live map sequence, §9 perf budgets |
| `docs/data-model.md` | §3.12 `location_shares`, `location_fixes`, `member_etas`, `meetups`; §3.14 entitlements |
| `docs/data-model-sync-and-privacy.md` | §1 (`location_fixes` C3), §4 `trip` stream, §5 realtime rules, §6 retention, §7 row 39 |
| `docs/api-contracts.md` | §4.12 `set_location_share`, `report_location_fixes`, `create_meetup`/`move_meetup`, `ping_all`; §5.5 `/v1/routes/eta` |
| `docs/api-contracts-async.md` | §1.2 `trip_locations:{trip_id}`; §2.3 `eta.meetups`, `location.expire`; N-23, N-47 |
| `docs/design-system.md` | map pins, avatar stack, odometer, blink/hop/ping presets |
| Phase files | `phase-20-permissions-location-visits.md` (location engine, `POST /v1/loc`, fixes TTL, share publisher), `phase-14-places-maps-routing.md` (map kit, Valhalla, Mapbox), `phase-12-entitlements-money-fx.md` (`boostActive`) |
| Reports | `design-analysis-260926-1143-plan-proposal-crew-report.md` §2 "3g-4 Crew map", F16; master §2 F-051, F-165, F-174, §4 location row, risk R5 (background location) |
| Renders | `docs/design-renders/screens/3g-4_Crew_map.png`, `4f-2_Live_map_teaser.png` (gate target, built by phase 46), `5a-2_Crew_live.png` (LA, phase 48) |

## Overview

Goal: during trip days a boosted crew (or First Trip Free) sees every sharing member live on the hand-drawn map: gliding pins that bunch when together, ephemeral trails while riding, a meet-up pin with ETAs recounted each minute, PING ALL and I'M ON MY WAY, pause and automatic switch-off at last-day midnight.

Done when: 3 simulated members (Node harness) publish fixes, the app shows gliding and bunching pins; ETAs refresh every 60 s from Valhalla; the meet-up pin pulses once all are under 5 min; unboosted trips cannot subscribe to `trip_locations` or read `member_etas` (permission tests); a share ends by itself at last-day midnight in the destination tz and the server unsubscribes clients.

## Requirements

### F-051 Crew live map (3g-4)

| Item | Behaviour |
|---|---|
| Header pill | "← CHAT" back (to crew chat when entered from there, else back stack), crew name, "{n} of {m} sharing · trip days only", LIVE dot blink 1400 ms (grey + "PAUSED" when own share paused) |
| Sharing window | Only on trip days (`trip.phase = in_trip`); starts when member turns on (first-open primer), ends last-day 23:59:59 destination tz; footer "Sharing switches itself off on {date} at midnight." |
| Pause/resume | Own row chip "PAUSE" / "RESUME" (undesigned control, design in code); others see "Paused sharing at {HH:mm}" with ETA "–"; pause stops publishing fixes immediately and removes own pin from others (server publishes `share.paused`; `live-snapshot` excludes paused shares, so reconnecting viewers never see the last fix) |
| Pins | Dark capsule, member-colour border, avatar + name + status ("Leaving Karsa Spa", "Finishing lunch, 900 m", "On the scooter · 2 km"); pins glide between fixes (Reanimated interpolation over fix interval, max 1.5 s; reduced motion = jump) |
| Bunching | Members within 60 m (and within 2 min of each other's fix) merge into one pill "MAYA + RIN · Karsa Spa" with spring merge/split; >3 = "+n" avatar stack |
| Trails | Only while moving fast (activity automotive/cycling or speed > 4 m/s); last ≤ 5 min of points held in memory on each viewer's device, drawn as dotted line, fades out 30 s after stop; never persisted, never sent back to server (D13) |
| You | Blue you-dot with ping ring; dashed route to meet-up (Valhalla, mode by own activity) |
| Meet-up | Yellow star pin "{POI} / MEET {HH:mm}"; guide sticker hops nearby (hop preset); pin pulses (ping preset) once every sharing member ETA < 5 min; "Arrived" per member via 75 m arrival radius |
| Bottom panel | "MEET-UP · {time}", place, MOVE IT; row per person/cluster: avatar(s), name, status, ETA clock "16:52"; ETAs recount every minute with odometer roll |
| Actions | Tap pin → pop + detail sheet (status, last seen, CALL if number visible per Q-5C); drag meet-up pin or MOVE IT → place picker (POI snap via `places_search`) → `move_meetup` (N-47 to sharing crew, ETAs recomputed); PING ALL → `ping_all{ping}` toast "Pinged everyone: {place} at {time}." (N-23); I'M ON MY WAY → `ping_all{on_my_way}` + own ETA shared, toast "The crew can see you coming. {n} minutes." |
| Status text | Deterministic template from activity (still/walking/cycling/automotive → "On the scooter" when trip transport tag is scooter) + nearest POI name within 80 m + distance to meet-up; no LLM |
| Entitlement | `boostActive(t)` (Boost or FTF, C8/C9, window C46); unboosted → gate state routing to the paywall entry `live_map` (teaser 4f-2 is phase 46); leave-by pips stay free (C10, phase 36) |
| Lock screen | "Put this on the lock screen" row starts the crew meet-up Live Activity via the `cp-live-activity` API (phase 48 builds the LA; this phase exposes `useMeetupSnapshot()` data the LA uses) |
| Permissions | Uses phase-20 orchestrator: WIU session default; "Always" upgrade offered only from this screen's banner "Keep sharing when your phone is locked"; denied → own row "Location off · Settings" and map still shows others |

### Undesigned states (design in code with the design system)
Permission denied / WIU only while backgrounded (row "Updates when you open the app"), precise location off ("Approximate" chip + 1 km circle), stale fix (> 5 min: pin greyed, "Last seen 12 min ago"), no meet-up set (empty panel with "SET A MEET-UP" CTA → create flow), outside trip days (explanation card with the date sharing starts), offline (last-known pins with "Offline · last update HH:mm", actions queued except PING ALL which needs network), Low Power Mode (coarse, "Saving battery" chip), all arrived celebration (confetti-lite + "Everyone's here"), member left trip (pin removed, server unsubscribe), Boost ended mid-trip (map freezes with gate card; nobody's history kept).

## Architecture & contracts

| Kind | Delta |
|---|---|
| Migration `*_meetups_and_crew_map_gate.sql` | `meetups` per data-model §3.12 + `arrived jsonb` (uid → at) **(doc delta)**; SQL fn `app.crew_map_open_at(trip_id, at timestamptz)` (pure, EXECUTE revoked from `app_user`) and `app.crew_map_open(trip_id)` = `crew_map_open_at(trip_id, now())` — `boostActive` snapshot row valid at `at` ∧ trip in_trip ∧ `at` < last-day midnight tz; production SQL reads only `now()`, never a GUC; RLS: `meetups` T + `crew_map_open`; replace `member_etas` select policy (table owned by phase 20) to require `crew_map_open` for `reason=crew_map` rows |
| Publication | add `meetups` to `trip` stream (own file `infra/powersync/streams/live-map.yaml`, merged into `trip` by `build-config.ts`) |
| Commands (`services/api/src/commands/live-map/`) | `set_location_share{trip_id, status}` (reason crew_map; creates/ends `location_shares`; `ENTITLEMENT_REQUIRED` if gate closed), `pause_location_share{share_id, paused}` **(doc delta: add to api-contracts §4.12)**, `create_meetup`, `move_meetup`, `ping_all{kind}` — all idempotent by op_id, emit domain events + `rt_outbox` |
| HTTP | `GET /v1/trips/{id}/live-snapshot` (participant ∧ `crew_map_open`, else 403 `ENTITLEMENT_REQUIRED`) in `services/api/src/routes/live-map.ts` **(doc delta)** |
| Fixes | Reuse phase-20 `POST /v1/loc` (rate ≤1/5 s) → publishes to `trip_locations:{trip}`. Phase 20 names the channel `trip_live:`; canonical = `trip_locations:` (api-contracts-async §1.2). Phase 20 (wave 6) is done before this phase: T1 makes the single-line channel-constant edit in `services/api/src/routes/loc.ts` (owned here for that line only) and the phase-20 `member_etas` select policy is replaced by this phase's migration (phase 20's `member_etas` permission test stays the baseline; this phase's `crew-map-gate` test covers the override) |
| Centrifugo | `trip_locations:{trip}` subscribe proxy ACL = `is_participant(trip, uid) ∧ app.crew_map_open(trip)` — nothing else; own share state is irrelevant (viewers need not share to see); rule in `packages/domain/src/live-map/channel-acl.ts`, registered with the phase-10 subscribe-proxy registry; payloads `fixes[]`, `eta[]`, `meetup.*`, `ping`, `share.paused`; channel history OFF for positions (per-channel history cannot hold one fix per member nor delete a paused member's fix) — initial state and reconnect recovery come from `GET /v1/trips/{id}/live-snapshot` → `{members[{uid, lat, lng, acc, activity, at}], etas[], meetup}` built from the latest fix per active, non-paused share via `app.can_see_location` (same ACL as subscribe); server-side unsubscribe on share window end, Boost end, membership change |
| Jobs | `eta.meetups` (self-rescheduling 60 s per active meetup): latest fix per sharing member (via `app_system`) → Valhalla `sources_to_targets` (mode by activity) → upsert `member_etas` → publish `eta[]`; `live_map.all_close` event when all < 5 min (N-47 once per meetup); `location.expire` cron (registered here, handler ends crew_map shares at last-day midnight tz and publishes `share.ended`) |
| Push | N-23 (ALWAYS, action-initiated), N-47 (BUDGET) via phase-11 router; widget/LA pushes owned by phases 48/49 |
| Domain | `packages/domain/src/live-map/`: `bunch(fixes, 60 m)`, `trailPolicy`, `statusText(activity, poi, dist)`, `shareWindow(trip, tz)`, zod payloads for channel messages |

## Tasks

### T1 — Meet-ups schema, crew-map gate and permission tests
- Goal: tables + gate fn + RLS so only boosted, in-trip participants read live data.
- Files: `packages/db/src/schema/meetups.ts`, `packages/db/migrations/<ts>_meetups_and_crew_map_gate.sql`, `packages/db/test/permissions/{meetups,crew-map-gate}.test.ts`, `infra/powersync/streams/live-map.yaml`.
- Steps: 1. Drizzle schema + SQL (FORCE RLS, grants to app_user/app_system, none to guide_reader). 2. `app.crew_map_open_at(trip_id, at)` + `app.crew_map_open(trip_id)` SECURITY DEFINER (`SET search_path`), gate uses `now()` only. 3. Replace `member_etas` select policy. 4. Single-line channel-constant edit in `services/api/src/routes/loc.ts`. 5. Testcontainers matrix: participant boosted, participant unboosted, FTF trip, crew non-participant, outsider; window-end cases call `crew_map_open_at(trip, '<after midnight>')` as the test superuser (test-only; no clock GUC in production SQL); plus a test that `set_config('app.now', …)` as `app_user` leaves `crew_map_open` unchanged.
- Tests: `pnpm --filter @cp/db test -- permissions/meetups permissions/crew-map-gate`
- Done when: unboosted participant gets 0 rows from `member_etas`/`meetups`; boosted participant reads them; `crew_map_open_at` after window end returns false; setting any `app.*` GUC as `app_user` cannot reopen the gate; `app_user` cannot EXECUTE `crew_map_open_at`.
- Status: done — 83e7222 (meetups sync on boosted trips; the gate reads the boost snapshot, `in_trip` and last-day midnight; revocation runs in the same transaction for rsvp out, crew removal and Boost ending; `loc.ts` already used `trip_locations:` and now publishes fixes as a standard envelope)

### T2 — Live-map domain rules and commands
- Goal: pure rules + idempotent commands.
- Files: `packages/domain/src/live-map/{bunch,trail-policy,status-text,share-window,payloads,channel-acl,index}.ts` + `*.test.ts`, `services/api/src/commands/live-map/{set-location-share,pause-location-share,create-meetup,move-meetup,ping-all}.ts`, `services/api/src/routes/live-map.ts`, `services/api/test/live-map/{commands,subscribe-acl,live-snapshot}.test.ts`.
- Steps: 1. Implement rules with unit tests (tz edges: UTC+8 vs UTC−10, DST dest). 2. Handlers via phase-10 `defineCommand` with `entitle: boostActive(t)`; `set_location_share` creates share with `ends_at` = window end. 3. Events → `rt_outbox` + notification mapping (N-23, N-47). 4. Pause publishes `share.paused` (clients drop the pin) and the paused member is excluded from `live-snapshot`. 5. Channel ACL rule + `GET live-snapshot`.
- Tests: `pnpm --filter @cp/domain test -- live-map`; `pnpm --filter @cp/api test -- live-map`
- Done when: replayed op_id is a no-op; unboosted → `ENTITLEMENT_REQUIRED`; window end computed correctly for 6 destination tz fixtures; subscribe-proxy tests deny a participant when the gate is closed (unboosted) and after the window, allow a non-sharing participant when open, deny outsiders; reconnecting client gets every sharing member from `live-snapshot`, never a paused one.
- Status: done — 83e7222 (`GET /v1/trips/{id}/live-snapshot` answers 402 `ENTITLEMENT_REQUIRED` when unboosted and 403 `NOT_ELIGIBLE` outside trip days; turning sharing off and pausing never need the gate)

### T3 — ETA job, arrival, expiry and server unsubscribe
- Goal: 60 s ETAs, all-close pulse event, automatic switch-off.
- Files: `services/worker/src/jobs/live-map/{eta-meetups,location-expire,unsubscribe-on-change}.ts`, `services/worker/test/live-map/*.test.ts`, `tools/scripts/live-map-sim/{sim.ts,README.md}` (Node clients posting fixes along GPX routes via `POST /v1/loc`).
- Steps: 1. `eta.meetups` self-reschedules while meetup active and ≥1 share live; batch Valhalla matrix; mode from activity; upsert `member_etas`; publish `eta[]`. 2. Arrival (≤75 m) marks `arrived`; all-close event once. 3. `location.expire` cron ends shares at window end; `share.ended` + Centrifugo `unsubscribe` for non-eligible users; same on `boost.expired`, `member.left`. 4. Sim script drives 3 members through Ubud fixtures.
- Tests: `pnpm --filter @cp/worker test -- live-map`; `pnpm tsx tools/scripts/live-map-sim/sim.ts --check` against docker-compose stack.
- Done when: sim run shows ETAs updating every 60 ± 5 s, one N-47 on all-close, shares end at window end and a subscribed test client receives unsubscribe.
- Status: done — 83e7222 (straight-line "about" ETAs until `VALHALLA_URL` is set; `location.expire` is a per-share timer armed by `set_location_share`; `sim.ts --check` gaps 62.0/60.1/62.0 s)

### T4 — Crew map screen: pins, bunching, trails, meet-up
- Goal: 3g-4 as designed on iOS and Android.
- Files: `apps/mobile/src/app/(trip)/map/[tripId].tsx`, `apps/mobile/src/features/crew/live-map/{screen,member-pin,bunch-pill,trail-layer,meetup-pin,route-to-meetup,header-pill,use-live-fixes,use-member-etas,use-trails}.tsx|ts`, `packages/i18n/locales/en/crew/live-map.po`.
- Steps: 1. `CpMap` (phase 14) with custom style; load `live-snapshot` on mount and on every (re)subscribe, then apply `trip_locations` publications via `useChannel`. 2. Pin glide interpolation on UI thread; bunch/merge springs; reduced motion variants. 3. In-memory trail ring buffer (5 min), drawn only per `trailPolicy`. 4. Meet-up pin + guide hop + all-close ping. 5. Header, LIVE blink, stale/approximate/offline visuals.
- Tests: `pnpm --filter @cp/mobile test -- features/crew/live-map` (RNTL: bunch pill labels, stale state, a11y labels "Maya and Rin, Karsa Spa, 3 minutes away"); unit test that trail buffer never writes to storage (spy on MMKV/fs).
- Done when: RNTL + unit tests pass; the sim script visibly drives glides and a merge on both simulators (screenshots in PR).
- Status: done — 976536c (glide runs on the JS thread because MapLibre annotations take map coordinates; the line to the meet-up is straight because routing returns no geometry yet; device screenshots come from `(dev)/live-map` scenes, since the local simulator session can't reach seeded data)

### T5 — Bottom panel, actions, pause, gate and permission states
- Goal: interactive panel and every undesigned state.
- Files: `apps/mobile/src/features/crew/live-map/{panel,member-row,eta-clock,meetup-editor,ping-actions,pause-chip,gate-card,states/*}.tsx`, `apps/mobile/src/features/crew/live-map/use-meetup-snapshot.ts`.
- Steps: 1. Rows with odometer ETA recount per minute. 2. Meet-up create/move (drag pin with haptic tick, MOVE IT → place picker) → commands, optimistic with pending badge. 3. PING ALL / I'M ON MY WAY with island toast. 4. Pause/resume chip. 5. Gate card when `crew_map_open` false → paywall entry `live_map` (router contract phase 46). 6. Permission banner via phase-20 orchestrator; Always upgrade copy. 7. `useMeetupSnapshot()` exported for the LA.
- Tests: `pnpm --filter @cp/mobile test -- features/crew/live-map/panel`
- Done when: each state in "Undesigned states" has an RNTL test rendering its copy; offline queues meet-up move and replays.
- Status: done — 7f94c93 (the Boost gate has no button until the paywall registers its `live_map` entry; the lock-screen row appears once the Live Activity area registers)

### T6 — End-to-end flows
- Goal: prove the phase on devices.
- Files: `e2e/crew/live-map/{share-and-meetup.yaml,pause-resume.yaml,gate-unboosted.yaml,window-end.yaml}`, seed fixture in `tools/scripts/live-map-sim/seed.ts`.
- Steps: 1. Seed boosted + unboosted trips. 2. Maestro flows with simulated location (iOS `simctl location`, Android emulator geo fix) + sim peers. 3. Assert ETA text changes after 60 s, pause hides own pin for peer (via API check), gate card on unboosted.
- Tests: `maestro test e2e/crew/live-map/`
- Done when: 4 flows green on iOS 26 simulator and Android API 36 emulator in CI.
- Status: blocked — c466be7 flows written. A demo-seed scenario alone cannot drive them: they need crewmates that keep moving during the run (`tools/scripts/live-map-sim/sim.ts` posting fixes every 5 s with `--join` for the device's uid), the device's own location set (`simctl location` / emulator geo fix), a peer-side api check while paused, and the trip window fast-forwarded. That is runner orchestration in `.github/workflows/device.yml` and `tools/scripts/ci-device` (start the sim against staging once the flow has onboarded and reported its uid), plus a Developer tools entry that seeds the boosted and unboosted trips, which is app code. Checked on the iOS runner (https://github.com/critterpass/critterpass/actions/runs/36587461907): all four fail at their first `openLink` because nothing sets `${TRIP_ID}` / `${UNBOOSTED_TRIP_ID}`

## Phase acceptance criteria
- [ ] Permission tests prove unboosted/outsider/after-window cannot read `meetups`, `member_etas` or subscribe to `trip_locations`
- [ ] Fixes never persisted beyond phase-20 TTL; trails exist only in viewer memory (unit test)
- [ ] ETAs refresh every 60 s; odometer recount visible; meet-up pulse fires once all < 5 min
- [ ] Pause removes own pin for peers within 2 s; share auto-ends at last-day midnight tz with server unsubscribe
- [ ] PING ALL / ON MY WAY deliver N-23 as ALWAYS; meet-up move delivers N-47
- [ ] All undesigned states rendered and tested; a11y labels on pins and rows; reduced-motion variants
- [ ] Maestro flows green on both platforms

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Valhalla matrix cost at scale | batch per meetup, skip members with unchanged fix (<20 m); fall back to straight-line ETA labelled "about" |
| Background fixes throttled (WIU, OEM killers) | stale-state UI, Always upgrade from this screen only, Android FGS type location from phase 20 |
| Channel ACL bug leaks positions | permission + subscribe-proxy tests are the merge gate; kill switch `ops_config.crew_map_enabled` stops publishing |
| Glide jank on mid Android | interpolation on UI thread, ≤ 12 pins, cluster beyond |

## Non-code dependencies
- Apple LPSE / background location justification and Play background-location declaration + video: until approved, WIU session only (rows show "Updates when you open the app").
- Mapbox account for traffic: absent → Valhalla-only ETAs (no traffic) labelled accordingly.

## Open questions
1. Channel name — resolved: `trip_locations:`; T1 edits the phase-20 constant (single line). Doc delta: `GET /v1/trips/{id}/live-snapshot`; phase-20 file note that P39 overrides the `member_etas` select policy.
2. `pause_location_share` command and `meetups.arrived` column missing from docs — default add (doc delta).
3. Can viewers who do not share still see others? — default yes (design shows "5 of 6 sharing" with Dev paused still viewing).
4. Crewmate phone CALL on pin sheet — default only when Q-5C visibility is on for that member.
