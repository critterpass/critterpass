# Google Maps and Places

Date: 2026-10-14
Status: decided (founder, D38). Supersedes [MapLibre + PMTiles on R2](20260927-maplibre-pmtiles-on-r2.md)
for the app map, and the open-data place index, Foursquare live details and Mapbox geocoding.

## Context

The open-data place index (Overture, FSQ OS and OSM, about 10 M rows and 9 GB) needs ingest,
conflation, refresh and picking jobs, and still misses places crews ask for, above all in Vietnam.
The app map was MapLibre over self-built PMTiles packs. The founder chose Google for both: places,
details and photos from Google Places API (New), and the map from the Google Maps SDKs ("their map
is also very customizable"), with Vietnam coverage accepted without a spike.

## Decision

- **Places:** Google Places API (New), called only by `services/api` (the worker resolves names in
  background jobs). The app never holds a Places key.
- **Map:** `react-native-maps` (the Expo SDK 58 version) with `PROVIDER_GOOGLE` on iOS and
  Android. MapLibre leaves the app in the same native build; there is no dual SDK.
- **What we store:** `google_place_id` on our place registry row (`pois`), indefinitely. Google
  coordinates at most 30 days (`location_source = 'google'`, `location_fetched_at`), refreshed
  while a trip or destination needs them, else cleared. Never a Google name, address, hours,
  rating, price or photo, on our servers, in a phone's cache or in a model's context.
- **Our layer:** profiles, briefs, crew notes, stops, labels (`name_source`: open data, editorial,
  crew, AI) and our own hours facts stay ours, keyed by our place id.
- **Offline:** no in-app offline map. The trip day works from our own text plus "Open in Google
  Maps" (`query_place_id`).
- **Routing:** unchanged. Mapbox for live ETAs, Valhalla for planning legs, from our stored points.

## Field masks and SKUs

One named mask per surface (`packages/domain/src/places/google-fields.ts`); lists never ask for an
Enterprise field. Prices are list prices read on 14 Oct 2026, per 1,000 calls after the monthly
free calls of each SKU.

| Surface | Call and mask | SKU (free a month, then price) | Stored |
|---|---|---|---|
| Search box | Autocomplete (New), session token, location bias; `placeId`, `structuredFormat`, `types`, `distanceMeters` | Autocomplete requests (10 k, then $2.83); free when the session ends in a Details call | nothing |
| Pick (ends the session) | Place Details `location`, `types`, `shortFormattedAddress` | Details Essentials (10 k, then $5) | place id, crew label, point ≤ 30 days, our category |
| List card photo | Place Details `photos`, then Place Photo at 480 px | Details IDs Only (unlimited) + Photos (1 k, then $7) | nothing |
| Place page | Place Details `displayName`, `formattedAddress`, `location`, `googleMapsUri`, opening hours, `rating`, `userRatingCount`, `priceLevel`, `websiteUri`, phone, `businessStatus`, `utcOffsetMinutes`, `photos` | Details Enterprise (1 k, then $20) | nothing |
| Plain-words search, "more places" | Text Search with `openNow`, `priceLevels`, location bias; `id`, `displayName`, `location`, `primaryType`, `photos` | Text Search Pro (5 k, then $32) | nothing until saved |
| Gap ideas near a stop | Nearby Search with `includedTypes`; same mask | Nearby Search Pro (5 k, then $32) | nothing until saved |
| Resolve a name (brief, link import, backfill) | Text Search, `places.id` | Text Search IDs Only (unlimited) | place id |
| Point for a resolved row, point refresh | Place Details `location` (`types` once) | Details Essentials | point ≤ 30 days |
| Moved id check | Place Details `id` | Details IDs Only | the new place id |

Field tiers for Place Details: IDs Only = `id`, `photos`, `movedPlaceId`; Essentials = `location`,
`formattedAddress`, `shortFormattedAddress`, `types`, `viewport`; Pro = `displayName`,
`primaryType`, `googleMapsUri`, `businessStatus`, `utcOffsetMinutes`; Enterprise = opening hours,
`rating`, `userRatingCount`, `priceLevel`, `websiteUri`, phone numbers.

## Caps, limits and the switch

- **Monthly caps per SKU** in our own usage table (`google_places_usage`, reserved atomically before
  each call, the Mapbox geocoding pattern): `GOOGLE_PLACES_MONTHLY_CAPS`, staging defaults
  autocomplete 30,000, details Essentials 10,000, Pro 5,000, Enterprise 1,000, Text Search Pro
  5,000, Nearby Pro 5,000, photos 1,000. A refused reservation answers `SUPPLIER_UNAVAILABLE`
  (not retryable) and the screen falls back to our layer.
- **Per-user limits** (Redis): autocomplete 60 a minute, details 120 an hour, photos 300 an hour,
  Text Search and Nearby 30 an hour; past them `RATE_LIMITED`.
- **Kill switch:** service key `places.google.enabled`; off, every Google route answers
  `SUPPLIER_UNAVAILABLE` and the app shows our layer.
- **Google-side ceilings:** per-method daily quotas on the project and a 5,000,000 VND a month
  budget alert.

## Attribution

- A Google map shows Google's own logo and notices; nothing covers them.
- Google content shown off a Google map carries the Google Maps logo (16–19 dp high) or the text
  "Google Maps" (12–16 sp), never restyled.
- A photo shows its author credit (`authorAttributions`, linked) and a path to the larger photo.
- "Places API results displayed on a map must be shown on a Google Map": Google results never sit
  on another map.
- Every Google response from our api is `Cache-Control: no-store` and carries
  `attribution{provider: 'google', authors[]}`.

## Styling: JSON styles, not a cloud Map ID

The founder named a Map ID; the light and dark looks are bundled `customMapStyle` JSON instead:

- the same colours and feature visibility, with no console step to keep in sync;
- the style switches with the app theme at runtime and changes by a JS update;
- no Dynamic Maps billing per load (a Map ID bills map loads after 10 k a month).

A cloud Map ID becomes a small console step only if a style ever needs a cloud-only feature.

## Why `react-native-maps` and not `expo-maps`

`expo-maps` draws Apple Maps on iOS. Google's terms put Places results on a Google map, and one map
on both platforms keeps one style, one marker path and one set of screenshots.
`react-native-maps` with `PROVIDER_GOOGLE` draws Google Maps on both.

## Google Cloud project and keys

Project `critterpass-e3c73` (shared with Firebase), billing linked. Keys by name only; values live
in the root `.env` (git-ignored), Railway variables, EAS env and GitHub secrets.

| Key | API | Restriction | Where |
|---|---|---|---|
| `GOOGLE_PLACES_API_KEY` | Places API (New) only | API restriction; server IP restriction optional | api and worker (Railway) |
| `GOOGLE_MAPS_IOS_API_KEY` | Maps SDK for iOS | bundle ids `app.critterpass`, `.staging`, `.dev` | EAS env, GitHub secrets |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Maps SDK for Android | API restriction, then package name + SHA-1 | EAS env, GitHub secrets |

The two mobile key values are left out of the native fingerprint, so a machine without them
computes the same runtime version.

## Consequences

- The open-data index, its ingest and refresh, machine picks, Foursquare, Mapbox forward
  geocoding, map packs and the PMTiles pipeline are removed once the Google path has run on
  staging. `pois` stays as our place registry (its name kept: renaming touches about 480 files).
- Spend scales with use; the caps and the switch bound it.
- Profile photos found by web search are deleted (no licence we could check); a place's photos
  come from Google live, with credit.
