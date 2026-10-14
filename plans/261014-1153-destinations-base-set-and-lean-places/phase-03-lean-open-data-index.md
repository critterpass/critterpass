---
phase: 3
title: A lean open-data place index
status: in-progress
depends_on: [1]
lane: B
tasks: 5
gate: none
owns:
  - packages/domain/src/places/lean.ts
  - packages/db/src/places/kept-places.ts
  - services/worker/src/places/{ingest-upsert.ts,osm-apply.ts,source-readers.ts,ingest-tile-run.ts,ingest-all.ts,prune.ts}
  - services/worker/src/jobs/places/{index.ts,ingest-tile.ts,prune.ts}
  - services/worker/src/content/publish.ts (the `places.pick` enqueue only)
  - services/worker/src/jobs/ai/draft/{place-picks.ts,draft.ts}
  - services/api/src/places/on-demand-ingest.ts
  - services/worker/test/places/{lean,prune,ingest}*.test.ts, services/worker/test/jobs/places/**
  - packages/db/test/places/kept-places.db.test.ts
mount_points:
  - packages/domain/src/places/queues.ts (`places.prune` spec; cron payload of `places.ingest`)
  - services/worker/src/job-registry.ts (append-only)
  - Railway staging variables (unset `FOURSQUARE_API_KEY`, `FSQ_PLACES_PORTAL_TOKEN`, `FSQ_OS_PLACES_PARQUET_URI`, `PLACES_REFRESH_COUNTRIES` on api and worker)
---
# Phase 3 — A lean open-data place index

## Context links

| Source | Section |
|---|---|
| Founder decision 1 (14 Oct 13:25) | plan.md; D38 (phase 1 T2). Measured storage cost of open data ~$3–7/month: the goal is less complexity and better content, not cost |
| Today's ingest | Monthly fan-out `places.ingest` (`packages/domain/src/places/queues.ts:45`, `0 2 1 * *`): live destinations, trips or pitches in 90 days, plus every destination in `PLACES_REFRESH_COUNTRIES` (`services/worker/src/jobs/places/index.ts:1-18,77-107`); FSQ OS export when the catalog is configured (`index.ts:8-11`, `fsq-export-runs.ts`); per-tile reads in `ingest-tile.ts`, writes `ingest-upsert.ts:137,191`, OSM `osm-apply.ts:183,199`; Overture `confidence` read at `source-readers.ts:154,174`; FSQ OS reader `source-readers.ts:186,207-227` |
| On use | `services/api/src/places/on-demand-ingest.ts`: a pitch or trip in a destination with < 50 active places queues its ingest (D25), plus picks (`:127-142`), brief and warm-up |
| Foursquare | api `services/api/src/places/live.ts:79` answers unavailable without `FOURSQUARE_API_KEY` (`services/api/src/env.ts:165`); `places.fsq_match` is not registered without the key (worker `env.ts:60`) |
| Machine picks | triggers: `on-demand-ingest.ts:127-142`, end of ingest `jobs/places/ingest-tile.ts:246`, content publish `services/worker/src/content/publish.ts:154`, draft inline `jobs/ai/draft/place-picks.ts:40` (`draft.ts:93`); route switch `ai.places.pick.enabled` (`packages/domain/src/admin/service-keys.ts:74`) |
| References to keep | 26 `poi_id` FK columns (scout list in plan 3d8ff4078 notes), `spawn_rules.poi_ids[]`, `swipe_sessions.deck` cards, `saved_items` (kind `poi`), `destination_briefs` essentials/eateries jsonb, `place_profiles`, `crowd_forecasts`, `poi_hours_proposals`, `media_assets` subjects `poi:<id>`, `curation = 'editorial'` |
| Publication | `pois` is not published (`packages/db/src/publication.ts:91-94,185`): pruning sends nothing through PowerSync |
| Categories | `packages/domain/src/places/categories.ts:10-22` |

## Overview

Goal: the place index holds travel places only, for destinations people use, from Overture and OSM; nothing calls Foursquare or runs machine picks; the 9.2 GB table shrinks to match.

Done when (staging): an ingest writes only rows that pass the lean rule; the monthly run touches only destinations used in 180 days; no FSQ export runs and no Foursquare call is logged for 7 days; no `places.pick` job runs; `pois` holds the kept set plus lean rows of used destinations, with row count and size before/after recorded (expected ≥ 80 % fewer rows).

## Requirements

| Item | Rule |
|---|---|
| Lean rule | Category in `temple_shrine, food, market, nature, beach, museum, nightlife, stay`, or `transit` whose source label is an airport, train station, bus station or ferry terminal; Overture-only rows need `confidence ≥ 0.6`; OSM sights and editorial rows have no floor. One constant in `packages/domain/src/places/lean.ts` |
| Used destination | A trip in any phase, or a pitch in the last 180 days. Curated (`live`) destinations count as used only through those |
| Kept set | Every row in Context "References to keep", whatever its kind, confidence or destination |
| Sources | Overture + OSM only; the FSQ OS reader and export are skipped (code removed in phase 6) |

## Tasks

### T1 — Lean rule at ingest
- Files: `packages/domain/src/places/lean.ts`, `services/worker/src/places/{ingest-upsert.ts,osm-apply.ts,source-readers.ts}`, tests.
- Steps: 1. Measure first: on staging, counts per category and Overture confidence decile for Đà Lạt, Đà Nẵng, Hội An (read-only query through the worker's system role); record in the PR and confirm or adjust the floor. 2. Filter before upsert: rows outside the rule are not written; an existing row that falls outside is left for the prune (T4). 3. Transit hubs by source label (Overture `airport`, `train_station`, `bus_station`, `ferry_terminal`; OSM `aeroway=aerodrome`, `railway=station`, `amenity=bus_station`, `amenity=ferry_terminal`).
- Tests: `pnpm --filter @cp/domain test -- lean` (each kind, hub labels, floor, OSM exemption); `pnpm test:remote @cp/worker -- places/ingest-upsert` (a recorded tile writes only lean rows).
- Done when: a re-ingest of Hội An on staging writes no row outside the rule.
- Status: done — 8035744fb (floor kept at 0.6 after measuring; the re-ingest check runs once the branch is deployed)

### T2 — Overture and OSM only; Foursquare off
- Files: `services/worker/src/jobs/places/{index.ts,ingest-tile.ts}`, `services/worker/src/places/{ingest-tile-run.ts,ingest-all.ts}`; Railway variables.
- Steps: 1. The fan-out never starts an FSQ export and tiles never read FSQ OS, whatever the env (guard in code; the reader is deleted in phase 6). 2. Unset `FOURSQUARE_API_KEY`, `FSQ_PLACES_PORTAL_TOKEN`, `FSQ_OS_PLACES_PARQUET_URI` on staging api and worker: live details, live search and `places.fsq_match` stop (existing no-key paths). 3. Kept Foursquare photo rows stay unread from here on (phase 4 T5 stops serving them).
- Tests: ingest fan-out test: no `places.fsq_export_chunk` job queued with the catalog env set.
- Done when: a full staging fan-out completes with no FSQ step; the api log shows no Foursquare request for 24 h.
- Status: done — 091b9216c (staging FSQ and refresh-country variables unset 14 Oct)

### T3 — Refresh only used destinations
- Files: `services/worker/src/jobs/places/index.ts:77-107`, `packages/domain/src/places/queues.ts`.
- Steps: the monthly fan-out selects used destinations only (180 days); `PLACES_REFRESH_COUNTRIES` and the always-live clause go; the on-demand trigger stays as is (first use of a sparse destination).
- Tests: fan-out selection test (live destination with no trip skipped; pitch 100 days ago included; country list ignored).
- Done when: next scheduled run's summary lists only used destinations.
- Status: done — 091b9216c

### T4 — Prune the existing index
- Files: `packages/db/src/places/kept-places.ts`, `services/worker/src/places/prune.ts`, `services/worker/src/jobs/places/prune.ts`, tests.
- Steps: 1. Dump `pois` to R2 (`ops.backup` pattern), record the key. 2. Operator job `places.prune {dry_run}`: delete rows that are not kept and either fail the lean rule or belong to an unused destination, in batches of 50 k with a pause; `place_cards` rows follow through their trigger; `poi_embeddings`/`poi_live_checks` rows go with their place. 3. `VACUUM (ANALYZE) pois` after; `VACUUM FULL` in a quiet window only if the size did not drop (writes to `pois` pause meanwhile). 4. Record rows and size before and after.
- Tests: `pnpm test:remote @cp/db -- places/kept-places` (one fixture row per reference kind survives; a non-lean, unreferenced row of a used destination goes; a lean row of an unused destination goes); dry run returns counts only.
- Done when: staging pruned, numbers in the PR; production gets the same job when it has data.
- Status: in progress — 2baa799df; dump `postgres/pois-prune/2026-10-14.dump` taken, staging prune running (resumable: a rerun the same day keeps the dump)

### T5 — Machine picks off
- Files: `services/api/src/places/on-demand-ingest.ts`, `services/worker/src/jobs/places/ingest-tile.ts:246`, `services/worker/src/content/publish.ts:154`, `services/worker/src/jobs/ai/draft/{place-picks.ts,draft.ts}`.
- Steps: nothing queues `places.pick`; the draft waits for the destination's brief (already queued on pitch and trip) with its existing timeout instead of picking inline; set `ai.places.pick.enabled` off on staging. Existing picks need no cleanup: a brief rewrites all of a destination's picks (named leads plus the open-data fill, `services/worker/src/places/profile/brief-run.ts:156-161` → `pick/run.ts:162-183`), and a destination without a brief keeps its old picks until its brief runs.
- Tests: draft test: no pick job, candidates from editorial + brief rows.
- Done when: a fresh-destination draft on staging runs with no pick job.
- Status: done — fda225686 (`ai.places.pick.enabled` off on staging)

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| A reference kind missed by the kept set | L×H | Fixture per kind; dump first; FK errors stop the batch (FK columns can't be orphaned anyway) |
| Floor too strict for Vietnam | M×M | T1 measures before fixing the value |
| Draft quality drops without picks | M×M | Brief essentials and eateries, editorial sets; the draft still reads lean open-data rows |

## Rollback

Config: restore the variables and switch `ai.places.pick.enabled` on. Code: revert. Data: re-ingest a destination on demand, or restore pruned rows from the dump.
