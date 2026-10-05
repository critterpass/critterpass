# Runbook: add a live guide destination

Owner: content. When: a new city gets its own live guide. Đà Nẵng (`da-nang`) was added this way
on 2026-09-30, and its commands and results are shown below as the worked example. Every staging
write goes through the content factory or the ops console, except the destination row, the POI
ingest and the region pack. Nothing is served until a person approves it in the console.

Run everything from a worktree at `origin/main` (plus your branch), with staging variables:

```sh
cd ~/Projects/critterpass   # railway is linked here
railway run --service api --environment staging -- pnpm --dir <worktree> <command>
```

Never print variable values, and never run `railway variables --kv`: it prints multi-line secrets
in full. List names only:

```sh
railway variables --service api --environment staging --json \
  | python3 -c "import json,sys; print(sorted(json.load(sys.stdin)))"
```

Use a value only inside `railway run`, never echo it.

## 0. Decide the basics

| Field | Đà Nẵng |
| --- | --- |
| slug | `da-nang` |
| name, country (name, as `critter_sets.name` spells it) | Đà Nẵng, Vietnam |
| currency, time zone | VND, Asia/Ho_Chi_Minh |
| bounds `minLon,minLat,maxLon,maxLat` (geofence, ingest and tiles share it) | `107.95,15.84,108.36,16.21` |
| best months | 3, 4, 5 (dry season; September to December is the rainy and storm season) |
| fare airport | DAD |

## 1. Destination row, season and costs (repo + staging)

1. Add the destination to `packages/db/seed/destinations.ts`, with `bestMonths` and `bounds`.
2. Add `packages/db/seed/season/<slug>.json`: all 12 months (crowd index, colour role, highlight
   tag up to 24 characters) and dated events, each with its source, URL and check date.
   `services/api/test/travel-data/season-seed.test.ts` requires one file per travel destination.
3. Add cost-index drafts for the destination to `packages/db/seed/cost-indices/indices.json`.
4. Add the travel reference points to `packages/domain/src/travel-data/destinations.ts`: fare
   airports, weather centroid and elevation, a marine point if the sea matters, summits and hazard
   subjects. Fares, weather, marine and forecast alerts pick the destination up from this entry. Fares are
   priced from the home airports of crews with an active trip. Weather is fetched once a trip
   there is confirmed or running. Update the fare target count in
   `services/worker/test/travel-data/fares-refresh.db.test.ts`.
5. Write the row and the drafts to staging. This can be re-run; it inserts only what is missing and
   never overwrites:

   ```sh
   railway run --service api --environment staging -- \
     pnpm --dir <worktree> --filter @cp/db seed:destination da-nang
   ```

6. Content review: approve the season months and events in the ops console
   (`upsert_season_editorial`) and the cost indices. Until then the destination's season curve and
   costs are not served.

## 2. Guide link (guide lane)

The guide belongs to the place's critter set: `critter_sets.guide_slug` and `destination_id` for
the country code. `app.sync_place_destinations` then fills `destinations.critter_set_id`.

1. The guide lane adds the persona key (`PERSONA_KEYS`), the `guides` row and the persona pack.
2. Set `PLACE_FACTS.<code>` in `tools/content-factory/src/data/place-facts.ts`:
   `destination: '<slug>'` first, then `guide: '<key>'` once the persona key exists.
3. Run `pnpm content sets run` and update the live list in
   `tools/content-factory/test/sets.test.ts`. Then approve the sets batch in the console.

## 3. Places

1. Give the destination its place box. `destinations.place_bounds` is the box the ingest reads and
   the area place search covers; it is separate from `geofence`, which drives arrival on the
   device. The backfill fills only missing boxes: from the geofence, else the region-pack bounds
   in `tools/maps/destinations.ts`, else the Overture locality with the destination's name in its
   country, boxed by population (8 km a side for a town up to 30 km for a metro). It lists the
   destinations it could not resolve (natural areas such as the Lake District, Loch Ness or the
   Mekong). Check the ones it did resolve too, since a name can match the wrong place (Bohol
   matched a village on Palawan). Set or correct a box by hand; this replaces any value:

   ```sh
   railway run --service api --environment staging -- pnpm --dir <worktree> --filter @cp/maps \
     ingest -- --set-bounds "vn-ha-long:106.95,20.88,107.15,21.00;gb-loch-ness:-4.75,57.10,-4.15,57.50"
   ```

   ```sh
   railway run --service api --environment staging -- pnpm --dir <worktree> --filter @cp/maps \
     ingest -- --backfill-bounds
   ```

2. Ingest from Overture and FSQ OS Places. With `FSQ_PLACES_PORTAL_TOKEN` set (staging worker and
   `.env`), FSQ OS is read from the Places Portal Iceberg catalog (`fsq.datasets.places_os`) with
   Foursquare's filters: not closed, no `unresolved_flags`, refreshed within 365 days. The table is
   not partitioned, so every read scans all of it (about 219M rows): from a laptop outside the US
   one bbox takes over 25 minutes, so run ingests on the worker. One destination, on the worker:

   ```sh
   # from a worktree at the merged main, enqueue on the staging worker
   railway run --service api --environment staging -- pnpm --dir <worktree> --filter @cp/maps \
     ingest -- --enqueue --only da-nang
   ```

   A single destination can also run here (`ingest -- --slug da-nang`); it reads its box from
   `place_bounds` (or `--min-lng … --max-lat`) and writes the attribution NOTICE to the git-ignored
   `tools/maps/attribution/`. `FSQ_OS_PLACES_PARQUET_URI` (a parquet export with the catalog's
   columns) replaces the catalog when no token is set; with neither, the ingest is Overture-only.

   What the ingest keeps: name, category, point, first address, Overture `confidence`, first
   website and phone (FSQ's on a match) and brand. Permanently closed Overture places are skipped,
   and a new Overture-only place under 0.3 confidence is not inserted. A place another destination
   already owns (overlapping boxes: Hội An inside Đà Nẵng's) is left untouched; search finds it
   through the box. Nothing is ever deactivated or deleted. Đà Nẵng ingested 80,479 active POIs.

   OpenStreetMap runs last over the same box (D25, ODbL). The worker downloads the smallest
   Geofabrik extract covering the box into its temp directory (Bali reads the 176 MB Nusa Tenggara
   file; it is deleted when another extract is needed) and reads it with DuckDB's `spatial`
   extension. Sights the other sources lack (viewpoints, peaks, waterfalls, beaches, temples,
   ruins, parks, markets) become POIs under `source_ids.osm`. A business OSM holds only fills the
   matched POI's empty hours, website and phone. `opening_hours` fills `pois.hours` where ours are
   empty, with `hours_source = 'osm'`; editorial and researched hours are never replaced. The
   worker log's `osm` block counts what was added, linked and given hours. An ingest that injects
   its own Overture reader (the tests) reads OSM only when it injects an OSM reader too.

3. Pin the places the curated set must hold, by open-data name and a point at the real place:
   `tools/content-factory/src/data/pinned-places.ts`. Find the names on staging first, because
   open data repeats names at wrong positions. Pinned stays, transit and markets are kept even
   outside the selection buckets.
   A pin can say what the place is (`kind`, which the note writer is told), correct a wrong
   open-data `category` and carry a `nameLocal` another record or the Wikidata item holds.
   `DUPLICATE_RULINGS` settles the duplicate pairs the decision left open (one place only on a
   street address or a Wikidata item). Pins and landmarks publish as `editorial.must_see`.
   `LEFT_OUT_PLACES` in the same file names the records the set never takes (a point far from the
   real place, a further record of a place the set holds, a seller), each with the reason the
   review page prints. A city that is not its country's guide city (Đà Lạt) is added to
   `MORE_CURATED_DESTINATIONS` in `tools/content-factory/src/data/place-facts.ts` first. A place
   only OpenStreetMap holds cannot be named by a release; its FSQ or Overture record is taken.
4. Run the curated batch for the destination only (selection and editorial, about $1 for 400
   POIs). Publishing it is additive, so the other cities are untouched:

   ```sh
   railway run --service api --environment staging -- pnpm --dir <worktree> \
     content places run --opt destinations=da-nang --max-usd 4 --concurrency 4
   ```

   To prepare a batch without queueing it, run `brief`, `generate` and `validate` the same way,
   then `content places review --batch <key>` with no `DATABASE_URL` (it writes the artifact to
   `batches/places/`) and `content places page --batch <key>` for the one-page review
   (`work/places/<key>/review.html`: must-sees, every place by category, merges, lines to check,
   what was left out). `review` with `DATABASE_URL` set queues the batch.

5. Review the gray-band duplicate pairs and approve the batch in the console. Publishing marks the
   POIs `curation = 'editorial'`. Place search and detail read every active POI, so they work
   before the approval.

### Correcting places already curated

Wrong pins, duplicates, wrong kinds, names and must-sees are corrected by a hand-made batch, with
no model call. A batch states only the records it changes; approving it lays them over the live
release.

1. Write the decisions in `tools/content-factory/src/data/place-corrections/<batch>.json`: per
   place the record to keep (by content ref), the records that fold into it, and the corrected
   name, kind or must-see flag. A record that joins the recommended set carries its note.
   Publishing never moves the point of an existing record: a place pinned in the wrong spot is
   corrected by keeping the record at the real place and merging the wrong one into it. Merging
   is also the only way a release takes a record out of the recommended set.
2. Check every kept point against a map and record what it was checked against in `checked`
   (OpenStreetMap through `https://photon.komoot.io/api/?q=<name>&lat=<lat>&lon=<lng>`).
3. Between records at the real place, keep the one the live media release holds a photo for
   (`poi:<source>-<id>` subjects), then the one more plans point at: a stop of an existing trip
   keeps pointing at a merged record, and nothing repoints it.
4. Read the records and their live items (read-only), then build the batch, the validator report
   and the review page (`work/places/<batch>/corrections.html`):

   ```sh
   railway run --service api --environment staging -- pnpm --dir <worktree> \
     content places corrections --batch <batch> --opt snapshot=1
   pnpm content places corrections --batch <batch>   # rebuild offline from the committed snapshot
   ```

5. Add each must-see to the destination's pins (step 3 above) under its corrected name, so the
   flag survives the next generated batch, and rename any pin whose record was renamed.
6. Queue it like any committed batch (`content places review --batch <batch>` with
   `DATABASE_URL`), then approve it in the console.

### Every destination, monthly

The worker's `places.ingest` job runs on the 1st of each month at 02:00 UTC. Its first run fills
missing place boxes, then starts an FSQ OS export run: the catalog's data files are split into
`places.fsq_export_chunk` jobs (five files each), and each chunk stores the rows inside any
destination's box in Postgres (`fsq_os_export_rows`) together with its progress, so a worker
deploy mid-run costs one chunk, not the whole scan. The chunk that completes the run queues one
`places.ingest` job per destination. A destination job splits its box into tiles by where its
stored FSQ OS rows are (at most 15,000 rows a tile, a few minutes each; a destination under that is
one tile) and queues them on `places.ingest_tile`. Each tile ingests Overture and FSQ OS inside its
own area, so a worker deploy mid-run costs one tile and the tile runs again (three retries). The
last tile queues the run's finish, which applies OpenStreetMap to the whole box once, deletes the
stored rows and logs `places ingest finished` with the run's totals, tile count, failed tiles,
minutes and active count. A run with a failed tile keeps its stored rows, so enqueueing the
destination again with the same `--fsq-run` redoes it. Every places queue runs one job at a time.
A new monthly export run deletes the previous one. A destination enqueued without a stored run
(`--enqueue --only <slug>`, or the on-demand ingest) first gets an export run of its own, in the
same restartable chunks, which keeps the other runs; its last chunk queues the destination again
with that run, at the priority it was queued with. Each tile step logs `places ingest tile step`
(start, then done with its duration), so a stalled tile shows where it is. A step has its own time
limit (a DuckDB read 8 minutes, an OSM extract download 10, its scan 12) and a tile job expires
after 15 minutes (a finish after 40), so a hang costs a retry, not hours of the queue. OSM never
reads a continent-wide extract: a box across a border (Strasbourg) takes its own side's region,
and an extract over 3 GB is skipped with an `osm extract too_large` step line.
To start it by hand, or to hold destinations back (a crew on a trip there):

```sh
railway run --service api --environment staging -- pnpm --dir <worktree> --filter @cp/maps \
  ingest -- --enqueue --except da-nang
```

`ingest -- --all [--except …]` runs the same steps on this machine, one destination at a time.
Watch progress in the console's jobs panel (`places.ingest`, `places.ingest_tile`) or the worker
logs (`places ingest tiles queued`, then `places ingest finished` with inserted, updated, skipped
and active counts).

A destination nobody ingested yet does not wait for the month: the first pitch or trip there,
while it holds fewer than 50 active places, queues `places.ingest` for its slug (at most once a
week). That job finds the place box first when the destination has none.

## 4. Ride tariffs

Add the destination's records in `tools/content-factory/src/kinds/ride-tariffs/records-<slug>.ts`.
Take figures only from operator or regulator pages, with the URL and the check date. Leave a class
out, and say why in the file header, when only blogs publish it. Add the slug to
`GUIDE_DESTINATIONS`, then `pnpm content ride_tariffs run`. The batch holds every destination's records.
The api serves the published release only.

## 5. Help hub

- Emergency numbers are per country (`emergency` kind); check the country is in the live release.
- Facilities: add search terms to `tools/content-factory/src/kinds/facilities/queries.ts`, then
  research only the new destination. The batch carries the other cities' live, verified records
  over unchanged:

  ```sh
  railway run --service api --environment staging -- pnpm --dir <worktree> \
    content facilities run --opt destinations=da-nang --max-usd 1
  ```

  The batch waits in `blocked` until a person verifies each new record against its source. Check
  that the positions match the facility; the model places pins from the address.

## 6. Region pack

A destination's detailed map tiles (`<slug>/tiles-v<n>.pmtiles` on the `cp-tiles` bucket, plus a
`map_regions` row). Without one the app still draws the destination's maps, on the world tiles
alone, and says a detailed map is on its way. To see which destinations people are planning trips
to that have no pack yet (read-only):

```sh
railway run --service api --environment staging -- pnpm --dir <worktree>/tools/maps \
  missing:regions
```

Most packs need nobody: every hour the `map regions` workflow asks the api for the destinations
with a trip or a pitch in the last 30 days and no pack (`GET /v1/map/regions/wanted`, the address
in the `MAP_REGIONS_API_URL` repository variable), builds at most six with the place's box widened
by 30 km, and publishes them; the worker registers each within 20 minutes. Its run summary names
what it skipped and why: a box over the size cap, or a destination with no Geofabrik extract in
`tools/routing-tiles/src/regions.ts`. The steps below are for those, for a box chosen by hand, and
for a rebuild.

1. Choose the box. Start from the place's own box (`destinations.place_bounds`, printed by
   `missing:regions`) and widen it to the day trips people make from the town: Đà Lạt's pack
   reaches Lang Biang, Liên Khương airport and the falls. Record it in
   `tools/maps/destinations.ts` (a guest place goes in `GUEST_PLACE_EXTRACTS`) with its Geofabrik
   region. A town-sized box makes a pack of a few megabytes; Bali and Iceland are about 40 MB.
2. Build and publish it on a GitHub runner (about 4 minutes for a Vietnamese town):

   ```sh
   gh workflow run map-regions.yml -f destination=vn-da-lat
   # a place with no entry in destinations.ts yet:
   gh workflow run map-regions.yml -f destination=<slug> -f bounds=<minLon,minLat,maxLon,maxLat> \
     -f geofabrik_region=<asia/vietnam>
   ```

   The run keeps the pack as the `region-pack-<slug>` artifact and, when the `R2_TILES_ACCESS_KEY_ID`
   and `R2_TILES_SECRET_ACCESS_KEY` repository secrets are set (an R2 token with Object Read &
   Write on `cp-tiles` only), puts it on the bucket under the first free version. It never
   replaces or deletes an object: a rebuilt pack becomes `tiles-v2`, and so on. The worker's
   `places.map_region_register` job (three times an hour) finds the file at its public address and
   writes the `map_regions` row; nothing else is needed.
3. Without those secrets, or to publish from a laptop: download the artifact into
   `tools/maps/.output/` and upload it. This needs `wrangler` logged in; with `DATABASE_DIRECT_URL`
   it also writes the row at once. A version that is already published is refused.

   ```sh
   gh run download <run id> -n region-pack-<slug> -D <worktree>/tools/maps/.output
   railway run --service api --environment staging -- pnpm --dir <worktree>/tools/maps \
     upload:r2 --destination <slug>
   ```

4. Building on a laptop is the last resort: it needs Java 21 and downloads about 1.6 GB (the
   country extract, water polygons and Natural Earth) from hosts that can be very slow from
   Vietnam. Check `df -h /` first; the temp work is deleted afterwards. With less than about 4 GB
   free, keep planetiler's temporary storage in memory. Đà Nẵng was built that way in 6 minutes
   into a 5.7 MB pack of 502 tiles, z0–14:

   ```sh
   cd <worktree>/tools/maps
   PLANETILER_JAVA=/opt/homebrew/opt/openjdk@21/bin/java \
   PLANETILER_EXTRA_ARGS="--storage=ram --nodemap_storage=ram --free_water_polygons_after_read=true --free_natural_earth_after_read=true --free_lake_centerlines_after_read=true --free_osm_after_read=true" \
     pnpm build:pmtiles --destination da-nang --max-heap-mb 4096
   ```

## 7. Guide content

Phrase cards are per language (`phrases` kind); check the language is in the live release, with
the gloss as the plain meaning. Tips and the guide's pitch are written at runtime in the guide's
voice, from the season, events, fares and places above. There is nothing to seed for them.

## 8. Check on staging after the deploy

- `GET /v1/destinations/da-nang` returns the row, best months, fares and FX, and the season curve
  once it is reviewed.
- `GET /v1/places/search?q=Dragon%20Bridge&destination_id=<id>` returns the POI, and
  `GET /v1/places/{id}` returns its detail.
- `GET /v1/weather` and `/v1/weather/marine` return data for a confirmed da-nang trip.
- `GET /v1/map/regions/{destination_id}` returns the pack manifest.
- The ride quote shows `fare_estimate` once the tariffs batch is published.
