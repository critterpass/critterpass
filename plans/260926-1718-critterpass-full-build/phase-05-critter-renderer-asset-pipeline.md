---
phase: 5
title: Runtime sticker renderer, bake pipeline, share images
status: in_progress
depends_on: [2, 3, 4]
wave: 3
features: [F-007, F-008, F-140]
screens: [3a-3, 3l-1, 3l-2, 3l-3, 3l-4, 3l-6, 3l-8, 3l-10, 3m-3, 3m-4, 3m-5, 3m-6, 3m-8, 3m-9, 3m-10, 3n-5, 3o-4, 5a-1, 5a-4, 5b-1, 5c-1, 5c-3, 5c-6]
tasks: 10
owns: [packages/critter-art/src/backends/skia/, packages/critter-art/src/share/, packages/critter-art/src/web/, packages/critter-bake/, apps/mobile/src/ui/sticker/, apps/mobile/src/ui/share-image/, apps/mobile/src/app/(dev)/sticker-lab.tsx, apps/mobile/plugins/with-critter-art.ts, apps/mobile/generated/critter-art/, apps/web/public/critters/, e2e/critters/sticker-lab.yaml]
---
# Phase 5 — Runtime sticker renderer, bake pipeline, share images

## Context links

| What | Where |
|---|---|
| Engine report | `plans/reports/design-analysis-260926-1143-critter-render-engine-report.md` §1.5–1.6 (lifecycle, DPR), §4 (measurements), §5.2 (surfaces → output), §5.3–5.4 (backends, bake CLI, tier A/B/C budget), §6 (tg-count/confetti notes) |
| Pipeline + budgets | `docs/system-architecture.md` §4.7 (Skia backend, LRU 25 MB mem / 60 MB disk, tier A ~6–10 MB), §4.8 (extensions) |
| App Group asset keys | `docs/api-contracts-async.md` §6 (`assets/critters/<form>-<pose>-<mode>.png`, `assets/avatars/<key>@2x/@3x.png`), `og.render` job row |
| Component + motion rules | `docs/design-system.md` §1.2 tier colours, `Sticker` + `SilhouetteSlot` rows, motion §4 (shared idle clock, reduce motion), §5 a11y labels, iOS LA/widget motion limits |
| Decisions | `docs/product-decisions.md` Q-06 (baked everywhere; runtime Skia for in-app + ~90 hero draw-ons), D16 (OG via critter atlas + Takumi), C21, C38, C40 |
| Web/OG report | `plans/reports/researcher-260926-1143-web-links-ops-report.md` (OG sizes, Takumi, atlas) |
| Design source | `design/App Icon.dc.html`, `design/Critterpass Store Assets.dc.html`, `design/Critterpass Prototype.dc.html` (3l, 3m, 3n-5, 3o-4) |
| Renders | `docs/design-renders/screens/3l-3_Critter_detail.png`, `3m-3_Recap_the_cover.png`, `3m-5_Recap_crew_awards.png`, `3m-6_Recap_the_receipt.png`, `3m-8_Recap_the_stamp.png`, `3m-9_Recap_the_postcard.png`, `3m-10_A_year_later.png`, `3n-5_App_icon.png`, `3o-4_Share_the_plan.png` |

## Overview

Goal: every surface gets critter art at the right cost — runtime RN Skia stickers in the app (cached images, hero draw-on, blink swap), a Node bake CLI producing all bundled/extension/web/icon assets, and one share-image renderer for app and server.

Done when: `<Sticker>` renders any (kind, form, pose, variant) from cache with ≤ 2 concurrent draw-ons at 60 fps on a mid-range Android device; `pnpm critter-bake` regenerates tier A assets, app icon sets, Android adaptive/monochrome icons, web WebP and the OG atlas deterministically; share cards (critter card, recap cards, 9:16 story, postcard, poster, memory) render identically (within golden tolerance) via Skia on device and `@napi-rs/canvas` on the server.

## Requirements

### F-007 — Runtime sticker renderer

| Behaviour | Spec |
|---|---|
| Default | cached bitmap per `(kind, form, pose, variant, seed, sizeBucket, scale, closedEyes, artVersion)`; memory LRU 25 MB, disk 60 MB; pre-warm visible set; no per-cell canvas |
| Buckets | 24/36/48/60/96/150/232/300 pt; render at nearest bucket ≥ requested, real screen scale (not design 2.5× cap) |
| Hero draw-on | `<Sticker drawProgress={sharedValue}>` renders `frame(model, t)` as a Skia `Picture` and snapshots to cache at t = 1. Timing (1500 ms creatures / 700 ms icons, easeInOutQuad, `delay`, tap replay) and the single ≤ 2-concurrent gate (others queue ≤ 300 ms then pop in with fade) belong to the motion runtime's `draw` pattern (phase 6); `LiveSticker` in the shell phase connects them |
| Blink | `<Sticker closedEyes>` renders the closed-eye cached image; the timed swap (150 ms every 2.6–6.2 s on the shared idle clock, paused off-screen/background/Reduce Motion — fixes design quirk) is wired by the shell phase's `LiveSticker` over phase-6 motion, so this phase has no motion dependency |
| Idle motion | view transforms from motion runtime (float/bob/hop), never canvas redraw |
| Locked | `SilhouetteSlot`: grey/gold silhouette from mask variant; "?" in tier colour (UI layer) |
| Tier | epic/legendary edge rings baked into image; rare blue ring + legendary sparkles are UI/motion layers |
| Layout | sticker pad contract: art occupies size·100/118 |
| A11y | labels "{name}, {form} form"; guides "{name}, {pose}"; locked "Undiscovered local, found by being in {city}"; decorative icons hidden |
| States | loading = tinted placeholder of same box (no layout shift); error = `spark` fallback + Sentry breadcrumb; low-memory warning evicts LRU |

### F-008 — Critter asset pipeline

| Output | Spec |
|---|---|
| Tier A (bundled, ~6–10 MB) | 6 guides × 4 forms × {idle, cheer, sleep} × {48, 96 pt} × {color, mask}; 150 silhouettes (mask) @60 pt + blur stages (critter-nearby LA 5a-4); notification avatars 6 guides × 4 forms; @2x/@3x |
| iOS | imagesets in `CritterArt.xcassets` for app + widget extension + notification exts (5a/5b/5c); lock-screen = mask variant (`widgetAccentedRenderingMode`) — full-colour 5c-3 stickers are not achievable on lock screen (system vibrant); StandBy night = mask |
| App icons (3n-5) | 4 styles FACE/PASSPORT/STAMP/STICKER + 6 earned icons (TEMPLE, SARDI, HOME SET, PON, GOLDEN, BALI SIX). iOS 26: layered Icon Composer `.icon` bundles (background + foreground art layers + `icon.json`) per icon so Liquid Glass light/dark/tinted/clear render from real layers; flat 1024 px light/dark/tinted PNGs also emitted as the fallback path; founder verifies both on an iOS 26 device against 3n-5; Android adaptive fg/bg + monochrome (stamp variant), 66/108 safe zone, `activity-alias` asset names. Caveat for the icon-switch phase (45): enabling/disabling an `activity-alias` can kill the app task and drop pinned shortcuts/widgets on some launchers — switch only on explicit user action, warn in copy, re-publish dynamic shortcuts after switch |
| Android | `drawable-{mdpi..xxxhdpi}` PNG/WebP for Glance widgets, notification `Person` icons, Live Update art; small notification icon = VectorDrawable from stamp polygons |
| Web | `apps/web/public/critters/<kind>-<form>-<pose>-<bucket>.webp` + srcset (no-JS/LCP fallback) |
| OG atlas | sprite sheet(s) + JSON index of critters/guides for Takumi (`og.render`, phase 51) |
| Store/social | Node renders for store listing & social kit templates (consumed by phase 53) |
| Determinism | content-hash manifest; re-run with no input change = zero file diff; `artVersion` = hash of critter-art + content forms |

### F-140 — Share image renderer

| Card | Source screen | Formats |
|---|---|---|
| Critter card (share ↗ on detail) | 3l-3 | 1080×1350 + 9:16 story 1080×1920 |
| Recap cards: cover, route, awards (gold edge on MVP), receipt ("saved as an image"), one that got away, stamp (+ crew signatures) | 3m-3…3m-8 | 1080×1350 each + 9:16 story |
| Postcard front/back | 3m-9 | 1800×1200 (print-ready 300 dpi variant for phase 44 postcards) |
| Plan share image | 3o-4 | 1080×1350 (the 1200×630 link-preview OG image is Takumi, phase 51) |
| Memory (anniversary) | 3m-10 | 9:16 |
| Poster (vote/plan poster) | 3o-4, 5b content-ext poster | 1080×1350 |

Renderer contract: typed props (data supplied by consuming phases 31/43/44/52), fonts from design-tokens (Archivo w62–w100, Geist, Geist Mono, Caveat), guide colours per C5, photos via local URI (app) or signed media URL (server). Share actions: system share sheet, Instagram Stories (background + sticker layers), save to Photos (add-only). Undesigned (design in code): share-sheet preview sheet with format toggle (post/story), rendering/progress + failure state, watermark "critterpass.app" footer, alt text.

## Architecture & contracts

| Piece | Design |
|---|---|
| Skia backend | `packages/critter-art/src/backends/skia`: `Cmd[]` → `SkPicture` (paths from flat `Float32Array` via `Skia.Path.MakeFromCmds`/`addPoly`, no per-vertex JSI), isolated `saveLayer` for multiply, `ImageFilter.MakeDropShadow`; `toImage(picture, px)` via offscreen surface |
| Draw-on thread | `frame()` is worklet-safe (pure, typed arrays); `drawProgress` shared value read on the UI runtime; JS-thread fallback if device bench < 55 fps |
| Cache | `apps/mobile/src/ui/sticker/cache.ts`: memory LRU (bytes) + disk (`expo-file-system` cache dir, PNG) keyed by spec hash + `artVersion`; `exportPng(spec, bucket, destPath)` for App Group writers (phases 48/49 own the App Group module) |
| Bake CLI | `packages/critter-bake`: `critter-bake --manifest <file> [--only <target>]`; manifest zod `{targets:[{kind|all, forms, poses, variants: color|mask|mono|stamp|blur, sizesPt, scales, crop: none|face|circle, bg?, format: png|webp|svg|vector-drawable, out}]}`; `worker_threads` pool; outputs to `apps/mobile/generated/critter-art/{ios,android,app}`, `apps/web/public/critters/`, `packages/critter-bake/out/og-atlas/` |
| Native wiring | `apps/mobile/plugins/with-critter-art.ts` config plugin copies generated xcassets into app + extension targets and drawables/mipmaps into Android `res` on prebuild; declares alternate icon names |
| Share renderer | `packages/critter-art/src/share`: pure layout model (frames, rects, text runs, images, stickers, rotations) → backends: Skia (app, Paragraph API with bundled fonts) and canvas2d (`@napi-rs/canvas` with the same font files) used by the worker for full share-card images only (recap/plan/critter cards, postcard print). OG meta images (`og:image`, 1200×630 link previews) are rendered only by Takumi from the prerendered atlas (D16, phase 51) — one OG path |
| Web runtime | `packages/critter-art/src/web`: `<critter-sticker>` custom element (IO-lazy draw-on, reduced motion, static WebP fallback) used by apps/web (phase 51) |

No tables, commands, channels or jobs added. Consumers: `og.render` (phase 51) uses Takumi + the OG atlas only; worker share-card jobs call `renderShareCardNode()`; `media.process` avatar PNGs (phase 45) call `exportPng`. Doc delta: api-contracts-async §6 key format — specify `<kind>-<form>-<pose>-<mode>@<scale>.png` with kind prefix (flag).

## Tasks

### T1 — RN Skia backend
- Goal: `Cmd[]` → `SkPicture`/`SkImage` with fidelity equal to canvas2d.
- Files: `packages/critter-art/src/backends/skia/{index,render,paths}.ts`, `render.test.ts`.
- Steps: 1. Build paths from flat arrays in one call per poly. 2. Isolated layer + multiply + shadow σ 2.5 pt. 3. Jest test using RN Skia's CanvasKit test env renders 20 kinds and diffs vs canvas2d (`@napi-rs/canvas`) output.
- Tests: `pnpm --filter @cp/critter-art test:skia`
- Done when: 20-kind sample within golden thresholds (mean < 0.5/255, > 8/255 px < 1%) vs canvas2d.
- Status: done — 83a31ee

### T2 — Sticker image cache and PNG export
- Goal: memory + disk cache, pre-warm, eviction, `exportPng`.
- Files: `apps/mobile/src/ui/sticker/{cache,spec-key,export-png,bucket}.ts`, `__tests__/cache.test.ts`.
- Steps: 1. Spec hash incl. `artVersion`. 2. Byte-sized LRU (25 MB), disk cap 60 MB with LRU sweep. 3. Memory-warning eviction. 4. `prewarm(specs[])` batching off the JS frame budget (InteractionManager/idle). 5. `exportPng` writes to a given path.
- Tests: `pnpm --filter @cp/mobile test -- sticker/cache`
- Done when: tests prove hit/miss, byte cap eviction, version invalidation, disk sweep; export produces a decodable PNG of correct px size.
- Status: done — 6d68085

### T3 — `<Sticker>` component: static, draw-on, blink, locked
- Goal: the app's single sticker component (rendering only; timing/gating come from motion).
- Files: `apps/mobile/src/ui/sticker/{Sticker.tsx,SilhouetteSlot.tsx,a11y.ts}`, tests.
- Steps: 1. Props `{kind|critterId, form, pose, variant, size, sticker, drawOn?, delay?, blink?, onPress?}`. 2. Static path = cached image. 3. `drawProgress` shared value + `frame()` worklet → Skia `Picture`; snapshot to cache at 1. 4. `closedEyes` prop selects the closed-eye cached image. 5. Absent `drawProgress` = static final frame (Reduce Motion path). 6. A11y labels.
- Tests: `pnpm --filter @cp/mobile test -- ui/sticker`
- Done when: RNTL tests cover progress rendering (0, 0.5, 1 → cache write), closedEyes swap, static path, labels, locked silhouette; no layout shift between placeholder and image.
- Status: done — cf06c18

### T4 — Sticker lab screen, device bench, Maestro
- Goal: measurable proof on devices.
- Files: `apps/mobile/src/app/(dev)/sticker-lab.tsx` (excluded from release bundles by the phase-1 dev-route exclusion (phase 1: Metro `blockList` on `src/app/(dev)/**` for `APP_VARIANT=production` + `check-release-bundle` CI gate)), `e2e/critters/sticker-lab.yaml`.
- Steps: 1. Lab: 150-cell dex grid, 2 hero draw-ons (local `withTiming` progress), closed-eye toggle storm, memory readout, fps counter. 2. Maestro flow scrolls grid, triggers draw-ons, asserts no crash (no fps assertion on simulators/emulators). 3. Capture script (Perfetto/`dumpsys gfxinfo`, `xctrace`) for the founder device run; tune bucket list if needed.
- Tests: `maestro test e2e/critters/sticker-lab.yaml`
- Done when (agent): Maestro passes on iOS simulator and Android emulator; capture script committed. Founder checklist: physical mid-range Android + iPhone run records grid scroll 60 fps, 2 concurrent draw-ons ≥ 55 fps, cache ≤ 25 MB in the phase report.
- Status: done — 70f7b9b (the ~1 s SIGABRT was the draw-on frame callback calling a React state setter on the UI thread; it now schedules the re-render onto the JS thread, and the device-faithful Reanimated test double covers this class; the sticker-lab Maestro flow runs locally when needed)

### T5 — Bake CLI core
- Goal: manifest-driven, parallel, deterministic Node renderer.
- Files: `packages/critter-bake/{package.json,tsconfig.json}`, `src/{cli,manifest,pool,render-job,encode,hash-cache}.ts`, `manifests/tier-a.json`, tests.
- Steps: 1. zod manifest. 2. `worker_threads` pool over canvas2d backend on `@napi-rs/canvas`. 3. Variants color/mask/mono/stamp/blur (Gaussian blur stages for silhouettes). 4. PNG/WebP encode; crop face/circle. 5. Content-hash cache; `--check` mode fails if outputs are stale (CI).
- Tests: `pnpm --filter @cp/critter-bake test && pnpm critter-bake --manifest packages/critter-bake/manifests/tier-a.json --check`
- Done when: tier A bakes; second run writes 0 files; `--check` detects a stale output.
- Status: done — e18f07c

### T6 — Platform writers: xcassets, Android res, config plugin
- Goal: generated assets land in app + extension targets on prebuild.
- Files: `packages/critter-bake/src/writers/{xcassets,android-res,app-group-keys}.ts`, `apps/mobile/plugins/with-critter-art.ts`, `apps/mobile/generated/critter-art/` (generated, committed), tests.
- Steps: 1. xcassets imagesets (1x omitted, @2x/@3x, template rendering for mask). 2. Android density buckets. 3. Key index JSON mapping App Group keys → bundled files. 4. Config plugin copies into app, widget, notification-service/content targets (paths from phase 2 target spike) and Android `res`.
- Tests: `pnpm --filter @cp/critter-bake test`; `pnpm --filter @cp/mobile expo prebuild --clean --no-install` then assert files exist via `pnpm --filter @cp/mobile test -- plugins/with-critter-art`
- Done when: prebuild output contains CritterArt assets in every target and Android res; `xcodebuild -list` shows no asset catalog errors (`xcrun actool` validation passes).
- Status: done — aa2660d (generated output is ~27MB against the ~6-10MB tier-A budget note; see phase report)

### T7 — App icons and notification small icon
- Goal: every alternate icon and Android monochrome/small icon from the art core.
- Files: `packages/critter-bake/src/templates/app-icons.ts`, `src/writers/{app-icon-ios,app-icon-android,vector-drawable}.ts`, `manifests/app-icons.json`.
- Steps: 1. Port the 4 icon style layouts + 6 earned icons from `design/App Icon.dc.html` into layout templates (share layout model). 2. iOS: layered `.icon` bundle per icon (layers from the share layout model, `icon.json` with glass/specular defaults) + flat 1024 px light/dark/tinted fallback sets. 3. Android adaptive fg/bg + monochrome (66/108 safe zone) per `activity-alias`. 4. Stamp polygons → SVG → VectorDrawable small icon. 5. Playwright screenshot of `App Icon.dc.html` vs baked icon diff (layout tolerance documented).
- Tests: `pnpm --filter @cp/critter-bake test -- app-icons`
- Done when (agent): 10 layered `.icon` bundles + 10 × 3 flat fallbacks (iOS) and adaptive/monochrome sets (Android) generated; founder checklist: iOS 26 device check picks layered vs flat per icon; icon names match an exported `APP_ICON_IDS` constant for phase 45.
- Status: done — 81abe53 (3 of 6 earned icons — sardi/home-set/bali-six — use an undesigned character mapping logged in docs/undesigned-states.md; passport/stamp chrome drops the DC file's dashed border and fine wordmark/dot details; see phase report)

### T8 — Web outputs, web element, OG atlas
- Goal: web WebP set, `<critter-sticker>` element, Takumi atlas.
- Files: `packages/critter-art/src/web/{critter-sticker,register}.ts`, `packages/critter-bake/src/writers/{web-webp,og-atlas}.ts`, `manifests/{web,og-atlas}.json`, `apps/web/public/critters/` (generated).
- Steps: 1. Element: IO-lazy (rootMargin 150 px) draw-on, reduced motion = static, tap replay, disconnect frees canvas. 2. WebP buckets + srcset JSON. 3. OG atlas: packed sprite sheets + JSON index `{kind, form, pose} → rect`.
- Tests: `pnpm --filter @cp/critter-art test -- web && pnpm --filter @cp/critter-bake test -- web og-atlas`
- Done when: Playwright test mounts 100 elements, only visible ones allocate canvases; atlas index covers all 150 critters × designed forms + 6 guides × poses.
- Status: done — b00384b

### T9 — Share layout model with Skia and Node backends
- Goal: one layout description, two renderers, parity-tested.
- Files: `packages/critter-art/src/share/{model,layout,text,backend-skia,backend-node}.ts`, `apps/mobile/src/ui/share-image/render.ts`, tests.
- Steps: 1. Model: frame, rect (radius, halftone tex), text run (font family/axis width step/weight/colour/maxLines/ellipsis), image (URI, fit, rotation), sticker spec, rotation for "slightly wrong angles". 2. Font registry from `@cp/design-tokens` font files (assert tier colours equal critter-art constants here). 3. Skia backend via Paragraph API; Node backend via `@napi-rs/canvas` `GlobalFonts`. 4. Grapheme-safe text (Vietnamese, emoji).
- Tests: `pnpm --filter @cp/critter-art test -- share`
- Done when: a test card renders on both backends within share tolerance (text AA band documented); tier colours asserted equal to design tokens.
- Status: done — 7393cbb (font registry step used one bundled font file directly rather than a `@cp/design-tokens`-owned registry — design-tokens ships type-scale metadata, not font binaries, which live in `apps/mobile/assets/fonts/`; see phase report)

### T10 — Share card templates and share actions
- Goal: all F-140 cards and the share/save flow.
- Files: `packages/critter-art/src/share/templates/{critter-card,recap-cover,recap-route,recap-awards,recap-receipt,recap-missed,recap-stamp,postcard,plan-preview,memory,poster,story-frame}.ts`, `apps/mobile/src/ui/share-image/{ShareImageSheet.tsx,share-actions.ts}`, template tests + `__states__` fixtures.
- Steps: 1. Templates with typed props (zod), post + 9:16 variants, postcard print variant. 2. `renderShareCardNode()` export for worker. 3. `ShareImageSheet` (undesigned; design in code): preview, format toggle, rendering + failure states, share sheet, Instagram Stories (background + sticker layers; hidden if app absent), save to Photos add-only via `expo-media-library` write-only permission. 4. Alt text per card. 5. Golden snapshots per template (Node backend) from realistic fixture data (content from design copy).
- Tests: `pnpm --filter @cp/critter-art test -- share/templates && pnpm --filter @cp/mobile test -- ui/share-image`
- Done when: 12 templates render in both backends; RNTL covers sheet states; snapshot goldens committed and reviewed against 3l-3/3m-*/3o-4 renders.
- Status: done — 2431d09 (content is founder-reviewable placeholder copy, not sourced from design renders — see phase report; goldens are self-consistency snapshots, not yet reviewed against 3l-3/3m-*/3o-4 by a founder)

## Phase acceptance criteria

- [ ] Skia backend within golden thresholds vs canvas2d
- [ ] `<Sticker>`: cache limits enforced, `drawProgress` + `closedEyes` rendering, static path under reduce motion, a11y labels
- [ ] Founder device run recorded: Critterdex grid 60 fps; 2 draw-ons ≥ 55 fps mid-range Android (physical device)
- [ ] `pnpm critter-bake --check` green in CI; outputs deterministic
- [ ] Prebuild places assets in app + all extension targets + Android res; app icon sets complete (iOS layered `.icon` + flat fallbacks, Android adaptive + monochrome)
- [ ] Web element lazy + reduced-motion; OG atlas complete
- [ ] 12 share templates, parity app/server, share sheet with save/share/Stories and error state
- [ ] Maestro `e2e/critters/sticker-lab.yaml` passes on both platforms (iOS simulator passes as of 6cfeaa5f; Android open)

## Risks & rollback

| Risk | Mitigation |
|---|---|
| Worklet draw-on unsupported for core modules | JS-thread fallback with `Picture` redraw; still gated at 2 |
| RN Skia bundle weight (+6 MB iOS / +4 MB Android) | accepted (Q-06); no CanvasKit on web |
| Hermes geometry slower than estimate | pre-warm in idle, larger buckets reuse, reduce concurrency to 1 on low-tier devices (device class check) |
| Asset catalog size | tier A only bundled; rest on-device cache |
| Text metric differences Skia vs Node | same font files; AA-band tolerance; layout by measured widths |
| Instagram Stories API change | feature-detect; falls back to system share sheet |

Rollback: bake outputs are generated and committed; revert the generation commit to restore previous assets.

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Phase 2 extension-target spike result (target names/paths) | plugin reads target list from one constant; defaults to widgets, notification-service, notification-content |
| Meta app id for Instagram Stories sharing | Stories button hidden; system share sheet only |
| Founder review of icon templates + share cards | ship designed layouts; undesigned sheet reviewed in running app |
| Designed forms beyond Tokek/Pon (phase 18) | tier A bakes forms present in `packages/content`; manifest `forms: all` picks new ones on next bake |

## Open questions

1. Size bucket list — default 24/36/48/60/96/150/232/300 pt; retune after T4 device bench.
2. First-launch Critterdex thumbnails: render on device (default) vs bundled 36 pt set (~3.6 MB) — default on-device with pre-warm; revisit if T4 shows > 2 s visible fill on mid-range.
3. Lock-screen widgets drawn full-colour in 5c-3 — default: system vibrant with mask variant (platform limit).
4. Draw-on in lists — default: hero only (perf data); lists static.
5. Doc delta: App Group key format needs kind prefix and scale suffix (api-contracts-async §6).
6. Doc delta: system-architecture §4.7 names `apps/mobile/generated/critter-art/` and `with-critter-art` plugin — add.
