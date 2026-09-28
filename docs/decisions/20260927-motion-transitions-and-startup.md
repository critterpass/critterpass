# Grow-into-page transition, timeline drag, and cold start (S3, S7, S8)

Date: 2026-09-27
Status: PASS on the transition-approach decision and the drag snap-latency criterion, confirmed on
an iPhone 15 Pro by the founder on 2026-09-28. **FAIL on iOS download size**: 65.9 MB against
≤40 MB, see Size measured 2026-09-28. INCOMPLETE on release cold start (Instruments on iOS, a
release build on mid-range Android).

## Context

Phase-02 needs a decision on how "grow-into-page" (design-system.md §3.3's `zoom` transition: shared
-element grow from the tapped card, radius 22→54, fade first 35%, 560 ms) gets built, a working
15-minute-snap timeline drag with haptic ticks, and committed scripts for the release cold-start and
download-size budgets (system-architecture.md §9: cold start ≤1.2 s mid Android / ≤0.8 s iOS, iOS
download ≤40 MB).

## Criteria (phase-02 §Requirements, "Motion (S3/S7/S8)")

| # | Criterion | Result |
|---|---|---|
| 1 | grow-into-page transition interruptible, ≤16 ms p95 frame | PASS for the chosen approach (custom teleport overlay) — see Raw numbers; iPhone 15 Pro founder run PASS (see Founder device run) |
| 2 | Timeline drag 15-min snap + haptic tick, snap latency <1 frame | PASS — snap is UI-thread math applied in the same frame that detects the crossing; only the haptic call itself hops to JS; iPhone 15 Pro founder run PASS |
| 3 | Release cold start ≤1.2 s mid Android / ≤0.8 s iOS | INCOMPLETE — Debug dev-client only, see Findings |
| 4 | iOS download ≤40 MB | **FAIL** — TestFlight staging on iPhone 15 Pro: 65.9 MB download, 122 MB install. See Size measured 2026-09-28 |

## Method

- **Three candidates investigated for grow-into-page, as the task asked, not just the one that
  turned out to work**:
  1. **`Link.AppleZoom`** — wired for real (`apps/mobile/src/app/(dev)/spikes/grow-into-page.tsx`'s
     `apple-zoom` mode: a real `<Link>` + `<Link.Trigger withAppleZoom>` to a second real route,
     `grow-into-page-detail.tsx`, using `<Link.AppleZoomTarget>` on the destination — not a stub).
     Reading the installed package's own source
     (`expo-router/build/link/zoom/ZoomTransitionEnabler.js`) before ever touching a device found
     `isZoomTransitionEnabled()` hard-coded to `return false;` in this exact installed version
     (`expo-router@58.0.8`) — the feature exists in the public API (`Link.AppleZoom`,
     `Link.AppleZoomTarget`, `Link.Trigger`'s `withAppleZoom` prop) but is entirely inert
     server-side-flag-off in this SDK release, confirmed on-device (see Raw numbers).
  2. **Reanimated `sharedTransitionTag`** — real, not experimental-in-name-only: `SharedTransition`
     ships in the installed `react-native-reanimated@4.7.0`. Implemented as an in-screen reveal
     (`SharedElementDemo`: the grid and the detail view are mutually exclusive renders of the same
     component tree, swapping in one commit) rather than a real cross-route navigation, because
     Reanimated's shared-element mechanism hooks into React's own mount/unmount lifecycle and
     expo-router's default `native-stack` presents screens as native `UIViewController`/`Fragment`
     instances that this JS-side layout-animation system does not have visibility into — a real,
     structural incompatibility with a *route* transition specifically, not a bug in the demo.
  3. **Custom teleport overlay** — `measure()` (Reanimated's UI-thread `View.measure` equivalent) on
     the tapped card via a per-card `useAnimatedRef` (one call site per card component, not in a
     loop — Rules of Hooks), then an absolutely-positioned `Animated.View` interpolating
     left/top/width/height/borderRadius from the measured source rect to full screen over the
     design token's 560 ms, content fading in over the first 35%. Interruptible by construction:
     closing calls `progress.value = withTiming(0, …)` from whatever value `progress` currently
     holds — Reanimated interpolates from there, it does not jump.
- **Frame-timing instrumentation**: the same real, native-thread `useFrameCallback` counter from the
  T10 skia-critter spike (independent of the screen's own re-renders), reporting the worst single
  frame gap in each 700 ms window — a direct, on-device measurement of whether a transition ever
  drops below 60 fps (16.6 ms/frame), not an estimate.
- **Timeline drag** (`apps/mobile/src/app/(dev)/spikes/timeline-drag.tsx`): `Gesture.Pan()` from
  Gesture Handler 3, `onChange` computing the nearest 15-minute step from the raw drag translation —
  all UI-thread. A haptic tick (`expo-haptics`) fires via `runOnJS` only when the snapped step index
  actually changes (not every pixel of movement); the visual thumb/fill position is a pure
  `useAnimatedStyle` of the same UI-thread value, so it updates in the identical frame the crossing
  is detected in — there is no JS round trip on the critical path, only on the haptic side-effect.
- **Cold start / size scripts**: `tools/spikes/motion/measure-cold-start-ios-simulator.sh`
  (`xcrun xctrace record --template 'App Launch'`, the Apple-sanctioned tool the phase names) and
  `measure-cold-start-android-emulator.sh` (`adb shell am start -W`, which reports `TotalTime`
  directly from the OS, no trace parsing needed). Both committed and runnable against either a
  Debug or (once one exists) a Release build.
- **Device-class evidence this environment can produce**: dedicated iOS simulator
  `cp-skia-critter-spike` (recreated, single reused instance — the earlier one was deleted to
  recover disk space mid-pass, see the skia-critter ADR's cross-reference), driven by Maestro
  (`tools/spikes/motion/maestro-*.yaml`). The `cp_pixel_api36` Android emulator was not used in this
  pass — no Android build exists yet this session (see the skia-critter ADR's disk-incident note);
  `maestro-*.yaml` and `measure-cold-start-android-emulator.sh` are written and ready to rerun once
  one does.

## Raw numbers

**iOS 27.0 simulator** (`iPhone 17 Pro`, Debug dev-client, same build/shared host as the T10 ADR):
```
grow-into-page, idle before any interaction:                          worst frame gap 16.67 ms
grow-into-page, teleport-overlay: open (measure+grow) + tap-to-close
  (reverses the same shared value mid-flight):                        worst frame gap 16.67 ms
grow-into-page, shared-element mode (in-screen reveal, open + close):  worst frame gap 16.67 ms
timeline-drag, full drag gesture crossing many 15-min boundaries
  (haptic tick fired on each crossing):                                worst frame gap 16.67 ms
```
16.67 ms is exactly one 60 Hz frame interval (1000/60 ms) — every window measured across every
interaction in this pass reported this same floor value, i.e. zero observed dropped frames, not an
estimate rounded down to the budget.

**`Link.AppleZoom`, on-device confirmation of the source-code finding**: tapping the
`Link.Trigger withAppleZoom`-wrapped card navigated to `grow-into-page-detail.tsx` using the
ordinary native-stack push transition (screenshotted mid/post-navigation) — no zoom animation of any
kind, consistent with `isZoomTransitionEnabled()` returning `false`.

**Cold start / size**: **not produced this pass.** `xctrace record --template 'App Launch'` was run
for real against the same simulator; without `--time-limit` it kept recording and its raw `.ktrace`
data (written under `$TMPDIR`, *separately* from the named `--output` bundle) passed 2.9 GB within
about 40 s — a second, independent disk-safety incident in this same pass (see the skia-critter
ADR's Android incident). A 10 s `--time-limit` avoided the disk risk but produced a trace too short
for `xctrace export` to read ("instrument run data is missing"). The script
(`measure-cold-start-ios-simulator.sh`) now enforces a `≥6 GB free` pre-flight check and cleans up
the stray `.ktrace` file on exit; a longer time limit (20–30 s) on a machine with more headroom
should produce a readable trace. `am start -W` (Android) was not attempted — no Android build in
this pass, see the skia-critter ADR.

## Findings

1. **`Link.AppleZoom` is a real dead end in this SDK, not a maybe** — this is a definitive,
   source-verified finding (not "it didn't seem to work"), and it also does not match the
   interaction model design-system.md's `zoom` token describes anyway: `Link.AppleZoom` is Apple's
   long-press context-menu "Link Preview" zoom (`@platform ios 18+`, requires `Link.Trigger`), not a
   plain-tap navigation transition. Even if the flag were flipped on in a future expo-router release,
   it would need a long-press interaction to trigger at all, which is not "grow-into-page" as
   designed (a tap). Both facts independently rule it out for this transition.
2. **Reanimated's shared-element transitions are for component trees, not native-stack routes** —
   worth stating precisely for whoever builds the real card→detail transition in the renderer/UI
   phases: `sharedTransitionTag` works today (verified: it renders, no error, in the in-screen
   demo), but wiring it to an actual `router.push()` navigation would first need either switching
   that specific transition to a JS-driven stack (`@react-navigation/stack`) instead of native-stack,
   or building the same "measure the source, animate an overlay" technique this spike already
   built as the fallback — which is exactly why the custom teleport overlay was built to a standard
   worth shipping, not as a token afterthought.
3. **Zero dropped frames across every interaction tested, on a shared/contended host** — the
   teleport overlay's open+close (including reversing mid-flight), the in-screen shared-element
   reveal, and a full 15-minute-boundary-crossing timeline drag all reported the same 16.67 ms floor
   (one 60 Hz frame) with no worse frame observed. This is real signal that UI-thread-only Reanimated
   work (measure → interpolate → style, or a Pan gesture's `onChange` → shared value → style) stays
   cheap even while this same machine was under load from other concurrent work — a meaningfully
   different result from T10's finding that a JS-`setState`-per-frame animation loop is expensive;
   the two results together are the actionable takeaway (drive continuous per-frame changes from
   the UI thread, not from JS state).
4. **A `<Link.Trigger>` child cannot receive an array `style` prop** — a real, source-verified
   constraint found while wiring the `apple-zoom` mode (fixed with `StyleSheet.flatten`, not an
   assumption): `Link.Trigger` forwards its child through expo-router's own `<Slot>`, which throws
   `[expo-router]: You are passing an array of styles to a child of <Slot>` if given one. Worth
   flagging for whoever eventually revisits `Link.AppleZoom` once/if it ships enabled.
5. **`react-native-gesture-handler` 3's `GestureDetector` needs exactly one
   `GestureHandlerRootView` ancestor**, and the app had none — `timeline-drag.tsx` is the first
   screen in this codebase to use a raw gesture (every other screen so far uses `Pressable`/
   `ScrollView`), so this was the first time the gap could surface. Fixed in
   `apps/mobile/src/app/_layout.tsx` (outside this task's own file list, but a one-line, app-wide,
   unavoidable prerequisite for *any* future Gesture Handler 3 usage — flagged the same way T8
   flagged its `tools/lint/boundaries.js` addition).

## Verdict

**PASS** on criterion 1 (grow-into-page, chosen approach) and criterion 2 (timeline drag): both
measured 16.67 ms worst-frame-gap (zero dropped frames) through real interactions on an iOS
simulator, and the drag's snap is proven UI-thread-only by construction (Method). **INCOMPLETE** on
criteria 3–4 (release cold start, iOS download size): no numeric result was produced this pass —
see Raw numbers for the specific, real blocker (an Instruments trace growing multi-GB in seconds)
and Founder follow-ups for what a release build still needs.

## Chosen path

**Custom teleport overlay** for grow-into-page. Not the plan's stated default assumption (which
listed Reanimated shared element ahead of a custom overlay) — reversed on the concrete,
source-verified finding that expo-router's native-stack does not expose the mount/unmount surface
Reanimated's shared-element mechanism needs for a *route* transition, and that `Link.AppleZoom` is
both inert in this SDK and interaction-model-mismatched regardless. The overlay technique matches
the design token's exact spec (radius/fade/duration) and is interruptible by construction.

## Founder follow-ups

- **Release-build cold start and size, on the reference devices** (iPhone 13+, mid-tier Android):
  everything measured in this pass is a Debug dev-client, which (a) fetches its JS bundle from Metro
  over the network rather than embedding it, inflating cold start in a way no amount of on-device
  optimisation removes, and (b) is not what `check-release-bundle.ts` ships (dev routes are
  Metro-blocklisted out of any real release export, so this spike's own screens cannot exist inside
  the build being measured — the cold-start scripts measure the app's actual entry route, not these
  spike screens). Build a real `APP_VARIANT=production` release configuration once Apple signing is
  fixed (see the T7 ADR's founder follow-ups) or via an Android release/bundle build, install it, and
  rerun `tools/spikes/motion/measure-cold-start-*.sh`.
- **iOS download size**: needs an actual App Store Connect / EAS build size report (thinned,
  compressed, per-device-variant) — a local unsigned `.app` bundle size is not that number and is
  recorded here only as a directional signal.

## Founder device run

| Check | Device | Date | Build | Value | Result |
|---|---|---|---|---|---|
| Grow-into-page, teleport overlay, open and close mid-animation ×10: worst frame gap (700 ms window) | iPhone 15 Pro | 2026-09-28 | TestFlight staging | not recorded; founder reported within target (≤16.6 ms) | PASS (founder reported ok) |
| Closing mid-animation reverses smoothly, no jump | iPhone 15 Pro | 2026-09-28 | TestFlight staging | — | PASS (founder reported ok) |
| Timeline drag: 15-minute snap with a haptic tick per step; worst frame gap while dragging | iPhone 15 Pro | 2026-09-28 | TestFlight staging | not recorded; founder reported within target (≤16.6 ms) | PASS (founder reported ok) |
| iOS download size (App Store Connect → App File Sizes) | iPhone 15 Pro | 2026-09-28 | TestFlight staging | download 65.9 MB, install 122 MB | **FAIL** against ≤40 MB, see Size measured 2026-09-28 |
| Release cold start ≤0.8 s | iPhone 13+ | | Instruments, local Release build | | open |
| Release cold start ≤1.2 s | mid-range Android | | release build | | open |

## Size measured 2026-09-28

The founder read 65.9 MB download and 122 MB install for an iPhone 15 Pro from App Store Connect.
To see what takes the space, the store IPA of TestFlight staging build 5 (EAS build
`9f812d36-1a73-41d2-b3f9-a5e935969c0d`, commit `f3b27042`, 84.0 MB `.ipa`, 120.9 MB unpacked)
was unzipped and measured with `du`, `xcrun assetutil`, `size`, `otool` and `afinfo`. Each
component was compressed on its own with `zip -9` to estimate its share of the download. Asset
catalogs were thinned with `assetutil -i phone -s 3 -p p3 -M 8 -g MTL3,1 -r 2023`, which is close
to the App Store variant for an iPhone 15 Pro. The main executable's FairPlay-encrypted range
(`cryptsize` 21.6 MB) does not compress in the store download, so it counts at full size.

| Component | Raw (MB) | Thinned for iPhone 15 Pro (MB) | Est. download (MB) | Notes |
|---|---|---|---|---|
| Main executable (arm64) | 25.2 | 25.2 | ~23.1 | 21.6 MB encrypted `__TEXT` (17.4 MB code). Statically links RN Skia (skia, skottie, svg, sksg, skshaper, skparagraph), Sentry, MMKV, Nitro, Reanimated, Worklets, Gesture Handler, Screens and the other static pods |
| Critter art `Assets.car`, three byte-identical copies (widgets, NSE, NCE) | 3 × 10.3 | 3 × 9.2 | 3 × 8.7 = 26.0 | 1,327 renditions each. 6.3 MB of each copy is 450 blur-stage silhouettes (120 px, 2x only, lossless). Nothing here is used today except the NSE's one guide avatar |
| Music, 12 `.m4a` (6 guide themes + 6 previews) | 11.9 | 11.9 | 11.8 | Mono AAC-LC at ~225 kbps. Only dev routes import it today, so the production export leaves it out |
| `React.framework` | 13.4 | 13.4 | 3.1 | |
| `MapLibre.framework` | 8.3 | 8.3 | 3.3 | Map rendering (MapLibre, not the Mapbox SDK; Mapbox is only routing over HTTP) |
| `hermesvm.framework` | 6.4 | 6.4 | 1.7 | |
| `main.jsbundle` (Hermes bytecode v99) | 10.7 | 10.7 | 4.4 | No source maps bundled. Dev routes add 1.1 MB raw / 0.5 MB compressed (staging vs production export of the same commit) |
| `ExpoModulesCore.framework` | 3.9 | 3.9 | 1.0 | |
| Other frameworks (FileSystem, MediaLibrary, Location, Font, ModulesJSI, Worklets, PowerSync SQLite core, ReactNativeDependencies) | 5.9 | 5.9 | 1.6 | `powersync-sqlite-core` 0.8 MB raw / 0.3 MB |
| Fonts, 27 TTFs, **two copies** (bundle root via the `expo-font` plugin and Metro `assets/fonts`) | 2 × 1.8 | 2 × 1.8 | 2 × 0.75 | 15 of them are Archivo width × weight instances |
| Main `Assets.car` (flat 1024 px AppIcon, splash) | 1.0 | 1.0 | 1.0 | AppIcon is one flat 1024 px rendition, 0.96 MB |
| SFX, 23 `.caf` (16-bit PCM, 48 kHz, mono) | 0.8 | 0.8 | 0.6 | |
| Extension executables, `GoogleSignIn.bundle`, plists, signatures, JS PNGs | ~1.1 | ~1.1 | ~0.4 | |
| **Total** | 120.9 | ~119.7 | ~79.6 | App Store Connect reports 122 MB install and 65.9 MB download |

The raw thinned total matches the 122 MB install size. The download estimate is about 14 MB above
the reported 65.9 MB. The likely reason is that the store download compresses better than `zip -9`
or stores the three identical `Assets.car` files once. Deduplicating them would give about 62 MB.
Treat each row's download share as an upper bound.

Not in this build: the 10 alternate app icons (they arrive with the alternate-icon feature; the
generated `.appiconset` folders are 3–4.8 MB each of raw PNGs, the layered `.icon` bundles
124–160 KB each). No `.lproj` folders; localisation lives in the JS bundle.

**Production today.** Leaving out music and dev routes gives about 53.6 MB (65.9 − 11.8 − 0.5).
That is still 13.6 MB over the target before the guide music ships to users.

### Reductions

| # | Change | Est. download saved (MB) | Who decides |
|---|---|---|---|
| 1 | Ship critter art once and only to the targets that render it: the widgets target keeps what widgets and Live Activities draw, the NSE keeps the notification avatars, the NCE keeps what its UI shows. Alternatively, one embedded resource framework that all three extensions read with `UIImage(named:in:)` | 8.7–17.4 (17.4 if the store does not dedupe) | Engineering (no visible change) |
| 2 | Blur-stage silhouettes: draw the blur at runtime in SwiftUI (`.blur` over the silhouette mask) or bake them lossy (`compression-type: lossy` / HEIF). Blurred images compress poorly when lossless | ~5 per remaining copy | Founder (visual parity of the blur) |
| 3 | Guide music: re-encode 225 kbps mono AAC-LC at 96 kbps AAC-LC (~6.8 MB saved) or 64 kbps HE-AAC (~8.5 MB), or bundle only the default guide's theme and previews and download the others on first selection (~9.7 MB) | 6.8–9.7 once music ships | Founder by ear (bitrate); founder (on-demand download) |
| 4 | Main binary: nothing in the app uses Skottie, SVG, SkParagraph or the shaper. A Skia build without them, measured with a link map (`LD_GENERATE_MAP_FILE=YES`) from a local Release build first | ~2–5 (estimate; the encrypted range counts at full size) | Engineering, after the link map confirms |
| 5 | Alternate icons (when they ship) and the primary icon as layered `.icon` only. The minimum iOS is 26, so flat fallbacks are never used. Flat 1024 px icons cost ~0.95 MB each | Avoids ~9 MB of growth for 10 icons; ~0.8 now on the primary icon | Founder (confirm the layered rendering on device) |
| 6 | Fonts: keep one copy. Either the native embed from the `expo-font` plugin or the Metro assets, not both. An Archivo variable font in place of the 15 static instances saves a little more | 0.75 (+~0.3) | Engineering |
| 7 | Dev routes | 0.5 | Already excluded from production builds |

Projection for production: 53.6 MB today, about 44.9 after #1 and about 40 after #2. #4 takes it
to about 35–38, and #6 plus a primary `.icon` to about 33–36 MB before music. Guide music then adds
about 0.9 MB (default theme and preview at 96 kbps, the rest downloaded on demand) to 5.0 MB (all 12
files at 96 kbps). The target is reachable with #1, #2, #4 and #6 plus lower-bitrate or on-demand
music. Without the founder decisions in #2 and #3 it is not.

## Rerun

```
bash tools/spikes/skia-critter/prebuild-and-build-ios-simulator.sh   # shared dev-client build
bash tools/spikes/motion/reinstall-and-launch-ios-simulator.sh grow-into-page
maestro test tools/spikes/motion/maestro-grow-into-page.yaml
maestro test tools/spikes/motion/maestro-timeline-drag.yaml
bash tools/spikes/motion/measure-cold-start-ios-simulator.sh <simulator-udid>
bash tools/spikes/skia-critter/prebuild-and-assemble-android-debug.sh
bash tools/spikes/motion/measure-cold-start-android-emulator.sh <emulator-serial>
```
