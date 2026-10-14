---
phase: 6
title: Remove the old place paths
status: pending
depends_on: [3, 4, 5]
lane: B
tasks: 4
gate: "Phases 3–5 on staging ≥ 7 days with a green Android happy gate; testers on a build that carries phase 5"
owns:
  - services/worker/src/places/{fsq-export.ts,fsq-export-runs.ts,foursquare-match.ts,embed.ts,pick/**}
  - services/worker/src/places/source-readers.ts (FSQ OS reader only)
  - services/worker/src/jobs/{place-details/**,places/pick.ts,ai/draft/place-picks.ts}
  - services/worker/src/jobs/places/index.ts (FSQ fan-out, `PLACES_REFRESH_COUNTRIES`)
  - services/api/src/places/{live.ts,live-search.ts,live-search-routes.ts,live-resolve.ts,foursquare-search.ts,foursquare-photo-assets.ts,place-photo.ts,routes.ts}
  - services/api/src/editorial-media/route.ts (the ignored `include` parameter)
  - packages/ai/src/routes/place-picks/**, packages/ai/src/routing.ts and packages/domain/src/ai/routes.ts (`places.pick` lines)
  - packages/domain/src/places/{queues.ts,foursquare*.ts}
  - packages/db/migrations/<ts>_retire_foursquare_and_picks.sql
  - packages/db/src/schema/{places.ts,place-profiles.ts}, packages/db/src/publication.ts
  - packages/db/test/permissions/{foursquare-bookkeeping,foursquare-photos,poi-embeddings}.test.ts (delete)
  - services/{api,worker}/src/env.ts, .env.example files (retired variables)
  - tools/content-factory/batches/places/**, tools/content-factory/src/data/place-corrections/**
  - docs/** (reconciliation)
---
# Phase 6 — Remove the old place paths

## Context links

| Source | Section |
|---|---|
| Founder decision 1, "removal last" | plan.md; D38 |
| Inventory (3d8ff4078) | Foursquare: api `places/{live,live-search,live-search-routes,live-resolve,foursquare-search,foursquare-photo-assets}.ts`, routes `places/routes.ts:184`, `live-search-routes.ts:40,64`; worker `places/foursquare-match.ts:125`, `jobs/place-details/index.ts`, queue `places.fsq_match` (`packages/domain/src/places/queues.ts:36`); tables `poi_foursquare_ids`, `poi_foursquare_photos`, `foursquare_api_usage` (`packages/db/src/schema/places.ts:191-250`). FSQ OS: `fsq-export.ts`, `fsq-export-runs.ts`, `source-readers.ts:186,207-227`, tables `fsq_os_export_runs/chunks/rows`. Picks: `packages/ai/src/routing.ts:277`, `packages/ai/src/routes/place-picks/index.ts:16`, `services/worker/src/jobs/places/pick.ts`, `services/worker/src/places/pick/**` (helpers moved by phase 4 T3). Per-place photo code: `place-profiles.photos` column, `services/api/src/places/place-photo.ts`. Unused: `poi_embeddings` (`embed.ts:70`, no caller). Datasets (audit): `tools/content-factory/batches/places` (15 files), `src/data/place-corrections` (24 files) |
| Stays | Overture + OSM ingest, MapLibre, PMTiles packs, Valhalla, Mapbox routing and geocoding, `cities`, profiles, briefs, `crowd_forecasts`, `poi_hours_proposals`, curated media |

## Overview

Done when: `rg -i "foursquare|fsq_os|fsq_place|places\.pick|PLACES_REFRESH_COUNTRIES"` over `apps services packages tools infra .github` finds nothing but history notes in docs; the retired tables and columns are dropped after a dump; no retired queue or cron is registered; docs match the code.

## Tasks

### T1 — Code and config
- Files: code paths in `owns`.
- Steps: delete Foursquare, FSQ OS, picks and per-place photo code with their queue specs, crons, job registry and producer lines (`services/api/src/jobs/producer.ts:101-104`) and env variables (`FOURSQUARE_*`, `FSQ_*`, `PLACES_REFRESH_COUNTRIES`); `/v1/media` stops accepting `include`; retired routes answer 404.
- Tests: CI suites (lint, typecheck, test) on the PR; locally only touched test files.
- Done when: CI green; staging worker boots with no retired queue.
- Status: todo

### T2 — Database
- Files: migration, schema mirrors, publication list, permission tests.
- Steps: dump the tables to R2 and record the key; drop `poi_foursquare_ids`, `poi_foursquare_photos`, `foursquare_api_usage`, `fsq_os_export_runs`, `fsq_os_export_chunks`, `fsq_os_export_rows`, `poi_embeddings`, `place_profiles.photos`, `pois.pick_source`; update `llm.pois` if it reads a dropped column.
- Tests: `pnpm test:remote @cp/db -- pois` and `-- place-profiles` still pass.
- Done when: applied on staging; size and dump key in the PR.
- Status: todo

### T3 — Datasets
- Files: `tools/content-factory/batches/places/**`, `tools/content-factory/src/data/place-corrections/**` and the content-factory code that only they use.
- Steps: delete after checking no published release reads them at runtime (writers read the database, not the files).
- Done when: content-factory tests pass in CI.
- Status: todo

### T4 — Docs reconciled
- Files: `docs/**`, plus `docs/runbooks/add-a-destination.md` (base set, ingest on use, brief, curated media) and the audit's stale "Valhalla later" lines (`services/api/src/routing/README.md`, `docs/system-architecture.md:101,508`).
- Steps: compare phase 1's deltas with the merged code and fix differences; mark retired routes, queues and tables removed.
- Done when: every route, queue and table in the docs exists in code.
- Status: todo

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| A reader of a dropped column was missed | M×M | Typecheck on the schema mirror change; CI database suites; staging soak |
| Installed builds call a retired route | L×L | Gate requires testers on the phase 5 build; 404 is handled as unavailable |

## Rollback

Revert the code; restore the dropped tables from the dump (key in the PR).
