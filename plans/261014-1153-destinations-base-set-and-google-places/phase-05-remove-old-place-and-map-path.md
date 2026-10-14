---
phase: 5
title: Remove the old place and map path
status: pending
depends_on: [2, 3, 4]
lane: B
tasks: 5
gate: "Phases 3 and 4 on staging ≥ 7 days, including one green Android happy gate on the Google path and the founder's live use (the Đà Lạt test trip, 22–25 Oct, if it falls in the window); testers on the new native build; no open P1 issue on places or maps"
owns:
  - services/worker/src/places/{ingest*.ts,conflate.ts,osm-*.ts,fsq-export*.ts,batch-sql.ts,division-points.ts,existing-pois.ts,embed.ts,foursquare-match.ts,map-region-register.ts,place-bounds.ts,source-readers.ts,step-timeout.ts,pick/**}
  - services/worker/src/jobs/{places/index.ts,places/ingest-tile.ts,places/pick.ts,place-details/**,ai/draft/place-picks.ts}
  - services/worker/src/places/prune.ts
  - services/worker/src/jobs/trip-day/daybundle-build.ts (map region entry)
  - services/api/src/places/{live.ts,live-search.ts,live-search-routes.ts,live-resolve.ts,foursquare-search.ts,foursquare-photo-assets.ts,map-regions.ts,map-regions-wanted.ts,same-place.ts,search.ts,routes.ts}
  - services/api/src/geocoding/** (forward route; reverse kept on `cities`)
  - services/api/src/routes/routing-boxes.ts (drop the `pois` extent fallback)
  - packages/suppliers/src/mapbox/geocode.ts
  - packages/ai/src/routes/place-picks/**, packages/ai/src/routing.ts (`places.pick` line), packages/domain/src/ai/routes.ts (`places.pick` line)
  - packages/domain/src/places/{queues.ts,foursquare*.ts}
  - packages/db/migrations/<ts>_retire_open_data_places.sql
  - packages/db/src/schema/places.ts, packages/db/src/publication.ts
  - packages/db/test/permissions/{poi-embeddings,poi-live-checks,foursquare-bookkeeping,foursquare-photos}.test.ts (delete)
  - infra/powersync/streams/places.yaml (`map_regions` query)
  - apps/admin/src/modules/catalogue/{poi-map.tsx,definitions.ts}, apps/admin/package.json (maplibre-gl)
  - apps/mobile/src/data/places/{offlineSearch.ts,useRegionPack.ts}, mobile i18n strings for packs and Foursquare
  - tools/maps/**, .github/workflows/map-regions.yml
  - tools/content-factory/batches/places/**, tools/content-factory/src/data/place-corrections/**
  - services/{api,worker}/src/env.ts, .env.example files (retired variables)
  - docs/** (reconciliation)
---
# Phase 5 — Remove the old place and map path

## Context links

| Source | Section |
|---|---|
| Founder decision 6 | "Deletion happens last, after the new path has run on staging" |
| Inventory | Worker queues and writers (`packages/domain/src/places/queues.ts:16-112`; `places.ingest` cron `:45`, `places.fsq_match` `:36`, `places.map_region_register` `:53`, `places.pick` `:56`); API routes (`services/api/src/places/routes.ts:184,196,209`, `live-search-routes.ts:40,64`, `geocoding/routes.ts:173`); `places.pick` route `packages/ai/src/routing.ts:277`, prompt `packages/ai/src/routes/place-picks/index.ts:16`; MapLibre in admin `apps/admin/src/modules/catalogue/poi-map.tsx:5-7`; packs `.github/workflows/map-regions.yml:39`, `tools/maps/*`; day bundle map entry `services/worker/src/jobs/trip-day/daybundle-build.ts:110-120`; routing box fallback over `pois` `services/api/src/routes/routing-boxes.ts:60-65`; datasets from the audit (`tools/content-factory/batches/places` 15 files, `src/data/place-corrections` 24 files) |
| Keep | Mapbox Directions/Matrix (`MAPBOX_TOKEN`, `services/api/src/index.ts:68-70`); Valhalla and `routing-tiles.yml`; `cities` for reverse geocoding; `place_profiles`, `destination_briefs`, `hours_research`, `crowd_forecasts`; `poi_hours_proposals`; the OSM credit (Valhalla and kept OSM-derived names) |
| Publication | `pois` is not published (`packages/db/src/publication.ts:185`), so deleting its rows sends nothing through PowerSync |

## Overview

Goal: nothing of the open-data index, Foursquare, Mapbox geocoding or map packs is left in code, jobs, env, workflows or the database, and the docs say what the system is.

Done when: the delete list below is gone; `pois` holds the kept set only (≤ 50 k rows on staging); the database is ≥ 8 GB smaller; no cron for a retired queue runs; `rg -i "maplibre|pmtiles|foursquare|overture|fsq_os|places\.pick"` over `apps services packages tools infra .github` returns only history notes in docs; docs match the code.

## Tasks

### T1 — Server and tooling deletions
- Files: every server, tool and workflow path in `owns` except the migration, the admin app and docs.
- Steps: 1. Delete ingest, conflation, OSM, FSQ export and match, embed, pick, map-region register and routes, Foursquare live and search, forward geocoding, open-data search paths (`/v1/places/search` keeps searching our rows only). 2. Remove their queue specs, crons, job registry lines, producer lines (`services/api/src/jobs/producer.ts:101-104`) and env variables (`FOURSQUARE_*`, `OVERTURE_RELEASE`, `FSQ_*`, `TILES_BASE_URL`, `MAPBOX_GEOCODE_MONTHLY_CAP`, `PLACES_REFRESH_COUNTRIES`) from schemas and `.env.example` files; unset them on Railway staging after deploy. 3. Day bundle: drop the map region entry. 4. Routing boxes: drop the `pois` extent fallback (base rows carry `place_bounds`, phase 2). 5. Delete `tools/maps/**`, `map-regions.yml`, the places batches and place corrections; remove the `MAP_REGIONS_API_URL` repository variable and the `R2_TILES_*` secrets only if nothing else reads them (routing tiles use their own bucket: check first).
- Tests: `pnpm turbo run lint typecheck test --filter=...[HEAD]` runs in CI; locally only tests of touched files.
- Done when: CI green; staging worker boots with no retired queue.
- Status: todo

### T2 — Database: prune, drop, shrink
- Files: `packages/db/migrations/<ts>_retire_open_data_places.sql`, `services/worker/src/places/prune.ts` (operator CLI), schema mirror, publication list, permission test deletions.
- Steps: 1. Dump `pois` and the tables below to R2 (`ops.backup` pattern) and note the object key. 2. Prune: delete `pois` rows outside the kept set (`packages/db/src/places/kept-places.ts`, phase 3 T6) in batches of 50 k with a pause; same for `place_cards` rows that pointed at them (trigger). 3. Migration: drop `poi_embeddings`, `poi_live_checks`, `poi_foursquare_ids`, `poi_foursquare_photos`, `foursquare_api_usage`, `mapbox_geocode_usage`, `fsq_os_export_runs`, `fsq_os_export_chunks`, `fsq_os_export_rows`, `map_regions`; drop `pois` columns `source_ids`, `confidence`, `brand`, `pick_source`, `fts` and its indexes, the per-destination search indexes (`20261003201500_pois_destination_search_indexes.sql:22-25`) unless a remaining reader uses them (check `20261012184904`'s stay-by-name index first), and `place_profiles.photos`; redefine `llm.pois` without the dropped columns; remove `map_regions` from `trip_pack` (`places.yaml`) and regenerate. 4. `VACUUM FULL pois` in a quiet window on staging (writes to `pois` pause for its duration); record size before and after. 5. Production: the same migration; prune finds little or nothing.
- Tests: `pnpm test:remote @cp/db -- pois` and the trip-places/place-cards permission files still pass; `sync-streams-places` passes after the regen.
- Done when: staging size drop recorded in the PR (≥ 8 GB); the dump key recorded.
- Status: todo

### T3 — App and admin leftovers
- Files: `apps/mobile/src/data/places/{offlineSearch.ts,useRegionPack.ts}` and any remaining pack or Foursquare strings and components; `apps/admin/src/modules/catalogue/{poi-map.tsx,definitions.ts}`, `apps/admin/package.json`.
- Steps: delete what phase 4 left unused; the admin catalogue keeps editing our rows with a "View on Google Maps" link instead of the MapLibre preview; `maplibre-gl` and `@maplibre/maplibre-gl-style-spec` leave the catalog when no package uses them. Regenerate the mobile schema after T2.
- Tests: none new.
- Done when: `pnpm --filter @cp/admin build` and the mobile typecheck pass in CI.
- Status: todo

### T4 — Docs reconciled
- Files: `docs/**` (as phase 1 T3 listed, plus `docs/runbooks/add-a-destination.md`, `services/api/src/routing/README.md` "Valhalla later" and `docs/system-architecture.md:101,508` stale lines from the audit).
- Steps: compare each phase 1 delta with the merged code and fix the differences; rewrite the add-a-destination runbook (the base set and the brief replace seed rows, ingest and packs); `data-model.md` notes that `pois` is the place registry and why it keeps its name; mark retired queues and routes removed.
- Done when: a reviewer can follow every route, queue and table in the docs to code.
- Status: todo

### T5 — Verify on staging and production
- Steps: staging: worker and api logs clean for 24 h, PowerSync volume unchanged, a fresh-user Android happy gate green; production: migrations applied by the pre-deploy step on the first production deploy (no data expected); record both in the PR.
- Done when: both recorded; plan status set to done.
- Status: todo

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| A reader of a dropped column or table was missed | M×M | Typecheck after the schema mirror change; CI database suites; staging soak before production |
| `VACUUM FULL` blocks writes too long | M×M | Run in a quiet window after the prune shrank the table; staging first, timed |
| Old installed builds still call retired routes | L×M | The gate requires testers on the new build; retired routes answer 404 |
| A dataset deletion loses something still used | L×M | The audit lists them as unused; CI catches imports |

## Rollback

Code: revert the PR. Data: restore the dumped tables from R2 (the dump key is in the PR); dropped columns come back with the restore. That cost is why this phase waits for the gate.
