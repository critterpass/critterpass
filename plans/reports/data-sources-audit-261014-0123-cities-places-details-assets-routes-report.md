# Data sources audit: cities, places, details, assets, routes

Date: 2026-10-14 01:23 (Asia/Saigon). Read at `origin/main` 745cfdd00 (13 Oct) plus read-only staging checks (PlanetScale `critterpass/staging` table statistics, `gh run list`, Railway service list). Staging counts are planner estimates (`reltuples`): the read-only role is held back by RLS, so exact `count(*)` was not possible.

## Summary

| Area | Source today | Coverage |
|---|---|---|
| Cities | Hand seed of 7 live guide cities (`packages/db/seed/destinations.ts`); `app.sync_place_destinations()` adds one row per critter city on a sets release (61 sets, 151 critters); AI `coverage='area'` rows from brief day-trip leads (`services/worker/src/places/profile/brief-links-store.ts:196`) | ~152 destinations; 8 curated (≥ 50 editorial places); no free-text "new city" path |
| Places | Overture (S3 + DuckDB, release `2026-09-23.1`), FSQ OS Places (Iceberg, needs `FSQ_PLACES_PORTAL_TOKEN`), OSM (Geofabrik extract ≤ 3 GB), conflated by trigram ≥ 0.6 within 60 m | `pois` ≈ 10.06 M rows, 9.2 GB (the bulk of the database); ingest on demand when a city has < 50 places; monthly refresh for live and wanted (90-day) cities plus `PLACES_REFRESH_COUNTRIES` |
| Details | Base row from open data; Foursquare live (hours, rating, tips) passed through, never stored, 4,000 calls/month; AI profiles: SearXNG (Tavily fallback) → top 2 pages → DeepSeek, cite-or-drop, Jev types the closed fields; reviewed notes always win | `place_profiles` ≈ 3,700; `destination_briefs` ≈ 13; 3,376 reviewed notes across 8 cities |
| Assets | Licensed stock (Pexels, Pixabay, Wikimedia Commons, with licence fields); Foursquare photos (credited); profile photos from web image search re-hosted on R2; maps: planetiler region packs + Protomaps z0–7 basemap on R2 `cp-tiles` (hourly build for wanted regions); critter art and SFX procedural; voice ElevenLabs | `media_objects` ≈ 3,500, `media_assets` ≈ 755 |
| Routes | Live ETAs and leave-by: Mapbox (walk / driving-traffic / cycling for scooter), never cached; planning legs: self-hosted Valhalla 3.8.3 (`route_cache` 30 days), straight-line fallback (× 1.35, 4.5/25/28/18 km/h + 3 min); intercity: AI from web search with cited costs, Travelpayouts flight price estimates; rides: Grab Farefeed or local tariff × Mapbox drive; geocoding: own `pois`/`cities` first, Mapbox v6 permanent ≤ 2,000/month | Valhalla build `20261006T004240Z`: 30 boxes in 11 Geofabrik regions (VN × 11, Bali, Japan, Thailand, Iceland, Portugal, Mexico, Peru, Morocco), 788 MB; `route_cache` ≈ 39 k, `plan_legs` ≈ 11.6 k; no transit routing anywhere |

## Findings to act on

1. **Profile photos have no licence check.** `services/worker/src/places/profile/photos.ts` downloads up to 3 images per place from SearXNG image search (Bing among the engines), resizes to 480 px and stores them publicly under `c/place-profiles/<poi>/n.jpg`; the only credit kept is the page the image was found on. Up to ~11 k images at today's profile count. Biggest legal exposure; restrict to Commons, Foursquare and stock, or link out instead of re-hosting.
2. **Weekly routing-tile refresh is skipped.** `.github/workflows/routing-tiles.yml:80` builds a scheduled run only when `date -u +%u` is 1. The Monday 19:00 UTC run fired at 2026-10-13 01:08 UTC (Tuesday) and skipped as "boxes unchanged". Tiles in use date from 6 Oct (OSM 4 Oct). Fix: build when the published tiles are older than 7 days instead of checking the weekday.
3. **Profiles never expire.** No `expires_at` on `place_profiles`; a closure or fee change stays until someone uses "Report a problem". Briefs expire after 90 days, links after 90 days, home links after 30 days.
4. **Mapbox legs are stored.** The worker writes Mapbox legs into `leave_bys.legs` (`leaveby-recompute.ts:145,158`), against Mapbox's no-caching terms (§2.10.1).
5. **Simplify-sync leftovers.**
   - Dataset deletion not done: `tools/content-factory/batches/places` (15 files), `src/data/place-corrections` (24 files) and `tools/routing-tiles/boxes.json` are still on `main`.
   - No `place-profile` / `destination-brief` evals in `packages/ai/evals`.
   - No `places.profiles` kill switch.
   - `places.pick` (names from model memory, no sources) is still routed (`routing.ts:277`).
6. **Tavily spend is not tracked.** `ai_usage` / `cost_micros` record model spend only.
7. **Search dependency.** All AI content runs through self-hosted SearXNG. Its engines suspend after ~200 queries per 30 min, which is a blocking and terms risk at scale.
8. **Stale docs.** `services/api/src/routing/README.md` and `docs/system-architecture.md:101,508` still say "Valhalla later"; the D21 amendment (4 Oct) is current.

## Limits and scaling

- **Places ingest.**
  - Each new city scans the full FSQ OS export (~219 M rows) and ingest queues run one job at a time.
  - The OSM pass hash-joins every POI and slows around 2 M rows; London tiles average 74 s and its OSM finish took 9 min.
  - The model fits tens of cities, not every country at once.
  - Natural areas (Loch Ness, Mekong) get no automatic place box.
  - Replicating `pois` filled the PowerSync volume on 6 Oct.
- **Routing.**
  - Box builds scale with demand: two boxes build in < 1 min and serve in ~60 MiB.
  - Whole countries do not fit one service: the spike's 8 countries needed 24.6 GB RAM and 99 min.
  - Matrices of 16×16 in big cities took 1–4.4 s.
  - Anything outside wanted boxes gets straight-line estimates only.
- **AI content.** ~300 profiles/hour across workers (searches 4 s apart). A cold city's brief takes ~30–60 s and a profile ~5–10 s, with pre-warming for the top 30 places at one every 20 s. Transit and health places never get a profile.
- **Coverage gaps.**
  - No transit routing.
  - No bus or ferry supplier: no 12go; prices are cited AI estimates.
  - No stored ratings: Foursquare live only.
  - Hours from AI are text facts only and never written back to `pois.hours`.

## Costs

| Item | Unit | Cap / free tier |
|---|---|---|
| DeepSeek profile | ~$0.017 (flash) – $0.032 (pro) per place (spike) | `PLACES_PROFILE_DAILY_CAP_USD` $5/day |
| DeepSeek brief | ~$0.09–0.12 per city | `PLACES_BRIEF_DAILY_CAP_USD` $3/day |
| Cold city end to end | ~$0.95 (plan estimate) | n/a |
| Tavily (fallback only) | ~$0.008 per search | not tracked |
| Foursquare live | ~$75/month | 4,000 calls/month |
| Mapbox Directions / Matrix | $2 per 1,000 past free tier; a full 50×50 matrix ≈ $5 | 100 k/month free |
| Mapbox geocoding | n/a | 2,000/month |
| Valhalla on Railway | ~$80/month (unvalidated estimate) | n/a |
| Overture, OSM, Protomaps, map and tile builds | free (R2 storage, GitHub runners) | n/a |

The largest fixed cost is the 9.2 GB `pois` table on PlanetScale. Everything else is small and grows with use.

## Unresolved questions

- Exact staging row counts (RLS blocks the read-only role); production Railway and Valhalla sizing; staging's `PLACES_REFRESH_COUNTRIES` value.
- What loaded the `cities` (Overture locality) table: no writer found in the repo.
- Real Valhalla and per-profile costs from billing, not estimates.
- Fix or drop the scraped profile photos before launch?
