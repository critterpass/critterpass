---
phase: 2
title: Destination base set and critter match
status: in_progress
depends_on: [1]
lane: A
tasks: 7
gate: none (T5's spot check is the controller's, on the founder's behalf)
owns:
  - packages/db/migrations/<ts>_destinations_base_set.sql
  - packages/db/src/schema/trips.ts (destinations only)
  - packages/db/test/permissions/destinations-base.test.ts
  - packages/domain/src/destinations/**
  - packages/domain/src/media/commons-licence.ts
  - tools/content-factory/src/kinds/media/wikimedia.ts (import the moved filter)
  - packages/ai/src/routes/{destination-critter,destination-describe,destination-vn-picks}/**
  - packages/ai/evals/{destination-critter,destination-describe}/**
  - services/worker/src/destinations/**
  - services/worker/src/jobs/destinations/**
  - services/worker/test/destinations/**
  - services/api/src/routes/places-search.ts
  - services/api/src/commands/polls/candidates.ts
  - services/api/src/explore/destination-route.ts (the `about` field only)
  - services/api/test/routes/places-search*.test.ts
  - infra/powersync/streams/core.yaml (destinations queries only)
  - apps/mobile/src/features/vote/premium/places/search-places.tsx
  - apps/mobile/src/features/vote/data/{device-vote-services.ts,use-destination-search.ts}
  - e2e/vote/search-base-town.yaml
mount_points:
  - packages/domain/src/jobs/feature-queues.ts, services/worker/src/job-registry.ts (one line each, append-only)
  - packages/domain/src/ai/routes.ts (DECISION_ROUTES, AI_ROUTES), packages/domain/src/ai/decision-thresholds.ts, packages/ai/src/routing.ts (three routes)
  - services/worker/src/env.ts, services/worker/.env.example (one cap variable)
  - infra/powersync/sync-streams.yaml, apps/mobile/src/data/powersync/synced-tables.generated.ts (regenerated)
---
# Phase 2 — Destination base set and critter match

## Context links

| Source | Section |
|---|---|
| Founder decisions 1–2 (14 Oct) | plan.md; D39 (phase 1 T2) |
| Research | `researcher-261014-1146-destination-base-set-report.md` §3 recipe (10,146 candidates, 8,768 with ≥ 10 sitelinks; P18 89 %, P948 79 %; VN 31 typed items; GeoNames `wkdt` 11/313 VN cities), §5 matching, §6 storage (~2–4 KB a row) |
| Schema | `packages/db/src/schema/trips.ts:36-57` (no `place_bounds` in the mirror; column from `20261003090000_pois_open_data_fields.sql:30`); coverage check widened in `20261006100000_destination_links_and_trip_stops.sql:121`; admin_reader column grants `20260927142354_ops_console.sql:224-225`; `country` holds the set's name (`packages/db/seed/destinations.ts:12`) |
| Sync | catalog `SELECT * FROM destinations WHERE coverage <> 'area'` (`infra/powersync/streams/core.yaml:167`); poll places read locally (`apps/mobile/src/features/vote/data/poll-queries.ts:43-48`) |
| Search and vote | `services/api/src/routes/places-search.ts:74-148` (trigram, `MIN_SCORE` 0.3, excludes `area` at `:98`), `PlaceSearchRow` `:31-45`; `resolvePlace` rejects `area` (`services/api/src/commands/polls/candidates.ts:19-28`) |
| Critters | 151 rows, no coordinates (`tools/content-factory/batches/critters/2026-09-30-critters-01.json`: `set_code`, `city`); one destination per critter city via `app.sync_place_destinations()` (`20261004134500_city_critter_guides.sql:76-109`); guides by critter (`app.destination_guide_id`, `:115-128`) |
| Jev | `choice()` takes 2–255 options (`packages/ai/src/decide/questions.ts:75,88`); example `packages/ai/src/routes/place-profile/labels.ts:41-90`; a route needs `DECISION_ROUTES` (`packages/domain/src/ai/routes.ts:102-115`), a threshold (`decision-thresholds.ts:31`) and a twin (`packages/ai/src/routing.ts:298-303`) |
| Media | `media_assets` licence columns (`packages/db/src/schema/media-assets.ts:32-62`), subject keys `destination:<slug>`; `media.ingest` re-hosts with variants (`services/worker/src/jobs/media/ingest.ts:1-6`); Commons licence filter (`tools/content-factory/src/kinds/media/wikimedia.ts:1-45`) |
| Locals page | joins `critter_sets` on `critter_set_id` (`20261007100000_locals_place_public_view.sql:61-62`) |

## Overview

Goal: the vote and pitch reach ~5,000 real destinations, each with a licensed photo, a facts-only line and a critter guide, without syncing them to every phone and without touching the 152 rows that exist.

Done when (staging): 4,500–5,500 destination rows; ≥ 85 % of base rows have a ready `media_assets` hero with licence and author; 100 % have `critter_key` and `critter_match.method`; Vietnam ≥ 200 rows; `GET /v1/places?q=quy nhon` and `?q=Quy Nhơn` return Quy Nhơn in the top 3; a fresh phone's synced `destinations` count is unchanged (152 ± rows its crews use); the monthly rebuild changes no slug.

## Requirements

| Item | Rule |
|---|---|
| Candidates | Wikidata items with an en or vi Wikivoyage article, direct P31 in {city, town, village, big city, island, national park, region}, sitelinks ≥ 10; plus GeoNames `cities15000` rows with feature PPLC/PPLA/PPLA2 or population ≥ 50 k (Vietnam also `cities5000`) |
| Join | QID first (GeoNames `wkdt`), else normalised name + country + ≤ 25 km; dedupe on QID or same normalised name within 5 km |
| Rank and cap | `ln(sitelinks + 1) + 0.5·ln(population + 1)` + kind bonus (island, park +1); per country ≤ 150, floor 10 for a country with a critter, Vietnam ≤ 300; total target 5,000 |
| Existing rows | `seed`, `critter` and `area` rows are matched (QID, else name + country) and only **enriched** (QID, GeoNames id, centre, population, names, photo, text); their slug, name, coverage, set and critter never change |
| New rows | `origin = 'base'`, `coverage = 'guest'`, slug `<iso2>-<folded name>` (suffix `-2` on collision; never reused), `country` = English country name (as the column means today), `country_code` ISO-2, default `place_bounds` box around the centre (city 12 km, town 6 km, island/park/region 25 km) |
| Photos | P948 banner as rank 0 else P18; Commons file metadata (licence short name, artist, credit, licence URL); only PD, CC0, CC BY, CC BY-SA; `media_assets` rows (`source = 'wikimedia'`, subject `destination:<slug>`) then `media.ingest` re-hosts variants (2 a second, Wikimedia user agent); never replaces a hand-picked hero |
| Text | Facts-only (decision 1): input is Wikidata/GeoNames facts only (name, kind, country, admin area, population, elevation, coordinates, P31 labels), never Wikipedia or Wikivoyage prose; output `{line ≤ 90 chars, about ≤ 400 chars}` in en and vi; numbers must appear in the input (validator); shown as AI-written with "Facts: Wikidata, GeoNames" |
| Critter | Method order: admin-region override → nearest same-country critter within 350 km (ratio to second nearest ≥ 1.5) → Jev `destination.critter` choosing from ≤ 4 candidate keys (in-country nearest 3, else globally nearest 3) → nearest globally (never empty). Stored: `critter_key`, `critter_match{method, distance_km, confidence?}`. `critter_set_id` stays null on base rows |
| Licences | GeoNames CC BY 4.0 credit added where the app lists data credits (the attribution NOTICE); Wikidata CC0; Wikivoyage used as a filter only |

## Architecture & contracts

| Kind | Delta |
|---|---|
| Migration | `<ts>_destinations_base_set.sql`: columns `origin text NOT NULL DEFAULT 'critter' CHECK (origin IN ('seed','critter','area','base'))` (backfill: area rows `area`, the 7 seeded slugs `seed`), `wikidata_qid text UNIQUE`, `geonames_id integer UNIQUE`, `country_code text`, `admin1 text`, `kind text`, `lat`/`lng double precision`, `population integer`, `names jsonb NOT NULL DEFAULT '{}'`, `base_rank real`, `critter_match jsonb`, `texts jsonb NOT NULL DEFAULT '{}'`, `base_built_at timestamptz`; generated `search_name` (unaccented name + names values) with a trigram index; admin_reader column grants; RLS unchanged (C0, app_user SELECT, system writes); widen `content_releases.kind` with `destinations` |
| Queues | `destinations.base_build` (cron `0 5 3 * *` UTC + operator `{dry_run}`), `destinations.describe` (per row, daily cap `DESTINATIONS_DESCRIBE_DAILY_CAP_USD`, default $2), `destinations.critter_match` (per build) |
| AI routes | `destination.critter` (decision, Jev, fast-tier twin), `destination.describe` (generation, fast tier, structured), `destination.vn_picks` (generation, pro tier, structured, one-time) |
| Api | `GET /v1/places?q` searches `search_name` across every non-area row, ranks by similarity then `base_rank`, adds `line` (reader's language, en fallback) and `photo` (media key) to `PlaceSearchRow`; `locals` for a base row = its own critter's silhouette; switch `destinations.base_search` (default on) hides base rows when off. `resolvePlace` accepts base rows. `GET /v1/explore/destinations/{id}` adds `about` |
| Sync | catalog: `coverage <> 'area' AND origin <> 'base'`; new queries in `core.yaml` with the global `my_crews`: base destinations of my crews' trips (`trips.destination_id`), poll options (`poll_options.ref_id`) and pitches (`pitches.destination_id`) |

## Tasks

### T1 — Schema and permission test
- Files: migration, `packages/db/src/schema/trips.ts` (mirror incl. the missing `place_bounds`), `packages/db/test/permissions/destinations-base.test.ts`.
- Steps: as Architecture; `ON CONFLICT (slug)` in `app.sync_place_destinations()` must not touch rows whose `origin = 'base'` (a later critter city with the same slug updates only critter columns): amend the function in the same migration.
- Tests: `pnpm test:remote @cp/db -- destinations-base` (app_user reads base rows, cannot write; admin_reader sees the new columns; the sync function leaves a base row's text, photo and match alone).
- Done when: migration applies on a staging branch from the PR head; mirror matches.
- Status: done — 3d8d18a59 (applied on staging 14 Oct)

### T2 — Base-set builder
- Files: `services/worker/src/destinations/base/{geonames,wikidata,join,rank,upsert,run,cli}.ts`, `services/worker/src/jobs/destinations/index.ts`, `packages/domain/src/destinations/queues.ts`, tests with recorded fixtures.
- Steps: 1. Download GeoNames `cities15000.zip`, `cities5000.zip` (VN rows only), `countryInfo.txt`, `admin1CodesASCII.txt` to the worker's temp dir. 2. Wikidata SPARQL in batches (≤ 5 parallel, 60 s each, retry on 429) for the candidate recipe with labels (en, vi, local), P625, P17, P1082, P18, P948, sitelinks. 3. Join, dedupe, rank, cap (pure functions in `packages/domain/src/destinations/`). 4. Upsert through a temp table + one `INSERT … ON CONFLICT` (not row by row); enrich existing rows by the rule above. 5. Queue photos (T3), matching (T4) and texts (T6) for new or changed rows. 6. Summary row in the job result: counts per country, VN count, unmatched critter cities.
- Tests: `pnpm --filter @cp/domain test -- destinations` (join on QID and on name+distance, dedupe, cap with floor and VN limit, slug collision); `pnpm test:remote @cp/worker -- destinations/upsert` (existing seed/critter/area rows keep slug, name, coverage, set, critter).
- Done when: a staging run lands 4,500–5,500 rows and a second run changes no slug.
- Status: done — 61dc37f3f (staging dry run: 5,000 kept, VN 300; the writing run waits for the merge and the PowerSync redeploy)

### T3 — Licensed photos
- Files: `services/worker/src/destinations/base/photos.ts`, `packages/domain/src/media/commons-licence.ts` (moved from `tools/content-factory/src/kinds/media/wikimedia.ts`, which imports it), tests.
- Steps: Commons `imageinfo&iiprop=extmetadata|url` in batches of 50; keep allowed licences; write `media_assets` (pending) under one `content_releases` row per build (`kind = 'destinations'`); queue `media.ingest` at 2 a second.
- Tests: `pnpm --filter @cp/domain test -- commons-licence` (NC/ND/unknown rejected; author and credit strings built); recorded Commons fixture for three licences.
- Done when: ≥ 85 % of base rows show a ready hero on staging (`GET /v1/media?subjects=destination:<slug>`).
- Status: done — 7edd1f18e (ready-hero share measured after the staging run)

### T4 — Critter coordinates and matching
- Files: `packages/domain/src/destinations/{critter-match,critter-regions}.ts`, `packages/ai/src/routes/destination-critter/**`, `packages/ai/evals/destination-critter/**`, `services/worker/src/destinations/match.ts`, routing and route registry lines.
- Steps: 1. A critter's point = the centre of its own destination row after T2 enrichment; critter cities T2 could not place are listed in the build summary and placed by the hand table `critter-regions.ts` (region critters such as the Mekong and Borneo sets, single places such as Keukenhof and Sidi Bou Said, plus admin1 → critter overrides for US, CN, IN, AU, BR, ID, MY, TH; a code table, not a dataset). 2. Pure matcher per the Requirements order. 3. Jev residual with candidate keys only; below the route's confidence floor → nearest globally. 4. Writes `critter_key`, `critter_match`; never re-matches `seed`/`critter` rows.
- Tests: `pnpm --filter @cp/domain test -- critter-match` (single-critter country, Kalimantan → Borneo by override, island, near tie → residual, no-critter country → global nearest); eval suite (12 cases) for `destination.critter`.
- Done when: 100 % of base rows carry a critter and method; residual share recorded in the PR (expected 10–20 %).
- Status: done — b46063436

### T5 — Vietnam top-up
- Files: `services/worker/src/destinations/base/vn-topup{,-cli}.ts`, `packages/ai/src/routes/destination-vn-picks/**` (a third route, `destination.vn_picks`, pro tier, structured, registered with the other two).
- Steps: per GeoNames admin1 of Vietnam (towns did not move in the 2025 province merger), the 15 most populous candidates from `cities5000` → pro tier picks up to 4 travel-worthy ids from that closed list with a one-line reason; picked rows get `origin = 'base'`, `names.source = 'vn_pick'`, kept by every rebuild. Controller spot-checks the list once (on the founder's behalf) and records it in the PR.
- Tests: unit test that output ids outside the candidate list are dropped.
- Done when: Vietnam has ≥ 200 rows and the PR has the spot-check note.
- Status: done — 8cdec6616 (dry-run list of 102 picks in plans/reports/critterpass-builder-medium-261014-1237-destinations-vietnam-picks-report.md for the spot check)

### T6 — Facts-only text
- Files: `packages/ai/src/routes/destination-describe/**`, `packages/ai/evals/destination-describe/**`, `services/worker/src/destinations/describe.ts`, env line.
- Steps: per Requirements; en and vi at build; other app languages fall back to en; daily cap; `report_content` is not added (YAGNI).
- Tests: validator unit test (a number or year not in the facts → rejected); eval suite (10 destinations, en + vi).
- Done when: ≥ 98 % of base rows have `texts.en.line` and `texts.vi.line`; cost recorded in the PR.
- Status: done — 383ed94cf

### T7 — Search, vote, pitch and sync
- Files: `services/api/src/routes/places-search.ts`, `services/api/src/commands/polls/candidates.ts`, `services/api/src/explore/destination-route.ts`, `infra/powersync/streams/core.yaml`, generated sync and mobile schema files, `apps/mobile/src/features/vote/premium/places/search-places.tsx`, `apps/mobile/src/features/vote/data/*`, `e2e/vote/search-base-town.yaml`.
- Steps: 1. Api per Architecture. 2. Streams per Architecture; re-run `pnpm tsx infra/powersync/build-config.ts` and the synced-schema generator. 3. The search row shows `line` under the name (existing `Text` variants; one line, `numberOfLines={1}`); photos already come through `useDestinationMedia`. 4. Device flow: search "Quy Nhơn", pitch it, see it in the poll with its photo and guide.
- Tests: `pnpm --filter @cp/api test -- places-search` (base rows found by unaccented and Vietnamese names, ranked after exact matches, hidden with the switch off, area rows still excluded); `sync-streams-parameter-bounds` replay with base rows referenced by trips, polls and pitches (`pnpm test:remote @cp/db -- sync-streams-parameter-bounds`).
- Done when: Android device run of `e2e/vote` green with design | device sheets; `ui-reviewed` applied by the controller.
- Status: done — 37e4319d4, ca2f1b4a1 (Android device run after the staging base-set run)

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| WDQS throttles or times out | M×M | Batches by country, 5 parallel, retry with backoff; the build is monthly and resumable by country |
| Wrong neighbour critter (single-critter countries) | M×L | Distance cap + Jev residual; `critter_match` stored for audit; override table |
| Slug clash with a later critter city | L×M | T1 makes the sync function respect base rows; slugs never reused |
| Sync budget grows with base rows in polls/pitches | L×M | Same lookup shape as the FX queries; exact-replay test |
| Facts text invents | L×M | Facts-only input, number validator, AI-written label |

## Rollback

Switch `destinations.base_search` off (search and new polls stop offering base rows). Rows are additive: `DELETE FROM destinations WHERE origin = 'base' AND id NOT IN (<referenced by trips, polls, pitches>)` removes the rest. The migration's columns are nullable or defaulted; reverting code leaves them unused.
