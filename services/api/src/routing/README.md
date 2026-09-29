# Routing

`/v1/routes/eta`, `/v1/routes/leave-by` and `/v1/routes/matrix`, plus place-detail ETAs, run on
Mapbox Directions v5 and Matrix v1 at launch. Everything sits behind `RoutingProvider`
(`provider.ts`) so a self-hosted router (the Valhalla build in
`docs/decisions/20260927-valhalla-routing-on-railway.md`) can replace Mapbox without touching the
routes. Without `MAPBOX_TOKEN` the api serves straight-line estimates only.

## Mapbox product terms check (2026-09-27)

Source: [Mapbox Product Terms, July 21, 2026](https://www.mapbox.com/legal/product-terms)
([PDF](<https://cdn.prod.website-files.com/609ed46055e27a02ffc0749b/6a60463142f6478d57642594_Mapbox%20Product%20Terms%20(July%2021%2C%202026).pdf>)),
read in full for the clauses below.

| Clause                       | Text (abridged)                                                                                                                                                                                                            | What we do                                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §2.10.1 Navigation APIs      | "Customer shall not export, download, cache or store results from any request to a Navigation API." Directions and Matrix are Navigation APIs ([docs.mapbox.com/api/navigation](https://docs.mapbox.com/api/navigation/)). | No response cache at any layer: no Redis, no table, no CDN. Every ETA is a live call. Clients show results and drop them; they don't persist them.                              |
| §1.9 Default restrictions    | Query "only … in response to human user queries and human application interactions", no "bulk or automated queries", and do not "cache or store Licensed Map Content or other results".                                    | Routes run per user request. Background jobs that re-query on a timer need a founder decision (see Open questions).                                                             |
| §1.4.1 Mandatory attribution | Mapbox logo, "© Mapbox" linking to mapbox.com/about/maps, "© OpenStreetMap" linking to openstreetmap.org/about, shown prominently (§1.4.3).                                                                                | Responses with `source: "mapbox"` carry `attribution` (label + URL pairs, `routes.ts`). Clients must render them, plus the Mapbox logo, wherever a Mapbox ETA or route appears. |
| §1.10 No redistribution      | No passing Mapbox results on to third parties.                                                                                                                                                                             | ETAs go only to the requesting user's app, never to partners, exports or public links.                                                                                          |
| §2.12 Mapbox Traffic Data    | Restricts the raw road-speed dataset product (§3.42).                                                                                                                                                                      | Not used. `driving-traffic` routing results fall under §2.10, not §2.12.                                                                                                        |
| §2.11 Studio styles          | Studio styles may only be used on a Mapbox Map.                                                                                                                                                                            | Not used. Our map is MapLibre with our own style; route results carry no style.                                                                                                 |

Nothing in the terms forbids showing Directions results on a MapLibre/OSM map. The geocoding
client (`../geocoding/mapbox.ts`) is separate: it uses `permanent=true` geocodes, which §2.7.3
allows us to store.

## Modes

| Wire `mode` | Domain mode     | Mapbox profile    | Notes                                                                                                                                                                                                                       |
| ----------- | --------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `walk`      | `pedestrian`    | `walking`         |                                                                                                                                                                                                                             |
| `drive`     | `auto`          | `driving-traffic` | Live traffic. A future `depart_at` gives predicted traffic.                                                                                                                                                                 |
| `scooter`   | `motor_scooter` | `cycling`         | Mapbox has no scooter profile. `cycling` stays off motorways, where scooters are banned in most of our SEA destinations, and uses the lanes scooters take. It assumes bicycle speed, so scooter ETAs run long, never short. |
| `transit`   | `multimodal`    | none              | Mapbox has no transit routing. Returns a straight-line walk + wait + ride estimate with `estimate: true, estimate_reason: "transit_unsupported"` and makes no Mapbox call.                                                  |

## Estimates and fallback

Any answer that is not a routed path has `estimate: true`, `source: "straight_line"` and an
`estimate_reason`:

- `provider_unavailable`: timeout (3 s per call), network error, HTTP 429, 5xx, 401 or 403. Logged as a warning.
- `no_route`: Mapbox answered but found no route (for example `NoRoute`, `NoSegment`).
- `transit_unsupported`: see Modes.
- `provider_not_configured`: no `MAPBOX_TOKEN`.

The estimate is straight-line distance × 1.35 at a per-mode speed plus 3 minutes
(`@cp/domain` `estimateStraightLineEta`). A failed matrix falls back as a whole. Routed and
estimated cells are never mixed.

## Leave-by

`leaveBy` routes `driving-traffic` twice. The first call departs at `arrive_by` minus a
straight-line guess. The second departs at `arrive_by` minus the first answer, so predicted traffic
matches the hour the trip actually runs. `leave_at` is `arrive_by` minus the second answer. Mapbox
only accepts a future `depart_at`, so a departure in the past routes on live traffic. `arrive_by`
itself only exists on the `driving` profile (no traffic), so we don't use it.

## Matrix

| Profile                         | Coordinates per request | Requests per minute |
| ------------------------------- | ----------------------- | ------------------- |
| `walking`, `cycling`, `driving` | 25                      | 60                  |
| `driving-traffic`               | 10                      | 30                  |

Source: [Matrix API docs](https://docs.mapbox.com/api/navigation/matrix/). The api accepts up to
50 × 50. `matrix.ts` splits larger requests into origin × destination blocks whose coordinate
count fits the cap, picks the split with the fewest requests, runs 4 at a time and stitches the
results. A 50 × 50 walk takes 20 requests. Drive matrices use `driving-traffic` only while the
whole matrix fits one 10-coordinate request. Beyond that they use `driving` (`traffic: false`),
because a 50 × 50 on `driving-traffic` would need 100 requests against a 30 per minute limit.

Cost ([pricing](https://www.mapbox.com/pricing), 2026-09-27): Matrix bills per element (origin ×
destination pair, minimum 2 per request), so chunking doesn't change the price. The first 100,000
elements a month are free, then $2.00 per 1,000 up to 500,000. A full 50 × 50 is 2,500 elements:
the free tier covers 40 of them a month, and each one after that costs $5.00. Directions bills
per request: 100,000 free a month, then $2.00 per 1,000. A leave-by is 2 requests.

## Closures

Mapbox cannot avoid polygons. Directions only takes `exclude=point(lng lat)`: at most 50 points
per request, and only on `driving` and `driving-traffic`
([Directions docs](https://docs.mapbox.com/api/navigation/directions/)). `closures.ts` samples
each closure ring into its vertices plus a 5 × 5 interior grid, then thins the set to share the
50-point budget across rings. Verified live: a closure over the Shichijo-dori bridge in Kyoto
moves the station → Kiyomizu-dera drive onto Gojo-dori (fixture `kyoto-drive-closure`).

Gaps:

- Walking and cycling (scooter) routes ignore closures: Mapbox has no exclusions for them.
- A road that crosses a closure between two sampled points can still be used. Large closures get
  coarser sampling. `routeCrossesClosures` checks a returned geometry when a caller needs certainty.
- Matrices ignore closures: the Matrix API has no `exclude`.

## Tests

`services/api/test/routing/` replays real Mapbox responses recorded for Kyoto (`fixtures/`, token
stripped). To re-record (about a dozen requests, all inside the free tier):

```sh
pnpm --filter @cp/api exec tsx --env-file=../../.env test/routing/record-fixtures.ts
```

Timeouts and HTTP failures are simulated at the HTTP client boundary only.

## Open questions for the founder

- §1.9 forbids "automated queries". The planned 60-second `eta.meetups` re-query job runs only
  while users are in an active meet-up, but it runs on a timer. Confirm with Mapbox before
  shipping it, or re-query only when a client reports a new location fix.
- §2.10.1 forbids storing results. Storing a derived `leave_at` on a plan item (as opposed to the
  raw ETA) needs the same confirmation. Until then, compute leave-by on read.
