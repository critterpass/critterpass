---
phase: 1
title: Photo stop and the decision docs
status: in-progress
depends_on: []
lane: B
tasks: 3
gate: none
owns:
  - services/worker/src/places/profile/{photos.ts,evidence.ts,jobs.ts,run.ts,store.ts,purge-photos-cli.ts} (T1, PR #916)
  - services/api/src/places/{profile.ts,place-photo.ts}, services/api/src/explore/picks.ts (T1, PR #916)
  - docs/product-decisions.md
  - docs/decisions/README.md
  - docs/system-architecture.md
  - docs/data-model.md
  - docs/data-model-sync-and-privacy.md
  - docs/api-contracts.md
  - docs/api-contracts-planning.md
  - docs/api-contracts-explore.md
  - docs/api-contracts-async.md
---
# Phase 1 — Photo stop and the decision docs

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D6 (`:20`), D21 (`:35`, crowd copy names its source), D23 (`:37`, web search uses and nevers), D24 (`:38`, Foursquare live and photos), D25 (`:39`, OSM + FSQ OS + live Foursquare search), D27 (`:41`, Mapbox addresses), D28 (`:42`, machine picks), D29 (`:43`, city critter), D31 (`:45`, AI content unreviewed, cite-or-drop, open-data index stays) |
| Audit | `data-sources-audit-261014-0123-…` finding 1 (profile photos), findings 3, 5, 7 |
| Code | profile photos `services/worker/src/places/profile/run.ts:135,220-221`, `evidence.ts:90`, `photos.ts:28`; readers `services/api/src/places/profile.ts:134`, `place-photo.ts:18-23`, `services/api/src/explore/picks.ts:84-89` |

## Overview

Stop re-hosting web images now (PR #916, docs reverted out of it), then write the new direction once so lanes code against one text.

Done when: #916 merged and deployed; the staging R2 prefix `c/place-profiles/` is empty and `place_profiles.photos = '[]'`; D38 (rewritten) and D39 are in the log; every delta below is on `main`.

## Tasks

### T1 — Stop scraped profile photos
- Files: as `owns` (T1).
- Steps: no image search or download in the profile run; readers drop profile photos; the purge CLI empties `c/place-profiles/` after the deploy.
- Tests: in #916 (`run.db.test.ts`, `purge-photos.db.test.ts`, `profile.db.test.ts`, `picks-photo.db.test.ts`).
- Done when: #916 merged; purge counts recorded in the PR.
- Status: in review — #916

### T2 — Decision log
- Files: `docs/product-decisions.md`, `docs/decisions/README.md` (no new ADR).
- Steps:
  1. **D38 (2026-10-14), lean open data, AI estimates, curated media.** Quote the founder (13:25–13:30). Places stay our open-data index, lean: Overture and OSM only (FSQ OS ingest dropped), a destination is ingested when a trip or pitch first uses it, only travel kinds above a confidence floor are kept, and only destinations with recent activity are refreshed; the existing index is pruned to that rule plus every referenced or curated row. Foursquare is retired (D24 live details and photos, D25 live search and id matching): cost at scale. Machine picks (D28 `places.pick`) are retired; a destination's recommended places are its editorial set and its brief. No per-place photos: a place shows a curated licensed photo or short video (Pexels, Pixabay, Commons; approved in the ops console) only when it is popular (editorial essentials, brief essentials and eateries, editorial must-sees; at most 40 a destination); every other place has no image. AI estimates for popular places (busy times, visit length, best time, tips, entry fee, dress) are written through the profile pipeline with or without web search, labelled as estimates and cited when a source exists (amends D31's cite-or-drop for these fields only, as D30 did for prices); busy times are shown as "estimate", never as "what crews saw" (D21). The planning agent may read blogs, travel guides and social media for suggestions and tips; suggestions resolve to our rows or are dropped; supplier and OTA sites stay excluded (D10, D23). MapLibre, PMTiles packs, Valhalla, Mapbox routing and Mapbox address geocoding stay. Google Maps Platform is not used (Vietnam is a prohibited territory under GMP Terms §3.2.1(c)(v)); the Google Cloud setup of 14 Oct is unused.
  2. **D39 (2026-10-14), amends D29 (1):** the stored base set of ~5,000 destinations; each matched to one of the 151 critters (nearest in country within a cap, admin-region overrides, Jev for the residual from candidate keys only); neighbours share a critter, which is their guide; base rows carry no critter set, so locals pages stay with the 61 places.
- Done when: both rows quote the founder and name what they amend.
- Status: todo

### T3 — Contract deltas
- Files: the other docs in `owns`.
- Steps:
  1. **system-architecture:** §2 data providers (`:64`): Foursquare out; §4.9 "Place details" row (`:271`): our profile and estimates, no live supplier; supplier rule text (`:274`) drops the Foursquare sentences.
  2. **data-model §3.13** (`:451-481`): `pois` is the lean index (rule and kept set written out); `place_profiles` gains `estimates`; `crowd_forecasts` gains source `estimate`; retiring: `poi_foursquare_ids`, `poi_foursquare_photos`, `foursquare_api_usage`, `fsq_os_export_*`, `poi_embeddings`, `poi_live_checks`, `place_profiles.photos`. §3.3 destinations: the base-set columns from #917 (and the drift fix: no `guide_id`, no bbox column).
  3. **data-model-sync-and-privacy:** catalog stream excludes base rows; base rows reach a phone through its crews' trips, poll options and pitches (as #917 built).
  4. **api-contracts §5.5** (`:684-699`): `GET /v1/places/{id}` profile block adds `estimates{…, label: 'estimate' | 'cited', sources[]}`; `GET /v1/media` drops `include=foursquare` and serves place subjects only for popular places; retiring: `/v1/places/{id}/live`, `/v1/places/search/live`, `/v1/places/search/live/resolve`. §6 AI tools unchanged.
  5. **api-contracts-planning:** "More places" (live Foursquare) retired from search; briefs may cite social and blog pages.
  6. **api-contracts-explore:** destination route `about` (from #917).
  7. **api-contracts-async §2.3** (`:217-229`): `places.ingest` scope (used destinations, Overture + OSM); new `places.prune` (operator), `media.propose` (weekly); retiring `places.fsq_match`, `places.fsq_export_chunk`, `places.pick`.
- Done when: every route, column, queue and switch named in phases 3–6 appears once.
- Status: todo

## Rollback

Revert the docs commit. The photo stop is deliberate and stays.
