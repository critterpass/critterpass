---
phase: 4
title: Critter art core (TS renderer extraction)
status: pending
depends_on: [1]
wave: 2
features: [F-006]
screens: [3a-3, 3l-1, 3l-2, 3l-3, 3l-4, 3l-5, 3l-6, 3l-8, 3l-9, 3l-10, 3m-2, 3m-7, 3n-5]
tasks: 8
owns: [packages/critter-art/package.json, packages/critter-art/tsconfig.json, packages/critter-art/vitest.config.ts, packages/critter-art/src/core/, packages/critter-art/src/kinds/, packages/critter-art/src/data/, packages/critter-art/src/forms/, packages/critter-art/src/backends/canvas2d/, packages/critter-art/src/index.ts, packages/critter-art/scripts/, packages/critter-art/golden/, packages/critter-art/gallery/]
---
# Phase 4 — Critter art core (TS renderer extraction)

## Context links

| What | Where |
|---|---|
| Engine analysis (authority for this phase) | `plans/reports/design-analysis-260926-1143-critter-render-engine-report.md` §1 (architecture, DSL, pipeline, lifecycle, determinism), §2 (Canvas2D surface, portability), §3 (data model, forms), §5.3 (core API sketch), §7 (risks, open Qs) |
| Probe code + reference renders | `docs/design-renders/engine-probe/` (`node-prerender.mjs`, `geometry-bench.js`, `contact-sheet.png`, `fidelity-checks.png`, `mono-check.png`, `renders/*`) |
| Pipeline diagram + golden thresholds | `docs/system-architecture.md` §4.7; import rules §2 (critter-art is pure, no I/O) |
| Tier colours, locked colours, a11y labels | `docs/design-system.md` §1.2 (tier colours), §5 (screen reader labels) |
| Tables the render spec must fit | `docs/data-model.md` `critters.art_params`, `critters.canonical_seed`, `critter_forms.palette/pose/edge` |
| Decisions | `docs/product-decisions.md` C4 (setGroup vs rarity), C20 (Golden Tokek), C21 (true silhouettes), C38 (stickers not forms), C40 (epic always adds pose + pink edge at every size), D9 (150 × 4 forms via content factory) |
| Design source (read-only) | `design/doodles.js`, `design/critters-data.js`, `design/critters-draw-1.js`, `design/critters-draw-2.js`, `design/Critter Collection.dc.html` |
| Renders | `docs/design-renders/screens/3l-3_Critter_detail.png`, `3l-2_Your_pass.png`, `3l-10_Sakura_Pon.png`, `3l-9_Once_a_year.png`, `3m-7_Recap_the_one_that_got_away.png` |

## Overview

Goal: a pure TypeScript package `@cp/critter-art` that turns a render spec (kind, form, pose, variant, seed, size) into a backend-agnostic display list, plus a Canvas2D backend that runs in browsers and in Node (`@napi-rs/canvas`). It is the single source of truth for every critter, guide, icon and silhouette pixel in app, extensions (via bake), web and OG.

Done when: all 150 critters, 6 guides (all poses), 28 icons + 4 annotation kinds render through the core with golden parity to the untouched design scripts in Chromium (mean abs < 0.5/255; pixels > 8/255 < 1%) at 24/96/300 pt, for common, locked, sticker, draw-on frames and blink; the form/tier model (common/rare/epic/legendary, pose, pink edge, gold die-cut, silhouettes, mask/mono/stamp variants) is typed, validated and rendered in a review gallery.

## Requirements

### F-006 — Critter art core

| Area | Designed behaviour to preserve (from design scripts) |
|---|---|
| Primitives | mulberry32-variant RNG seeded `(s·1000003)>>>0` with `Math.imul`; uniform Catmull-Rom `spl(pts, close, step=1.1)`; shapes `E` ellipse n-gon, `blob` superellipse, `fluff`, `bez`, `tube`, `crs`; ribbon brush (wobble per point index, closed/tapered/untapered pressure, width `max(minW, w·press·(.9+.2 sin(.19i+ph2)))`, `minW = 1.05 pt`) |
| Ops DSL | `line/stroke(under)/wash/fill/dot` + helpers `W`, `F`; `sid++` consumed by line/stroke/wash only; 100×100 local space (icons: own viewBox) |
| Paint model | pass 1 wash/under with blend (default `multiply`, attr `source-over`), seeded wash misregistration `ox∈[-off,off], oy∈[-.2off,.8off]`, fill α .9·fa + miter edge stroke α .28·fa w 1.4; pass 2 fills + lines interleaved, source-over; `fa = clamp((p−.25)/.55)` |
| Draw-on | progress `p` 0..1 (caller eases, easeInOutQuad, 1500 ms creatures / 700 ms icons); arc-length budget `p·total·1.02`, sequential in authored order, vertex-granular truncation; truncated ribbon = prefix of the full ribbon's L/R arrays (precompute once, slice per frame; no per-frame trig) |
| Sticker | die-cut outline in sticker colour (wash/fill: stroke 2·stkW + fill; line/under: stroke 2·stkW + op.w; round join/cap), pad = stkW + 4, art occupies size·100/118 (layout contract); drop shadow `rgba(0,0,0,.32)`, σ 2.5 pt, dy 2.5 pt; outline alpha `min(1,4p)` |
| Isolation | multiply is canvas-local: display list wraps the critter in an isolated layer so washes multiply only with its own sticker/washes |
| Blink | closed-eye op list built on demand only (`closedEyes: true`), never eagerly |
| Size | size-dependent line weight: `build(spec, sizePt)` is per size bucket, never downscaled from a master |
| Locked | recolour every op to one colour, α 1, source-over (silhouette) |
| Guides | 6 hand-drawn kinds gecko/tanuki/puffin/axolotl/sardine/alpaca with pose support per report §3.2 (gecko idle/wave/cheer/think/point/sleep; tanuki wave/cheer/think; puffin/axolotl wave/cheer; sardine/alpaca extras); palette slots `accent`, `leaf`, `beak2`, `stripe` exposed as palette keys (design hard-codes the last two) |
| Icons | 28 icons (`egg`+`crack` … `heart`) + annotation kinds `underline/circle/arrow/squiggle` with own viewBox, stroke 5–10 units, optional accent wash |
| Locals | 150 CritterDex entries, 15 archetypes, 77 archetype:variant combos, 36 accessories, ears/horns/tails/masks/muzzles/28 patterns |

**Forms / tiers (data model, rendering):**

| Form | Render rule (design-system §1.2, C40) |
|---|---|
| common | default palette |
| rare | full palette triplet recolour (all 3 slots authored; `fill` alone is not enough, report §3.4) + blue ring is a UI concern (not baked) |
| epic | recolour + pose + 2 pt `#ff5fa8` die-cut edge ring at every size |
| legendary | gold recolour + 3 pt `#ffd84a` die-cut edge ring; sparkles are a motion-layer concern (phase 6) |
| locked | silhouette `#3a3466` on sticker `#2c2750`; legendary locked `#6b5a24` on `#3a2f14` (C21: true silhouettes) |

Variants: `color` · `mask` (locked-style single colour, clean for every kind) · `mono` (luminance render for tinted icons) · `stamp` (line ops only, single ink, no washes — Android monochrome/small icon source).

**Undesigned — design in code (founder reviews in gallery):**
1. Epic pose for the 12 pose-less archetypes (fish, wader, stand, bug, frog, seal, whale, turtle, snake, crab, octo, nessie variants; T8's "all 15 archetypes + 6 guides" is the test scope and source of truth): add pose mechanics `tilt` (body rotation about archetype anchor), `hop` (lift + squash offsets baked into geometry), archetype-specific raised fin/limb/antenna variant, plus existing extras (spark lines). Every archetype must yield a visibly distinct epic pose (C40).
2. Unlocked Golden Tokek (only the locked silhouette is designed): gold palette derived from 4a-3 gold-cover gecko.
3. Stable blink seeds: fix design jitter for `dotEyes` (seal, dugong, naga), octo, axolotl so later strokes keep seeds when eyes close (production mode); golden mode replicates design exactly.
4. Guide cp-ids (cp-041, cp-061, cp-076, cp-112, cp-145, cp-148) resolve to their hand-drawn kinds (design silently renders `spark`).

## Architecture & contracts

Pure package, no DOM/I/O; depends on nothing runtime-specific (design-tokens is wave-2 parallel; tier colours live in `src/forms/tier-palette.ts` and phase 5 asserts equality with `@cp/design-tokens`).

```ts
type Variant = 'color' | 'mask' | 'mono' | 'stamp';
type RenderSpec = { kind: string; form?: FormSpec; pose?: Pose; variant?: Variant; maskColor?: string;
  sticker?: { color: string; w?: number } | null; blend?: 'multiply' | 'srcOver'; seed: number;
  closedEyes?: boolean; seedMode?: 'design' | 'stable' };
type FormSpec = { rarity: 'common'|'rare'|'epic'|'legendary'; palette: Palette; pose?: Pose; edge: 'none'|'epic'|'legendary' };
type Cmd = { t:'poly'; pts: Float32Array; color; alpha; blend; dx?; dy? }
         | { t:'polyline'; pts: Float32Array; closed; width; join:'miter'|'round'; cap; color; alpha; blend }
         | { t:'layer'; cmds: Cmd[]; isolate: true; shadow?: { dy; sigma; color }; alpha };
build(spec, sizePt): Model   // ops + precomputed ribbons L/R, arc lengths, outline + edge rings
frame(model, p): Cmd[]       // allocation-light; p already eased
layout(spec, sizePt): { w, h, pad, artBox }
resolveKind(idOrKind): KindFn; registry: critters (150), guides (6), icons (32)
```

| Contract | Delta |
|---|---|
| `critter_forms.palette jsonb` (data-model) | = `Palette` zod schema exported as `paletteSchema` `{f, dk, bl, accent?, leaf?, beak2?, stripe?, eye?, pupil?, ink?}`; `pose` ∈ `Pose` enum incl. new `tilt/hop`; `edge` ∈ `none/epic/legendary`. Doc delta: note enum values in data-model.md. |
| `critters.art_params jsonb` | = design `spec` object (`b, c, v, ears, tail, muz, acc, pat, beak, …`) typed as `ArtParams` + zod schema; phase 18 validates generated content with it |
| `critters.canonical_seed` | default rule: locals = design collection seed `no`; guides = 7 (see Open questions) |
| Critter data | `src/data/critters.ts` generated from `design/critters-data.js` by `scripts/import-design-data.ts` (read-only source); ids keyed by explicit `no`, not array position |
| Designed forms | only designed ones shipped as fixtures in `src/forms/designed.ts` (Tokek rare/epic/golden, Pon Sakura); the other forms come from phase 18 (`packages/content`) |

No DB, API, sync, push, or AI changes.

## Tasks

### T1 — Package scaffold and math primitives
- Goal: `@cp/critter-art` package with rng, spline, shapes, ribbon as typed pure modules.
- Files: `packages/critter-art/{package.json,tsconfig.json,vitest.config.ts}`, `src/core/{rng,spline,shapes,ribbon}.ts`, `src/core/*.test.ts`, `src/index.ts`.
- Steps: 1. Scaffold package per phase-1 conventions (ESM, strict TS, exports map `.`, `./canvas2d`). 2. Port RNG (int32 wrap), `spl`, `E/blob/fluff/bez/tube/crs`, ribbon (wobble by point index, pressure modes, minW) using `Float32Array`. 3. Tests compare against the original functions evaluated from `design/doodles.js` in a Node `vm` context (read-only) on fixed inputs — bit-identical point arrays.
- Tests: `pnpm --filter @cp/critter-art test`
- Done when: every primitive matches design output exactly (max abs diff 0 for rng/spline, < 1e-5 for ribbon floats) across ≥ 50 seeded cases each; typecheck clean.

### T2 — Op builder, model, frame and Canvas2D backend
- Goal: DSL (`line/stroke/wash/fill/dot/W/F`) → `Model` → `frame(model,p)` → `Cmd[]`, rendered by a Canvas2D backend (browser + `@napi-rs/canvas`).
- Files: `src/core/{ops,model,frame,layout,cmd}.ts`, `src/backends/canvas2d/{index,render}.ts`, tests alongside.
- Steps: 1. Op builder with `sid` semantics and `seedMode`. 2. `build`: splines, arc lengths, full ribbons L/R, sticker outline + tier edge ring cmds, locked recolour. 3. `frame`: wash offsets, fade `fa`, arc-length budget prefix slicing, isolated layer + shadow. 4. Canvas2D backend: isolated layer via offscreen canvas, `multiply`, shadow, real device scale (not design's 2.5× cap). 5. Accept a `CanvasFactory` so Node and browser share code.
- Tests: `pnpm --filter @cp/critter-art test` (unit: cmd counts/arc lengths vs design instrumented values: gecko 42 ops, 1,121 pts).
- Done when: a hand-written test kind renders identically in Node canvas and the op/lineTo counts match the design instrumentation for the same kind.

### T3 — Port guides, icons and doodles helpers
- Goal: `doodles.js` `K` registry (6 guides with poses, 28 icons, 4 annotation kinds) and helpers `eyes/cheeks/extras/toes/iris/dotEyes` in TS.
- Files: `src/kinds/guides/{gecko,tanuki,puffin,axolotl,sardine,alpaca}.ts`, `src/kinds/icons/*.ts`, `src/kinds/parts/face.ts`, `src/kinds/registry.ts`.
- Steps: 1. Port line-for-line, keeping op order (seed-sensitive). 2. Expose `accent/leaf/beak2/stripe` as palette keys with design defaults. 3. Registry with unknown-kind error in dev (not silent `spark`), `spark` fallback in production + logged.
- Tests: `pnpm --filter @cp/critter-art test` (op-count + seed-sequence snapshot per kind × pose).
- Done when: all 6 guides × supported poses and 32 icon kinds build; op sequences equal the design's (verified via `vm`-evaluated design scripts).

### T4 — Golden harness (Chromium vs core)
- Goal: CI job rendering references from the untouched design scripts in Chromium and diffing core output.
- Files: `packages/critter-art/golden/{harness.html,reference-page.ts,run-golden.ts,cases.ts,diff.ts}`, `golden/README.md`, root script `golden` in package.json.
- Steps: 1. Playwright Chromium loads `design/doodles.js`, `critters-data.js`, `critters-draw-1.js`, `critters-draw-2.js` unmodified; renders `<doodle-art>` cases (`anim="none"`, fixed `devicePixelRatio`) to PNG buffers in memory. 2. Same page loads the bundled core (esbuild) + canvas2d backend; renders identical specs with `seedMode:'design'`. 3. Also render the core in Node `@napi-rs/canvas` and diff vs Chromium. 4. Cases: sizes 24/96/300 pt × {plain, sticker, locked, source-over} × draw-on p ∈ {.15,.5,.85,1} × blink closed; guides/icons now, locals appended by T5/T6. 5. Output diff images + JSON report to `golden/out/` (gitignored); non-zero exit on threshold breach.
- Tests: `pnpm --filter @cp/critter-art golden`
- Done when: guides + icons pass mean abs < 0.5/255 and > 8/255 pixels < 1% in both Chromium-core and Node-core comparisons; harness fails when a single op colour is changed (mutation check).

### T5 — Port critters-draw-1 (helpers, parts, sit/stand)
- Goal: `X.h` helpers, 36 accessories, ears/horns/tails/masks/muzzles/patterns, archetypes `sit` and `stand`.
- Files: `src/kinds/locals/helpers.ts`, `src/kinds/locals/parts/{accessories,ears,horns,tails,masks,muzzles,patterns}.ts`, `src/kinds/locals/archetypes/{sit,stand}.ts`.
- Steps: 1. Port in design order; replace hard-coded `INK`/literal colours with named constants (values unchanged). 2. Register the 71 sit/stand critters. 3. Add their golden cases.
- Tests: `pnpm --filter @cp/critter-art test && pnpm --filter @cp/critter-art golden`
- Done when: all sit/stand critters pass golden at 24/96/300 pt, common + locked + sticker.

### T6 — Port critters-draw-2 archetypes and critter data
- Goal: archetypes `bird wader fish lizard frog turtle snake bug octo crab seal whale nessie`, boot-equivalent registry, generated CritterDex data.
- Files: `src/kinds/locals/archetypes/*.ts`, `src/data/{critters,places}.ts` (generated), `scripts/import-design-data.ts`, `src/data/types.ts`.
- Steps: 1. Port archetypes. 2. Import script reads `design/critters-data.js` via `vm`, writes typed data (61 places, 150 critters, `setGroup` not `tier`, C4). 3. `resolveKind` maps guide cp-ids to guide kinds. 4. Golden for all 150.
- Tests: `pnpm --filter @cp/critter-art test && pnpm --filter @cp/critter-art golden`
- Done when: 150/150 critters + 6 guides pass golden; data import is idempotent (re-run yields zero diff); `resolveKind('cp-112')` renders gecko.

### T7 — Form/tier model, variants, seeds
- Goal: `FormSpec`/`Palette`/`ArtParams` zod schemas, tier edges, silhouettes, `mask/mono/stamp` variants, canonical seeds, stable blink seeds.
- Files: `src/forms/{schema,tier-palette,resolve,designed}.ts`, `src/core/variants.ts`, tests.
- Steps: 1. Schemas matching `critter_forms`/`critters.art_params`. 2. Edge rings (epic 2 pt pink, legendary 3 pt gold) as round-join outline ring beneath the sticker outline; golden-compare against the design's CSS 4-offset wrapper instances (element screenshot) with an edge-band tolerance documented in `golden/README.md`. 3. Variants: mask (every op one colour, no leakage — assert 0 off-palette px), mono (luminance), stamp (line ops only). 4. `seedMode:'stable'` fixes dotEyes/octo/axolotl blink jitter. 5. Designed forms fixtures (Tokek rare `#54d6a4/#2e9a74`, epic `#ff9a4d/#c4623e`+cheer, Golden Tokek, Pon Sakura `#ffc2d9/#c94f86/#fff1f6`+cheer).
- Tests: `pnpm --filter @cp/critter-art test && pnpm --filter @cp/critter-art golden`
- Done when: mask variant has 0 off-colour pixels for all 156 kinds; stable mode keeps every non-eye op seed identical between open/closed; Tokek/Pon designed forms match 3l-3/3l-10 references within edge-band tolerance.

### T8 — Epic pose mechanics and review gallery
- Goal: visibly distinct epic pose for every archetype (C40) and a static gallery for founder review.
- Files: `src/kinds/locals/poses.ts`, archetype edits for pose hooks, `gallery/{index.html,gallery.ts,vite.config.ts}`.
- Steps: 1. Add `tilt`, `hop` and per-archetype raised-limb/fin/antenna pose hooks for pose-less archetypes (design in code). 2. Gallery (Vite, canvas2d backend): grid of kind × form × pose × variant × size with draw-on replay, blink toggle, dark/light backgrounds, seed switch design/stable. 3. Pixel-difference test: epic pose render differs from common pose by > 3% pixels for every archetype.
- Tests: `pnpm --filter @cp/critter-art test`; `pnpm --filter @cp/critter-art gallery:build`
- Done when: all 15 archetypes + 6 guides have an epic pose passing the difference test; gallery builds to static files; existing golden still green (poses opt-in).

## Phase acceptance criteria

- [ ] `pnpm --filter @cp/critter-art test` and `golden` pass in CI (Chromium + Node parity, thresholds per system-architecture §4.7)
- [ ] 150 critters, 6 guides (all designed poses), 32 icon kinds render via `build/frame` with no DOM access (package has no `lib: dom` runtime imports outside `backends/canvas2d`)
- [ ] Draw-on frame uses prefix slicing (no trig per frame): benchmark shows frame geometry ≤ 0.1 ms/critter on Node JIT
- [ ] Forms: zod schemas exported; designed forms fixtures render; epic poses exist for every archetype; mask/mono/stamp variants clean
- [ ] Guide cp-ids resolve; unknown kinds throw in dev
- [ ] No design file modified (`git diff --stat design/` empty)
- [ ] No plan/phase/feature ids in code, test names or commits

## Risks & rollback

| Risk | Mitigation |
|---|---|
| Seed/op-order drift breaks parity | line-for-line port; op-sequence snapshots per kind before pixel diff |
| Float differences Node vs Chromium | both Skia; thresholds from measured parity (0.06–0.42/255) |
| Edge ring look ≠ CSS 4-offset dilation | edge-band tolerance; gallery review; switchable implementation behind `edgeStyle` option until founder signs off |
| New epic poses look off-model | gallery review loop; poses isolated in `poses.ts`, rollback = revert that file |
| Hermes perf (≈10× V8) | measured in phase 5 on device; core keeps flat typed arrays |

Rollback: package is additive; consumers pin by workspace version.

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Founder review of epic poses + Golden Tokek palette | ship defaults from gallery; content factory (phase 18) can override per form via `FormSpec.pose` |
| Name/IP check for some locals (e.g. Berlin "Buddy bear") | data imported as-is; content factory owns renames |

## Open questions

1. Canonical seed per critter — default: locals `no`, guides 7 (design's most frequent); stored in `critters.canonical_seed`.
2. Keep or fix blink seed jitter — default: fix (`seedMode:'stable'` in production), design mode for golden only.
3. Tier edge style — default: round outline ring, edge-band tolerance vs CSS reference.
4. Tier palette source — critter-art keeps its own constants (no design-tokens dep in wave 2); phase 5 test asserts equality. Doc delta: system-architecture §2 lists critter-art → design-tokens dependency; change to "none (tokens asserted in tests)".
5. Doc delta: data-model `critter_forms.pose/edge` enums and `palette` keys to be listed as defined here.
