---
phase: 1
title: Decisions, contracts and the photo stop
status: in_progress
depends_on: []
lane: B
tasks: 3
gate: none
owns:
  - services/worker/src/places/profile/{photos.ts,evidence.ts,run.ts,store.ts}
  - services/worker/src/places/profile/purge-photos-cli.ts
  - services/worker/test/places/profile-*.test.ts
  - services/api/src/places/{profile.ts,place-photo.ts}
  - services/api/src/explore/picks.ts
  - services/api/test/places/profile*.test.ts
  - docs/product-decisions.md
  - docs/decisions/20261014-google-maps-and-places.md
  - docs/decisions/20261014-destination-base-set.md
  - docs/decisions/README.md
  - docs/decisions/20260927-maplibre-pmtiles-on-r2.md (superseded note only)
  - docs/system-architecture.md
  - docs/data-model.md
  - docs/data-model-sync-and-privacy.md
  - docs/api-contracts.md
  - docs/api-contracts-planning.md
  - docs/api-contracts-explore.md
  - docs/api-contracts-async.md
  - docs/design-system.md (map rows only)
---
# Phase 1 — Decisions, contracts and the photo stop

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D6 (`:20`, "No Google"), D24 (`:38`), D25 (`:39`), D27 (`:41`), D28 (`:42`), D29 (`:43`), D31 (`:45`, "The open-data place index stays"); entitlement matrix "offline maps and plan" (`:129`) |
| Audit | `data-sources-audit-261014-0123-…` finding 1: profile photos have no licence check |
| Code | `services/worker/src/places/profile/run.ts:135` (`findPhotoHits`), `:220-221` (`keepPhotos`, `saveProfilePhotos`); `evidence.ts:90` (`storePhotos`); `photos.ts:28` (`c/place-profiles/<poi>/n.jpg`); `store.ts:209` (`UPDATE place_profiles SET photos`); readers `services/api/src/places/profile.ts:134`, `place-photo.ts:18-23`; destination cover from a pick's profile photo `services/api/src/explore/picks.ts:84-89` |

## Overview

Two things that cannot wait: stop re-hosting web images (legal exposure, founder: "stop immediately — first task"), and write the decisions and contract deltas once, so the three lanes code against one text and never edit the same doc. This phase merges as its own small PR the day it is ready.

Done when: no profile run searches or downloads an image; no api response carries a profile photo; R2 holds no object under `c/place-profiles/`; `place_profiles.photos = '[]'` everywhere on staging; D38, D39, two ADRs and every contract delta below are on `main`.

## Tasks

### T1 — Stop scraped profile photos
- Goal: no web image is fetched, stored or served again; the stored ones are deleted.
- Files: `services/worker/src/places/profile/{photos.ts (delete),evidence.ts,run.ts,store.ts}`, `services/worker/src/places/profile/purge-photos-cli.ts`, `services/api/src/places/{profile.ts,place-photo.ts}`, `services/api/src/explore/picks.ts`, their tests.
- Steps: 1. Remove the image search and download (`run.ts:135,220-221`, `evidence.ts:68-90`, `photos.ts`). 2. Readers return no profile photo: `profile.ts:134` drops `photos`; `place-photo.ts` returns the Commons/Foursquare/stock order without the profile step; `coverOf` (`picks.ts:84`) falls back to the destination's `media_assets` hero or none. 3. One-off worker CLI lists and deletes every object under `c/place-profiles/` (batched, dry-run flag, prints counts) and sets `photos = '[]'`; run on staging, record counts in the PR. The column stays until phase 5.
- Tests: `pnpm --filter @cp/worker test -- profile` (a run makes no image-search call: the search double records none); `pnpm --filter @cp/api test -- places/profile` (response has no photos).
- Done when: staging bucket listing under the prefix is empty; a fresh profile run on staging stores text only.
- Status: done — 8c15203f7 (code and dry run; the staging delete waits for the founder's go)

### T2 — Decision log and ADRs
- Goal: the founder's 14 Oct decisions are the contract.
- Files: `docs/product-decisions.md`, `docs/decisions/20261014-google-maps-and-places.md`, `docs/decisions/20261014-destination-base-set.md`, `docs/decisions/README.md`, superseded note in `docs/decisions/20260927-maplibre-pmtiles-on-r2.md`.
- Steps:
  1. **D38 (2026-10-14), amends D6, D24, D25, D27, D28, D31:** places come from Google Places API (New) through our api (autocomplete with sessions, Text Search IDs-only to resolve names, Nearby and Text Search Pro for discovery, Place Details per-screen masks, Place Photos with author credit); the app map is Google Maps (iOS and Android) in our light and dark looks (JSON map styles, `customMapStyle`; a cloud Map ID only if a style ever needs cloud-only features); only `place_id` is stored indefinitely and Google coordinates at most 30 days; no Google name, address, hours, rating, price or photo is stored, cached on a phone or sent to a model; our layer (profiles, briefs, notes, stops) is keyed by our place id carrying `google_place_id`; the open-data index, its ingest and refresh, machine picks, Foursquare live details and search, Mapbox address geocoding, map packs and the PMTiles pipeline are retired (D31's "The open-data place index stays" is reversed); no in-app offline map: the offline trip day is our own text (labels, times, crew notes, our addresses, profile text) plus "Open in Google Maps"; Mapbox stays for live ETAs and Valhalla for planning legs. Quote the founder's words from the brief ("their map is also very customizable"; Vietnam coverage accepted, no spike).
  2. **D39 (2026-10-14), amends D29 (1):** a stored base set of ~5,000 destinations (recipe as decision 1); each matched to one of the 151 critters (nearest in country within a cap, admin-region overrides, Jev for the residual from candidate keys only); neighbouring destinations share a critter, which is their guide; base rows carry no critter set, so locals pages stay with the 61 places.
  3. Entitlement matrix (`:129`): "offline maps and plan" → "offline plan".
  4. ADR "Google Maps and Places": field → SKU table (decision 4 of plan.md), caps, attribution rules (Google Maps logo 16–19 dp or "Google Maps" text 12–16 sp off-map; photo author credit and a path to the larger photo; "Places API results displayed on a map must be shown on a Google Map"), styling by `customMapStyle` JSON and why not a Map ID (no console step, runtime light/dark switch, a Map ID bills Dynamic Maps loads after 10 k a month), the react-native-maps choice and why `expo-maps` is out, the Google Cloud project (`critterpass-e3c73`, shared with Firebase), the three keys and their restrictions (names only). ADR "Destination base set": sources, licences (GeoNames CC BY 4.0 credit, Wikidata CC0, Wikivoyage as a filter only, Commons per-file licence), recipe, matching.
- Tests: none (docs). `pnpm exec prettier --write` on the files.
- Done when: both D rows quote the founder and name the amended decisions; the README index lists both ADRs; the MapLibre ADR says superseded.
- Status: done — 2c639f70e

### T3 — Contract deltas
- Goal: lanes code against written contracts; nobody else edits these docs until phase 5 T4.
- Files: `docs/system-architecture.md`, `docs/data-model.md`, `docs/data-model-sync-and-privacy.md`, `docs/api-contracts.md`, `docs/api-contracts-planning.md`, `docs/api-contracts-explore.md`, `docs/api-contracts-async.md`, `docs/design-system.md`.
- Steps:
  1. **system-architecture:** topology (`:46` R2 PMTiles out; `:64` data providers add Google Places API (New) and Maps SDKs, drop Foursquare); §4.6 Context (`:224`) "our place layer, never Google content"; §4.9 Place details row (`:271`) → Google; §6 secrets (Google keys per platform and environment); §8 pinned (`:486` MapLibre → `react-native-maps` with the Expo SDK 58 version); §11 tiles spike row (`:570`) superseded.
  2. **data-model §3.13** (`:451-481`): `pois` is the place registry: new `google_place_id`, `name_source`, `location_source`, `location_fetched_at`, `google_checked_at`; `lat`/`lng` nullable (Google points expire); new `google_places_usage` (S); tables to drop in phase 5 marked "retiring". **§3.3 destinations** (`:161`, `:199`): `origin`, `wikidata_qid`, `geonames_id`, `country_code`, `admin1`, `kind`, `lat`, `lng`, `population`, `names`, `base_rank`, `critter_match`, `texts`, `place_bounds` (fix the drift: no `guide_id`, no bbox column).
  3. **data-model-sync-and-privacy:** catalog stream excludes `origin = 'base'`; base rows reach a phone through its crews' trips, poll options and pitches; `trip_places`/`place_cards` add `google_place_id`; `trip_pack` loses `map_regions` in phase 5.
  4. **api-contracts §5.5** (`:684-699`): new `GET /v1/places/autocomplete`, `POST /v1/places/pick`, `GET /v1/places/{id}/photos`, `GET /v1/places/nearby`; `GET /v1/places/{id}` takes our id or a Google place id and adds a `google` block (`no-store`); `GET /v1/places?q` returns base rows with `line` and photo; retiring in phase 5: `/v1/places/{id}/live`, `/v1/places/search/live*`, `GET /v1/geocode` (forward), `/v1/map/regions/*`. §6 AI tools: `places_search`/`place_details` read our layer only. Errors reuse §3 codes (no new code): a per-user limit is `RATE_LIMITED`; a monthly cap, the `places.google` switch off or a Google outage is `SUPPLIER_UNAVAILABLE` (retryable false at the cap, true on an outage); a Google timeout is `UPSTREAM_TIMEOUT`.
  5. **api-contracts-planning:** plain-words search and link import resolve through Google (`:57`, `:63`); gap ideas may add Nearby results (display-only).
  6. **api-contracts-explore:** destination route (`:30`) adds `about` (facts-only text) for base rows.
  7. **api-contracts-async §2.3** (`:217-229`): add `places.location_refresh` (daily), `places.google_id_refresh` (monthly), `places.google_backfill` (operator), `destinations.base_build` (monthly), `destinations.describe`, `destinations.critter_match`; mark retiring: `poi.ingest`, `places.ingest`, `places.ingest_tile`, `places.map_region_register`, `places.fsq_match`, `places.pick`.
  8. **design-system** (`:246`, `:258`): `PlanningMapCanvas`/`MapView` on Google Maps with the light/dark JSON styles; the Google Maps attribution component.
- Tests: none (docs).
- Done when: every route, column, queue and stream named in phases 2–5 appears here once.
- Status: done — df68d90a2

## Risks and rollback

| Risk | Mitigation |
|---|---|
| Purging R2 removes photos a screen still expects | T1 changes the readers first and deploys before the purge runs |
| Docs drift from what lanes build | Phase 5 T4 reconciles against the merged code |

Rollback: revert the docs commit. The photo stop is deliberate and is not undone.
