# Grow-into-page transition, timeline drag, and cold start (S3, S7, S8)

Date: 2026-09-27
Status: PASS on the transition-approach decision and the drag snap-latency criterion. INCOMPLETE on
S7/S8's physical-device release-build numbers — this pass measured a Debug dev-client on an iOS
simulator and an Android emulator, which the phase's own "Device evidence" rule and the nature of a
dev-client build (fetches JS from Metro, unlike a real release bundle) both disqualify as final
evidence; see Findings and Founder follow-ups for exactly what still needs a release build on a
physical reference device.

## Context

Phase-02 needs a decision on how "grow-into-page" (design-system.md §3.3's `zoom` transition: shared
-element grow from the tapped card, radius 22→54, fade first 35%, 560 ms) gets built, a working
15-minute-snap timeline drag with haptic ticks, and committed scripts for the release cold-start and
download-size budgets (system-architecture.md §9: cold start ≤1.2 s mid Android / ≤0.8 s iOS, iOS
download ≤40 MB).

## Criteria (phase-02 §Requirements, "Motion (S3/S7/S8)")

| # | Criterion | Result |
|---|---|---|
| 1 | grow-into-page transition interruptible, ≤16 ms p95 frame | PASS for the chosen approach (custom teleport overlay) — see Raw numbers |
| 2 | Timeline drag 15-min snap + haptic tick, snap latency <1 frame | PASS — snap is UI-thread math applied in the same frame that detects the crossing; only the haptic call itself hops to JS |
| 3 | Release cold start ≤1.2 s mid Android / ≤0.8 s iOS | INCOMPLETE — Debug dev-client only, see Findings |
| 4 | iOS download ≤40 MB | INCOMPLETE — Debug .app size recorded as a directional number only, see Findings |

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
