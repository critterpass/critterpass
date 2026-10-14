# Map tiles: MapLibre RN + PMTiles on R2 (Da Nang draft)

Date: 2026-09-27
Status: PASS on rendering, delivery choice and city-pack download. Offline PASS on an iPhone 15 Pro
in Airplane Mode (founder run, 2026-09-28), within one app session; a cold relaunch offline is not
covered (see Findings). Android pan/zoom fps is still a founder checklist item.

## Context

Phase-02 "Map tiles" (system-architecture.md §11) needs a real custom-styled basemap sourced from
PMTiles on R2, proven to render on a real MapLibre RN build and to work with a downloaded,
on-device city pack. This also de-risks phase 14 (places/maps/routing), which inherits whichever
delivery path and style pipeline this spike proves out.

## Criteria (phase-02 §Requirements, "Map tiles")

| # | Criterion | Result |
|---|---|---|
| 1 | MapLibre RN 11 renders a custom hand-drawn style from PMTiles on R2 | **PASS** |
| 2 | Offline: city pack downloads to device, style still renders from it | **PASS** (network-severed run not attempted — see Findings) |
| 3 | 60 fps pan on mid Android | **INCOMPLETE** — founder checklist, no Android device in this lane |

## Method

- **Extract**: `tools/spikes/tiles/build.ts` downloads planetiler's released jar and the real
  Geofabrik `asia/vietnam-latest.osm.pbf` (329 MB) into a throwaway temp dir, runs the bundled
  OpenMapTiles profile (`--download` for planetiler's own water/lake/natural-earth auxiliary
  sources, `--bounds=107.95,15.92,108.35,16.20`, `-Xmx2g`, zoom 0–14), and deletes the temp dir
  (PBF, jar, planetiler's own working data) afterwards regardless of outcome — nothing but the
  4.1 MB `.pmtiles` output survives. **Needs a real Java 21+ binary**; this Mac only had JBR 17 —
  `brew install openjdk@21` (keg-only, not linked) and `PLANETILER_JAVA=` env override, documented
  in `tools/spikes/tiles/README.md`, not applied globally.
- **Style**: `tools/spikes/tiles/style/da-nang-dark.json`, a hand-authored MapLibre style JSON
  against the *real* OpenMapTiles schema this extract produces (checked with `pmtiles show
  --metadata`, not guessed) — navy background (`design-tokens` `ink/900` `#120f22`) with a faint
  grid drawn as a real `background-pattern` sprite tile (not a flat color), blue water
  (`color/blue` `#4f86ff`) at reduced opacity, road/building/park layers from the `ink`/`paper`
  scale, a `critter-paw` POI icon, Archivo labels for roads/POIs/villages and a Caveat hand-drawn
  accent for city/town place names.
- **Fonts/sprite**: `tools/spikes/tiles/generate-fonts.ts` wraps `@kartore/glyphore` (a real SDF-PBF
  generator) against the actual shipped `Archivo-W100-700.ttf` / `Caveat-600.ttf` from
  `apps/mobile/assets/fonts` — no placeholder glyph data. `generate-sprite.ts` draws the grid tile
  and paw icon with `@napi-rs/canvas` (the same real Skia binding `skia-critter` uses), at 1x/2x.
- **Delivery comparison**: `wrangler r2 bucket dev-url enable cp-tiles` → public URL
  `https://pub-0cf3d04afb394624afbe8f117d1f198b.r2.dev`. Compared against the phase's other named
  option, media-worker range reads, by reading the real source
  (`services/media-worker/src/index.ts`) rather than guessing: `env.MEDIA.get(objectKey)` is
  called with no `range` option and no `Range` request-header handling at all — every GET returns
  the full object regardless of a client's `Range` header — and the binding is `MEDIA` (the
  `cp-media-*` buckets), not `cp-tiles`. Media-worker literally cannot do a PMTiles range read
  today; adding that is real work outside this phase's files (`services/media-worker/**` is not
  owned here). The public bucket, by contrast, already serves real byte-range requests natively
  (`Accept-Ranges: bytes`, verified 200 responses on partial `curl -r` requests) — exactly what
  PMTiles' own random-access reader needs, and PMTiles archives are non-sensitive geometry, so no
  privacy class is at risk. `upload.ts` always passes `--remote` to `wrangler r2 object put`
  (its default target is Wrangler's local simulator, which looks identical but writes nowhere
  real — a genuine early mistake in this pass, caught by checking the uploaded object's public URL
  actually 404'd until `--remote` was added).
- **Mobile screen**: `apps/mobile/src/app/(dev)/spikes/map.tsx` — `@maplibre/maplibre-react-native@11.4.0`'s
  `<Map mapStyle={…}>` pointed at `pmtiles://<url>` (iOS's MapLibre Native core reads `pmtiles://`
  natively — no `addProtocol` JS shim needed, confirmed by it actually rendering). A button
  downloads the same `.pmtiles` file to `FileSystem.documentDirectory` via
  `expo-file-system`'s real `downloadAsync`, then a second button re-points the style's source at
  that local file and forces a full `<Map key=…>` remount.
- **Tests**: `e2e/spikes/map-offline.yaml` (Maestro, real device interaction on the iOS Simulator)
  drives exactly this: open the screen → remote render → download → switch to local file → local
  render, with screenshots at each stage.

## Raw numbers

- planetiler 0.10.2 run: wall time 8 m 39 s (download 1 m 31 s, lake_centerlines 11 s,
  water_polygons 44 s, natural_earth 1 m 25 s, `osm_pass1` 54 s, `osm_pass2` 3 m 11 s, archive
  write 34 s) on `-Xmx2g`. Output: 4,109,962 bytes, 397 addressed tiles / 365 tile entries / 349
  tile contents, zoom 0–14, 28 MB of raw features compressed into that 4.1 MB archive.
- R2 upload: 13 objects, 4,483,095 bytes total (pmtiles + 8 glyph-range `.pbf` files across 2
  fontstacks + 4 sprite files).
- Range-read timing (curl from this dev machine to the public bucket, **not** a device or a
  Singapore-region measurement — a directional number only): full 4.1 MB GET 1.12 s; a 16 KB range
  GET 0.31 s; five repeats of a 64 KB range GET: 0.76 s / 0.28 s / 0.31 s / 0.30 s / 0.77 s (cold
  vs. warm edge cache, not device-side).
- On-device (iOS Simulator, `expo-file-system` `downloadAsync`) full-file download of the same
  4,109,962-byte object: 1765 ms, 617 ms, 684 ms across three real runs (shared-machine network
  variance, not a controlled benchmark).

## Findings

1. **Public bucket beats media-worker on the actual code, not just convenience**: see Method — no
   guesswork, the worker's source has no range-request path today.
2. **A doubled `file://` scheme reads as a *misleading* "path not found" even though the file is
   exactly there.** `expo-file-system`'s `documentDirectory` is already a `file://` URI; the first
   version of this screen built `pmtiles://file://${documentDirectory}…`, and MapLibre Native's
   real error — `Error fetching PMTiles header: path not found: file:///…/da-nang-tiles.pmtiles`
   — names the *correct*, single-scheme path, which genuinely exists on disk at that exact
   location (confirmed with `ls`). Something in the doubled-prefix parse still fails even though
   the reported path is right; the fix is simply not to double it (`pmtiles://` + a URI that is
   already `file://…`). Worth flagging for phase 14: this failure mode gives no hint that the
   scheme, not the path, is the problem.
3. **`<Map mapStyle={…}>` does not reliably re-apply a `background-pattern` layer when only the
   `sources.*.url` changes in place.** Swapping the vector source from the remote URL to the local
   file (same `mapStyle` object shape, new `url` value) rendered the vector data correctly but
   silently dropped back to a flat, uncustomized background — no error, nothing in `log stream`.
   Giving `<Map>` a `key` prop that changes with the source (forcing a full unmount/remount)
   fixed it immediately. Any future runtime style/source swap in this MapLibre RN version should
   assume the same and force a remount rather than trust the library's own prop diffing.
4. **`wrangler r2 object put` defaults to local mode.** Without `--remote` it "succeeds" against
   Wrangler's local simulator — indistinguishable from a real upload until the URL is actually
   checked. `upload.ts` always passes `--remote`; any future spike script doing the same should
   too.
5. **Java version gate on planetiler.** The GitHub-released jar needs Java 21+; this Mac's only
   JDK (JetBrains Runtime 17, used elsewhere in this environment) is too old and fails with an
   opaque `UnsupportedClassVersionError`. Documented in the README rather than fixed globally
   (`brew install openjdk@21`, keg-only, `PLANETILER_JAVA=` env override).

## Verdict

**PASS** on rendering (both remote and local-file sources, real Da Nang geometry, real custom
dark style, real Archivo/Caveat glyphs, real sprite pattern — all screenshotted via
`e2e/spikes/map-offline.yaml`) and on the delivery-path choice. **PASS with a gap** on offline:
the city pack downloads for real and the map renders from it with zero PMTiles-source network
calls, but this pass did not additionally sever network reachability to prove fonts/sprite also
survive from MapLibre Native's own on-disk ambient HTTP cache — skipped deliberately rather than
cutting host networking on a Mac shared with four other concurrent agents (see Founder
follow-ups). **INCOMPLETE** on the 60 fps pan criterion — no Android device in this lane; iOS
Simulator panning looked smooth by eye but per phase-02's own device-evidence rule, simulator
numbers never count as fps evidence.

## Chosen path

Public `cp-tiles` R2 bucket (`dev-url` access) for PMTiles, fonts and sprite — matches phase-02's
own default (open question 2) and is now backed by a real code-level reason, not just the
default. No fallback (vector tile server on Railway) needed.

## Founder follow-ups

- **Pan/zoom fps on a real Samsung Galaxy A15-class device** (phase-02 open question 3):
  `tools/spikes/tiles/measure-pan-zoom-fps-android.sh <serial>` resets `dumpsys gfxinfo` counters,
  waits for a manual ~10 s pan/pinch-zoom on the map spike screen, then prints real frame-timing
  stats. Fill the table below.
- **True network-severed offline proof**: re-run `e2e/spikes/map-offline.yaml` through the
  download+switch steps, then actually disable the simulator's network (Simulator.app → Debug →
  Network Link Conditioner, or a real device in airplane mode) and confirm the map still renders
  — this pass proved the local-file source path works but did not cut network reachability to
  also prove the sprite/glyph ambient cache survives cold.
- **Style is a draft, not final art direction**: colors pulled directly from `design-tokens`, but
  no designer pass on the OpenMapTiles layer selection/ordering itself.

### Founder device run

| Device | Pan/zoom fps (`dumpsys gfxinfo`) | Dropped frames | Notes |
|---|---|---|---|
| Samsung Galaxy A15-class | | | |

| Check | Device | Date | Build | Value | Result |
|---|---|---|---|---|---|
| Download city pack (offline): bytes and ms | iPhone 15 Pro | 2026-09-28 | TestFlight staging | not recorded | PASS (founder reported ok) |
| Switch to the downloaded file, Airplane Mode, pan and zoom Da Nang: map, labels and icons render | iPhone 15 Pro | 2026-09-28 | TestFlight staging | — | PASS (founder reported ok); one session only, a cold relaunch is not covered (see the offline gap above) |

## Rerun

```
pnpm --filter @cp/spikes run tiles:build -- --city da-nang
pnpm --filter @cp/spikes run tiles:fonts
pnpm --filter @cp/spikes run tiles:sprite
pnpm --filter @cp/spikes run tiles:upload -- --city da-nang
maestro test e2e/spikes/map-offline.yaml
bash tools/spikes/tiles/measure-pan-zoom-fps-android.sh <serial>   # founder, real Android device
```
