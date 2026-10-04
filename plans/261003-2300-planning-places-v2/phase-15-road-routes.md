---
phase: 15
title: Plan routes drawn along the roads
status: done
depends_on: [3, 5, 10]
wave: 3
screens: [7a-1, 7a-2, 7a-3, 7b-1, 7b-3]
tasks: 3
owns:
  - packages/domain/src/routing/polyline.ts, packages/domain/test/routing/polyline.test.ts
  - packages/suppliers/src/valhalla/**
  - services/worker/src/jobs/planning/legs/**
  - services/worker/test/planning/legs.db.test.ts
  - packages/db/migrations/<UTC timestamp>_plan_legs_shape.sql
  - packages/db/src/schema/planning.ts (the `plan_legs.shape` column only)
  - apps/mobile/src/data/powersync/synced-tables.generated.ts (regenerated)
  - apps/mobile/src/data/legs/**
  - apps/mobile/src/ui/map/planning/{route-trace.ts,stop-route-layer.tsx} and their tests
  - "T3, after phase 10 merges: the map wiring in apps/mobile/src/features/plan/{trip-map,day-plan,views}/**"
mount_points:
  - packages/domain/src/index.ts (one export line)
  - docs/data-model*.md (the plan_legs row)
---
# Phase 15 — Plan routes drawn along the roads

Founder, 2026-10-04 07:38: "instead of straight lines between places, is it possible to have real route drawn?"

## Context

- The plan maps join stops with straight segments: `ui/map/planning/route-trace.ts` `dayPath` (7a-1 trip map, day plan mini-map, day map open) and the old MAP tab `features/plan/views/plan-map.tsx` (`planMapModel` routes; the screen the founder sees while `planning.redesign` is off).
- Legs are worked out by our Valhalla (phase 3): `services/worker/src/jobs/planning/legs/compute.ts` takes the walk and drive matrix diagonals and `chooseLegMode` picks one. A matrix answer has no geometry, but Valhalla's `/route` answers carry each leg's `shape` (encoded polyline, precision 6; the recorded route fixtures already hold it and `schemas.ts` drops it).
- `plan_legs` already syncs to phones (`SELECT * FROM plan_legs` streams), so a stored shape reads offline like the minutes do.
- Storing is allowed: the router is self-hosted on OpenStreetMap data (ODbL) and the map credits OpenStreetMap. A Navigation API answer (Mapbox Directions or Matrix) is never stored (`travel.ts` header).

## Requirements

- Every leg Valhalla routes keeps the road shape for its chosen mode (walk → pedestrian; drive, driver and ride → auto) in a new nullable `plan_legs.shape` (text, encoded polyline). The shape is simplified for display (about 5 m tolerance, raised until the leg fits a point budget of about 200), so a leg stays near 1 KB or less.
- Straight-line legs (router down, unset, or a point off the road graph) keep `shape` null.
- The phone draws a day by joining its legs' shapes in order, matching legs by their `from_key`/`to_key` (`stay` or a stop's stable id), never by position. A leg with no shape (not worked out yet, a straight-line estimate, an offline edit) draws the straight segment as today, so a reorder shows straight lines until the new legs sync, then snaps to the roads.
- Tracing the chosen day out from the stay (7a-1) follows the roads; `traceLine` already takes any polyline.
- The server change is additive: a nullable column, no change to any route or command answer, and it works whatever `planning.redesign` says. Older app builds ignore the column.
- Existing trips get shapes from a re-run of the legs job for their current versions (the controller queues it after the deploy).

## Tasks

### T1 Server: keep the shape
- `@cp/domain` polyline encode and decode (precision as a parameter) plus a Douglas–Peucker simplify with a point budget. No new dependency.
- The Valhalla client's route answer exposes each leg's decoded shape; `schemas.ts` reads `shape` (optional, so the off-graph and over-limit fixtures still parse).
- The legs job fetches the road shape for each leg's chosen mode and stores the simplified, encoded shape with the leg. Prefer one multi-point `/route` call per day per mode used; when it fails (one point off the graph fails the whole call), fall back to per-leg calls, and a leg that still fails keeps `shape` null. Minutes and metres keep their source and meaning (matrix, cache and the drive factor). Shapes are not put in the route cache.
- Migration `<UTC timestamp>_plan_legs_shape.sql` adds the column; the Drizzle schema matches; regenerate the mobile synced schema (CLAUDE.md command); add the column to the plan_legs row of the data model doc. The privacy class stays C1 (the shape only joins places already in the plan).
- Tests: polyline round trip and the simplify budget; the legs db test stores a shape for a routed leg and null for a straight-line leg.
- Status: done — a77683eda

### T2 App: read the shape and draw it
- `data/legs`: `LEGS_SQL` reads `shape`; `DayLeg` gets `path` (decoded `[lng, lat]` points, or null). A hook or helper that reads every leg of a version for the maps that draw all days at once.
- `ui/map/planning/route-trace.ts`: a `RouteDay` may carry its leg paths keyed by `from>to`; `dayPath` stitches them (dropping the repeated joint point) and falls back to the straight segment per missing leg. `RouteStop` gains the stop key when it does not already carry it. `StopRouteLayer` needs no other change.
- Tests: stitching with a mix of shaped and missing legs, with and without a stay.
- Status: done — 7044e1ddb

### T3 Wire the maps (after phase 10's PR merges)
- Trip map (all days, the chosen day traced), day plan mini-map, day map open, and the old MAP tab (`plan-map.tsx`, item to item, no stay legs).
- Device check on Android: `mode=compare` for the trip map and the old MAP tab flows; the PR shows the lines following the streets.
- Status: done — a6b53a6f3

## Done when

On staging, after the backfill, the founder's Đà Nẵng trip shows lines that follow the streets on the old MAP tab, and on the trip map with the redesign override on; a reorder redraws along the roads once its legs sync; in airplane mode the shapes still draw.

## Risks

- A long drive (Đà Nẵng to Hội An, about 30 km) has thousands of raw points: the point budget keeps it small.
- Matrix minutes and route shapes come from different calls and can differ slightly; the minutes stay the plan's truth and the shape is only drawn.
