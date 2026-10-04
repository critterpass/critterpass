---
phase: 3
title: Travel times and stored legs
status: done
depends_on: [2]
wave: 2
screens: [7a-1, 7a-2, 7b-1, 7b-2, 7i-2]
tasks: 6
gate: founder decision "Routing / drive-time provider" (plan.md). Tasks below follow the recommended option; the other options change T1–T3 only (see "If the founder picks another option")
owns:
  - packages/suppliers/src/valhalla/**
  - tools/routing-tiles/**
  - .github/workflows/routing-tiles.yml
  - infra/railway/valhalla.Dockerfile
  - infra/railway/valhalla.toml
  - services/api/src/routing/{valhalla,planning-provider,route-cache,travel-modes,tool-executor}.ts
  - services/api/src/planning/stay.ts
  - services/api/test/routing/{valhalla,planning-provider,route-cache}.test.ts
  - services/worker/src/jobs/planning/legs/**
  - services/worker/test/planning/legs.db.test.ts
mount_points:
  - services/api/src/routing/provider.ts (purpose-based provider selection)
  - services/api/src/app.ts (wire the planning provider)
  - services/api/src/places/detail.ts:74 (resolveTripLodging → tripStay)
  - services/api/src/ai/tool-executors.ts (route_eta executor)
  - services/api/src/planning/register.ts, services/worker/src/jobs/planning/index.ts (one line each)
  - services/api/src/planning/fit/context.ts (travel source; after phase 4 is done)
  - services/worker/src/jobs/{live-map/meetup-router,recap/contributors/plan,safety/sos-responder-eta}.ts (shared client; after their full-build phases close)
---
# Phase 3 — Travel times and stored legs

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D6 (Valhalla + Mapbox), D21 ("routing is Mapbox Directions/Matrix at launch behind the routing provider, with self-hosted Valhalla as the later swap"), D12 (offline plan) |
| `services/api/src/routing/README.md:17-18` | Mapbox §2.10.1 "Customer shall not export, download, cache or store results from any request to a Navigation API"; §1.9 no "bulk or automated queries" |
| `docs/decisions/20260927-valhalla-routing-on-railway.md` | Valhalla 3.8.3 (3.9.0 never built a usable graph), always `osmium merge` before building, route p95 < 300 ms, 16×16 matrix 1–4 s in big metros, 24 GB build peak for 8 whole countries |
| Code | `services/api/src/routing/provider.ts:55` (`RoutingProvider` = eta + matrix + leaveBy), `eta.ts:46,143`, `matrix.ts`; `packages/domain/src/routing/{eta-provider,straight-line-eta}.ts:46`; worker `jobs/live-map/meetup-router.ts:62` (`valhallaRouter`); `tools/spikes/src/valhalla/` (zod client, city sampler); `services/api/src/places/detail.ts:74` (`resolveTripLodging` stub, always undefined); `services/api/src/explore/plan-read.ts` (stay = first `stay` item); `packages/ai/src/tools/read-tools.ts:96` (`route_eta` spec with no executor) |
| Renders | `7a-2` (legs "CAR · 1H10", "WALK · 20 MIN", "5 STOPS · 2H40 IN THE CAR"), `7b-1` (same + mini-map), `7b-2` ("20 MIN" between strip cards), `7i-2` ("✓ THE PLAN" offline) |

## Overview

Goal: every planning surface gets drive and walk minutes it may store, sync and reuse in background jobs: a self-hosted Valhalla built from destination boxes, a planning routing provider with a route cache, the trip's stay as the anchor, and `plan_legs` written for each plan version so phones show legs offline.

Done when: a plan change on staging writes `plan_legs` for every consecutive pair (stay first and last) within 60 s p95; legs sync to both participants and render offline; no Navigation API result is stored anywhere (test); live day-of ETAs still use Mapbox unchanged.

## Requirements

| Render | Behaviour |
|---|---|
| 7a-2 / 7b-1 legs | Each pair of consecutive stops (and stay → first, last → stay) has `mode` + `minutes`; mode = walk when ≤ `routing.walk_max_m` (1.2 km) and ≤ 15 min, driver when a driver is assigned to that day (find-a-driver data, when present: "Made drives · 1h10 each way"), else drive |
| 7a-1 sheet "5 stops · 2h40 in the car" | Sum of drive/driver legs for the day |
| 7b-1 "a live mini-map that redraws as you drag" | The phone draws straight segments while dragging (renders show straight lines); minutes refresh when the new version's legs land; until then the phone shows its own straight-line estimate marked "about" |
| 7i-2 offline | Legs are synced rows: the day plan reads them with no network |
| Drive realism | Free-flow minutes × `destinations.drive_factor` (editorial per destination, default 1.0; Bali proposed 1.3 for founder review) |
| Approximate legs | When Valhalla is down or a point is off-graph: straight-line estimate (`estimateStraightLineEta`), `approx = true`, the app prefixes "about" |

Reuse / extend / new: reuse `RoutingProvider`, `estimateStraightLineEta`, the spike's Valhalla client and city sampler; extend provider selection by purpose (planning vs live) and implement the stub stay resolver and the `route_eta` executor; new tile pipeline, serving service, route cache and legs job.

## Architecture & contracts

| Kind | Delta |
|---|---|
| Service | `valhalla` on Railway SG, private network only (`http://valhalla.railway.internal:8002`), image pinned `ghcr.io/valhalla/valhalla-scripted:3.8.3`, tiles tar downloaded from R2 `cp-routing/<build>/tiles.tar` at boot; no public host |
| Tiles | Built off this Mac: GitHub Actions (`routing-tiles.yml`, manual + weekly) extracts each destination's place box from Geofabrik with `osmium extract`, merges into one PBF, builds tiles, uploads tar + manifest. Boxes from `destinations` bounds (live guides + every destination with an active trip) |
| Provider | `services/api/src/routing/planning-provider.ts`: `travel(from, to, mode, at)` and `matrix(sources, targets, mode)` → `{minutes, meters, source, approx, storable: true}`; Valhalla first, straight-line fallback; Mapbox is never a planning source. `provider.ts` gains purpose selection: `live` (Mapbox traffic, unchanged) vs `planning` |
| Cache | `route_cache` read-through for storable sources only; key = rounded points (5 dp), mode, hour bucket; TTL 30 d (`maint.purge`) |
| Stay | `services/api/src/planning/stay.ts` `tripStay(tx, tripId, date?)`: booked stay with a point for that night → plan item with category `stay` → setup stay area; null = no anchor (fit says "from the centre") |
| Table | `plan_legs` (phase 2) |
| Queue | `plan.legs` (trigger: domain events `plan.version_created`, `plan.ops_applied`, `change_set.applied`, `booking.edited` with a stay; singleton per trip, 30 s; retry 3; DLQ) → writes legs for the new version (copying unchanged pairs from `route_cache`), emits `plan.legs_updated` (phase 4's `plan.check` listens) |
| Realtime | `trip_plan:{trip_id}` `legs.updated{version}` |
| AI tool | `route_eta` executor (spec exists, `read-tools.ts:96`): planning provider, minutes + mode only |
| Env | `VALHALLA_URL` (api + worker), `ROUTING_TILES_BUCKET` |

## Tasks

### T1 — Shared Valhalla client
- Goal: one client for api and worker.
- Files: `packages/suppliers/src/valhalla/**`, `services/api/test/routing/valhalla.test.ts`
- Steps: 1. Port the spike's zod client (`tools/spikes/src/valhalla/client.ts`): `/route`, `/sources_to_targets`, `/optimized_route`, `/locate`. 2. Timeouts (route 2 s, matrix 6 s), one retry, circuit breaker. 3. Recorded responses for Bali, Kyoto, Đà Nẵng fixtures.
- Tests: `pnpm --filter @cp/suppliers test -- valhalla` (recorded-response contract + timeout/off-graph mapping)
- Done when: off-graph and timeout map to typed errors; matrix chunking ≤ 25 × 25.
- Status: done — 21fcc2321 (#599)

### T2 — Tiles pipeline and serving service
- Goal: Valhalla serving every destination box, rebuilt without this Mac.
- Files: `tools/routing-tiles/**`, `.github/workflows/routing-tiles.yml`, `infra/railway/valhalla.Dockerfile`, `infra/railway/valhalla.toml`
- Steps: 1. Box list from `destinations` (live + active-trip destinations), buffered 30 km. 2. `osmium extract` per box → `osmium merge` → `valhalla_build_tiles` (3.8.3) → tar → R2 with a manifest (build id, boxes, OSM date). 3. Serving image downloads the newest manifest at boot, health on `/status`. 4. Railway service creation is a founder-approved infra step (record size and cost in the PR).
- Tests: workflow dry run on two boxes (Đà Nẵng, Bali) in CI; `/status` and one Bali route from the bench script.
- Done when: staging Valhalla answers a Bali and a Kyoto route; build ≤ 60 min on the runner; serving memory recorded.
- Status: done — 21fcc2321 (#599), smoke fix in #602; first publish 2026-10-03 (30 boxes: run 23 min, tile build 8 min, peak about 6.3 GiB, tar 2.0 GB / 742 MB gzip, serving 123 MiB); staging `valhalla` answers Bali (Seminyak → Ubud 52 min) and Kyoto (station → Kiyomizu-dera walk 41 min)

### T3 — Planning routing provider, route cache, modes
- Goal: storable travel minutes for planning, Mapbox untouched for live ETAs.
- Files: `services/api/src/routing/{planning-provider,route-cache,travel-modes,valhalla}.ts`, `services/api/src/routing/provider.ts`, `services/api/src/app.ts`, `services/api/test/routing/{planning-provider,route-cache}.test.ts`
- Steps: 1. Purpose-typed providers so a `planning` caller cannot receive a Mapbox result (type-level `storable: true`). 2. Read-through cache. 3. Mode rule (walk ≤ 1.2 km and ≤ 15 min; driver when assigned; else drive) × `drive_factor`. 4. Straight-line fallback marked `approx`.
- Tests: `pnpm --filter @cp/api test -- routing/planning-provider routing/route-cache`; `pnpm test:remote @cp/api -- routing/route-cache.db`
- Done when: a test asserts no code path writes a Mapbox result to `route_cache`, `plan_legs` or any table (provider type + grep test over `services/**` for the Mapbox client in planning modules).
- Status: done — 21fcc2321 (#599)

### T4 — The trip's stay
- Goal: "from the villa" has a real anchor.
- Files: `services/api/src/planning/stay.ts`, `services/api/src/places/detail.ts`
- Steps: 1. `tripStay` per night (booked stay point → plan stay item → setup area). 2. Replace the `resolveTripLodging` stub so place detail's lodging ETA runs. 3. Export for fit (phase 4) and legs.
- Tests: `pnpm test:remote @cp/api -- planning/stay.db` (booked stay wins; two stays across nights; none → null)
- Done when: `GET /v1/places/{id}?trip_id` returns a lodging ETA for a trip with a booked stay.
- Status: done — 21fcc2321 (#599); query shared from `@cp/db` in #602

### T5 — Legs per plan version
- Goal: `plan_legs` for crew and draft versions, synced and offline.
- Files: `services/worker/src/jobs/planning/legs/**`, `services/worker/src/jobs/planning/index.ts` (one line), `services/api/src/planning/register.ts` (event hook line), `services/worker/test/planning/legs.db.test.ts`
- Steps: 1. Event hook (api and worker) on the four events → `plan.legs` singleton per trip. 2. Order stops per day by `starts_at`, pairs incl. stay; batch matrix per day; write rows for the version; keep rows of older versions until the version is superseded (stream shows the version the phone reads). 3. Emit `plan.legs_updated` + `legs.updated` hint. 4. Backfill command for trips in planning/pre/in phases.
- Tests: `pnpm test:remote @cp/worker -- planning/legs.db` (pairs incl. stay, attendee subsets ignored for order, approx fallback, idempotent replay)
- Done when: on staging, an edit writes legs within 60 s p95 and both phones show them in airplane mode.
- Status: done — #602 (worker job, api and worker hooks, backfill, route_cache retention); staging timing and airplane-mode check after `VALHALLA_URL` and the backfill

### T6 — Wire travel into fit, AI and the existing Valhalla users
- Goal: one planning travel source everywhere.
- Files: `services/api/src/routing/tool-executor.ts`, `services/api/src/ai/tool-executors.ts`, `services/api/src/planning/fit/context.ts` (mount, after phase 4 is done), worker mounts listed in frontmatter
- Steps: 1. `route_eta` executor for C/D callers. 2. Fit context reads `plan_legs` for stop pairs and the planning provider for place insertions (replacing phase 4's straight-line source). 3. Live map, SOS responder ETA and recap use the shared client (each only after its full-build phase is done).
- Tests: `pnpm --filter @cp/ai eval -- guide` (route_eta cases); `pnpm --filter @cp/api test -- planning/fit` (travel source)
- Done when: the guide answers "how long from the villa to X" with planning minutes; fit uses stored legs when present.
- Status: done — #602 (`route_eta` on planning travel; fit reads stored legs and tries places on planning travel with the booked-stay rule; the plan check, live map, recap and SOS share the stay rule or the Valhalla client)

## If the founder picks another option

| Option | Changes |
|---|---|
| Stadia (hosted Valhalla + traffic) | T1/T2 become a Stadia adapter in `packages/suppliers/src/stadia/**` (no tiles, no service); storage only while subscribed, so `route_cache` TTL ≤ subscription and a revoke purge job |
| Mapbox only (D21 as is) | No `route_cache`; `plan_legs` holds straight-line estimates only (`approx`); live minutes fetched per human view and never stored; plan check (phase 4) uses straight-line only; 7i-2 shows "about" minutes |
| Straight-line only | T1–T3 dropped; legs `approx`; Bali mountain drives understated (risk accepted by the founder) |

## Device flows

Covered by phase 10 (`e2e/plan/day-plan.yaml` reads legs, `e2e/plan/day-plan-offline.yaml` airplane mode). This phase adds no UI.

## Phase acceptance criteria

- [ ] T1–T6 done-when checks pass.
- [ ] No Navigation API result stored (test + code search).
- [ ] Legs exist for every crew version of active staging trips after the backfill.

## Risks & rollback

| Risk | Likelihood × impact | Mitigation / rollback |
|---|---|---|
| Tile build memory/time (8 countries peaked at 24 GB) | M × M | destination boxes, not countries; runner size recorded; rollback = straight-line legs (`approx`), nothing else changes |
| Valhalla free-flow understates Bali/Mexico City traffic | H × M | `drive_factor` per destination (founder-reviewed); copy says "in the car", not a clock promise |
| Big-metro matrices slow (Tokyo/Osaka 2–4 s) | M × L | background jobs only; interactive matrices ≤ 1 × 25 |
| Transit cities (Kyoto, Lisbon) shown as car/walk | M × M | logged undesigned; transit stays out of scope unless the founder adds GTFS routing |
| `leave_bys.legs` already stores Mapbox results (`leaveby-recompute.ts:145,158`) | known | outside this plan's owns: reported to the controller for the trip-day lane |

## Migration (existing users' data and screens)

Backfill legs for active trips (T5). Existing straight-line estimates on the phone (`features/plan/day/fit-check.ts`) keep working until phase 10 reads legs. No user-visible change in this phase.

## Undesigned states to log

None here; "about" prefix and transit fallback are logged by phase 10 where they show.

## Open questions

1. `drive_factor` starting values per destination: default 1.0 everywhere except values the founder approves.
2. Do guest destinations without an active trip get tiles? Default: no; a trip landing there adds its box to the next weekly build (first-day legs are `approx`).
