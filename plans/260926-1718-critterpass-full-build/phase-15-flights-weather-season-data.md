---
phase: 15
title: Fares, weather/marine, season & crowd data
status: pending
depends_on: [8, 11, 13]
wave: 7
features: [F-033, F-034, F-035]
screens: [3b-2, 3b-3, 3c-1, 3c-3, 3c-5, 3d-1, 3d-3, 3e-2, 3k-2, 3k-7, 3k-8, 3l-5]
effort: 7 sessions
owns:
  - infra/powersync/streams/season.yaml
  - packages/domain/src/travel-data/**
  - packages/suppliers/src/travelpayouts/fares/**
  - packages/suppliers/src/core/{egress,http,audit}.ts
  - packages/db/migrations/*_supplier_calls.sql
  - packages/db/src/schema/travel-data.ts
  - packages/db/migrations/*_fares_weather_crowds.sql
  - packages/db/migrations/*_season_and_hazards.sql
  - packages/db/seed/season/**
  - packages/db/test/permissions/{price-quotes,fare-cells,weather-snapshots,crowd-forecasts,season,hazard-alerts}.test.ts
  - services/api/src/travel-data/**
  - services/worker/src/travel-data/**
  - apps/mobile/src/data/travel-data/**
---
# Phase 15 — Fares, weather/marine, season & crowd data

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D6 (Open-Meteo, Travelpayouts, Frankfurter, BestTime, AeroDataBox/AeroAPI), D10 (fare estimates only, no flight booking), C14, C20 (season is a hint) |
| `docs/system-architecture.md` | §4.9 supplier layer (flights row), §10 ops (outbound timeouts, fixed IP) |
| `docs/data-model.md` | §3.4 `price_quotes`; §3.12 `weather_snapshots`, `crowd_forecasts`; §3.8 `fx_snapshots` (P12) |
| `docs/api-contracts.md` | §5.5 `/v1/fares`, `/v1/destinations/{id}`, `/v1/weather`, `/marine`, `/v1/places/{id}/crowds`, `/v1/fx/snapshot`; §6 tools `fare_calendar`, `weather`, `marine`, `crowd_forecast`, `fx`; §7 `travelpayouts` adapter |
| `docs/api-contracts-async.md` | §2.3 `fares.refresh`, `crowds.refresh`, `season.ingest`, `fx.refresh`, `weather.watch` (P37 consumer) |
| Reports | `design-analysis-260926-1143-next-trip-explore-report.md` §3d-1, §3d-3, §3c-3, §5; `researcher-260926-1143-ai-guide-report.md` §4.7; `fact-check-260926-1143-ai-guide-report.md` claims 34–39, 41, omissions 6–8; `researcher-260926-1649-travel-supplier-apis-report.md` (Travelpayouts); master §2 rows F-033–F-035, §8 vendors |
| Renders | `docs/design-renders/screens/3d-1_Destination_guide.png`, `3d-3_Place_detail.png`, `3k-7_Forecast.png`, `3k-8_Storm_warning.png`, `3c-1_Vote_showdown.png` |

## Overview

Goal: the deterministic travel-data layer every price, crowd bar and forecast on screen reads from. Nightly Travelpayouts fare calendars per crew origin × destination × month; editorial season curves and events (blossoms, leaves, festivals) plus BestTime hourly crowds; Open-Meteo hourly weather, marine and curated hazard feeds (volcano alert levels) with change watchers. Every value carries source + `seen_at`, and every consumer has a defined missing-data state.

Done when: `/v1/fares`, `/v1/destinations/{id}?origins&month`, `/v1/weather`, `/v1/weather/marine`, `/v1/places/{id}/crowds`, `/v1/hazards` return real cached data in staging with "seen" timestamps; the six crons run and are idempotent; the watcher emits `forecast.changed` / `hazard.changed` only on material change; tool executors are registered.

## Requirements

### F-033 Flight price & route data

| Area | Behaviour |
|---|---|
| Source | Travelpayouts Data API (month-matrix / prices for dates, cached "from user searches ~48 h"); estimates only, never booking (D10) |
| Precompute | nightly 02:00 SGT: origins = distinct home airports of members in active crews (+ trip origins), destinations = 6 guide destinations + destinations on open vote boards, months = next 12; stored as `fare_cells` |
| Output | per (origin, destination, month): cheapest round trip, date pair, transfers, duration_min, found_at, fetched_at; "7H FROM SIN" chip = min direct/1-stop duration |
| Wording | "~$X (seen {time})"; stale >72 h → "no recent price" state (never a fabricated number); origin without data → nearest hub fallback labelled ("from KUL") |
| Price drop | compare with previous 7-day min; ≥10 % drop emits `fare.dropped{crew, destination, month, delta}` (P25 tip strip consumes) |
| Frozen quotes | `freezeFareQuote()` writes `price_quotes` (kind=flight, source=travelpayouts, frozen_at, version) for polls and budgets (C43/C-tie rule consumer: P16/P26) |
| FX | `fx.refresh` cron (`15 * * * *`, registered once in T6) using P12 snapshot fn; destination chip "¥1,000 ≈ $6.70" from snapshot |

### F-034 Season & crowd data

| Area | Behaviour |
|---|---|
| Month curves | `season_months` per destination × month: `crowd_index` 0–100, `price_index`, `highlight_tag` (APR BLOSSOMS, NOV LEAVES, JAN CHEAPEST), colour role (cheapest/peak/normal); editorial, sourced + dated; price_index recomputed from `fare_cells` when coverage ≥ 3 origins |
| Events | `season_events`: kind (blossom, foliage, festival, ceremony, holiday, closure), name, starts_on/ends_on, confidence, source, forecast_updated_at; in-season daily refresh from editorial updates (blossom forecast edits via admin) |
| Re-pricing | `/v1/destinations/{id}?origins&month` returns month bars + per-origin fares for the selected month + fx chip + best months ("re-prices the whole page for your crew's airports") |
| Hourly crowds | BestTime weekly forecast per active POI (venue id mapping stored), refreshed nightly for POIs in active trips, monthly otherwise; `/v1/places/{id}/crowds?date` → `hourly[24]`, `best_window` computed deterministically (lowest contiguous window within open hours) |
| Availability heatmap feed | `season_events` + holidays feed P27 date options ("no week fits" reasons) |
| Missing states | no crowd data → hide hourly chart, show month curve only; no editorial month curve → hide WHEN TO GO card, show best_months chips; guest-guide destination → events from `web_search` notes only (P13 guest mode), labelled |

### F-035 Weather, marine, hazard feeds

| Area | Behaviour |
|---|---|
| Weather | Open-Meteo commercial: hourly temp, precip prob/amount, wind, weather code per trip point (destination centroid + plan-item POIs, elevation-aware for summits e.g. Batur); `weather_snapshots` per destination/date + point cache 1 h |
| Marine | Open-Meteo Marine: wave height/period for boat items (3k-8 "Waves up to 2.5m") |
| Hazards | curated feed adapters: MAGMA Indonesia / PVMBG volcano alert level (Bali/Lombok), Icelandic Met Office (Reykjavík), JMA warnings (Kyoto), GVP weekly report fallback; `hazard_alerts` (destination, kind, level, headline, source, issued_at, expires_at) |
| Watchers | `watchForecast(trip)` pure diff: material change = precip ≥50 % flips on an outdoor item, wave ≥2.0 m on a boat item, hazard level change, temp extremes; emits `forecast.changed` / `hazard.changed` domain events with impact score; P37 builds watch list + `ai.replan` from them |
| Cadence | `weather.refresh` every 3 h (hourly within 48 h of an outdoor item; 15 min for marine/volcano when trip in progress) |
| Attribution | Open-Meteo CC BY 4.0 string on weather surfaces (key exported for UI) |
| Missing states | feed down → last snapshot with "CHECKED {time}" + stale badge; never invent a forecast |

## Architecture & contracts

| Kind | Delta |
|---|---|
| Tables | `price_quotes`, `weather_snapshots`, `crowd_forecasts` (data-model). New (**doc delta**): `fare_cells` (origin_iata, dest_iata, destination_id, month, depart_on, return_on, price_minor, currency, transfers, duration_min, found_at, fetched_at; uk (origin, dest, month); C0, not synced), `season_months` (destination_id, month, crowd_index, price_index, highlight_tag, colour_role, source, reviewed_at; C0, `catalog` stream), `season_events` (C0, `catalog`), `hazard_alerts` (C0, `trip_pack`), `poi_besttime_refs` (poi_id, venue_id) |
| RLS | C0: authenticated read, `app_system` write; `price_quotes` trip rows use `app.is_trip_member` |
| Streams | `weather_snapshots`, `crowd_forecasts`, `hazard_alerts` in `trip_pack`; `season_months`, `season_events` in `catalog` (own file `infra/powersync/streams/season.yaml`) |
| Routes | `/v1/fares`, `/v1/destinations/{id}`, `/v1/weather`, `/v1/weather/marine`, `/v1/places/{id}/crowds` (per api-contracts §5.5) + `/v1/hazards?destination_id` (**doc delta**) |
| Commands | admin `upsert_season_editorial {destination_id, months[], events[]}` (content role, audited) — **doc delta** §4.17 |
| Jobs | `fares.refresh`, `crowds.refresh`, `season.ingest`, `fx.refresh` (cron registration), `weather.refresh` + `hazards.refresh` (**doc delta**: `weather.watch` in async §2.3 stays P37 and consumes this phase's events) |
| Events | `fare.dropped`, `forecast.changed`, `hazard.changed` in `packages/domain/src/travel-data/events.ts` |
| Adapter | `packages/suppliers/src/travelpayouts/fares/` (search-only capability of the `travelpayouts` adapter; P35 owns links/affiliate part) |
| Suppliers core | first outbound supplier call lands here, so this phase creates the minimal core P35 later extends: `fetchWithEgress` (Railway static outbound IP), 120 s timeout, retries on idempotent reads only, and the `supplier_calls` audit table (supplier, endpoint, status, latency, cost units, no bodies; S, no user read) in `*_supplier_calls.sql` — **doc delta**; P35 drops these from its own scope |
| Tools | executors `fare_calendar`, `weather`, `marine`, `crowd_forecast`, `fx` registered via P13 `registerToolExecutor` |
| Env | `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER`, `OPEN_METEO_API_KEY`, `BESTTIME_API_KEY_PRIVATE` in `.env.example` |

## Tasks

### T1 — Schema + migrations + permission tests
- Goal: all travel-data tables.
- Files: `packages/db/src/schema/travel-data.ts`, `packages/db/migrations/<ts>_fares_weather_crowds.sql`, `<ts>_season_and_hazards.sql`, `packages/db/test/permissions/{price-quotes,fare-cells,weather-snapshots,crowd-forecasts,season,hazard-alerts}.test.ts`, `packages/domain/src/travel-data/{types,events}.ts`.
- Steps: 1. Drizzle tables + indexes + retention columns. 2. RLS/grants; publication + stream entries. 3. Permission tests incl. trip-scoped `price_quotes` outsider denial.
- Tests: `pnpm --fail-if-no-match --filter @cp/db test -- permissions/price-quotes permissions/fare-cells permissions/weather-snapshots permissions/crowd-forecasts permissions/season permissions/hazard-alerts`
- Done when: tests green; publication allow-list check passes.

### T2 — Travelpayouts fares adapter + nightly precompute
- Goal: fare calendars for crew origins.
- Files: `packages/suppliers/src/travelpayouts/fares/{client,map}.ts`, `services/worker/src/travel-data/{fares-refresh,fare-drop}.ts`, `services/api/src/travel-data/fares-route.ts`, tests + recorded fixtures under `packages/suppliers/test/travelpayouts/`.
- Files (core): `packages/suppliers/src/core/{egress,http,audit}.ts`, `packages/db/migrations/<ts>_supplier_calls.sql`, `packages/suppliers/test/core/*.test.ts`.
- Steps: 0. Suppliers core: `fetchWithEgress`, 120 s timeout, `supplier_calls` audit writer + migration. 1. Client on the core. 2. Origins × destinations × months selection query. 3. Upsert `fare_cells`; stale marking. 4. Drop detection → `fare.dropped`. 5. `GET /v1/fares` with `seen_at`; `freezeFareQuote()`. 6. `fare_calendar` executor.
- Tests: `pnpm --fail-if-no-match --filter @cp/suppliers test -- core travelpayouts` ; `pnpm --fail-if-no-match --filter @cp/worker test -- travel-data/fares`
- Done when: rerun same night is a no-op; empty API response yields "no recent price" (null) not zero.

### T3 — Season curves, events, destination composite
- Goal: 3d-1 data and re-pricing.
- Files: `packages/db/seed/season/{<destination-slug>}.json`, `services/api/src/travel-data/{destination-route,season-admin}.ts`, `services/worker/src/travel-data/season-ingest.ts`, tests.
- Steps: 1. Author editorial month curves + events for the 6 destinations from cited public sources (JMA/JNTO blossom normals, tourism board calendars), each row with `source` + `reviewed_at`. 2. `upsert_season_editorial` admin command. 3. `season.ingest` recompute price_index from fares. 4. `/v1/destinations/{id}?origins&month` composite (months, fares per origin, fx chip, duration chip, highlights).
- Tests: `pnpm --fail-if-no-match --filter @cp/api test -- travel-data/destination`
- Done when: Kyoto returns APR/NOV peak tags and per-origin fares for the chosen month; missing curve returns `curve:null`.

### T4 — BestTime hourly crowds
- Goal: 3d-3 crowd chart + "GO BEFORE 7:30".
- Files: `services/worker/src/travel-data/{besttime-client,crowds-refresh}.ts`, `services/api/src/travel-data/crowds-route.ts`, `packages/domain/src/travel-data/best-window.ts`, tests.
- Steps: 1. Venue mapping via BestTime venue search on POI name+address; store ref. 2. Weekly forecast → `crowd_forecasts` (per dow). 3. Pure `bestWindow(hourly, openSpans)`. 4. Route + `crowd_forecast` executor.
- Tests: `pnpm --fail-if-no-match --filter @cp/domain test -- best-window` ; `pnpm --fail-if-no-match --filter @cp/worker test -- travel-data/crowds`
- Done when: Fushimi Inari fixture yields early-morning best window; POI without data → `hourly:null`.

### T5 — Open-Meteo weather + marine
- Goal: hourly forecasts per trip point.
- Files: `services/worker/src/travel-data/{open-meteo-client,weather-refresh}.ts`, `services/api/src/travel-data/weather-route.ts`, tests with recorded fixtures.
- Steps: 1. Client (commercial endpoint, elevation param). 2. Refresh cadence per rules; snapshots per destination/date; point cache. 3. Marine for boat items. 4. Routes + `weather`/`marine` executors; attribution key.
- Tests: `pnpm --fail-if-no-match --filter @cp/worker test -- travel-data/weather`
- Done when: Bali trip fixture stores 7-day hourly + marine; failure keeps last snapshot with `stale:true`.

### T6 — Hazard feeds + forecast watcher
- Goal: volcano/warning ingest and material-change events.
- Files: `services/worker/src/travel-data/hazards/{magma,imo,jma,gvp,refresh}.ts`, `packages/domain/src/travel-data/watch-forecast.ts`, `services/api/src/travel-data/hazards-route.ts`, tests.
- Steps: 1. Adapters parse official feeds (recorded fixtures). 2. Upsert `hazard_alerts`. 3. Pure `watchForecast(prev, next, planItems)` with impact scoring. 4. Emit events into `domain_events`. 5. Register `fx.refresh`, `weather.refresh`, `hazards.refresh` crons.
- Tests: `pnpm --fail-if-no-match --filter @cp/domain test -- watch-forecast` ; `pnpm --fail-if-no-match --filter @cp/worker test -- travel-data/hazards`
- Done when: precip flip on an outdoor item emits one event; identical rerun emits none; Batur level change emits `hazard.changed`.

### T7 — Mobile data hooks + freshness formatting
- Goal: client read layer for later UI phases.
- Files: `apps/mobile/src/data/travel-data/{useFares,useDestinationInsights,useCrowds,useWeather,useHazards,freshness}.ts`, tests.
- Steps: 1. `hc` typed queries with offline cache (last good response persisted). 2. `formatSeen()` ("seen 3h ago"), stale flags, missing-data discriminated unions. 3. Weather/crowds read from PowerSync `trip_pack` when synced, HTTP otherwise.
- Tests: `pnpm --fail-if-no-match --filter @cp/mobile test -- data/travel-data`
- Done when: hooks return typed `ok | stale | missing` states; offline returns cached data with stale flag.

## Phase acceptance criteria

- [ ] Six crons (`fares.refresh`, `crowds.refresh`, `season.ingest`, `fx.refresh`, `weather.refresh`, `hazards.refresh`) registered once each, idempotent, visible in pg-boss
- [ ] All endpoints return source + `seen_at`/`fetched_at`
- [ ] No endpoint returns a fabricated number for missing data (tests)
- [ ] Editorial season rows each cite a source and review date
- [ ] Watcher emits events only on material change (tests)
- [ ] Tool executors registered: `fare_calendar`, `weather`, `marine`, `crowd_forecast`, `fx`
- [ ] Permission + stream tests green

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Travelpayouts gaps for small origins | hub fallback labelled; "no recent price" state |
| Travelpayouts conversion minimums threaten account | fare data kept, affiliate CTAs only where compliant (P35) |
| Open-Meteo Standard lacks climate normals | month curves editorial; no climate API dependency |
| BestTime credit burn | refresh only active-trip POIs nightly |
| Hazard feed format changes | adapter contract tests + ops alert on parse failure; last value kept |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Travelpayouts partner account + token | fare fields return null and UI shows the "no recent price" state |
| Open-Meteo commercial plan | cannot ship (free tier is non-commercial); staging only |
| BestTime Pro subscription | hourly chart hidden (month curve only) |
| Founder review of editorial season data | rows stay `reviewed_at null` and are not served |

## Open questions

1. Fare month horizon — default 12 months.
2. Price-drop threshold — default ≥10 % vs 7-day min.
3. Doc delta: `supplier_calls` table + suppliers core move from P35 to P15 (plan.md open question 13 and P35 scope need the controller's update); `fare_cells`, `season_months`, `season_events`, `hazard_alerts`, `poi_besttime_refs`; route `/v1/hazards`; crons `weather.refresh`, `hazards.refresh`; admin `upsert_season_editorial`.
4. Official feed licence terms for MAGMA/IMO/JMA redistribution in-app — default: show headline + level with source link.
5. Local signals (processions, road closures) — default: P37 uses `web_search` + curated feed list; this phase provides only `season_events` kind `closure` authored via admin.
