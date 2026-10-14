---
phase: 3
title: Google Places on the server and the place registry
status: pending
depends_on: [1]
lane: B
tasks: 9
gate: none. The server key exists (`GOOGLE_PLACES_API_KEY`, Places API (New) only, root `.env` and Railway staging api + worker; project `critterpass-e3c73`, 5,000,000 VND/month budget alert, 14 Oct 12:30). Production caps are set before launch (T3)
owns:
  - packages/db/migrations/<ts>_pois_google_place_ids.sql
  - packages/db/migrations/<ts>_google_places_usage.sql
  - packages/db/src/schema/{places.ts,trip-places.ts,place-cards.ts,planning.ts (trip_ideas lat/lng only),meetups.ts (lat/lng only)}
  - packages/db/src/places/kept-places.ts
  - packages/db/test/permissions/{google-places-usage.test.ts,pois.test.ts,trip-places.test.ts,place-cards.test.ts}
  - packages/db/test/places/**
  - packages/suppliers/src/google-places/**
  - packages/domain/src/places/{google-types.ts,google-fields.ts,queues.ts}
  - services/api/src/places/google/**
  - services/api/src/places/{routes.ts,detail.ts,on-demand-ingest.ts,search.ts}
  - services/api/src/planning/imports/{match.ts,pipeline.ts}
  - services/api/src/planning/search/{evaluate.ts,run.ts}
  - services/api/src/planning/fit/{context.ts,nearby.ts,gap-ideas.ts,signals/visit.ts}
  - services/api/src/planning/fixers/too-far-candidates.ts
  - services/api/src/explore/plan-read.ts
  - packages/db/src/planning/stay.ts
  - services/api/test/{places,planning}/**
  - services/worker/src/places/google/**
  - services/worker/src/jobs/places/{location-refresh,google-backfill,google-id-refresh}.ts
  - services/worker/src/places/profile/{brief-match.ts,brief-run.ts,run.ts (inputs only)}
  - services/worker/src/jobs/ai/draft/{place-picks.ts,draft.ts,load-places.ts}
  - services/worker/src/jobs/planning/{legs/load.ts,check/context.ts,check/run.ts,ideas/placement-load.ts}
  - services/worker/src/jobs/critters/verify.ts
  - services/worker/test/{places,planning,jobs}/**
  - infra/powersync/streams/places.yaml
mount_points:
  - services/{api,worker}/src/env.ts and .env.example files (Google key and caps; append-only)
  - packages/domain/src/admin/service-keys.ts (`places.google.enabled`; append-only)
  - services/worker/src/job-registry.ts (append-only)
  - infra/powersync/sync-streams.yaml, apps/mobile/src/data/powersync/synced-tables.generated.ts (regenerated)
---
# Phase 3 — Google Places on the server and the place registry

## Context links

| Source | Section |
|---|---|
| Founder decisions 3, 5, 6 | plan.md; D38 (phase 1 T2) |
| Google (read 14 Oct) | Field → SKU (Place Details: IDs Only = `id`, `photos`, `movedPlaceId`; Essentials = `location`, `formattedAddress`, `shortFormattedAddress`, `types`, `viewport`; Pro = `displayName`, `primaryType`, `googleMapsUri`, `businessStatus`, `utcOffsetMinutes`; Enterprise = opening hours, `rating`, `userRatingCount`, `priceLevel`, `websiteUri`, phones). Text Search and Nearby: `displayName`, `location`, `photos` are Pro. Prices and free caps: Details IDs Only and Text Search IDs Only unlimited; Details Essentials 10 k then $5/1k; Pro 5 k / $17; Enterprise 1 k / $20; Text Search Pro and Nearby Pro 5 k / $32; Autocomplete requests 10 k / $2.83 (session usage free when the session ends in Place Details); Photos 1 k / $7. Policies: "You can therefore store place ID values indefinitely"; photo/review author credit; "Google Maps" logo or text off-map |
| Registry | `pois` (`packages/db/src/schema/places.ts:50-91`), not published (`packages/db/src/publication.ts:91-94,185`); copies: `trip_places` (`20261006060000_trip_places.sql:9-38,89-120`, refreshed by `places.trip_refresh`, events `packages/domain/src/places/trip-place-events.ts:19-36`), `place_cards` (trigger, `20261006070000_place_cards.sql:43-102`), `trip_ideas` and `meetups` keep their own name/lat/lng |
| Usage pattern | `mapbox_geocode_usage` + `app.reserve_mapbox_geocode_call` (`20261004104623_mapbox_geocode_usage.sql:7-25`, called from `services/api/src/geocoding/routes.ts:100`): one row per month, atomic `calls < cap` update, refused count |
| Routes today | `services/api/src/places/routes.ts:113` (search), `:160` (detail), `:184` (live) |
| Brief | `matchBriefLeads` (`services/worker/src/places/profile/brief-match.ts:106`) via open-data candidates; called `brief-run.ts:141`; `writePicks` `brief-run.ts:161` |
| Other open-data readers | link import `services/api/src/planning/imports/match.ts:110-121`; plain words `search/evaluate.ts:12` → `places/search.ts:244-256`; gap ideas `fit/nearby.ts:34,55,63`, `fit/gap-ideas.ts:56`; draft picks inline `services/worker/src/jobs/ai/draft/place-picks.ts:40` (`draft.ts:93`); on-demand ingest and picks `services/api/src/places/on-demand-ingest.ts:75-90,127-142` |
| Commands | 17 carry a `poi_id` (list in the scout notes: `save_idea`, `hide_place`, `set_place_stance`, `set_must_dos`, `record_visit`, `start_encounter`, `add_expense`, `create_meetup`, `rate_places`, `swipe_vote`, `apply_plan_ops`, …): **unchanged** |

## Overview

Goal: the server can search, resolve, describe and photograph any place through Google, keep only what the terms allow, and key every existing and new place in `pois` by `google_place_id` without changing an id.

Done when (staging): the four new routes answer from Google within budget; every row in the kept set has a registry entry and ≥ 90 % carry a `google_place_id`; a new brief resolves names through Text Search IDs-only and drops the rest; no Google field except id and a ≤ 30-day point is written anywhere (DB tests); `places.google.enabled` off turns every Google route into `SUPPLIER_UNAVAILABLE` and the app keeps working on our layer.

## Requirements

| Surface | Google call (mask) | SKU | Stored |
|---|---|---|---|
| Search box | Autocomplete (New) with `sessionToken`, `locationBias.circle` (stay or destination centre, radius from `place_bounds`), `languageCode` = reader's; mask `suggestions.placePrediction.{placeId,structuredFormat,types,distanceMeters}` | Autocomplete requests (free when the session ends in a pick) | nothing |
| Pick (ends the session) | Place Details with the same session; `location,types,shortFormattedAddress` | Details Essentials | `google_place_id`, label = the prediction's main text (crew-confirmed), point ≤ 30 days, our category from `types` |
| List card photo | Details `photos` (IDs Only) → Photo media `maxWidthPx=480`, `skipHttpRedirect=true` | IDs Only + Photos | nothing (`photoUri` passed through) |
| Place page | Details `displayName,formattedAddress,location,googleMapsUri,regularOpeningHours,currentOpeningHours.openNow,rating,userRatingCount,priceLevel,websiteUri,nationalPhoneNumber,businessStatus,utcOffsetMinutes,photos` | Enterprise | nothing |
| Plain words, "more places" | Text Search with request filters (`openNow`, `priceLevels`, `locationBias`); mask `places.{id,displayName,location,primaryType,photos}` | Text Search Pro | nothing until saved (then a pick) |
| Gap ideas near a stop | Nearby Search (`includedTypes` from our category); same mask | Nearby Pro | nothing until saved |
| Resolve a name (brief, link, backfill) | Text Search, mask `places.id` | IDs Only | `google_place_id` |
| Point for a resolved row | Details `location,types` | Essentials | point ≤ 30 days |
| Point refresh / id refresh | Details `location` / `id` | Essentials / IDs Only | point / moved id |

Rules: every Google response is `Cache-Control: no-store` and carries `attribution{provider:'google', authors[]}`; nothing from it enters `llm.*` views, model prompts or our tables beyond the "Stored" column; per-user limits (autocomplete 60/min, details 120/h, photos 300/h, text and nearby 30/h).

## Architecture & contracts

| Kind | Delta |
|---|---|
| Migration (registry) | `pois`: `google_place_id text UNIQUE`, `name_source text NOT NULL DEFAULT 'open_data'` (`open_data`, `editorial`, `crew`, `ai`; backfill editorial), `location_source text NOT NULL DEFAULT 'own'` (`own`, `google`), `location_fetched_at timestamptz`, `google_checked_at timestamptz`; `lat`/`lng` nullable on `pois`, `trip_places`, `place_cards`, `trip_ideas`, `meetups`; `trip_places` and `place_cards` gain `google_place_id` (copied by `app.refresh_trip_places` and `app.sync_place_card`, both tolerating null points); column grants for `admin_reader` |
| Migration (usage) | `google_places_usage(month text, sku text, calls int, refused_calls int, PK(month, sku))`, class S, forced RLS, `app_system` only; `app.reserve_google_places_call(p_sku text, p_cap int) RETURNS boolean` (the Mapbox pattern) |
| Streams | `places.yaml`: the four `AS pois` selects add `google_place_id` (regenerate both generated files) |
| Client | `packages/suppliers/src/google-places/`: zod-typed `autocomplete`, `details(mask)`, `textSearch(mask)`, `nearby(mask)`, `photoUri`; `X-Goog-Api-Key` from `GOOGLE_PLACES_API_KEY`; timeouts 1.5 s (autocomplete) / 4 s; one retry on 5xx; `NOT_FOUND` and `movedPlaceId` surfaced |
| Masks | `packages/domain/src/places/google-fields.ts`: one named mask per surface and its SKU (used by the client, the caps and a test) |
| Api routes | `GET /v1/places/autocomplete?q&session&trip_id?&destination_id?&near?` → `{suggestions[{google_place_id, main, secondary, kind: place\|address, distance_m?}]}`; `POST /v1/places/pick {google_place_id, session, label, trip_id?, destination_id?}` → `{place_id, name, lat, lng}`; `GET /v1/places/{id}` accepts our uuid or a Google place id and adds `google{…}` (null at the cap or switch off); `GET /v1/places/{id}/photos?max=1..10&w=` → `{photos[{uri, width, height, authors[{name, uri}]}]}`; `GET /v1/places/nearby?lat&lng&radius&category` |
| Jobs | `places.location_refresh` (daily `20 2 * * *` UTC; also on a pitch or trip event for that destination), `places.google_id_refresh` (monthly), `places.google_backfill` (operator, idempotent) |
| Env | `GOOGLE_PLACES_API_KEY` (api, worker), `GOOGLE_PLACES_MONTHLY_CAPS` (JSON; default `{autocomplete:30000, details_essentials:10000, details_pro:5000, details_enterprise:1000, text_pro:5000, nearby_pro:5000, photo:1000}`), `GOOGLE_LOCATION_TTL_DAYS` (30) |
| Switch | service key `places.google.enabled` (default on) |

## Tasks

### T1 — Registry columns, usage table, streams
- Files: both migrations, schema mirrors, `places.yaml`, generated files, permission tests.
- Steps: as Architecture. Readers of `trip_places`/`place_cards` keep their column names, so phones change nothing but gain `google_place_id`.
- Tests: `pnpm test:remote @cp/db -- google-places-usage` (system-only; reserve refuses at the cap; 20 concurrent reserves never pass the cap); `-- trip-places` (refresh copies `google_place_id`, accepts a null point); `-- pois` (grants unchanged for app_user).
- Done when: applied on a staging branch from the PR head; `pnpm tsx infra/powersync/build-config.ts --check` clean.
- Status: todo

### T2 — Google Places client and field masks
- Files: `packages/suppliers/src/google-places/**`, `packages/domain/src/places/google-fields.ts`, tests.
- Steps: as Architecture; recorded responses for Đà Lạt, Hội An, Lisbon (autocomplete, each details mask, text search IDs-only and Pro, nearby, photo media, `NOT_FOUND`).
- Tests: `pnpm --filter @cp/suppliers test -- google-places` (shapes, error mapping, retry); `pnpm --filter @cp/domain test -- google-fields` (each surface mask maps to the intended SKU; no Enterprise field in a list mask).
- Done when: one live call per endpoint from staging with `GOOGLE_PLACES_API_KEY` (recorded in the PR, key never printed).
- Status: todo

### T3 — Caps, limits and the switch
- Files: `services/api/src/places/google/usage.ts`, worker twin `services/worker/src/places/google/usage.ts` (shared SQL through `packages/db` if both need it), env lines, service key.
- Steps: 1. Every client call reserves its SKU first; a refusal returns `SUPPLIER_UNAVAILABLE` (retryable false) and the caller degrades (autocomplete → our rows; details → our layer + "Open in Google Maps"; photos → Commons/stock/category tile); per-user Redis limits as Requirements; a metric per SKU and an alert at 80 % of a cap. 2. Google-side ceilings with `gcloud` on `critterpass-e3c73`: per-method daily quotas for Places API (New) a little above our monthly caps / 30, and the server key restricted to Railway's static egress IPs (`gcloud services api-keys update … --allowed-ips`), if staging and production egress IPs are stable; record values (never key values) in `docs/runbooks/google-maps-setup.md` (lane C creates it; this step appends a section).
- Tests: route test with the cap at 1 (second call degrades, no Google request made).
- Done when: staging caps set in Railway; the alert fires in a dry run; quotas and the IP restriction applied or the reason they are not is recorded.
- Status: todo

### T4 — Read routes
- Files: `services/api/src/places/google/{autocomplete,pick,detail,photos,nearby}.ts`, `services/api/src/places/{routes.ts,detail.ts}`, tests.
- Steps: 1. Autocomplete as Requirements; `kind = address` when types include `street_address`, `premise`, `subpremise` or `route`. 2. Pick: find by `google_place_id` or insert (`destination_id` = the trip's, else the nearest destination centre within 100 km, else 400 `VALIDATION`; `name_source = 'crew'`; `category` from `google-types.ts`; `timezone` from the destination; `location_source = 'google'`); an existing row keeps its name. 3. Detail and photos as Requirements; the old `/live` route stays until phase 5. 4. Nearby.
- Tests: `pnpm --filter @cp/api test -- places/google` (session token passed through and ended by the pick; a second pick of the same place returns the same id; the pick writes only allowed columns: the test compares the row before and after against an allow-list; `no-store` on every Google response; a Google place id that is not in the registry opens with `place_id: null` and creates no row).
- Done when: staging answers autocomplete p95 < 400 ms and detail p95 < 900 ms (api timing log).
- Status: todo

### T5 — Points that expire, ids that move
- Files: `services/worker/src/places/google/{refresh,expire,moved}.ts`, `services/worker/src/jobs/places/{location-refresh,google-id-refresh}.ts`, `packages/domain/src/places/queues.ts`, tests.
- Steps: 1. Needed = Google-sourced rows referenced by a trip in `planning`, `pre`, `in`, or ended ≤ 14 days ago (through `app.trip_place_refs`), or a brief/curated place of a destination with a pitch or trip in the last 30 days. 2. Needed and `location_fetched_at` older than 25 days → Details Essentials, update the point, call `app.refresh_trip_places` for affected trips; copies in `trip_ideas` and `meetups` updated by `poi_id`. 3. Not needed and older than `GOOGLE_LOCATION_TTL_DAYS` → null the point in `pois` and the same copies. 4. A pitch or trip event for a destination queues a refresh for its brief places. 5. Monthly: rows with `google_checked_at` older than 12 months → Details IDs Only; `movedPlaceId` → update; `NOT_FOUND` → `status = 'closed'`.
- Tests: `pnpm test:remote @cp/worker -- places/location-refresh` (a needed stale point is refreshed and copied to `trip_places`; an unneeded one is nulled everywhere; an own point is never touched).
- Done when: on staging, a daily check query shows 0 needed Google points older than 30 days.
- Status: todo

### T6 — Staging backfill of existing places
- Files: `packages/db/src/places/kept-places.ts`, `services/worker/src/jobs/places/google-backfill.ts`, `services/worker/src/places/google/backfill.ts`, tests.
- Steps: 1. Kept set (SQL, shared with phase 5): rows referenced by any `poi_id` column (the 26 FK columns), `spawn_rules.poi_ids`, active `swipe_sessions.deck` cards, `saved_items` of kind `poi`, `destination_briefs` essentials/eateries, `place_profiles`, `crowd_forecasts`, `poi_hours_proposals`, plus `curation = 'editorial'`. 2. Per row: Text Search IDs-only, `textQuery` = name (+ address when ours), `locationRestriction` rectangle ±150 m, `pageSize` 1. 3. A Google id already taken by another kept row: keep the row with more references (editorial first), set the other's `merged_into_id`, leave its id null. 4. Unresolved rows stay our own places (our name and point; "Open in Google Maps" searches by name). 5. Report per destination: kept, resolved, merged, unresolved.
- Tests: `pnpm test:remote @cp/worker -- places/google-backfill` (ids never change; re-run is a no-op; duplicate resolution as step 3).
- Done when: run on staging, report in the PR, ≥ 90 % resolved for the 8 curated cities; same job ready for production (expected to be near-empty).
- Status: todo

### T7 — Briefs, links, plain words and gap ideas on Google
- Files: `services/worker/src/places/profile/{brief-match.ts,brief-run.ts}`, `services/worker/src/places/google/resolve.ts`, `services/api/src/planning/imports/{match.ts,pipeline.ts}`, `services/api/src/planning/search/{evaluate.ts,run.ts}`, `services/api/src/places/search.ts`, `services/api/src/planning/fit/{nearby.ts,gap-ideas.ts}`, `services/worker/src/jobs/ai/draft/{place-picks.ts,draft.ts}`, `services/api/src/places/on-demand-ingest.ts`, tests.
- Steps: 1. Brief: each lead name → Text Search IDs-only inside the destination box → find-or-create (`name_source = 'ai'`, the AI's name) → point via Details Essentials; unresolved → `dropped`; `writePicks` keeps the order. 2. Link import: a Google Maps URL with `query_place_id`/`place_id` is used as is; other names resolve as in 1; open-data trigram matching goes. 3. Plain words: our rows of the destination first (curated, brief, the trip's), then Text Search Pro with the parsed filters, display-only. 4. Gap ideas: our rows, then Nearby Pro, display-only. 5. Draft no longer runs `places.pick` inline; it waits for the brief (already queued on pitch and trip) with the existing timeout. 6. `on-demand-ingest.ts` stops queueing ingest and picks; keeps brief and warm-up.
- Tests: brief run with recorded Google fixtures (resolved names stored as ids, an unknown name dropped); import match test (URL id, name resolve); plain-words test (filters sent as request params, no Enterprise field in the mask).
- Done when: a cold destination's brief on staging lists resolved places only; a TikTok/Google Maps link adds the right place.
- Status: todo

### T8 — Our category and profiles for Google rows
- Files: `packages/domain/src/places/google-types.ts`, `services/worker/src/places/profile/run.ts` (inputs), tests.
- Steps: static map of Google place types to `POI_CATEGORIES` (`packages/domain/src/places/categories.ts:10`), used at pick and resolve; the profile job (Jev `place.labels`, `labels.ts:58`) overwrites it with its own typing; profile and brief prompts receive our columns only.
- Tests: map unit test; a profile run test asserting the model input holds only registry columns (no Google response field).
- Done when: Google rows show our category and, after their profile, its typed fields.
- Status: todo

### T9 — Readers tolerate a missing point
- Files: `services/api/src/planning/fit/{context.ts:198-209,signals/visit.ts:34-48}`, `services/api/src/planning/fixers/too-far-candidates.ts:51-60`, `services/api/src/explore/plan-read.ts:186`, `packages/db/src/planning/stay.ts:81-113`, `services/worker/src/jobs/planning/{legs/load.ts:86-95,check/context.ts:211-221,check/run.ts:130-136,ideas/placement-load.ts:56-64}`, `services/worker/src/jobs/ai/draft/load-places.ts:58-105`, `services/worker/src/jobs/critters/verify.ts:51`, and whatever else the type checker lists after T1.
- Steps: a stop or candidate without a point gets no leg ("about" leg skipped), no fit distance and no pin; never a crash. The recap reader already filters (`services/worker/src/jobs/recap/contributors/plan.ts:45`).
- Tests: legs job test with a null-point stop; fit test with one.
- Done when: `pnpm turbo run typecheck --filter=...[HEAD]` clean in CI.
- Status: todo

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| Spend above caps through abandoned autocomplete sessions | M×M | Autocomplete cap 30 k; min 2 chars and 250 ms debounce in the app; per-user limit |
| Wrong match in backfill or brief | M×M | Tight restriction box; drop unresolved; report; the profile's name check (Jev labels) flags odd categories |
| Shared registry name differs from a crew's own label | L×L | First source wins; trips keep their own text in `trip_ideas`/items |
| Terms reading of the 30-day point or the crew label | M×H | Config TTL; G4 counsel read before launch |

## Rollback

`places.google.enabled` off: Google routes answer `SUPPLIER_UNAVAILABLE`; old open-data routes are untouched until phase 5. Migrations are additive (new columns, a new table, nullable points); backfill only adds ids, so reverting code leaves data valid.
