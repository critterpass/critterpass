# Skia critter painter performance (S1, S2)

Date: 2026-09-27
Status: PASS on the pixel-diff/port-fidelity criterion and on the caching architecture question.
iPhone draw-on and Critterdex grid PASS on an iPhone 15 Pro (founder run, 2026-09-28, TestFlight
staging). INCOMPLETE on Android (Galaxy A15-class, Pixel 7a) fps and dropped-frame numbers, and on
the optional Instruments frame-by-frame traces. The iOS simulator numbers below stay as labelled
engineering signal; per phase-02's "Device evidence" rule they never count as device evidence.

## Context

Phases 4/5 need to know, before building the real renderer (`packages/critter-art`, landing in a
parallel branch not yet merged), whether re-tessellating the hand-drawn brush strokes in
`design/doodles.js` on every animation frame is affordable at Critterdex scale (150×4 grid, 6 idle
bobbing critters, per phase-02), or whether the grid must fall back to pre-baked thumbnails
(system-architecture.md §4.7's cached-`SkImage` design; code-standards.md §7's "≤2 concurrent critter
draw-ons" budget). This pass ports a **representative subset** of the design source (Tokek/gecko only,
per the environment brief for this run) into a spike painter, rather than the full multi-archetype
renderer — the production painter and its full pixel-parity suite land with the renderer phase.

## Criteria (phase-02 §Requirements, "Skia critters (S1/S2)")

| # | Criterion | Result |
|---|---|---|
| 1 | ≤2 % pixel diff vs Node prerender | **PASS — 0.175 %** (70/40,000 px), measured against the real, unmodified `design/doodles.js` source, not just self-consistency — see Method |
| 2 | Draw-on 120 fps iPhone 13+, ≥55 fps low/mid Android | **iPhone: PASS** (iPhone 15 Pro founder run, 2026-09-28, see Founder device run); **Android: INCOMPLETE** (no physical device; Android emulator not reached — see Raw numbers). iOS **simulator**: 60 fps idle → 14.3 fps during a single critter's 1.5 s draw-on in a Debug dev-client |
| 3 | 150×4 grid scroll + 6 idle critters, dropped frames ≤2 % Android | **iPhone: PASS** (≥60 fps, iPhone 15 Pro founder run); **Android: INCOMPLETE** on both the physical-device and the Android-emulator number (not reached this pass); iOS **simulator** real evidence: 600-cell grid + 6 continuously-bobbing critters holds 60 fps idle and ~52–53 fps during synthetic scroll when cells share one cached image — see Findings for why "live redraw" mode did not reproduce a comparable per-frame cost (it isn't animated) |
| 4 | Grid strategy decision (FlashList 2 vs Legend List, code-standards.md Unresolved Q3) | **Decided: FlashList 2** — see Chosen path |

## Method

- **Port, not import**: `design/doodles.js` stays untouched and read-only. `K.gecko`'s centreline
  maths (body/head/tail/limb polylines, per-pose arm variants, eye/cheek/mouth drawing) and the shared
  brush helpers (`spl` catmull-rom resample, `E` ellipse points, `rng` seeded wobble, `ribbon`
  variable-width tessellation) were ported line-for-line into two independent, non-importing copies:
  `tools/spikes/src/skia-critter/{geometry,gecko-ops,draw-surface}.ts` (Node) and
  `apps/mobile/src/app/(dev)/spikes/critter-{geometry,gecko-ops,skia-paint}.ts` (device) — kept
  separate deliberately (lint boundaries forbid `(dev)/spikes` importing `tools/spikes` and vice
  versa; the phase's own "spike code stays in tools/spikes or (dev)" rule already assumes this).
- **Canvas2D-like interface over Skia**: `DrawSurface` (`fillPolygon`/`strokePolygon`/`translated`)
  is the shared abstraction the task asked for — implemented once over `@napi-rs/canvas` (Node; a
  real Skia binding — skia-safe/Rust — not a mock) and once over `@shopify/react-native-skia`'s
  `Skia.Path.Make().addPoly()` on-device. Both consume the exact same `DrawOp[]` list and the exact
  same `renderGeckoFrame(surface, ops, totalLineLength, progress)` two-pass loop (washes/underlays,
  then fills/ink-line ribbons with a stroke-length draw-on budget), ported from `DoodleArt.draw(p)`.
- **Pixel-diff ground truth, not a self-comparison**: rather than diffing the Node port against
  itself, `tools/spikes/src/skia-critter/design-source-reference.ts` runs the real, unmodified
  `design/doodles.js` `<doodle-art kind="gecko">` custom element in headless Chromium (Playwright —
  already a pinned dependency, already used by `tools/design-renders` for the production golden-image
  pattern this mirrors at spike scale: system-architecture.md §4.7's "Chromium render of untouched
  design scripts vs core output"). `anim="none"` avoids a real race found while building this: the
  element's own `IntersectionObserver` calls `play()` asynchronously once connected, which otherwise
  repaints a mid-animation frame over an explicit `draw(1)` call. `pixelmatch`/`pngjs` (already pinned,
  already used by `tools/design-renders`) do the diff. Rerun: `pnpm --filter @cp/spikes run skia-critter`;
  test: `pnpm --filter @cp/spikes test -- skia-critter`.
- **On-device harness**: `apps/mobile/src/app/(dev)/spikes/critter.tsx` (one critter, JS-driven
  draw-on progress via `requestAnimationFrame`, a blink toggle, a Reanimated `useFrameCallback`
  counting real committed native frames over 1 s windows — independent of the screen's own
  re-renders) and `critterdex-grid.tsx` (600 cells, `numColumns=4`, toggle between `@shopify/flash-list`
  2.3.2 and `@legendapp/list` 3.4.0, toggle between one cached `SkImage` (via `drawAsImage`, an
  offscreen Skia render) shared by every cell vs. each cell tessellating its own copy once, 6
  continuously bobbing critters using the same cached image with a pure `translateY` transform).
- **Real device-class evidence this environment can produce**: no physical iPhone 13+/Galaxy
  A15-class/Pixel 7a exists here (phase-02 non-code dependency table). What *does* exist — an iOS
  27.0 simulator (`iPhone 17 Pro`, dedicated instance `cp-skia-critter-spike`, not the simulator
  another concurrent agent had booted) and the `cp_pixel_api36` Android emulator — was used for real,
  per the environment brief's instruction to measure there and label accordingly. Built the dev
  client for both (`tools/spikes/skia-critter/prebuild-and-build-ios-simulator.sh`,
  `prebuild-and-assemble-android-debug.sh`), drove it with Maestro flows
  (`tools/spikes/skia-critter/maestro-*.yaml`) since the app's fps/paint-op-cost readouts are
  on-screen React state, not stdout — screenshots were read directly off the simulator/emulator, not
  invented.
- Host-Mac-only, informational: `pnpm --filter @cp/spikes run skia-critter` also times the port's
  render cost on this machine's own CPU via `@napi-rs/canvas` (same engine as react-native-skia, but
  the host Mac, not a phone) — useful as an algorithmic-cost signal (does caching matter at all?)
  but explicitly not simulator or device evidence.

## Raw numbers

**Pixel diff (Node, hardware-independent, CI-safe)**:
```
gecko port vs real design/doodles.js <doodle-art kind="gecko">: 70 / 40,000 px differ (0.175 %)
```
5/5 tests in `tools/spikes/src/skia-critter/gecko-render.test.ts` pass, incl. determinism
(same palette ⇒ byte-identical ops) and draw-on-budget monotonicity.

**Host Mac, Node/@napi-rs/canvas (informational only — not simulator/device evidence)**:
```
single full 200×200 frame render:                 p50 0.527 ms, p95 0.641 ms
"1 frame" of 6 idle + 24 grid-recycle 96×96 renders: p50 40.38 ms, p95 45.94 ms
  (budget: 16.6 ms @60 fps / 8.3 ms @120 fps — exceeded even on this Mac's CPU when every
  visible critter re-tessellates its ribbons from scratch every frame)
```

**iOS 27.0 simulator** (`iPhone 17 Pro`, Debug dev-client build, Xcode 27 / SDK 58 preview.7, shared
16 GB host with other concurrent agents — read literally as "iOS simulator, Debug, contended host",
not as an iPhone 13 number):
```
critter.tsx, idle (before tapping "Play draw-on"):        native committed fps 60.0
critter.tsx, mid 1.5 s draw-on animation (JS setState/frame): native committed fps 14.3
critter.tsx, fully drawn (progress=1):                    42 filled polygons, JS paint-op rebuild 2.31 ms
critterdex-grid.tsx, idle, 600 cells + 6 bobbers, cached image: native committed fps 60.0
critterdex-grid.tsx, during synthetic scroll swipes, FlashList 2.3.2, cached image: ~52.0 fps
  (screenshot showed no visible scroll offset — Maestro's synthetic swipe may not have crossed
  FlashList v2's fling threshold; treat the offset-unchanged result as inconclusive, the fps
  reading as real)
critterdex-grid.tsx, during synthetic scroll swipes, Legend List 3.4.0, cached image: ~53.0 fps
  (scroll offset visibly advanced ~1 row, so this fling registered)
critterdex-grid.tsx, "live redraw" (each cell tessellates its own copy once, not shared): 60.0 fps
  — see Findings for why this does not exercise the same cost as critter.tsx's continuous animation
```

**Android emulator**: **not produced in this pass — real, disk-driven decision, not an oversight.**
The Android debug build (all four ABIs, the toolchain's default) filled this machine's disk from
13 GB down to 0.4 GB free during `buildCMakeDebug`'s native C++ compilation before the controller
caught it; recovering took stopping the Gradle daemon mid-build, deleting the partial native build
output (which had also leaked multi-gigabyte `android/build`/`android/.cxx` directories *inside*
several `node_modules` packages — `react-native-reanimated` 3.6 GB, `@shopify/react-native-skia`
2.9 GB, `react-native-worklets` 1.9 GB, `expo-modules-core` 1.9 GB — not just under
`apps/mobile/android`), and reconfiguring the build script to `arm64-v8a` only plus a `≥4 GB free`
pre-flight check (both now in `prebuild-and-assemble-android-debug.sh`). Given that incident, this
pass prioritised finishing the iOS evidence (above) and the two remaining tasks (T11, T12) over a
second native-build attempt on the same machine. The harness and scripts are real and rerunnable —
see Rerun — this is a founder/next-pass follow-up, not a missing capability.

## Findings

1. **The port is faithful**: 0.175 % pixel difference against the actual, unmodified design source
   (not a self-diff) is far inside the 2 % budget, and the failure mode found and fixed while
   building the reference renderer (the `<doodle-art>` element's own async `IntersectionObserver` +
   `play()` racing an explicit `draw(1)` call, fixed with `anim="none"`) is exactly the kind of
   real, non-obvious bug this kind of ground-truth diff is supposed to catch.
2. **Per-frame ribbon tessellation is measurably expensive, and the cost shows up exactly where the
   architecture already expected it to** (system-architecture.md §4.7's cached-`SkImage` design,
   code-standards.md §7's "≤2 concurrent draw-ons" budget): one critter continuously re-tessellating
   its brush ribbons via a naive JS-`setState`-per-frame animation loop drove this iOS simulator from
   60 fps to 14.3 fps. That number is confounded (Debug build — Hermes debug bytecode, dev-mode React
   overhead; a shared, contended host; JS-thread-driven `setState` causing full-tree React
   reconciliation every frame rather than a UI-thread worklet driving only the Skia paint) — it is
   **not** a clean "Skia itself is slow" result. It **is** clean evidence for a narrower, actionable
   claim: *the harness's own naive per-frame-JS-state redraw path is a real bottleneck*, independent
   of whatever a Release build would show. The fix implied is architectural, not a micro-optimisation:
   drive per-frame progress from a UI-thread value (Reanimated shared value / worklet), not JS
   `setState`, for any hero critter that redraws every frame — and never do this at all for grid
   cells (next finding).
3. **The grid's "live redraw" toggle did not reproduce a comparable cost, and that is itself the
   finding, not a gap**: FlashList/Legend List virtualise, so at most ~20–30 cells exist as mounted
   components at once, and `GridCritterCellLive` computes its paint ops **once** per mount (no
   animation loop) — cheap per the ~0.5 ms host-Mac number, so it never depresses fps in a static
   reading. The real cost this mode exercises is a **per-scroll-recycle** cost (every cell newly
   scrolled into view repeats the tessellation independently instead of reusing one shared image),
   not a per-frame cost — consistent with "cache once, reuse everywhere" being strictly better than
   "cache per cell" for a grid, and with why the 6 *continuously bobbing* critters in this same
   screen use one shared cached image plus a pure `translateY` transform (finding 4) instead of their
   own live redraw.
4. **Transform-only animation on a cached image is free at this scale**: the 6 idle bobbing critters
   (continuous `withRepeat`/`withSequence` loops, one shared cached `SkImage`, only `translateY`
   changing) never depressed fps below 60 in any capture, including while 600 cells were also on
   screen. This is the cheap pattern system-architecture.md §4.7 already prescribes; the spike
   confirms it holds even alongside a large virtualised grid, on a simulator, under host contention.
5. **FlashList 2.3.2 and Legend List 3.4.0 both link and run cleanly** against Expo SDK 58
   preview.7 / RN 0.88 RC / React 19.3 on the first attempt — no peer-dependency conflicts beyond the
   two pre-existing, unrelated warnings (`react-native-worklets` wanting an older `expo-modules-core`
   range, `typescript` 6.0.3 vs a transitive `@expo/require-utils` wanting 5.x) that already existed
   in this workspace before this task touched anything.
6. **`@napi-rs/canvas` is a legitimate device-analog, not just a convenient double**: both it and
   `@shopify/react-native-skia` bind the same underlying Skia library (skia-safe / Rust for the
   former, JSI for the latter), so a Node-side render using the same path construction and paint
   settings is a meaningful stand-in for on-device rasterisation, not merely a mock — worth recording
   since it is why the pixel-diff test can run in CI with no device at all.
7. **Jest cannot load `@shopify/react-native-skia`, `react-native-reanimated`, `@shopify/flash-list`
   or `@legendapp/list/react-native` as-is** (untranspiled ESM in `node_modules`; Reanimated/Worklets
   need a real JSI runtime — even the package's own documented `react-native-reanimated/mock` still
   pulls in the native initializer transitively under this repo's current Jest preset). Rather than
   touch the shared `apps/mobile/jest.config.js` (outside this task's file ownership), each of these
   is a per-test-file `jest.mock(...)` pointing at a small local double under the new
   `apps/mobile/src/app/__mocks__/` directory (same native-boundary-double class code-standards.md
   §17 already sanctions, same pattern `app-group.test.tsx` already uses for the `cp-app-group`
   native module) — a minor, called-out extension of the file-ownership footprint for tests only,
   the same class of deviation as T8's `tools/lint/boundaries.js` addition.

## Verdict

**PASS** on port fidelity (0.175 % vs the real design source, ≤2 % budget) and on the grid-caching
architecture question (share one image, animate by transform only — confirmed cheap at 600 cells +
6 bobbers on a contended simulator). **INCOMPLETE** on the phase's actual fps/dropped-frame pass
criteria, which are physical-device-only by the phase's own rule; the iOS-simulator numbers above are
real and directionally useful (they already motivate the caching architecture) but do not stand in
for iPhone 13 / Galaxy A15-class / Pixel 7a evidence.

## Chosen path

- **Grid list**: **`@shopify/flash-list` 2.x** for the Critterdex grid (code-standards.md §5's
  "FlashList for lists >20" already made this the default; this spike's job per Unresolved Q3 was to
  confirm it holds at 600 cells with continuously-animating siblings, which it does). Legend List
  3.4.0 was also proven to link and scroll cleanly and is a reasonable fallback if a future FlashList
  regression appears, but nothing here found a reason to switch off the already-decided default.
- **Draw-on strategy for the renderer phase**: cache a rendered `SkImage`/`SkPicture` per
  spec×pose×bucket (already system-architecture.md §4.7's design) and reuse it for every
  non-focused/idle critter; reserve live per-frame ribbon tessellation for the ≤2 concurrently
  "drawing on" hero critters the motion budget already allows, and drive that progress from a
  UI-thread value, not JS `setState`, based on finding 2.
- **Representative-subset scope, as directed**: only Tokek/gecko was ported for this perf spike, not
  the other five guides' archetypes in `critters-draw-1.js`/`critters-draw-2.js`. The ribbon/wash/spline
  maths ported here is shared across every archetype in the design source (same `d.line`/`d.wash`/
  `d.stroke`/`d.fill`/`d.dot` calls, same `ribbon()`/`spl()`), so the perf and caching conclusions
  generalise; exact pixel-parity for the other archetypes is the renderer phase's job, not this one's.

## Founder follow-ups

- **Physical-device fps/dropped-frame run**: iPhone 13+, Galaxy A15-class, Pixel 7a — install the
  built dev client (`tools/spikes/skia-critter/prebuild-and-build-ios-simulator.sh` /
  `prebuild-and-assemble-android-debug.sh`, or an EAS development build once Apple signing is fixed
  per the T7 ADR) and rerun `tools/spikes/skia-critter/maestro-open-critter.yaml` /
  `maestro-open-grid.yaml`, or `dumpsys gfxinfo`/Instruments for a frame-by-frame trace, to get the
  phase's actual pass/fail numbers against 120 fps iPhone / ≥55 fps Android / ≤2 % dropped frames.
- **Release-configuration numbers**: everything measured here is a Debug dev-client build (Hermes
  debug bytecode, dev-mode React). Re-run on a Release build once one exists (T11 builds the
  cold-start/size scripts this can reuse) — Debug-build fps numbers systematically understate
  Release performance and should not be used to make a final go/no-go call on their own.
- **Uncontended host**: this pass ran on a Mac shared with other concurrent agents (a second,
  unrelated simulator was already booted when this pass started). The 14.3 fps single-critter number
  in particular should be re-measured on an idle machine before treating its exact value as
  meaningful (the *direction* — continuous JS-driven redraw is expensive — does not depend on host
  contention).

## Founder device run

Steps 1–2 are the spike screens; steps 3–5 are the Sticker lab (the runtime renderer that builds on
this spike). On-screen readouts, TestFlight staging.

| Check | Device | Date | Build | Value | Result |
|---|---|---|---|---|---|
| Spike: Critter draw, native committed fps during draw-on (target 120 fps ProMotion) | iPhone 15 Pro | 2026-09-28 | TestFlight staging | not recorded; founder reported within target | PASS (founder reported ok) |
| Spike: Critterdex grid, 600 cells, flash-list + cached image, 6 bobbing critters: lowest fps over ~10 s hard scroll (target ≥60) | iPhone 15 Pro | 2026-09-28 | TestFlight staging | not recorded; founder reported within target | PASS (founder reported ok) |
| Sticker lab: 150-critter grid scroll, lowest fps (target 60) | iPhone 15 Pro | 2026-09-28 | TestFlight staging | not recorded; founder reported within target | PASS (founder reported ok) |
| Sticker lab: 2 concurrent draw-ons, lowest fps (target ≥55) | iPhone 15 Pro | 2026-09-28 | TestFlight staging | not recorded; founder reported within target | PASS (founder reported ok) |
| Sticker lab: closed-eye storm + scroll, highest cache MB (target ≤25 MB) | iPhone 15 Pro | 2026-09-28 | TestFlight staging | not recorded; founder reported within target | PASS (founder reported ok) |
| Draw-on ≥55 fps, grid dropped frames ≤2 % | Galaxy A15-class | | | | open |
| Draw-on ≥55 fps, grid dropped frames ≤2 % | Pixel 7a | | | | open |
| Sticker lab 60 fps / ≥55 fps / ≤25 MB (`e2e/critters/capture-perf.sh android`) | mid-range Android | | | | open |
| Sticker lab Instruments traces (`e2e/critters/capture-perf.sh ios`) | iPhone | | local Release build | | open |

## Rerun

```
pnpm --filter @cp/spikes run skia-critter     # Node prerender + design-source reference + timing
pnpm --filter @cp/spikes test -- skia-critter # pixel-diff + determinism + draw-on-budget tests
bash tools/spikes/skia-critter/prebuild-and-build-ios-simulator.sh
bash tools/spikes/skia-critter/install-and-launch-ios-simulator.sh critter
maestro test tools/spikes/skia-critter/maestro-open-critter.yaml
maestro test tools/spikes/skia-critter/maestro-open-grid.yaml
bash tools/spikes/skia-critter/prebuild-and-assemble-android-debug.sh
# clean up when done:
xcrun simctl shutdown cp-skia-critter-spike && xcrun simctl delete cp-skia-critter-spike
rm -rf apps/mobile/ios apps/mobile/android /tmp/cp-skia-critter-ios-derived
```
