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

3. Pin the places the curated set must hold, by open-data name and a point at the real place:
   `tools/content-factory/src/data/pinned-places.ts`. Find the names on staging first, because
   open data repeats names at wrong positions. Pinned stays, transit and markets are kept even
   outside the selection buckets.
4. Run the curated batch for the destination only (selection and editorial, about $1 for 400
   POIs). Publishing it is additive, so the other cities are untouched:

   ```sh
   railway run --service api --environment staging -- pnpm --dir <worktree> \
     content places run --opt destinations=da-nang --max-usd 4 --concurrency 4
   ```

5. Review the gray-band duplicate pairs and approve the batch in the console. Publishing marks the
   POIs `curation = 'editorial'`. Place search and detail read every active POI, so they work
   before the approval.

### Every destination, monthly

The worker's `places.ingest` job runs on the 1st of each month at 02:00 UTC. Its first run fills
missing place boxes, exports FSQ OS once for every destination's box (one scan, one parquet
directory per destination), then queues one job per destination; the queue runs one at a time.
To start it by hand, or to hold destinations back (a crew on a trip there):

```sh
railway run --service api --environment staging -- pnpm --dir <worktree> --filter @cp/maps \
  ingest -- --enqueue --except da-nang
```

`ingest -- --all [--except …]` runs the same steps on this machine, one destination at a time.
Watch progress in the console's jobs panel (`places.ingest`) or the worker logs
(`places ingest finished`, with inserted, updated, skipped and active counts).

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

## 6. Offline region pack

1. Add the extract to `tools/maps/destinations.ts` (Geofabrik region and the bounds).
2. Build it. This needs Java 21. Check `df -h /` first: the downloads alone (the country
   extract, water polygons and Natural Earth) take about 1.6 GB, and the temp work is deleted
   afterwards. With less than about 4 GB free, keep planetiler's temporary storage in memory. Đà
   Nẵng was built that way in 6 minutes into a 5.7 MB pack of 502 tiles, z0–14:

   ```sh
   cd <worktree>/tools/maps
   PLANETILER_JAVA=/opt/homebrew/opt/openjdk@21/bin/java \
   PLANETILER_EXTRA_ARGS="--storage=ram --nodemap_storage=ram --free_water_polygons_after_read=true --free_natural_earth_after_read=true --free_lake_centerlines_after_read=true --free_osm_after_read=true" \
     pnpm build:pmtiles --destination da-nang --max-heap-mb 4096
   ```

3. Upload to R2 and register the `map_regions` row. This needs `wrangler` logged in and
   `DATABASE_DIRECT_URL`:

   ```sh
   railway run --service api --environment staging -- pnpm --dir <worktree>/tools/maps \
     upload:r2 --destination da-nang
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
