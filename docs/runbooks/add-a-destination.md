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

1. Export FSQ OS Places for the bounds from the Places Portal Iceberg catalog. This needs
   `FSQ_PLACES_PORTAL_TOKEN` on staging; the S3 bucket is gone. Use DuckDB's `iceberg` extension:
   `ATTACH 'places' AS fsq (TYPE iceberg, SECRET fsq, ENDPOINT 'https://catalog.h3-hub.foursquare.com/iceberg')`.
   Filter as FSQ recommends: `date_closed IS NULL`, no `unresolved_flags`, refreshed within 365
   days. Write the result to a local parquet file. Đà Nẵng returned 5,546 rows in about a minute.
2. Ingest from Overture and the FSQ file into staging. This takes a few minutes. Delete the parquet
   file afterwards.

   ```sh
   FSQ_OS_PLACES_PARQUET_URI=<file.parquet> OVERTURE_RELEASE=2026-09-23.1 \
   railway run --service api --environment staging -- pnpm --dir <worktree> --filter @cp/maps \
     ingest -- --slug da-nang --min-lng 107.95 --min-lat 15.84 --max-lng 108.36 --max-lat 16.21 \
     --tz Asia/Ho_Chi_Minh
   ```

   Đà Nẵng ingested 80,479 active POIs. The attribution NOTICE lands in the git-ignored
   `tools/maps/attribution/`.
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
