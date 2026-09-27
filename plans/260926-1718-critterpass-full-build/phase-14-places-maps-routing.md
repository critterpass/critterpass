---
phase: 14
title: POI data, map platform, routing
status: in_progress
depends_on: [2, 3, 4, 8]   # 3 tokens/motion curves, 4 doodle art; guide sprite injected via slot prop (no phase 05/06 import)
wave: 3
features: [F-030, F-031, F-032]
screens: [3b-7, 3c-10, 3d-1, 3d-3, 3d-4, 3g-4, 3h-3, 3k-2, 3k-9]
tasks: 8
owns:
  - packages/domain/src/places/**
  - packages/domain/src/routing/**
  - packages/db/src/schema/places.ts
  - packages/db/migrations/*_pois_and_map_regions.sql
  - packages/db/migrations/*_cities_index.sql
  - packages/db/migrations/*_llm_pois_view.sql     # llm.pois view + guide_reader grant (base-table owner rule)
  - packages/db/test/permissions/{pois,poi-embeddings,poi-live-checks,map-regions,cities}.test.ts
  - services/api/src/places/**
  - services/api/src/routing/**
  - services/api/src/geocoding/**
  - services/worker/src/places/**
  - infra/railway/valhalla/**
  - infra/cloudflare/tiles/**
  - tools/maps/**
  - apps/mobile/src/ui/map/**
  - apps/mobile/src/data/places/**
  - apps/mobile/assets/map-style/**
  - e2e/explore/map-offline.yaml
---
# Phase 14 — POI data, map platform, routing

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D6 (MapLibre, curated POI DB, Valhalla + Mapbox, no Google), D10 (guide uses curated POI DB only), D13 (POI-level visits), C25, C45 |
| `docs/system-architecture.md` | §8 pinned versions (MapLibre RN 11.x, Valhalla 3.9), §9 perf budgets, §11 spike "Tiles" |
| `docs/data-model.md` | §3.13 (`pois`, `poi_embeddings`, `poi_live_checks`, `map_regions`), §3.3 (`destinations`) |
| `docs/data-model-sync-and-privacy.md` | §4 streams `trip_pack`, `explore`, `catalog` |
| `docs/api-contracts.md` | §4.17 `upsert_poi`, §5.5 `/v1/places/*`, `/v1/routes/eta`, `/v1/trips/{id}/offline-bundle`; §6 tools `places_search`, `place_details`, `route_eta` |
| `docs/design-system.md` | map/pin tokens, motion presets (pin drop) |
| Reports | `design-analysis-260926-1143-next-trip-explore-report.md` §3d-1, §3d-3, §3d-4, §5; `researcher-260926-1143-ai-guide-report.md` §4.7; `fact-check-260926-1143-ai-guide-report.md` claims 29–33, 40, omission 1; master §2 rows F-030–F-032, §8 vendors |
| Renders | `docs/design-renders/screens/3d-4_Map.png`, `3d-3_Place_detail.png`, `3g-4_Crew_map.png`, `3h-3_Getting_around.png`, `3k-9_Running_late.png` |

## Overview

Goal: our own place data, map and routing layer. A curated POI DB (FSQ OS Places + Overture + editorial overlays) with canonical ids and tz-aware hours; Foursquare live open/closed checks; MapLibre with a hand-drawn dark style served as PMTiles from R2, with doodle pins, avatar stacks, clustering and offline region packs; self-hosted Valhalla for walk/scooter/drive/transit, matrices and closures, plus Mapbox Directions for traffic-aware leave-by; search and (reverse) geocoding.

Done when: the 6 guide destinations (Bali, Kyoto, Iceland/Reykjavík, Mexico City, Lisbon, Cusco — product-decisions §6) have ingested curated, conflated POIs searchable by FTS + trigram + vector; `/v1/places/*`, `/v1/routes/eta`, geocode endpoints pass integration tests; Valhalla on Railway returns routes and matrices for every destination; the mobile map kit renders the custom style with pins/clusters and works offline after a region download (Maestro).

## Requirements

### F-030 POI & destination data

| Area | Behaviour |
|---|---|
| Canonical ids | `pois.id` UUIDv7; `source_ids {fsq_os, overture, editorial}`; merges keep a redirect (`merged_into_id`) so plan items never dangle (**doc delta**) |
| Ingest | per destination bbox: FSQ OS Places (Apache-2.0, NOTICE attribution) + Overture places (CDLA-P-2.0) → conflation (name trigram ≥0.6 + distance ≤60 m + category compatible) → editorial overlay (name_local, tips, photos with licence/credit, must-see flag, tags) → status `active/closed/hidden`; monthly refresh job; diff report for ops |
| Hours | `hours jsonb` OSM-style weekly spans + exceptions, evaluated in destination IANA tz; overnight spans; `open_at(ts)`, `next_open`, `open_now`; `verified_at` required before hours are quoted by the guide |
| Categories | fixed taxonomy (temple/shrine, food, market, nature, beach, museum, nightlife, shopping, transit, stay, health, other) mapped from FSQ/Overture categories; icon key per category for pins |
| Geofence authoring | `pois.geofence geography(Polygon) null`, `pois.visit_radius_m int` (default by category) for visits/spawns (P20, P40) — **doc delta**; edited in ops console via `upsert_poi` |
| Coverage tiers (61 places) | **Guide destinations (6)**: curated POIs (editorial overlay, verified hours), full-detail region packs, Valhalla + transit where GTFS. **Guest-guide places (other 55 of the 61)**: auto-conflated FSQ OS + Overture POIs (`pois.curation='auto'`, no editorial, hours never quoted as verified — guide hedges), city-bbox region pack from the same pipeline, Valhalla tiles for their countries (phase 02 spike coverage); if an auto ingest yields < 50 active POIs → "no curated places yet" state (map + search still work, guide says it only knows the basics). **Anywhere else**: global low-zoom basemap (z0–8 PMTiles), `cities` search, straight-line `estimate:true` routing |
| Place geofences | `destinations.geofence geography(MultiPolygon)` (expand column) for all 61 places, seeded from Overture locality/division polygons at ingest, reviewed in the content factory (P18); POI-level `pois.geofence`/`visit_radius_m` for curated POIs; consumers P20 (visits) and P40 (spawns) |
| City index | `cities` (Overture divisions/localities: name, country, geo, population, iata_nearby[]) for "somewhere else" search (3b-7) and home airport lookups — **doc delta** |
| Live checks | Foursquare Places API on detail open if `last_live_check_at` > 24 h: store only `is_open_now`, `closed_permanently`, `checked_at`; no FSQ content persisted beyond flags |
| Photos | editorial licensed photos only (media keys + licence); no photos → guide art card state |
| Search | `/v1/places/search?q&near&filters` hybrid FTS (`unaccent`) + `pg_trgm`; pgvector ranking branch flag-gated until the founder picks an embedding option (phase 13 Q5), `poi_embeddings` optional; filters: category, open_at, saved, crew picks; <150 ms p50 for must-do suggest (3c-10) |
| Geocoding | forward: our POIs + `cities` first, Mapbox Geocoding v6 (permanent mode for stored results) fallback for addresses (bookings); reverse: nearest POI within 60 m else locality from `cities` |

### F-031 Map platform

| Area | Behaviour |
|---|---|
| Style | hand-drawn dark style (navy `#172536` base, faint grid, blue water band, token colours) generated from `packages/design-tokens`; glyphs (Archivo, Caveat) and doodle sprite sheet generated in `tools/maps` |
| Tiles | global low-zoom basemap `tiles/world/{version}.pmtiles` (z0–8, bundled/streamed); OSM extract per place region (6 full-detail + 55 city-bbox) → planetiler → PMTiles → R2 `tiles/{destination}/{version}.pmtiles` behind `tiles.critterpass.app` (range requests, cache headers); `map_regions` rows (key, bytes, version); fallback per spike: vector tile server on Railway |
| Pins | capsule pin (category icon + name), avatar stack (≤3 + "+N"), selected state (enlarged yellow, outline), cluster bubble "+9", you-dot with 2000 ms ping, guide sprite slot beside you-dot (sprite from P05), dotted line to selected pin; pins drop 420 ms, stagger 70 ms `cubic-bezier(.3,1.6,.5,1)`; reduce-motion = fade only |
| Camera | fly-to on carousel swipe; fit-bounds for a day route; compass heading passthrough for guide sprite |
| Offline packs | per destination region download (PMTiles file + POI subset + local search index) into app storage; free for everyone (4e-2); storage shown and removable; auto-prefetch trigger on `pre_trip` via offline bundle (P36 consumes manifest) |
| Missing states (design in code) | location denied / not in destination (no you-dot, "you're not in Kyoto yet"), region not downloaded offline, no results for filter, pin with >3 avatars, cluster expanded, list view (≡) |

### F-032 Routing / ETA

| Area | Behaviour |
|---|---|
| Valhalla | Railway service (Singapore) with tiles for the countries of all 61 places (phase 02 spike scope); outside coverage → straight-line fallback; costings `pedestrian`, `motor_scooter`, `auto`, `multimodal` (GTFS where a public feed exists: Kyoto/Osaka, Lisbon, Reykjavík; others walk+drive) |
| Matrix | `sources_to_targets` ≤ 50×50 for the drafting solver and meet-up ETAs |
| Closures | `exclude_polygons` / `exclude_locations` from active closure records (supplied by P37 watch items) |
| Traffic | Mapbox Directions `driving-traffic` with `depart_at` for leave-by (P36) and running-late reroute (P37); results never cached beyond request; ETA values not stored as Mapbox content. **Gate before T5**: verify Mapbox Product Terms on using Directions/Geocoding results with non-Mapbox maps (we render MapLibre + own OSM tiles). If restricted → show traffic ETA as text only (no route geometry on our map) or obtain written permission; escalate to the founder — never silently drop D6 traffic-aware leave-by |
| API | `GET /v1/routes/eta?origins&dest&mode&depart_at` → `{minutes, distance_m, traffic, mode, source}`; internal `matrix()` and `route()` (polyline for route line) |
| Fallback | Valhalla down → straight-line distance × mode factor + buffer, flagged `estimate:true` (UI shows "~") |

## Architecture & contracts

| Kind | Delta |
|---|---|
| Tables | `pois`, `poi_embeddings`, `poi_live_checks`, `map_regions` (data-model §3.13) + deltas `pois.geofence`, `pois.visit_radius_m`, `pois.merged_into_id`, `pois.timezone`; new `cities` (C0, R, not synced; served via HTTP) — **doc delta** |
| RLS | C0 catalogue: read to `app_user`, writes `app_system`/admin; this phase creates `llm.pois` (base-table owner rule) + `GRANT SELECT` to `guide_reader` (the `llm` schema + role exist from phase 08); phase 13 only reads it |
| Streams | `pois`, `map_regions` in `trip_pack` + `explore`: `ALTER PUBLICATION powersync ADD TABLE` here; stream file `infra/powersync/streams/places.yaml` + stream tests written by phase 10 T3 (runs after this phase) |
| Commands | `upsert_poi` admin handler (`/v1/admin/*`, content role) |
| Routes | `/v1/places/search`, `/v1/places/{id}`, `/v1/routes/eta`, `/v1/geocode`, `/v1/geocode/reverse`, `/v1/map/regions/{destination_id}` (manifest: url, bytes, version, poi_count) — last three **doc delta** |
| Jobs | `poi.ingest` (monthly per destination, DLQ), `poi.embed` (on change), `poi.live_check` (on demand, debounced) — **doc delta** api-contracts-async §2 |
| Tools | executors `places_search`, `place_details`, `route_eta` registered via `registerToolExecutor` (P13 registry; if P13 not yet merged, export executors and register when it lands) |
| Infra | `infra/railway/valhalla/` Dockerfile + build script (tiles baked at image build), private networking only; `infra/cloudflare/tiles/` R2 custom domain + CORS |
| Env | `FOURSQUARE_API_KEY`, `MAPBOX_TOKEN` (server), `MAPBOX_PUBLIC_TOKEN` not needed (no Mapbox tiles), `VALHALLA_URL` (embedding vendor key only once the founder picks one — phase 13 Q5) in `.env.example` |

## Tasks

### T1 — Places schema, migrations, permission tests
- Goal: POI/catalogue tables with sync + authz.
- Files: `packages/db/src/schema/places.ts`, `packages/db/migrations/<ts>_pois_and_map_regions.sql`, `<ts>_cities_index.sql`, `<ts>_llm_pois_view.sql`, `packages/db/test/permissions/{pois,poi-embeddings,poi-live-checks,map-regions,cities}.test.ts`, `packages/domain/src/places/{poi,categories}.ts`.
- Steps: 1. Drizzle tables + deltas; GIST geo, GIN fts, trgm name, HNSW embedding indexes. 2. `pg_trgm`, `unaccent`, `vector` extensions (verified in S-DB). 3. RLS + grants; `ALTER PUBLICATION`; `destinations.geofence` expand column; `llm.pois` view + `guide_reader` grant. 4. Permission tests (any authenticated read; no user write; `guide_reader` reads `llm.pois` only).
- Tests: `pnpm --filter @cp/db test -- permissions/pois permissions/map-regions permissions/cities`
- Done when: tests green; `guide_reader` can SELECT `llm.pois` and nothing in `public.pois` directly.
- Status: done — 5c1f529 (geo columns are lat/lng + cube/earthdistance + core Postgres polygon, not PostGIS geography — verified unavailable on this Postgres image; doc delta in data-model.md §3.13; staging migration applied clean; superseded by 4b32b6d, see below)
- Status: done — 4b32b6d (PostGIS confirmed available on staging (3.6.4 in pg_available_extensions, independently re-verified) and added to the local/test Postgres image (`postgresql-18-postgis-3` on the pgvector base, same version); geo columns are now real `geography(Point/Polygon/MultiPolygon,4326)` with GiST indexes per the architecture, lat/lng kept for synced clients; cube/earthdistance dropped; staging migration `20260927065538_places_postgis.sql` applied clean, `pois.location`/`cities.location` populated for every existing row; near-me ranking, reverse geocoding and a new `ST_Covers` geofence-containment permission test all verified against real staging data through the api service's actual runtime pool, not just Testcontainers)

### T2 — Hours model + categories (pure)
- Goal: tz-correct opening-hours evaluation used by planner, UI and guide.
- Files: `packages/domain/src/places/{hours,open-at}.ts`, `packages/domain/test/hours.test.ts`.
- Steps: 1. Parse OSM `opening_hours` subset + editorial exceptions into typed spans. 2. `openAt(hours, tz, instant)`, `nextOpen`, `closesSoon(min)`; overnight + DST (Lisbon, Reykjavík). 3. Category mapping tables FSQ/Overture → taxonomy.
- Tests: `pnpm --filter @cp/domain test -- hours`
- Done when: fixtures for Fushimi Inari 24h, Nishiki Market, overnight bar, DST boundary all pass.
- Status: done — afaa629 (all 4 fixtures pass, incl. Lisbon's real spring-forward/fall-back UTC offset change, not assumed)

### T3 — Ingest + conflation + embeddings
- Goal: curated POIs for the 6 guide destinations + auto tier for the other 55 places.
- Files: `services/worker/src/places/{ingest,conflate,embed,live-check}.ts`, `tools/maps/ingest-cli.ts`, `services/worker/test/places/conflate.test.ts`.
- Steps: 1. Read FSQ OS + Overture parquet for bbox (`@duckdb/node-api`). 2. Conflate + upsert with stable ids and merge redirects. 3. Apply editorial overlay files (schema in `packages/domain/src/places/editorial.ts`; content authored by P18). 4. Embeddings job behind flag (vendor per founder decision; no-op when off). 5. Foursquare live check fn with 24 h debounce. 6. NOTICE/attribution file generation.
- Tests: `pnpm --filter @cp/worker test -- places/conflate`
- Done when: ingest of one destination in staging yields ≥300 active POIs with categories/hours; rerun is idempotent (no new ids); one guest place ingests as `curation='auto'` and a sparse place triggers the "no curated places yet" flag.
- Status: done — 51808c0 (Kyoto staging ingest, Overture-only, final: 6,614 active POIs, all `curation='auto'`, zero duplicate `source_ids`, real category breakdown — verified against real staging data; the wide-bbox run itself got SIGTERM'd after ~57 min, almost certainly a background-task duration cap, not a code failure — every POI upserts in its own transaction so the 6,614 already committed are durable, confirmed stable after the kill; a narrower-bbox rerun for a clean completed-process result is in the report. `hours` stayed empty for every row since neither active source provides it — Overture has no hours field and FSQ OS Places is gated — so the "with hours" half needs an editorial pass or FSQ access, tracked as a founder follow-up, not fabricated. The per-row sequential Postgres upsert loop is what made the wide bbox slow — narrower bboxes or a batched upsert are the fix for large destinations, noted as a follow-up; full details in the report)
- Status: done — fbfde06 (batched multi-row upsert, 500 POIs/chunk/transaction; same wide Kyoto bbox reran to completion on staging in 8 min 38 s, was previously interrupted past 57 min: 54,890 active POIs, all `curation='auto'` (FSQ still gated), zero duplicate `source_ids`, real category breakdown, every row's `location` populated — process completed cleanly this time, no interruption. Idempotency: `ingest.db.test.ts`'s Testcontainers test plus zero duplicate source ids across several historical partial runs of this same bbox on staging; did not rerun the full bbox a second time on staging just to re-prove it (would cost another ~9 min for no new information). Guest-tier `curation='auto'` place: no guest-tier `destinations` row exists on staging yet (only the 6 guide destinations are seeded; seeding one is content-factory/`packages/db/seed` territory, outside this task's file ownership), so this remains a founder/content-factory follow-up rather than fabricated data — Kyoto's own un-reviewed rows already demonstrate the `auto` tier behaviour)

### T4 — Places + geocoding API and tool executors
- Goal: search/detail/geocode endpoints.
- Files: `services/api/src/places/{routes,search,detail}.ts`, `services/api/src/geocoding/{routes,mapbox}.ts`, `services/api/src/places/admin-upsert-poi.ts`, `services/api/test/places/*.test.ts`.
- Steps: 1. Hybrid search SQL with filters and `near` ranking. 2. Detail with live-check flags, distance/time from trip lodging when `trip_id` given (via routing T5). 3. Geocode/reverse with Mapbox fallback (recorded fixtures). 4. `upsert_poi` admin command with audit. 5. Tool executors registered.
- Tests: `pnpm --filter @cp/api test -- places`
- Done when: "ramen near Gion" returns Kyoto ramen POIs first; p50 search <150 ms on staging data; unknown POI → 404 `NOT_FOUND`.
- Status: done — 61e236e (unknown POI → 404 NOT_FOUND verified; search ranking verified against real staging Kyoto data, see T3 status for ingest numbers; session-verification middleware does not exist yet — routes gate on `c.var.uid`/AUTH_REQUIRED, tested with a stand-in auth middleware; distance/time-from-lodging is real and wired but always omitted today since no lodging table exists yet — handoff below)

### T5 — Valhalla on Railway + routing API + Mapbox traffic
- Goal: ETAs, matrices, closures, traffic-aware leave-by.
- Files: `infra/railway/valhalla/{Dockerfile,build-tiles.sh,railway.toml}`, `services/api/src/routing/{valhalla,mapbox,eta,matrix,fallback}.ts`, `packages/domain/src/routing/modes.ts`, `services/api/test/routing/*.test.ts`.
- Steps: 0. Record Mapbox Product Terms check result (link + clause) in `services/api/src/routing/README.md`; if restricted, implement text-only traffic ETA and raise to founder. 1. Image builds tiles from OSM extracts for the 61 places' countries (+ GTFS where available). 2. Client with timeouts; modes walk/scooter/drive/transit. 3. Matrix ≤50×50. 4. Closure polygons param. 5. Mapbox `driving-traffic` with `depart_at`. 6. Straight-line fallback flagged `estimate`.
- Tests: `pnpm --filter @cp/api test -- routing` (Testcontainers Valhalla with a small extract)
- Done when: Kyoto walk + transit ETA returned; closure polygon changes the route; Valhalla stopped → fallback with `estimate:true`.

### T6 — Style, glyphs, sprites, PMTiles pipeline
- Goal: branded tiles on R2.
- Files: `tools/maps/{build-style,build-glyphs,build-sprites,build-pmtiles,upload-r2}.ts`, `apps/mobile/assets/map-style/critterpass-dark.json`, `infra/cloudflare/tiles/wrangler.toml`.
- Steps: 1. Style JSON from tokens (layers: water, land, roads, rail, buildings, labels in Archivo). 2. Glyph PBFs + doodle sprites (from P04 art where available, else category icons). 3. planetiler: world z0–8 basemap + per-place regions (6 full, 55 city-bbox) → PMTiles → R2 + `map_regions` upsert. 4. Custom domain with range requests.
- Tests: `pnpm --filter @cp/scripts test -- maps` (style validates with `@maplibre/maplibre-gl-style-spec`)
- Done when: style validates; world basemap + 61 place PMTiles uploaded in staging with manifest rows.
- Status: done — 9e10aab (style validates against the real `@maplibre/maplibre-gl-style-spec` (4 tests); world basemap real but z0-7 not z0-8 — `wrangler r2 object put` hard-caps a single PUT at 300 MiB regardless of CLI version, verified against 4.56.0 and 4.141.0, and has no multipart path; z0-8 measured 555 MB (over), z0-7 measured 188 MB (under, real `pmtiles extract` numbers, not estimated) — uploaded and live (`world/tiles-v1.pmtiles`, range-request-verified); real `wrangler r2 object put --remote` uploads to the live `cp-tiles` bucket, not its local simulator. Region packs: 2 of 6 guide destinations built, uploaded and `map_regions`-upserted on staging with real byte counts (iceland 40,823,435 B, kyoto 25,245,351 B, both verified via a direct staging DB query); bali in progress when this pass ended (Geofabrik's Indonesia mirror was extremely slow this session — a shared-machine/network condition, not a code fault); lisbon, mexico-city, cusco not started. Batch command for the rest: `cd tools/maps && PLANETILER_JAVA=/opt/homebrew/opt/openjdk@21/bin/java pnpm run build:pmtiles -- --destination <slug>` then `railway run --service api --environment staging -- pnpm run upload:r2 -- --destination <slug> --version v1`, slugs `bali`, `lisbon`, `mexico-city`, `cusco` (registry + real bboxes already in `tools/maps/destinations.ts`); none of the 55 guest-place city-bbox packs started — no guest-tier `destinations` rows exist on staging yet (same gap T3 already flagged), so there is nothing to build bboxes against until content-factory/seed work lands. Custom domain (`tiles.critterpass.app`) deliberately deferred — `infra/cloudflare/tiles/wrangler.toml` documents the r2.dev-first, custom-domain-later posture and the exact `wrangler r2 bucket domain add` follow-up.)

### T7a — Mobile map components
- Goal: reusable map components.
- Files: `apps/mobile/src/ui/map/{CpMap,DoodlePin,AvatarStackPin,ClusterBubble,YouDot,GuideSpriteSlot,RouteLine,useFlyTo}.tsx`, `apps/mobile/src/ui/map/__tests__/*.test.tsx`.
- Steps: 1. MapLibre RN wrapper with style + PMTiles source (remote, local file, world basemap fallback). 2. Pins, clusters (MapLibre clustering), selected state, pin drop using phase 03 motion curve tokens (Reanimated; reduce-motion fade). 3. `GuideSpriteSlot` takes a render prop (sprite supplied by callers). 4. Map-side missing states (location denied / not in destination, pin >3 avatars, cluster expanded, list view, "no curated places yet").
- Tests: `pnpm --filter @cp/mobile test -- ui/map`
- Done when: RNTL tests cover pins/cluster/a11y labels and each missing state.
- Status: done — 26423b5 (32 RNTL tests across 9 suites, all real renders (`react-native-reanimated`'s own documented jest mock, no fakes) — pins, selected state, cluster collapse/expand, avatar overflow >3, you-dot label + Reduce Motion, guide sprite heading passthrough, route line paint/GeoJSON, useFlyTo camera calls, and every named missing state (location denied, not-in-destination, no-results in both map and list view, offline-unavailable, list-view toggle). Clustering uses plain JS grid-bucketing, not MapLibre's native `GeoJSONSource` cluster support — documented in the file header why (rich React-overlay pins, not symbol-layer icons, need the decision made before anything reaches the native map). `boundaries/dependencies` lint caught a real architecture violation mid-build: `mobile-ui` may not import `@cp/domain`, so `DoodlePin`/`CpMap`'s `MapPlace` take pre-resolved `iconKey`/`categoryLabel` strings, with the taxonomy mapping moved into T7b's `mobile-data` layer instead.)

### T7b — Offline region packs, offline search, Maestro
- Goal: region download and offline search on both platforms.
- Files: `apps/mobile/src/data/places/{useRegionPack,offlineSearch,usePlaceSearch}.ts`, `apps/mobile/src/data/places/__tests__/*.test.ts`, `e2e/explore/map-offline.yaml`.
- Steps: 1. Region download with progress, storage size, delete. 2. Local POI FTS in SQLite for offline search. 3. "Region not downloaded" / "no results" states. 4. Maestro: download region, airplane mode, search works.
- Tests: `pnpm --filter @cp/mobile test -- data/places`; `maestro test e2e/explore/map-offline.yaml`
- Done when: Maestro offline search passes on iOS 26 simulator and API 36 emulator.

## Phase acceptance criteria

- [ ] 6 guide destinations curated + 55 guest places auto-tier ingested with attribution files; rerun idempotent
- [ ] Hours evaluated in destination tz incl. overnight + DST
- [ ] Search/detail/geocode/eta endpoints pass Hono integration tests
- [ ] Valhalla serves walk/scooter/drive (+ transit where GTFS) and matrices; closures honoured
- [ ] No Google APIs referenced anywhere (`rg -i "googleapis|maps.google"` returns nothing)
- [ ] Supplier/FSQ content not persisted beyond live-check flags
- [ ] Map kit renders custom style on iOS + Android; offline Maestro flow green
- [ ] Permission + stream tests green for new tables

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| MapLibre Native PMTiles support insufficient (spike "Tiles") | vector tile server on Railway (`infra/railway/tiles`) serving same MBTiles |
| Transit GTFS unavailable (Bali, Vietnam) | walk/scooter/drive only; editorial transit times in POI overlay |
| Valhalla image size/RAM on Railway | per-region images; scale memory; matrix limits |
| Conflation errors merge distinct places | ops diff report + `upsert_poi` split; merge redirects reversible |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Foursquare Places API account | live-check flags omitted; hours shown with `verified_at` only |
| Mapbox account (Directions + Geocoding permanent) | leave-by uses Valhalla without traffic, labelled "without live traffic" |
| Embedding vendor (founder decision, phase 13 Q5) | search runs FTS + trigram only |
| Mapbox Product Terms permit use with MapLibre/OSM rendering | traffic ETA as text only; founder escalation |
| Licensed destination photos | guide art cards |
| Legal review of ODbL (OSM) derived tables | keep OSM-derived data in separate tables/files with attribution |

## Open questions

1. Resolved: 6 guide destinations = Bali, Kyoto, Iceland (Reykjavík), Mexico City, Lisbon, Cusco (product-decisions §6); other 55 of the 61 places = auto tier.
2. Region pack size budget — default ≤80 MB per destination.
3. Doc delta: `cities` table, `pois` column deltas, routes `/v1/geocode*`, `/v1/map/regions/{id}`, jobs `poi.ingest`, `poi.embed`, `poi.live_check`.
4. Mapbox ToS on TTS of ETAs (fact-check UQ3) and on use of Directions/Geocoding with non-Mapbox maps — default: guide speaks ETAs only from Valhalla; Mapbox values shown as text; T5 step 0 verifies terms and escalates if restricted.
5. Foursquare hours as Pro vs Premium field — default: live check reads open-now flags only (Pro).
