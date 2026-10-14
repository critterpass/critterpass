---
phase: 4
title: "Popular places: AI estimates, planning research, curated media"
status: pending
depends_on: [1, 2]
lane: A
tasks: 6
gate: none (the controller approves media batches in the ops console on the founder's behalf)
owns:
  - packages/db/src/places/popular.ts
  - packages/db/migrations/<ts>_place_estimates.sql
  - packages/db/src/schema/{place-profiles.ts,travel-data.ts (crowd_forecasts source only)}
  - packages/db/test/places/popular.db.test.ts, packages/db/test/permissions/place-profiles.test.ts
  - packages/domain/src/places/{place-profile.ts,estimates.ts}
  - packages/ai/src/routes/{place-profile,destination-brief}/**
  - packages/ai/evals/{place-profile,destination-brief}/**
  - packages/suppliers/src/media-stock/**
  - tools/content-factory/src/kinds/media/{pexels.ts,pixabay.ts,wikimedia.ts,http.ts} (import the moved clients)
  - services/worker/src/places/profile/** (except files phase 1 changed in #916, once merged it is free)
  - services/worker/src/places/pick/{run.ts,select.ts} (moved, see T3)
  - services/worker/src/jobs/media/propose.ts
  - services/worker/test/{places/profile,media}/**
  - services/api/src/places/{profile.ts,foursquare-photo-assets.ts}
  - services/api/src/editorial-media/route.ts
  - services/api/src/routes/place-crowd-forecasts.ts
  - services/api/src/planning/fit/signals/crowds.ts
  - services/api/test/{places,editorial-media,planning}/** (files for the above)
mount_points:
  - packages/ai/src/routing.ts, packages/domain/src/ai/routes.ts (route ids unchanged; prompt and schema versions bump)
  - packages/domain/src/admin/service-keys.ts (`places.estimates.enabled`, `places.social_research.enabled`; append-only)
  - packages/domain/src/jobs/feature-queues.ts, services/worker/src/job-registry.ts (`media.propose`; append-only)
---
# Phase 4 — Popular places: AI estimates, planning research, curated media

## Context links

| Source | Section |
|---|---|
| Founder decisions 2, 4, 5 (14 Oct 13:25–13:30) | plan.md; D38 (phase 1 T2) |
| Profile pipeline | `services/worker/src/places/profile/run.ts`: Jev labels `:124` (`packages/ai/src/routes/place-profile/labels.ts:58`), pages `:137` (`evidence.ts`, two searches, top two pages), DeepSeek write `:148` (`place.profile_fast`/`place.profile`, `packages/ai/src/routing.ts:285-286`), cite-or-drop `:159` (`routes/place-profile/validate.ts`), second source `:199`; store `store.ts:101-249`; columns `packages/db/src/schema/place-profiles.ts` (`texts`, `best_times`, `visit_min`, `meal_role`, `dish`, `facts`, `dropped_facts`, `sources`) |
| Warm-up | `services/worker/src/places/profile/warm.ts:25-40`: top 30 by essential, must-see, `pick_rank`, confidence |
| Crowds | `crowd_forecasts` unique `(poi_id, source, dow)` (`packages/db/src/schema/travel-data.ts:117-140`), source check widened in `20261003180100_planning_places_column_deltas.sql:166`; readers `services/api/src/routes/place-crowd-forecasts.ts:50-52`, fit `services/api/src/planning/fit/signals/crowds.ts:15-16` (`visits`, `editorial` only) |
| Research | `services/worker/src/places/profile/search.ts:18-28` excludes Foursquare, Facebook, Instagram, TikTok, YouTube, Pinterest plus `SUPPLIER_BLOCKED_DOMAINS` (`packages/ai/src/tools/blocked-domains.ts`: OTAs, Tripadvisor, Google Maps); the brief uses the same search (`brief-evidence.ts:44,82`) and matches leads to our rows (`brief-match.ts:106`, `brief-run.ts:141`), fill from `pick/run.ts` (`brief-run.ts:25,156-161`); social readers `packages/suppliers/src/social` (TikTok and YouTube oEmbed) |
| Media | `/v1/media` merges editorial assets with Foursquare photos on `include=foursquare` (`services/api/src/editorial-media/route.ts:8-9,124-134`, `places/foursquare-photo-assets.ts`); app rule `apps/mobile/src/features/explore/place-photo.ts` (`poi:<id>` subjects, generic stock labelled "not this place"); content factory media kind (`tools/content-factory/src/kinds/media/{pexels,pixabay,wikimedia,place-match,subjects}.ts`, subjects hand-listed for 8 destinations `subjects.ts:21-76`); approval `approve_content_batch` (`services/api/src/admin/content/commands.ts:137`) → `content.publish` → `writers-media.ts` → `media.ingest` (`services/worker/src/jobs/media/ingest.ts`); release rows `content_releases` (`artifact` jsonb, `status`, `stage`) |

## Overview

Goal: the places people are most likely to visit get useful, honest numbers (busy times, how long, when, tips, fee) and a real photo or clip; the planning agent finds places where travellers actually talk about them; nothing else carries a photo.

Done when (staging): `popular_places(destination)` returns ≤ 40 rows for every used destination; ≥ 90 % of popular places in Đà Lạt, Đà Nẵng and Hội An have a ready profile with estimates, each field marked `estimate` or `cited`; popular places show busy-time estimates through the crowd route; a new brief cites at least one blog or social page where one exists and stores only resolved places; a media batch for popular places without media is in the ops review queue; `/v1/media` returns no Foursquare photo, no generic stand-in for a place, and no place photo outside the popular set.

## Requirements

| Item | Rule |
|---|---|
| Popular | Per destination, active and not merged, in order: editorial `essential`, brief essentials (rank), brief eateries (rank), editorial `must_see`; transit, stay and health excluded; at most 40. One SQL function in `packages/db/src/places/popular.ts` used by warm-up, estimates, media and `/v1/media` |
| Estimates | For popular places only: visit length, best time(s) of day, busy times, entry fee, tips (≤ 3), what to wear or bring. Each field `{value, basis: 'cited' \| 'estimate', source?}`; `cited` needs a quote on a fetched page (the existing check); otherwise `estimate`. Fee and dress are never cited from a social page. Closed fields typed by Jev (visit length bucket, best time slots, busy level per window: quiet/moderate/busy) |
| Busy times | The model names up to five windows (day group + hours); code turns them into hourly curves per weekday and writes `crowd_forecasts` rows with `source = 'estimate'`; shown only when no `visits` or approved `editorial` curve exists; copy "usually busy from 10 (estimate)" |
| Research | Two domain policies: **facts** (as today: suppliers, OTAs, review sites, Foursquare, Google Maps, social, pin boards excluded) for fee, hours, dress; **suggestions** (briefs and profile tips) additionally allow Facebook, Instagram, TikTok, YouTube and Reddit pages and any travel blog. Social pages are read through oEmbed captions or search snippets, never scraped. Queries carry places, dates and topics only (D23). A lead that does not resolve to one of our rows is dropped |
| Media | Approved assets only (Commons, Pexels, Pixabay; photos and short clips); proposals for popular places without a ready asset and destinations without a hero, weekly; the controller approves in the ops console. A place shows an asset filed under that place only; generic stand-ins are no longer served for places |

## Tasks

### T1 — Popular set
- Files: `packages/db/src/places/popular.ts`, `services/worker/src/places/profile/warm.ts`, test.
- Steps: the function per Requirements; warm-up queues the popular set instead of its top-30 query.
- Tests: `pnpm test:remote @cp/db -- places/popular` (order, exclusions, cap, merged rows out).
- Done when: staging counts per used destination recorded in the PR.
- Status: todo

### T2 — Estimates in the profile
- Files: migration (`place_profiles.estimates jsonb NOT NULL DEFAULT '{}'`; `crowd_forecasts` source adds `estimate`; grants unchanged), schema mirrors, `packages/domain/src/places/{place-profile.ts,estimates.ts}`, `packages/ai/src/routes/place-profile/**`, `services/worker/src/places/profile/{run.ts,store.ts}`, `packages/ai/evals/place-profile/**`.
- Steps: 1. The prompt asks popular places for the estimate fields with basis and source; non-popular runs are unchanged. 2. Validator: a `cited` field needs its quote (existing check), otherwise it is stored as `estimate`; numbers allowed only in fee and visit length. 3. Jev types the closed fields. 4. Busy windows → `crowd_forecasts` (`estimate`), replaced as a set per run. 5. Switch `places.estimates.enabled`. 6. Evals: gold set from the 8 curated cities' reviewed notes and approved editorial curves (visit length within one bucket, best time overlap, busy peak hour within 2 h).
- Tests: `pnpm --filter @cp/domain test -- estimates` (window → curve; basis rules); `pnpm test:remote @cp/worker -- places/profile/run` (a popular place stores estimates and estimate curves; a non-popular one does not; an uncited fee is `estimate`).
- Done when: eval thresholds pass in CI; staging Đà Lạt popular places have estimates; cost per place recorded.
- Status: todo

### T3 — Planning research on blogs and social
- Files: `services/worker/src/places/profile/{search.ts,brief-evidence.ts,brief-run.ts,brief-picks.ts}`, `services/worker/src/places/pick/{run.ts,select.ts}` (moved into `brief-picks.ts`), `packages/ai/src/routes/destination-brief/**`, `packages/ai/evals/destination-brief/**`.
- Steps: 1. Split the excluded-domain list into the two policies; the brief and profile tips use **suggestions**, facts use **facts**. 2. Social results: TikTok/YouTube captions via the existing oEmbed readers; Instagram/Facebook/Reddit by snippet only. 3. Leads resolve through `matchBriefLeads` as today; unresolved are dropped. 4. Move `loadFill`/`writePicks`/selection into `profile/brief-picks.ts` so phase 6 can delete `pick/**`. 5. Switch `places.social_research.enabled`.
- Tests: domain-policy unit test (supplier and OTA always blocked; social allowed for suggestions only); brief run with a recorded social result (resolved lead kept with its source, unresolved dropped).
- Done when: a staging brief for Hội An cites a blog or social source.
- Status: todo

### T4 — Serving estimates
- Files: `services/api/src/places/profile.ts`, `services/api/src/routes/place-crowd-forecasts.ts`, `services/api/src/planning/fit/signals/crowds.ts`, tests.
- Steps: `GET /v1/places/{id}` profile block adds `estimates` (reader's language, en fallback); the crowd route returns `estimate` curves when nothing better exists, with `source: 'estimate'`; fit uses estimate curves with lower weight and says so in its reason text.
- Tests: route test (source precedence visits > approved editorial > estimate); fit test (estimate curve used, labelled).
- Done when: contracts match phase 1 T3.
- Status: todo

### T5 — One photo rule, popular only
- Files: `services/api/src/editorial-media/route.ts`, `services/api/src/places/foursquare-photo-assets.ts` (unused), tests.
- Steps: `include=foursquare` is accepted and ignored; place subjects (`poi:<id>`) are served only for the popular set and only when the asset shows that place (no generic stock for places); destination subjects unchanged.
- Tests: `pnpm --filter @cp/api test -- editorial-media` (Foursquare never returned; a non-popular place gets nothing; generic stock under a place filtered; destination hero unchanged).
- Done when: staging Explore shows photos only on popular places.
- Status: todo

### T6 — Curated media proposals
- Files: `packages/suppliers/src/media-stock/**` (Pexels, Pixabay, Commons clients moved from the content factory, which imports them), `services/worker/src/jobs/media/propose.ts`, queue spec, tests.
- Steps: weekly `media.propose`: popular places without a ready asset and destinations without a hero → search Commons (Wikidata P18 near the point first), Pexels, Pixabay (photos and clips ≤ 15 s) → keep matches of that place (existing `place-match.ts` rules) → one `content_releases` row (`kind = 'media'`, artifact as the content factory writes it) per run, at most 200 items, for review; nothing is shown until approved. Check the admin review page renders a worker-made release; if it needs the contact sheet, the artifact links source pages instead.
- Tests: recorded Pexels/Pixabay/Commons fixtures; a run proposes nothing for places that already have a ready asset.
- Done when: one staging batch reviewed and published by the controller; its assets ready via `media.ingest`.
- Status: todo

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| Estimates wrong and read as facts | M×H | Basis on every field, "estimate" copy, evals against reviewed notes, switch off |
| Social sources unreliable | M×M | Suggestions and tips only; facts never from social; dropped when unresolved |
| Media proposals need too much review | M×M | Popular places only, 200 per batch, Commons first (usually the place itself) |
| Cost | L×M | Popular set capped; existing daily caps (`PLACES_PROFILE_DAILY_CAP_USD`, `PLACES_BRIEF_DAILY_CAP_USD`) |

## Rollback

Switch `places.estimates.enabled` and `places.social_research.enabled` off; stop `media.propose`. The migration only adds a column and a source value. `/v1/media` change reverts with the code.
