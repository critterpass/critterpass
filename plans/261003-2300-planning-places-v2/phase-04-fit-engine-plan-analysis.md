---
phase: 4
title: Fit engine, place signals and the plan check job
status: pending
depends_on: [2]
wave: 2
screens: [7e-1, 7f-1, 7f-2, 7c-2, 7c-3, 7d-2, 7a-2, 7g-1, 7h-1, 7h-2]
tasks: 7
gate: T4 follows the founder decision "Crowd data source"; T1–T3 and T5–T7 do not wait on it
owns:
  - packages/planner/src/fit/**
  - packages/planner/src/check/**
  - packages/planner/test/{fit,check}/**
  - packages/domain/src/places/{open-spans,visit-minutes}.ts
  - services/api/src/planning/fit/**
  - services/api/test/planning/fit/**
  - services/worker/src/jobs/planning/{check,climate}/**
  - services/worker/test/planning/{check,climate}.db.test.ts
  - tools/content-factory/src/kinds/places/crowds.ts
mount_points:
  - packages/planner/src/index.ts (export fit, check)
  - services/worker/src/travel-data/weatherapi-client.ts (add fetchHistory)
  - tools/content-factory/src/kinds/registry.ts (crowds kind)
  - services/api/src/planning/register.ts, services/worker/src/jobs/planning/index.ts (one line each)
---
# Phase 4 — Fit engine, place signals and the plan check job

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D5/D22 (numbers from code, model only words), D21 (crowds: editorial month curve only; weather from WeatherAPI), D24 (Foursquare live data never stored: fit uses only our `pois.hours`), C44 (pre-draft fit), Q-36, Q-37 |
| `docs/code-standards.md` | §2 (Temporal for local days), §15, §17 (property tests for scheduling with an explicit 60 s budget) |
| Code | `packages/planner/src/feasibility/check.ts:32` (`checkFeasibility`, injected travel), `travel.ts:20` (`timelineViolations`, per-person timelines), `fit-status.ts:65` (`preDraftFit`); `packages/planner/src/draft/{schedule-day,sequence,metrics,open-data}.ts`; `packages/domain/src/places/{hours,open-at}.ts:72,95`; duplicated span logic in `planner/draft/day-minutes.ts:24`, `fit-status.ts spansFor`, `travel-data/crowds-route.ts spansOn`, `explore/slot-suggest.ts openSpans`; `services/api/src/explore/slot-suggest.ts:77` (`suggestSlot`: no travel, no attendees, no weather); `services/api/src/explore/plan-read.ts:29,58`; `services/api/src/travel-data/weather-read.ts:121`; `crowd_forecasts` (no producer); `season_months.crowd_index`; `packages/domain/src/places/editorial.ts` (`time_needed_min`, `crowd_hint`, `best_time`); `services/api/src/cost/tool-executors.ts:17,44` (fit_check with a fixed 120-minute visit) |
| Renders + captions | 7e-1 "WHEN IT FITS is worked out from opening hours, crowds and your days"; 7f-1 day dots green/orange/grey + WHY reasons; 7f-2 "Each row already says where it would fit"; 7c-3 "Each row says when it would fit"; 7a-2 dashed "FOUR OF YOU ARE FREE"; 7h-1 "Runs by itself whenever the plan changes"; 7h-2 "options from saves first, then from what fits the time, the weather and who's free" |

## Overview

Goal: one pure fit engine that says when a place fits each day (grade, slot, reasons) from opening hours, travel, crowds, weather and who is free; the place signals it needs; the server routes that serve it; and a deterministic plan check job that keeps the trip's issues and every idea's fit current after each plan change, with no model call.

Done when: the same fixture gives the same fit on server and phone (shared planner tests); `POST /v1/trips/{id}/fit` answers 50 places p95 < 800 ms on staging; a plan change refreshes `plan_checks`, `plan_check_issues` and `trip_ideas.fit` within 60 s p95; the plan check never calls a model (test).

## Requirements

### Fit (shared by 7e-1, 7f-1, 7f-2, 7c-2, 7c-3, 7d-2, 7g-1)

| Input | Source |
|---|---|
| Opening spans for the local date | `pois.hours` through one shared `openSpans(hours, tz, date)` in `packages/domain/src/places/open-spans.ts` (overnight spans and exceptions handled); unknown hours → category usual hours (`planner/draft/open-data.ts usualHours`) and reason `hours_unknown`. Never Foursquare live hours (D24) |
| Visit length ("TAKES 1H30") | `editorial.time_needed_min`, else `visit-minutes.ts` category default |
| The day | crew version's items (times, attendees, locks, outdoor), meal windows, the stay for that night (phase 3 `tripStay`; until then the stay item rule from `plan-read.ts`) |
| Travel | a `TravelSource`: stored `plan_legs` for stop pairs and the planning provider for insertions (phase 3 swaps this in); straight-line × `drive_factor` before that, marked approx |
| Crowds | `crowd_forecasts` by source precedence visits > editorial (approved) > none, × the month's `season_months.crowd_index` factor; none → no crowd reasons |
| Weather | hourly chance of rain from `weather_snapshots` inside the forecast horizon (3 days by default), else `climate_normals.rain_pct`; outdoor items only |
| Who's free | participants minus attendees of overlapping items (`timelineViolations` semantics) |
| Crew split | `place_stances` with both sides → grade capped at `possible`, reason `crew_split` |

| Output | Shape |
|---|---|
| Per day | grade good/possible/no; slot {starts_at, ends_at}; reasons [{code, params}]; insert_after?/before? stable_id; detour_min?; needs_move? stable_id |
| Best | the earliest good slot on the least full day, ties → fewer drive minutes |
| Grades | good = open, free, travel fits with ≥ 15 min slack, not raining, not in a busy window when a quiet one exists; possible = fits with a trade-off (busy, rain risk, tight, detour > 10 min, needs a flexible item moved, crew split); no = closed, no window, arrival/departure day without room |
| Reason codes | `opens_at`, `busy_from`, `quiet_until`, `drive_minutes`, `walk_minutes`, `ride_works`, `dry_mornings`, `rain_likely`, `free_day`, `after_item`, `before_item`, `on_the_way`, `first_night`, `cheapest_of`, `who_free`, `needs_move`, `crew_split`, `hours_unknown`, `editorial_best_time` (editorial text shown verbatim) |

### Gaps (7a-2, 7g-1, 7h-2)

Free windows ≥ 60 min between 07:00 and 22:00 for any subset of two or more participants, with who is free, where the others are and until when, and the next fixed item ("Maya and Rin are at the spa till 18:00. Dinner is at 19:30.").

### Gap ideas (7h-2, 7g-1 "FOR YOUR GAPS")

Up to three options: crew ideas that fit the window first, then curated places, then pairs that fit back to back ("COFFEE, THEN THE MARKET … before it shuts at 18:00"), then back to the stay (free); each with minutes, cost each when known, whose save, who voted for it (swipe yes or stance want).

### Plan check (7h-1 data; screens in phase 13)

| Kind | Rule (thresholds from `plan.check.thresholds`) | Fix |
|---|---|---|
| clash (fix) | overlap or not enough travel time between consecutive items of the same people (`checkFeasibility` with legs) | one-liner: retime the movable item to the first feasible start (booked/locked never moves) |
| closed (fix) | an item outside its opening spans | one-liner: move within that day's spans if free, else none |
| too_far (fix) | day drive > 180 min, or a leg > 90 min that ends after dark | screen `too_far` (phase 13 fills the alternative) |
| rain (fix) | outdoor item overlaps rain ≥ 50 % (forecast) or ≥ 40 % (normal) | screen `rain_crowds` |
| crowds (fix) | item starts in a busy window ≥ 70 when a quiet window exists that day | screen `rain_crowds` |
| pace (know) | stops per 9 h above 6 | none ("It works, just.") |
| booking_note (know) | a booking deadline before the trip (free-cancel or hold expiry from bookings) | none |

Ranking: fix before know, then clash > closed > too_far > rain > crowds, then day order. Fingerprint = kind + day + stable_ids so unchanged issues keep their identity.

Reuse / extend / new: reuse `checkFeasibility`, `timelineViolations`, `scheduleDay`, `openAt`/`nextOpen`, `weather-read`, `season_months`, `crowd_forecasts`, the content-factory hours-research pattern and `ops.content_reviews`; extend the WeatherAPI client (history); new fit engine, gaps, check rules, fit routes, climate normals and the plan check job. `suggestSlot` is replaced by the fit engine (callers switch in phases 7 and 8; file deleted in phase 14); the guide's `fit_check` moves onto the engine in phase 6.

## Architecture & contracts

| Kind | Delta |
|---|---|
| Pure | `packages/planner/src/fit/{context,day-model,slot,reasons,grade,gaps,gap-ideas,index}.ts`; `packages/planner/src/check/{rules/*,rank,fingerprint,index}.ts`; `packages/domain/src/places/{open-spans,visit-minutes}.ts` |
| Routes (`api-contracts-planning.md`) | `POST /v1/trips/{id}/fit` `{poi_ids (1..50), day_id?, starts_at?, include_context?}` → `[{poi_id, best, days[]}]` + `context` (only for one place, for local re-evaluation) · private no-store · trip participants else `NOT_FOUND`. `GET /v1/trips/{id}/places/{poiId}/nearby?limit` → curated places by drive minutes from the place `[{poi_id, name, category, minutes, mode}]` · private 15 min. `GET /v1/trips/{id}/gaps/ideas?day_id&start&end` → `{who_free[], context{busy[], next_item?}, ideas[≤3]{kind: single\|pair\|stay, poi_ids, minutes, cost_each_minor?, currency?, saver_id?, voted_by[], reasons[]}}` · no-store |
| Queues (`api-contracts-async.md` §2.2) | `plan.check`: triggers `plan.version_created`, `plan.ops_applied`, `change_set.applied` (start after 45 s), `plan.legs_updated`, `idea.saved/removed`, `place.stance_set/cleared`, `forecast.changed`, daily 06:00 trip tz while the trip is in planning/pre/in; singleton per trip; skip after `plan.check.max_runs_per_trip_day`; writes `plan_checks`, replaces the version's `plan_check_issues`, updates `trip_ideas.fit`; emits `check.updated`. `climate.normals`: monthly cron + destination added → WeatherAPI history sampled (10 days × month × 3 years per cell) → `climate_normals` |
| Realtime | `trip_plan:{trip_id}` `check.updated{version, fix_count, know_count}` |
| Content | `places crowds` content-factory kind: a typical-week curve per curated place (from open data, `crowd_hint`, `best_time`, category), written as `crowd_forecasts(source='editorial', approved_at=null)` and reviewed in `ops.content_reviews`; approval sets `approved_at` |
| AI | none in this phase; phase 6 moves the guide's `fit_check` tool onto this engine once T5 is done |
| Metering | none: the plan check is deterministic system work (founder decision "Metering"); runs counted in `plan_checks.runs_today` |

## Tasks

### T1 — Fit engine core
- Goal: `fitPlace(context, place)` → per-day grades, best slot, reasons.
- Files: `packages/planner/src/fit/{context,day-model,slot,reasons,grade,index}.ts`, `packages/domain/src/places/{open-spans,visit-minutes}.ts`, `packages/planner/test/fit/*.test.ts`, `packages/planner/src/index.ts`
- Steps: 1. `openSpans` on Temporal (one implementation; the four duplicates switch over in phase 14). 2. Day model from items + attendees + locks + stay + meal windows. 3. Slot search on a 15-minute grid with travel insertion (prev/next) and detour. 4. Crowd, weather, split modifiers. 5. Grade + reasons with params.
- Tests: `pnpm --filter @cp/planner test -- fit` (Vitest; property tests `{ timeout: 60_000 }`: never overlaps a locked item, never outside open spans, never schedules into another attendee's item, more travel never upgrades a grade)
- Done when: fixtures reproduce the render facts (Tirta Empul good on Sat 08:00 with `opens_at`, `busy_from 10`, `drive_minutes 45`, `dry_mornings`; Wed no because the terraces take the morning).
- Status: todo

### T2 — Gaps and who's free
- Goal: dashed free slots and their context lines.
- Files: `packages/planner/src/fit/{gaps,gap-ideas}.ts`, `packages/planner/test/fit/gaps.test.ts`
- Steps: 1. Free windows ≥ 60 min per subset ≥ 2. 2. Context (who is where until when; next item). 3. Gap idea ranking: ideas → curated → pairs → stay.
- Tests: `pnpm --filter @cp/planner test -- fit/gaps`
- Done when: the Bali fixture yields "Wed 16:00–19:00, four free, Maya and Rin at the spa till 18:00, dinner 19:30".
- Status: todo

### T3 — Place signals: crowds and climate normals
- Goal: hourly crowd curves and rain normals the engine can read.
- Files: `services/api/src/planning/fit/signals/{crowds,climate,visit}.ts`, `services/worker/src/jobs/planning/climate/**`, `services/worker/src/travel-data/weatherapi-client.ts`, `services/worker/test/planning/climate.db.test.ts`
- Steps: 1. Crowd reader with source precedence and month factor. 2. `fetchHistory` in the WeatherAPI client; `climate.normals` job per destination cell (sampled; recorded fixtures). 3. Weather reader: forecast inside the horizon, else normals; reason flags which one.
- Tests: `pnpm test:remote @cp/worker -- planning/climate.db`; `pnpm --filter @cp/api test -- planning/fit/signals`
- Done when: Bali October normals show the afternoon peak; a forecast inside 3 days overrides the normal.
- Status: todo

### T4 — Editorial crowd curves (after the crowd decision)
- Goal: curated places get a typical week the founder approved.
- Files: `tools/content-factory/src/kinds/places/crowds.ts`, `tools/content-factory/src/kinds/registry.ts`
- Steps: 1. Kind mirrors `kinds/places/hours.ts`: one structured call per place from our open data and editorial fields, validated (24 values 0–100 × 7 days, plausibility rules: closed hours = 0). 2. Proposals into `ops.content_reviews`; approval writes `approved_at`. 3. No `da-nang` writes before 2026-10-05 00:00 +07.
- Tests: `pnpm --filter @cp/content-factory test -- places/crowds` (validator cases)
- Done when: Bali's curated places have approved curves on staging; unapproved rows never reach phones (stream filter from phase 2).
- Status: todo

### T5 — Fit service and routes
- Goal: fit, nearby and gap ideas over HTTP.
- Files: `services/api/src/planning/fit/{context,service,routes,nearby,gap-ideas}.ts`, `services/api/src/planning/register.ts` (one line), `services/api/test/planning/fit/*.test.ts`
- Steps: 1. Context assembler (crew version; organiser draft only for organisers), `TravelSource` and `StaySource` interfaces. 2. Batch fit: routing only for each place's two best insertions, straight-line prefilter for the rest. 3. Nearby: straight-line top 25 → planning matrix 1 × 25. 4. Gap ideas from T2.
- Tests: `pnpm test:remote @cp/api -- planning/fit/routes.db` (participant vs outsider; organiser draft hidden from members; 50-place budget)
- Done when: 50 places p95 < 800 ms on staging; outsiders get `NOT_FOUND`.
- Status: todo

### T6 — Plan check rules
- Goal: issues with params and one-liner fixes, ranked.
- Files: `packages/planner/src/check/**`, `packages/planner/test/check/*.test.ts`
- Steps: 1. Rules table above on top of `checkFeasibility` + fit signals. 2. One-liner fixes (clash retime, closed move) as planner ops that pass lock rules. 3. Rank + fingerprint. 4. A fixer registry interface that phase 13 fills for `too_far`, `rain_crowds`, `less_driving`.
- Tests: `pnpm --filter @cp/planner test -- check` (Bali fixture: 3 to fix, 2 to know, in the render's order)
- Done when: one-liner ops never move a booked item (property test, 60 s budget).
- Status: todo

### T7 — Plan check job
- Goal: issues and idea fits refresh themselves after every change.
- Files: `services/worker/src/jobs/planning/check/**`, `services/worker/src/jobs/planning/index.ts` (one line), `services/api/src/planning/register.ts` (event hook line), `services/worker/test/planning/check.db.test.ts`
- Steps: 1. Event hooks (api + worker) and the daily schedule. 2. Assemble context once per run; rules; idea fits; write in one transaction; `check.updated`. 3. Daily run cap. 4. Backfill command for active trips. 5. A test asserts the job module graph has no `@cp/ai` gateway import.
- Tests: `pnpm test:remote @cp/worker -- planning/check.db`
- Done when: an edit that creates a clash shows as a fix issue within 60 s p95 on staging; a reverted edit clears it.
- Status: todo

## Device flows

None directly; screens in phases 7–13 exercise every route. Staging check after T7: edit a seeded trip and watch `plan_checks` update.

## Phase acceptance criteria

- [ ] T1–T7 done-when checks pass.
- [ ] Fit parity: the planner fit fixtures run in the app's Jest suite too (phase 5 imports them).
- [ ] No Foursquare attribute, supplier content or model output feeds the engine.

## Risks & rollback

| Risk | Likelihood × impact | Mitigation / rollback |
|---|---|---|
| Fit wrong in a way users notice (closed when open) | M × H | hours only from `pois.hours` with `hours_unknown` labelled; founder review of the Bali/Đà Nẵng fixtures; rollback = hide fit lines (`planning.redesign` off) |
| Plan check churn (counts flicker as legs arrive) | M × M | 45 s start delay + singleton; fingerprints keep identity |
| Climate history call volume | L × M | sampled days, cached forever; one cell per destination at first |
| Editorial curves mislead ("busy from 10") | M × M | approval gate; source-labelled copy (founder decision) |
| Engine slow on big trips | M × M | routing only for best insertions; batch cap 50 |

## Migration (existing users' data and screens)

Backfill plan checks and idea fits for active trips (T7). `suggestSlot` and the old `fit_check` keep working until their callers move (phases 6, 7, 8) and phase 14 deletes them.

## Undesigned states to log

None here (no UI); reason wording is logged by the phases that show it.

## Open questions

1. Climate normals source: default WeatherAPI history (existing vendor, sampled); alternative NASA POWER hourly (public domain, free, new vendor).
2. Meal windows per destination (Spain/Mexico dine late): default per-destination editorial windows with a global fallback (breakfast 07–10, lunch 11:30–14:30, dinner 18:30–22:00).
