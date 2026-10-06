---
phase: 6
title: Motion runtime, feedback bus, gesture kit
status: in_progress
depends_on: [3, 4]
wave: 3
features: [F-003, F-005, F-028]
screens: [3n-7, prototype (all motion captions), 3a-6, 3c-2, 3m-3, 3l-4, 3l-6, 3f-5, 3d-2, 3e-3, 4c-2, 5b-3]
tasks: 10
owns: [apps/mobile/src/motion/, tools/scripts/check-audio-assets.ts, apps/mobile/modules/cp-haptics/, apps/mobile/assets/sfx/, apps/mobile/assets/music/, apps/mobile/src/app/(dev)/motion-lab.tsx, e2e/motion/]
---
# Phase 6 — Motion runtime, feedback bus, gesture kit

> **Status, 6 Oct 2026:** open: T6's Robolectric `sdk=34` pin in `modules/cp-haptics/android`, which must ride a native change (the native batch). Everything else is done.

## Context links

| Source | Section |
|---|---|
| `docs/design-system.md` | §3 motion (presets, durations/easings/springs, transitions, gestures, patterns, choreography rules, native-surface motion), §4 sound + haptics cue table + audio rules, §5 Reduce Motion row |
| `docs/code-standards.md` | §7 motion rules (feedback bus only, no ad-hoc timings, budgets, UI thread), §9 a11y, §14 native code, §17 testing |
| `docs/system-architecture.md` | import rules (`src/motion` → design-tokens, lib), performance budgets (120 fps iOS, ≥ 55 fps mid Android, ≤ 30 animated views low-tier) |
| `docs/data-model.md` | `notification_prefs.quiet_hours`, `user_settings.talk_out_loud` |
| Reports | design-system-prototype report (tg-motion DSL, pattern catalogue), mobile-framework report (Reanimated 4.7, Worklets 0.13, GH 3, Skia 2.13), master §2 F-003/F-005/F-028, §7 row "Haptics", "Speech / TTS / audio session" |
| Renders | `docs/design-renders/screens/3n-7_Sound.png`, `3a-6_Pass_issued.png`, `3f-5_Slide_to_board.png`, `3l-4_Encounter.png`; `screens.json` MOTION captions (the motion spec per screen) |

## Overview

Goal: the shared motion runtime every screen uses — token-driven loop presets on one clock, the one-shot pattern library, a feedback bus that fires visual + haptic + SFX in the same frame, a per-guide music engine, the press/gesture kit and the island toast — all with Reduce Motion parity.
Done when: the dev `motion-lab` screen plays every preset and pattern at 1×/2×/4× slowmo in full/reduced/off modes, each `impact(cue)` produces the mapped haptic + SFX (respecting silent switch, volumes, categories, quiet hours), and Jest + Maestro suites pass on iOS and Android.

## Requirements

### F-003 Motion runtime
| Aspect | Requirement |
|---|---|
| DSL | Compile the design's `tg-motion` `kf` segments (`offset: tx ty s sx sy r o e=`) to Reanimated keyframe descriptors; transform order translate → rotate → scale; per-segment easing; unmentioned props carry forward. Design loops with holds are presentation artefacts: entrances play once |
| Loops | `bob, float, wiggle, pulse, ping (pairs offset ½), spin, marquee, blink, hop, grow` on one shared frame clock (stickers breathe in phase); loops pause off-screen and when app backgrounds |
| One-shots | `stamp` (+ `thud` screen jolt), `slap`, `settle`, `deal`, `fling`, `slideOff`+collapse, `flap`, `odometer`, `splitFlap`, `draw` (critter-art `frame()` driver from the critter-art core phase; owns the app's single ≤ 2-concurrent draw-on gate, consumed by `LiveSticker` in the shell phase), `typewriter`/stream reveal, `confetti` (Skia particles 40/70/90/140, ≤ 40 low-end), `squash`, `holdFill`, `pageTurn`, `flyTo` (overlay clone arc), `slideToConfirm` driver + 6 s scripted choreography hook, `sheen`, `pingRings`, `rays`, `typing`, `waveform` (real audio level input), `petals`, `barGrow`, `storyProgress`, `countUp` |
| Rules | Choreography rules 1–7 (§3.4): impact = visual + jolt + haptic + SFX in the same frame; label changes flap; numbers never jump; motion budget per screen (≤ 2 concurrent draw-ons, ≤ 30 animated views on low-tier device flag) |
| Reduce Motion | OS setting or in-app "Motion: full / reduced / off": spatial → 200 ms cross-fade; no burst flash; idle loops static; impacts fade 150 ms, no jolt/shake, confetti omitted, haptic + SFX kept; draw-on/typewriter show final frame; fling shorter without rotation; `off` = all motion instant, feedback kept |
| Debug | `slowmo` 1×/2×/4× in dev builds; motion-freeze mode (all animations at final frame) for Maestro screenshots |

### F-005 Feedback bus
| Aspect | Requirement |
|---|---|
| API | `impact(cueId, opts?)` fires the token-mapped haptic + SFX + optional visual jolt; cue ids from `sound.tokens.json` (§4 table incl. `holdRamp`, `sos`, `alarm`, `crack/pop/chirp`, `flap`, ambient SFX) |
| Haptics | iOS Core Haptics (ramps, long SOS pattern), Android `VibrationEffect` composition / `HapticFeedbackConstants`; global haptics toggle |
| SFX | Categories: stickers & stamps, critter voices, UI; effects volume; iOS `ambient` session (respects silent switch); Android `USAGE_ASSISTANCE_SONIFICATION` |
| Music (3n-7) | Per-guide theme loops; music on/off + volume; tapping a theme crossfades (1.5 s); landing in a new destination crossfades to its guide theme; settings sliders play a short sample at the chosen level (gamelan phrase for music, sticker slap for effects); bars on the playing theme move with real audio level |
| Ducking | TTS / voice mode use `playback` session and duck music −12 dB; restore after |
| Quiet | "Quiet on the road" 22:00–07:00 and temple-POI mute (context signal set by the location engine); alarms and SOS bypass; no background audio except voice mode in use and alarm channels |
| Prefs | Device-local store (MMKV) for motion mode, haptics, music on/volume, effects volume, SFX categories, quiet on the road; the You phase renders 3n-7 and may mirror to `user_settings` |

### F-028 Island toast + press/gesture kit
| Aspect | Requirement |
|---|---|
| IslandToast | Pill drops from top (island easing), sticker + 2 lines + optional OPEN action; 2.8 s (6 s with action); queue with de-dupe; swipe up to dismiss; on iPhones with Dynamic Island it grows from the island area; elsewhere and on Android a banner variant from the top; screen-reader announcement (live region) |
| Press | Scale .92 (< 120 pt wide) / .96 / .975 over 130 ms `press`, release overshoot 1.035 over 420; tap cancels past 8 pt |
| Gestures | long-press 320 ms; drag-snap (15-min snaps with `snap` cue); swipe deck `fling` (commit \|dx\| > 110, next card from ty 26 s .93 `gentle`); drag-reorder with move-up/down alternatives; hold-to-fill (value-driven, touch or dwell, drains 450 ms); slide-to-confirm (commit > 70 %, spring back 280); edge-swipe back and drag-dismiss thresholds exported for the shell |
| A11y | Every gesture hook returns an `accessibilityActions` descriptor so components expose a non-gesture alternative |

Undesigned states to design in code: toast overflow (max 1 visible, queue drains), audio interruption (call/Siri) → pause music, resume on end; missing music asset for a guide → theme card hidden (runtime safety only; all 6 themes are a launch gate, see Non-code dependencies).

## Architecture & contracts

| Item | Delta |
|---|---|
| DB / sync / commands / channels / jobs / push | None |
| Native module | `apps/mobile/modules/cp-haptics` (Expo module; Swift `CHHapticEngine` patterns incl. continuous ramp and SOS; Kotlin `VibrationEffect.Composition` with amplitude fallback). JS API: `play(patternId)`, `ramp.start/update(0–1)/stop()`, `isSupported()` |
| Audio | `expo-audio` players: SFX pool (preloaded short clips), music player pair for crossfade; audio session manager owns category switching (ambient ↔ playback) |
| Exports (`src/motion/index.ts`) | `presets`, `useLoop`, `useSharedClock`, `patterns.*`, `impact`, `useFeedbackPrefs`, `music` (`play(guideId)`, `crossfadeTo`, `duck`, `preview`), `gestures.*` (`usePress`, `useLongPress`, `useDragSnap`, `useSwipeDeck`, `useHoldFill`, `useSlideToConfirm`, `useReorder`, `edgeSwipe`, `dragDismiss` constants), `IslandToast`, `toast.show()`, `useMotionMode`, `OverlayHost` (fly-to + confetti layer) |
| Context signals | `feedback.setContextMute('temple' \| 'quietHours', boolean)` — set by the location engine and notification settings |
| Doc delta | code-standards §7 names the call `feedback.emit`; design-system §4 names it `impact(cueId)`. Implement `impact` and export `feedback.emit` as an alias only if the docs are not reconciled |

## Tasks

### T1 — Shared clock, loop presets, motion mode, slowmo
- Goal: token-driven loop presets on one frame clock with Reduce Motion and debug slowmo.
- Files: `apps/mobile/src/motion/{index.ts,clock.ts,presets.ts,use-loop.ts,motion-mode.ts,device-tier.ts,slowmo.ts}`, `apps/mobile/src/motion/__tests__/presets.test.tsx`.
- Steps: 1. `useSharedClock()` single `useFrameCallback` driving a shared value; presets derive phase from it. 2. `useLoop(preset, {offset})` returns animated style; pauses when unfocused (`useIsFocused`) or off-screen (visibility hook). 3. `useMotionMode()` merges OS `AccessibilityInfo.isReduceMotionEnabled` with in-app setting. 4. Device tier flag (RAM/cores) for budgets. 5. Slowmo multiplier + motion-freeze in dev builds.
- Tests: `pnpm --filter @cp/mobile jest src/motion/__tests__/presets` (Reanimated jest utils, fake timers: phase at t, pause, reduced → static).
- Done when: all 10 loop presets match token durations; reduced/off produce static styles.
- Status: done — 2fa9500

### T2 — tg-motion DSL compiler
- Goal: design keyframes compile to Reanimated descriptors so captions can be reproduced exactly.
- Files: `apps/mobile/src/motion/dsl/{parse.ts,compile.ts,types.ts}`, `apps/mobile/src/motion/dsl/__tests__/dsl.test.ts`, `apps/mobile/src/motion/dsl/__fixtures__/design-samples.json` (strings copied from `design/*.dc.html`).
- Steps: 1. Parser for `offset: tx ty s sx sy r o e=` segments with carry-forward. 2. Compile to `Keyframe`-compatible objects with per-segment easing from tokens. 3. `once` flag strips presentation holds. 4. Fixtures from ≥ 10 design animations (stamp, slap, hop, deal…).
- Tests: `pnpm --filter @cp/mobile jest src/motion/dsl`.
- Done when: every fixture compiles; round-trip values equal the design numbers.
- Status: done — 0b4e850

### T3 — Impact patterns: stamp, thud, slap, settle, squash, flap, slideOff, deal, sheen
- Goal: first half of the one-shot library with reduced variants.
- Files: `apps/mobile/src/motion/patterns/{stamp,thud,slap,settle,squash,flap,slide-off,deal,sheen}.ts`, `apps/mobile/src/motion/patterns/__tests__/impact-patterns.test.tsx`.
- Steps: 1. Each pattern = hook/function returning animated props + `onImpact` frame callback that calls `impact(cue)` via `scheduleOnRN` once (never per frame). 2. `thud` applies to a screen-root shared value exposed by `ScreenJoltProvider`. 3. Reduced variant per §5 row. 4. Stagger helpers from tokens.
- Tests: `pnpm --filter @cp/mobile jest src/motion/patterns/__tests__/impact-patterns`.
- Done when: stamp fires `thud.heavy` exactly once at impact frame; reduced stamp = 150 ms fade without jolt.
- Status: done — 0923e7a

### T4 — Number & text patterns: odometer, splitFlap, countUp, typewriter/stream, barGrow, storyProgress
- Goal: numbers never jump; text reveals are word-buffered.
- Files: `apps/mobile/src/motion/patterns/{odometer,split-flap,count-up,typewriter,bar-grow,story-progress}.ts(x)`, `__tests__/number-patterns.test.tsx`.
- Steps: 1. Odometer per-digit columns (650 ms, digit stagger 30, tabular figures, `tick` cue throttled). 2. Split-flap 340 ms per flip with `flap` cue. 3. Typewriter reserves final box; stream mode accepts appended tokens, reveals by word. 4. Reduced = instant final value with a11y announcement hook.
- Tests: `pnpm --filter @cp/mobile jest src/motion/patterns/__tests__/number-patterns`.
- Done when: odometer handles digit-count changes and negative values; reduced shows final frame.
- Status: done — a07fb1c

### T5 — Overlay effects: flyTo, confetti, rays, pingRings, petals, draw, pageTurn, waveform, typing
- Goal: Skia/overlay-based effects with budgets.
- Files: `apps/mobile/src/motion/overlay/{OverlayHost.tsx,fly-to.ts}`, `apps/mobile/src/motion/patterns/{confetti,rays,ping-rings,petals,draw,page-turn,waveform,typing}.tsx`, `__tests__/overlay.test.tsx`.
- Steps: 1. `OverlayHost` at app root renders clones measured via `measure()`; `flyTo(sourceRef, targetRef, node)` arc (mid lift 140, r −14°, 780 ms) then pop + `thud.soft`. 2. Confetti particle system in Skia (`useFrameCallback`), counts by tier, gravity .33, drag .985. 3. `draw` drives critter-art `frame(model, t)` progress (stroke trim) and owns the only draw-on concurrency gate (≤ 2; exported as `drawGate`); stickers receive the progress shared value, never their own gate. 4. `waveform` consumes an audio-level shared value. 5. Reduced variants: omit confetti/rays/petals, final frames.
- Tests: `pnpm --filter @cp/mobile jest src/motion/__tests__/overlay`.
- Done when: third concurrent draw-on is queued; low-tier confetti capped at 40.
- Status: done — 5879256

### T6 — cp-haptics native module
- Goal: Core Haptics ramps/SOS on iOS, compositions on Android.
- Files: `apps/mobile/modules/cp-haptics/{expo-module.config.json,index.ts,src/CpHapticsModule.ts}`, `ios/CpHapticsModule.swift`, `ios/HapticPatterns.swift`, `android/src/main/java/app/critterpass/haptics/CpHapticsModule.kt`, `ios/Tests/HapticPatternsTests.swift`, `android/src/test/.../CpHapticsModuleTest.kt`.
- Steps: 1. Patterns generated from `sound.tokens.json` haptic column. 2. Continuous ramp (intensity 0→1 driven by `holdFill` value, throttled 30 Hz). 3. SOS long pattern. 4. Engine restart on reset/interruption. 5. `isSupported()` fallback to `expo-haptics` impacts.
- Tests: `xcodebuild test` for the module test target via CI script; `./gradlew :cp-haptics:testDebugUnitTest`.
- Done when: both builds pass; unit tests assert pattern parameters from tokens.
- Status: blocked — waits on the next native change to commit the Robolectric `sdk=34` pin (any file under `modules/*/android` moves the native fingerprint, see the acceptance box below); `ramp.*`/`play('sos')` did run in the motion-lab cue grid on both platforms in the device runs (T10). JS wrapper + Swift/Kotlin implementation + XCTest/Robolectric unit tests written and autolinking-verified (`expo-modules-autolinking search` resolves the module on both platforms). iOS native compile proven on real EAS infra: merging the (now-landed) `ci/eas-cloud-e2e` pipeline and running `pnpm e2e:cloud -- --platform ios` triggered a fresh `e2e-test`-profile build (fingerprint changed once `apps/mobile/modules/cp-haptics`'s Swift landed) that **FINISHED successfully** and was reused by every later Maestro run — confirms `CpHapticsModule.swift`/`HapticPatterns.swift` compile for real, not just locally-typechecked Swift syntax. Android build/Kotlin compile and both platforms' Maestro/device behaviour remain unverified: this pass ran iOS only per the coordinator's instruction (Android emulator boot is blocked on a founder EAS dashboard toggle, see the eas-cloud-e2e report), and the Maestro flows themselves didn't get far enough to exercise `ramp.*`/`play('sos')` at runtime (see T10's status — `openLink` into the dev screen is blocked by an unrelated upstream Maestro bug).

### T7 — Feedback bus, SFX, audio session, prefs, quiet rules
- Goal: `impact(cue)` = haptic + SFX (+ jolt) under all prefs and mute rules.
- Files: `apps/mobile/src/motion/feedback/{index.ts,cues.ts,sfx-pool.ts,audio-session.ts,prefs.ts,quiet.ts}`, `apps/mobile/assets/sfx/*.m4a` + `LICENSES.md`, `tools/scripts/check-audio-assets.ts`, `__tests__/feedback.test.ts`.
- Steps: 1. Cue table from tokens. 2. SFX pool preload per category; volume per category. 3. Audio session manager (ambient default; playback for voice/TTS). 4. Prefs in MMKV (`cp.motion.*`). 4a. `tools/scripts/check-audio-assets.ts`: every cue in `sound.tokens.json` with an SFX column and every guide in the music manifest has a licensed asset; `--mode release` fails, PR mode warns. 5. Quiet on the road window (device tz), context mutes; `alarm`/`sos` bypass. 6. Haptics toggle; SFX sourced from a licensed/owned library (credits file).
- Tests: `pnpm --filter @cp/mobile jest src/motion/feedback`.
- Done when: tests prove quiet window mutes `slap` but not `sos`; category off mutes only its cues; haptic still fires under Reduce Motion.
- Status: done — 6f0b593 (no licensed SFX assets exist yet — a launch-gate founder dependency; every cue falls back to haptic-only, `check-audio-assets.ts --mode release` fails until they land)

### T8 — Music themes engine
- Goal: per-guide theme playback with crossfade, ducking, previews and levels.
- Files: `apps/mobile/src/motion/music/{index.ts,themes.ts,crossfade.ts,levels.ts}`, `apps/mobile/assets/music/manifest.json`, `__tests__/music.test.ts`.
- Steps: 1. Manifest maps guideId → asset (from content/licensing), loop points, sample clip. 2. Two-player crossfade 1.5 s; `crossfadeTo(guideId)` for landing and theme tap. 3. `duck(-12dB)` / `unduck` for TTS/voice. 4. `preview('music' | 'effects', level)` for 3n-7 sliders. 5. Level meter shared value from player metering for bar animation. 6. Interruption handling; guide without asset → `available: false`.
- Tests: `pnpm --filter @cp/mobile jest src/motion/music`.
- Done when: crossfade volumes sum correctly over time (fake timers); missing asset reported unavailable.
- Status: done — 6f0b593 (no licensed music themes yet — a launch-gate founder dependency; all 6 guides are `available: false` in `manifest.json`, theme cards hidden)

### T9 — Press & gesture kit
- Goal: GH3-based hooks with thresholds from tokens and a11y action descriptors.
- Files: `apps/mobile/src/motion/gestures/{press.ts,long-press.ts,drag-snap.ts,swipe-deck.ts,reorder.ts,hold-fill.ts,slide-to-confirm.ts,edge-swipe.ts,drag-dismiss.ts,index.ts}`, `__tests__/gestures.test.tsx`.
- Steps: 1. Implement each hook (thresholds §3.3, springs from tokens). 2. `useHoldFill` accepts touch or external value (dwell) and drives `cp-haptics` ramp. 3. Each returns `{gesture, animatedStyle, accessibilityActions, onAccessibilityAction}`. 4. Reduced variants (shorter fling, no rotation).
- Tests: `pnpm --filter @cp/mobile jest src/motion/gestures` (GH `fireGestureHandler` test utils).
- Done when: commit/cancel thresholds verified for fling, slide-to-confirm and hold-fill; each hook exposes an a11y action.
- Status: done — cb1afc3

### T10 — IslandToast + motion lab + Maestro
- Goal: island toast component/queue and a dev screen exercising the whole runtime.
- Files: `apps/mobile/src/motion/island-toast/{IslandToast.tsx,queue.ts,index.ts}`, `apps/mobile/src/app/(dev)/motion-lab.tsx`, `e2e/motion/motion-lab.yaml`, `e2e/motion/island-toast.yaml`, `__tests__/island-toast.test.tsx`.
- Steps: 1. Toast queue, durations, OPEN action, swipe-up dismiss, live-region announcement; Dynamic Island origin on supported iPhones (safe-area heuristics), banner elsewhere. 2. Motion lab lists presets/patterns/cues with slowmo + mode switch (excluded from release bundles by the phase-1 dev-route exclusion (phase 1: Metro `blockList` on `src/app/(dev)/**` for `APP_VARIANT=production` + `check-release-bundle` CI gate)). 3. Maestro: open lab, trigger each pattern in motion-freeze, `assertScreenshot`; toast show/queue/dismiss.
- Tests: `pnpm --filter @cp/mobile jest src/motion/island-toast`; `maestro test e2e/motion/` on iOS simulator and Android emulator.
- Done when: Maestro flows pass on both platforms; toast announced by screen reader test.
- Status: done — device runs on GitHub Actions: iOS https://github.com/critterpass/critterpass/actions/runs/36605138393 (motion-lab and island-toast, after motion-lab scrolls to the toast demo and waits for the pill), Android https://github.com/critterpass/critterpass/actions/runs/36587470467 (motion-lab and island-toast, e2e-test APK OV5q4BQk…; the merged pill node was fixed by the status-bar change in 6b7d247c); the screen-reader announcement is covered by `__tests__/island-toast.test.tsx`

## Phase acceptance criteria

- [x] No `withTiming`/`withSpring` literals outside `src/motion` (verified by `grep -rl "withTiming\|withSpring" apps/mobile/src` matching only `apps/mobile/src/motion/**` — no automated lint rule exists for this yet; `tools/lint/*` is outside this phase's owns list, so authoring one is a handoff, not blocking)
- [x] All §3.1 presets and §3.4 patterns implemented with reduced/off variants
- [x] `impact()` covers every cue id in `sound.tokens.json` (test enumerates tokens)
- [x] Silent switch, category volumes, quiet on the road, temple mute, SOS/alarm bypass verified in tests
- [x] Music crossfade, ducking and previews: Jest (fake timers) green — [ ] founder device checklist item (needs a real iPhone/Android device; unfilled, founder gate)
- [x] Launch gate: 6 music themes, full SFX set and critter chirps delivered — in-house procedural audio (`@cp/sound-art`), wired into `apps/mobile/assets/{sfx,music}/`, `SFX_ASSET_MODULES`/`MUSIC_ASSET_MODULES`/`MUSIC_SAMPLE_MODULES` and `manifest.json` (`available: true` for all 6 guides); `check-audio-assets --mode release` passes — [ ] founder listening-gallery approval for the Ajo/Sardi/Paco themes and the critter chirp is still open (`manifest.json`'s `pendingFounderApproval`, `docs/decisions/20260927-in-house-procedural-audio.md` §"Founder review gate"), a founder gate, not agent-side work
- [ ] `cp-haptics` builds and tests pass on iOS and Android — Android: the EAS e2e-test build 4ecd0486 FINISHED (the Kotlin compiles) and `./gradlew :cp-haptics:testDebugUnitTest` passes 3/3 locally (with cp-deferred-link 2/2 and cp-location 5/5) once Robolectric runs API 34, since JDK 17 can't open the API 36 sandbox; that `src/test/resources/robolectric.properties` pin (`sdk=34`) isn't committed because any file under `modules/*/android` changes the native fingerprint, so it goes in with the next native change. iOS EAS build (`e2e-test` profile) FINISHED successfully on real infra, proving the Swift compiles; Android build/Kotlin compile unverified (this pass ran iOS only, per instruction); XCTest/Robolectric unit tests unexecuted (no local toolchain); its `isSupported()`/`ensureEngine()` guards were code-reviewed as simulator-safe while diagnosing the T10 blocker above, but `ramp.*`/`play('sos')` still haven't executed at runtime on any device
- [x] Maestro `e2e/motion/` green on iOS — and on Android: https://github.com/critterpass/critterpass/actions/runs/36605138393 (iOS), https://github.com/critterpass/critterpass/actions/runs/36587470467 (Android)
- [x] Low-tier budget: ≤ 2 draw-ons, confetti ≤ 40 enforced

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Shared clock costs frames on low-end Android | Per-preset clocks behind the same API; keep phase alignment only on high tier |
| Skia overlay + Reanimated contention | Confetti/rays render in a single Skia canvas; reduce counts by tier |
| Audio session conflicts with camera/voice | Central session manager; interruption tests on device |
| Core Haptics unavailable (older hardware) | `isSupported()` → `expo-haptics` impacts |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| SFX library (thud, slap, peel, chimes, flap, ambient; 23 cues + 6 per-guide notify motifs) | Wired: in-house procedural audio (`@cp/sound-art`, `docs/decisions/20260927-in-house-procedural-audio.md`) copied into `apps/mobile/assets/sfx/`, one `SFX_ASSET_MODULES` entry per cue (`.caf` iOS / `.ogg` Android); `check-audio-assets --mode release` passes. The 6 notify motifs are bundled but not yet wired to a cue id (no `sound.tokens.json` entry names them — a future guide-notification feature, design-system open question 4). The critter chirp's founder listening approval (below) is the only remaining gate |
| Music themes: 3 named (Tokek, Pon, Lundi) + 3 proposed (Ajo, Sardi, Paco) | Wired: in-house procedural audio (`@cp/sound-art`), all 6 guides `available: true` in `manifest.json` with `MUSIC_ASSET_MODULES`/`MUSIC_SAMPLE_MODULES` entries; `check-audio-assets --mode release` passes. `manifest.json`'s `pendingFounderApproval: true` on Ajo/Sardi/Paco records that founder listening-gallery approval of those 3 proposed styles is still open — doesn't block wiring or playback |
| Critter chirp audio (content spec) | Wired: in-house procedural audio (`@cp/sound-art`'s `chirp` cue), in `SFX_ASSET_MODULES`. Founder listening approval is the remaining gate |

## Open questions

1. Doc delta: `impact(cueId)` (design-system §4) vs `feedback.emit` (code-standards §7) — default: `impact`, update code-standards.
2. Motion/sound prefs are device-local (MMKV) — default: yes; `user_settings` has no columns for them (doc delta if cross-device sync is wanted).
3. Temple mute radius and POI category source — default: location engine supplies a boolean; this phase only consumes it.
4. Per-guide custom notification sounds (design-system Q4) — default: asset slots in `assets/sfx/notify-<guide>.caf/.ogg`, wired by the push phase.
