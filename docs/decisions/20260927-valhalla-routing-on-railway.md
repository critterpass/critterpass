# Valhalla routing on Railway Singapore

Date: 2026-09-27
Status: PASS on walk/drive route latency; **FAIL on the 16×16 matrix budget** for larger cities;
self-hosted Valhalla on Railway SG is otherwise workable once two build-pipeline bugs are worked
around (see Method/Findings)

## Context

The routing spike needs a self-hosted Valhalla instance on Railway Singapore, built from real
OSM extracts, proven against the phase's routing latency budgets before phase 14 builds the
production routing API on the same engine. Scope: the phase's required SEA + Japan extract
(Vietnam, Thailand, Malaysia+Singapore+Brunei, Indonesia, Philippines, Cambodia, Laos, Japan).
The four guide-destination countries added to this spike's scope (Iceland, Portugal, Peru,
Mexico — Reykjavík, Lisbon, Cusco, Mexico City) were downloaded and included in the first two
build attempts but were **dropped from the final working build under a hard time/cost box** (see
Findings); they are not measured here and need a follow-up run. The product's full 61-place
roster (`design/critters-data.js`) spans the globe (also France, Spain, the US, China, Brazil,
…) — building that in one instance is explicitly out of scope; see Extrapolation.

## Criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Walk route p95 < 300 ms | **PASS** — 133.4 ms overall, worst city (Singapore) 212.5 ms |
| 2 | Drive route p95 < 300 ms | **PASS** — 124.6 ms overall, worst city (Singapore) 206.9 ms |
| 3 | 16×16 matrix (walk) p95 < 1 s | **FAIL** — 3803 ms overall; only 4/12 cities individually pass |
| 3b | 16×16 matrix (drive) p95 < 1 s | **FAIL** — 3137 ms overall; only 5/12 cities individually pass |
| 4 | Memory within the Railway plan during build | **PASS, no margin** — peaked at 24.57 GB of the team's 24.576 GB per-service ceiling (100% utilization, sustained minutes at a time), on two separate stages, without OOM-killing |
| 5 | Tile build time recorded | **99.3 min** (1 h 39 m) first boot, merged single-file extract, 8 build threads |
| 6 | Tile size / volume size recorded | tiles 8.8 GB (dir) / 8.8 GB (tar); volume 24 GB used of a 46 GB auto-grown volume |
| 7 | Cold start (restart → ready) recorded | **Not obtained** — the only restart attempted re-triggered a full rebuild because `force_rebuild` was still `True` from the previous fix cycle; time-boxed out before a clean warm-restart retry (see Findings) |
| 8 | Idle vs. peak memory recorded | Both read ~24.5 GB — the tile tar (8.8 GB) appears to stay resident/page-cached once loaded, so "idle" doesn't show a lower number on this box; not proof that a smaller serving box would fail (see Chosen path) |
| 9 | 61-place full-coverage extrapolation + recommended strategy | Done — see Extrapolation |

## Method

- **Engine**: official Valhalla image (`ghcr.io/valhalla/valhalla-scripted`), deployed as service
  `spike-valhalla` in Railway's `asia-southeast1-eqsg3a` (Southeast Asia / Singapore) region with
  a volume mounted at `/custom_files` (the image's own working directory). **Pinned to 3.8.3, not
  the newer 3.9.0** the plan guessed at — see Findings for why.
- **Extract**: one merged PBF built by `osmium merge` (`tools/spikes/valhalla-merge.Dockerfile`,
  a one-off run against the same volume) from the 8 required countries' real Geofabrik files
  (measured via HTTP HEAD, no local download): Vietnam 314.0 MB, Thailand 312.6 MB,
  `malaysia-singapore-brunei` 239.8 MB, Indonesia 1656.9 MB, Philippines 579.4 MB, Cambodia 39.1 MB,
  Laos 51.2 MB, Japan 2419.8 MB — 5.66 GB combined input, merged to a 5.96 GB `.pbf`.
- **Bench**: `tools/spikes/src/valhalla/` — a deterministic (seeded) city-bbox sampler
  (`cities.ts`), a zod-validated HTTP client for Valhalla's `/route` and `/sources_to_targets`
  (`client.ts`), pure PASS/FAIL budget evaluation (`budgets.ts`), and the bench orchestrator
  (`bench.ts`) reusing percentile/sequential-timing math from `../s-db/stats.ts` (matching the
  existing cross-spike reuse convention). Runs as a one-off Railway service
  (`spike-valhalla-bench`, `tools/spikes/valhalla-bench.Dockerfile`) hitting `spike-valhalla` over
  Railway private networking (`http://spike-valhalla.railway.internal:8002`) — the real
  production path. Samples walk + drive route pairs (62 pairs/city/mode, 744 total per mode) and
  16×16 matrices (10 calls/city/mode) inside real city bboxes: Da Nang, Hanoi, Ho Chi Minh City,
  Bangkok, Kuala Lumpur, Singapore, Bali, Manila, Siem Reap, Luang Prabang, Tokyo, Osaka (the 12
  cities this build actually covers). A sampled point Valhalla can't route from is resampled up
  to 3 times before being counted as a failure; none of the 12 covered cities hit a real
  routing failure (all `failures` are 0 for them — the only failures recorded are the 4 guide
  cities, correctly and honestly, since their countries aren't in this build's extract).
- **Local-over-internet comparison**: not run — dropped under the time/cost box in favour of
  getting the core walk/drive/matrix numbers from a working graph at all (see Findings for why
  that took most of the session).

## Raw numbers

Overall (12 cities, private network, Railway SG → Railway SG):

```json
{
  "overallWalk": {"count": 744, "p50Ms": 27.34, "p95Ms": 133.36, "p99Ms": 212.53, "maxMs": 324.20},
  "overallDrive": {"count": 744, "p50Ms": 34.23, "p95Ms": 124.57, "p99Ms": 199.84, "maxMs": 239.94},
  "overallMatrixWalk": {"count": 102, "p50Ms": 1143.48, "p95Ms": 3803.37, "p99Ms": 4287.99, "maxMs": 4403.48},
  "overallMatrixDrive": {"count": 120, "p50Ms": 1067.82, "p95Ms": 3136.88, "p99Ms": 3669.81, "maxMs": 4106.30}
}
```

Per city (walk p95 / drive p95 / matrixWalk p95 / matrixDrive p95, ms; ✓ = under its budget):

| City | Walk | Drive | Matrix walk | Matrix drive |
|---|---|---|---|---|
| Da Nang | 25.9 ✓ | 32.5 ✓ | 630.3 ✓ | 905.5 ✓ |
| Siem Reap | 17.1 ✓ | 25.3 ✓ | 295.7 ✓ | 618.1 ✓ |
| Luang Prabang | 12.4 ✓ | 10.1 ✓ | 127.1 ✓ | 169.9 ✓ |
| Bali | 121.3 ✓ | 48.2 ✓ | 1241.4 ✗ | 942.4 ✓ |
| Hanoi | 56.3 ✓ | 65.0 ✓ | 1933.9 ✗ | 1496.0 ✗ |
| Ho Chi Minh City | 84.3 ✓ | 82.8 ✓ | 1429.8 ✗ | 1907.0 ✗ |
| Bangkok | 185.4 ✓ | 62.6 ✓ | 1696.9 ✗ | 1236.5 ✗ |
| Kuala Lumpur | 97.2 ✓ | 73.0 ✓ | 1732.1 ✗ | 1251.7 ✗ |
| Manila | 117.3 ✓ | 62.0 ✓ | 1232.4 ✗ | 1227.2 ✗ |
| Osaka | 89.3 ✓ | 92.7 ✓ | 2274.8 ✗ | 2242.1 ✗ |
| Singapore | 212.5 ✓ | 206.9 ✓ | 4288.0 ✗ | 2619.6 ✗ |
| Tokyo | 168.9 ✓ | 126.6 ✓ | 4403.5 ✗ | 4106.3 ✗ |

Route latency has zero city-level failures. Matrix latency scales with city size/road density —
the three smallest towns pass cleanly, mid-size cities are 1.2–2.3 s (over budget but usable),
and the two largest metros (Singapore, Tokyo) are 4×+ over budget.

Build (from `railway logs` timestamps, container start → first successful `/status`):
container start `2026-09-27T09:24:24.189Z`, ready `2026-09-27T11:03:43.300Z` → **5959.1 s = 99.3
min**. Peak memory during the build, from `railway metrics --raw`: **24,575.6–24,575.99 MB**
(essentially the full 24,576 MB / 24 GB per-service ceiling this team's Railway plan enforces),
sustained for several minutes at a time at two distinct stages (way-node-reference sorting;
graph-edge creation) — it did not OOM-kill, but there was no observed headroom. Immediately after
the bench run, memory was still ~24.57 GB — most likely the 8.8 GB tile tar staying
page-cache-resident rather than a genuine serving requirement (see Chosen path).

Disk (`railway ssh -- du -sh`, `df -h`): `valhalla_tiles/` (uncompressed) 8.8 GB;
`valhalla_tiles.tar` 8.8 GB; merged input PBF 5.96 GB; admin/timezone DBs ~0.2 GB; volume total
24 GB used of a 46 GB auto-grown Railway volume (98% would have been hit by the failed
multi-extract attempt's leftover raw PBFs — cleaned up as part of the fix, see Findings).

## Findings

1. **Valhalla 3.9.0's `valhalla-scripted` image never produces a usable graph, on this Railway
   setup, single- or multi-extract.** The plan's guessed "3.9" turned out to genuinely be the
   current stable release (verified via `github.com/valhalla/valhalla` releases and the GHCR
   package page, not assumed) — but on it, both a from-scratch single-country (Vietnam-only,
   ephemeral storage, no volume) build and the 8-country build completed without a fatal error,
   produced files at the expected paths, and served 200 on `/status` and `?verbose=true`, yet
   `/locate` returned zero edges for well-mapped city-centre coordinates in every case. Only
   hierarchy level 2 (local) tile files existed; levels 0/1 (highway/arterial) never did, and
   Mjolnir's intermediate `*.bin` working files were left in place — both signs the pipeline
   stopped short of `hierarchy`/`validate`. **A public FOSSGIS demo Valhalla instance
   (`valhalla1.openstreetmap.de`) accepted the exact same request bodies and coordinates and
   returned real routes**, which rules out a client/request-format or bad-coordinate explanation
   and isolates the problem to this image tag's automated build.
2. **Pinning to 3.8.3 fixes single-extract builds but not multi-extract ones.** A Vietnam-only
   3.8.3 build (same Railway setup) produced a complete, working graph in ~5 minutes. The
   8-country 3.8.3 build crashed instead, with real errors in `railway logs`:
   `Failed tile 2/526735/0: vector::_M_range_check: __n (...) >= this->size() (which is 0)` (and
   seven more, all during the `enhance` stage), followed by the container purging its tile
   directory and restarting the whole build from scratch — an infinite loop if left alone. The
   image's own log explicitly warns: *"Tile building using more than one osm.pbf extract is
   discouraged. Consider merging the extracts into one file."*, linking
   `github.com/valhalla/valhalla/issues/3925`. This is a real, documented-by-upstream limitation,
   not a Railway or memory-pressure artifact — the crash happened at only ~83% memory utilization
   on the retry, well under the ceiling.
3. **Fix: merge the extracts with `osmium merge` before building.** `osmium-tool` isn't in the
   Valhalla image; `tools/spikes/valhalla-merge.Dockerfile` is a plain `debian:trixie-slim` +
   `apt-get install osmium-tool` one-off that runs against the *same* Railway volume (moved over
   with `railway volume detach`/`attach`) and merges every local `*.pbf` into one file in under 3
   minutes for this dataset. Pointing `spike-valhalla` at the single merged file (no `tile_urls`
   multi-list) with Valhalla 3.8.3 produced a complete graph: level 0 = 95 tiles, level 1 = 709
   tiles, level 2 = 9,952 tiles, and real routes/matrices for every one of the 12 covered cities.
   **Production implication for phase 14: never feed `valhalla_build_tiles`/`tile_urls` more than
   one extract directly — always pre-merge with `osmium merge` first**, and pin Valhalla to 3.8.3
   until 3.9.0's hierarchy-stage regression is confirmed fixed upstream.
4. **The 4 guide-destination countries were downloaded and merge-ready but dropped from the final
   build under a hard time/cost box** raised mid-session (Railway compute bills while
   `spike-valhalla`/`-bench`/`-check`/`-merge` run) — re-running the whole discovery-and-fix cycle
   for a 12-country merge would have meant another ~100+ minute build with no remaining budget.
   The fix itself (merge-then-build) is proven and applies identically to a 12-country merge; this
   is a size/time trade the founder should decide on for a re-run, not a technical blocker.
5. **Cold start (warm restart) was not obtained.** The `force_rebuild=True` variable used to force
   the fixed rebuild was still set when a restart was attempted afterwards, so the restart
   re-triggered a full ~100 min rebuild instead of a warm reload from the existing tile tar;
   stopped immediately (`railway down`) once noticed, under the time box, rather than spending
   another cycle on it. The tile tar itself was confirmed intact on disk afterwards (9.36 GB,
   unmodified timestamp) — a clean warm restart (with `force_rebuild` unset) should be quick
   (`use_tiles_ignore_pbf` is on by default, meaning a restart skips rebuilding when a valid tar
   exists) but this specific number needs a follow-up run to state with a measured figure.
6. **`railway volume detach`/`attach --json` reports `{"success":true}` and the volume's
   `serviceName` shows `null` in `railway volume list --json` even once genuinely reattached** —
   confirmed by deploying the target service and seeing the real data mounted, not by the list
   command's own field. Don't trust that field for confirming a volume move; deploy and check the
   mount instead.

## Verdict

**PASS** on walk and drive point-to-point route latency (criteria 1–2), on the real production
path (Railway private networking), for every one of the 12 SEA + Japan cities this build covers.
**FAIL** on the 16×16 matrix budget (criteria 3–3b) for 8 of 12 cities, with a clear pattern:
small towns pass, dense metros (Singapore, Tokyo) miss by 3–4×. **PASS with zero margin** on
build memory (criterion 4) — it fits the team's 24 GB per-service ceiling but saturates it, twice,
for minutes at a time. Cold start and a clean idle-memory baseline are **not measured** (criteria
7–8 incomplete) due to the time/cost box; disk/build-time numbers (criteria 5–6) are real and
complete.

## Monthly cost estimate

Railway bills usage-based: $20/vCPU-month, $10/GB RAM-month, by the minute (`checkthat.ai`/
`budgetforge.dev` pricing summaries, cross-checked against this team's own confirmed 24 GB/24
vCPU per-service ceiling via `railway metrics`).

- **Build** (one-time or per periodic OSM refresh): ~100 min on a box sized to the observed 24.57
  GB peak, rounded up to a 32 GB / 8 vCPU box for headroom → 32×$10×(100/60/730) + 8×$20×(100/60/730)
  ≈ **$1.10 per rebuild**. Negligible even monthly.
- **Serving, as measured** (same 24 GB box, never right-sized down, run continuously): 24 GB ×
  $10 + a serving-appropriate 4 vCPU × $20 = **≈ $320/month**. This is the only box actually
  measured serving traffic in this spike.
- **Serving, recommended** (right-sized): Valhalla's own community sizing guidance (not this
  spike's own measurement — flagged as such) puts a *serving-only* instance at roughly 4 GB RAM
  regardless of the underlying dataset size, since the 8.8 GB tile tar is read via mmap, not fully
  resident, once the OS isn't also caching a build's temp files. A 4 GB / 2 vCPU service would
  cost 4×$10 + 2×$20 = **≈ $80/month**. **Not validated by this spike** — the "idle" memory
  reading here never actually dropped because it was taken on the same 24 GB box right after a
  build, which is expected to page-cache the tar it just wrote. A follow-up run should redeploy
  `spike-valhalla` on an explicit 4–6 GB limit and confirm `/route`/`/sources_to_targets` still
  answer correctly before committing to this figure for phase 14's budget.

## Chosen path

Keep self-hosted Valhalla on Railway (D6 stands) for the SEA + Japan + guide-destination scope,
with three concrete changes phase 14 should carry forward:

1. **Always pre-merge multi-country extracts with `osmium merge` before `valhalla_build_tiles`**
   (Finding 3) — never pass more than one file via `tile_urls` directly.
2. **Pin Valhalla to 3.8.3**, not 3.9.0, until the hierarchy-stage regression (Finding 1) is
   confirmed fixed in a later release; re-check this pin before upgrading.
3. **Split the build box from the serving box.** Build on a larger, short-lived box (32 GB
   headroom proven necessary at this data size, likely more once the 4 guide countries and any
   future regions are added); serve from a much smaller, continuously-running box once validated
   (see cost estimate above) — this is both a cost optimization and reduces the real, observed
   risk of building and serving on the same zero-margin 24 GB instance.

For the matrix-latency FAIL specifically: this is not disqualifying for launch if phase 14 either
(a) caps matrix requests to smaller grids for large/dense cities (e.g. 8×8 instead of 16×16 where
the product doesn't need the full grid), (b) adds request-level caching for matrix calls between
a fixed set of POIs (trip-day ETAs are usually the same handful of places repeated), or (c) tests
whether more CPU at serve time (this spike's `server_threads=8` was a *build-time* setting to
manage build memory; serving concurrency is a separate, untested knob) narrows the gap — none of
these were tested here under the time box and are founder/phase-14 follow-ups, not part of this
spike's own scope.

## Extrapolation to full 61-place coverage

**Measured, not estimated: the input size.** `design/critters-data.js` lists exactly 61 country
entries (counted directly: `grep -cE "^\s*\['[a-z]{2}', '" design/critters-data.js` → 61). HTTP
HEAD (`curl -sIL`, no local download) against every country's Geofabrik extract gives a **real
combined input size of 60,646.5 MB (59.2 GB)** across 56 distinct PBF files (a few cover more
than one of the 61 countries: `malaysia-singapore-brunei`, `china` covers Hong Kong too,
`gcc-states` covers four Gulf countries at once). Two small labelled exceptions: Dominican
Republic has no standalone Geofabrik extract, so the real `haiti-and-dominican-republic` combined
file (84.0 MB) stands in; Georgia (the country) has no Geofabrik extract at all, so neighbouring
Armenia's real size (50.8 MB) is used as a labelled proxy — together under 0.3% of the total.

**What that means directly:** 59.2 GB of input is ~74% of a full OSM planet PBF (~80 GB).
Combined with this spike's own measurement — a 5.96 GB single merged extract already saturated a
24 GB service during two separate build stages — a 59.2 GB single-instance build is not viable on
this team's current Railway plan, full stop; it would need proportionally more RAM than any
single Railway service tier offers today (published tiers top out well under what a naive
per-GB scale-up of this spike's ~4.1 GB peak-RAM-per-GB-input ratio would demand), and Valhalla's
own community sizing guidance (`valhalla/valhalla` discussions #3138/#3288/#4816) independently
puts planet-scale builds at 16–32 GB minimum with multi-hour build times, consistent with the
same conclusion by a different route.

**Recommended coverage strategy:** regional Valhalla builds, not one global instance — (a) keep
this spike's SG instance for Southeast Asia + Japan (+ the 4 guide countries once re-merged in);
(b) stand up 1–2 more regionally-scoped Valhalla services (e.g. an EU extract, an Americas
extract), each pre-merged with `osmium merge` per Finding 3, each well under 59.2 GB, each in the
Railway region closest to its users; (c) for single-city tier-3 places that would otherwise
justify downloading a whole country (e.g. Kenya for one Nairobi critter), fold them into whichever
regional build already covers that continent, or serve drive ETAs there from Mapbox Directions
only (the phase's own stated fallback) and skip walk/matrix until a regional rebuild is warranted;
(d) never attempt a single-instance 59 GB build on a 24 GB-limited service.

## Rerun

```
# From the repo root, with the Railway CLI logged in and the project/environment linked
# (see infra/railway/README.md for ids).

# 1. Download extracts as local files on the volume (or set `tile_urls` on spike-valhalla and let
#    it download for you, then skip step 2's file list -- but ALWAYS merge before building, per
#    Finding 3).

# 2. Merge every extract into one file before touching valhalla_build_tiles:
railway service link spike-valhalla-merge   # or: railway add --service spike-valhalla-merge
railway service link spike-valhalla          # detach the volume from wherever it currently is
railway volume detach --volume spike-valhalla-volume --yes
railway service link spike-valhalla-merge
railway volume attach --volume spike-valhalla-volume --yes
railway variable set RAILWAY_DOCKERFILE_PATH=tools/spikes/valhalla-merge.Dockerfile --service spike-valhalla-merge
railway up --service spike-valhalla-merge --ci
railway logs --service spike-valhalla-merge   # wait for MERGE_DONE, then delete the per-country .pbf files
railway ssh --service spike-valhalla-merge -- rm -f /custom_files/<country>-latest.osm.pbf ...

# 3. Move the volume to the routing engine and build (single merged file, Valhalla 3.8.3):
railway service link spike-valhalla-merge
railway volume detach --volume spike-valhalla-volume --yes
railway service link spike-valhalla
railway volume attach --volume spike-valhalla-volume --yes
railway variable set RAILWAY_DOCKERFILE_PATH=tools/spikes/valhalla-tiles.Dockerfile --service spike-valhalla --skip-deploys
railway variable set build_elevation=False --service spike-valhalla --skip-deploys
railway variable set server_threads=8 --service spike-valhalla   # triggers the build
railway up --service spike-valhalla --ci
railway logs --service spike-valhalla   # first boot: budget well over 90 minutes per ~6 GB of merged input

# 4. Bench (one-off, hits spike-valhalla over Railway private networking):
railway add --service spike-valhalla-bench   # first time only
railway variable set RAILWAY_DOCKERFILE_PATH=tools/spikes/valhalla-bench.Dockerfile --service spike-valhalla-bench --skip-deploys
railway variable set VALHALLA_BASE_URL=http://spike-valhalla.railway.internal:8002 --service spike-valhalla-bench --skip-deploys
railway variable set VALHALLA_CITY_GROUPS=sea-japan --service spike-valhalla-bench   # add ",guide" once those countries are merged in too
railway up --service spike-valhalla-bench --ci
railway logs --service spike-valhalla-bench --lines 50   # one-line JSON report

# Local unit tests for the pure helpers (sampler, budgets, response parsing):
pnpm --filter @cp/spikes test -- src/valhalla
```

## Decision 2026-09-27: Mapbox at launch, Valhalla later

The founder chose Mapbox Directions and Matrix for launch routing. Valhalla comes back when volume
justifies it.

- **Why:** Valhalla passed single-route latency (p95 about 130 ms) but failed the 16 × 16 matrix
  budget in dense cities (3–4 s against 1 s). Serving would cost at least about $80/month (the
  smallest box above, not validated), before any matrix tuning. Mapbox starts on its free tier
  (100,000 Directions requests and 100,000 Matrix elements a month), then bills per use at $2.00
  per 1,000. The plan already uses Mapbox for traffic and geocoding.
- **What shipped:** `services/api/src/routing/` implements `RoutingProvider` on Mapbox: walk,
  drive (`driving-traffic`) and scooter (`cycling`) ETAs, matrices up to 50 × 50 chunked to Mapbox's
  per-request coordinate caps, traffic-aware leave-by, and closures as sampled `exclude` points.
  Transit has no Mapbox profile, so it returns flagged straight-line estimates. Outages and
  timeouts fall back to straight-line estimates flagged `estimate: true`. Limits, product-terms
  clauses (no caching or storing of results, attribution) and gaps are in
  `services/api/src/routing/README.md`.
- **What stays:** the Valhalla tooling in `tools/spikes/` (merge, tiles and bench Dockerfiles, the
  Rerun steps above) is kept as is. A Valhalla provider implements the same `RoutingProvider`
  interface and replaces Mapbox in `services/api/src/index.ts` without route changes.
- **When to revisit:** when monthly Mapbox routing spend passes the cost of a Valhalla serving box
  sized for matrices, or when GTFS transit routing becomes a requirement Mapbox cannot meet.
