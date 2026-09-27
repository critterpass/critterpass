# critter-art golden harness

Renders guides, icons and every CritterDex local through the **unmodified** `design/*.js` scripts
in Chromium (the reference) and diffs them against `@cp/critter-art`'s own `build`/`frame`/Canvas2D
pipeline, rendered two ways: in the same Chromium page (bundled via esbuild) and in Node via
`@napi-rs/canvas`. Covers all 6 guides, 28 icon kinds, and all 150 locals across their 15 archetypes
(`src/kinds/locals/register.ts`).

## Running

```sh
pnpm --filter @cp/critter-art golden:setup   # once, if Chromium isn't already cached
pnpm --filter @cp/critter-art golden
```

Output: `golden/out/report.json` (every case's metrics) and `golden/out/diffs/*.png` (amplified
red-channel diff images, written only for cases that miss threshold). Both are gitignored.
Non-zero exit when any gating case misses threshold or the mutation-sensitivity check fails.

## Case matrix

- **Baseline** — every guide and icon (34 kinds) at 96pt, plain, fully drawn (`p=1`). Confirms
  every kind's own geometry/ops are correct.
- **Deep dive** — `gecko`, `tanuki` (guides) and `heart` (icon) at every combination of size
  (24/96/300pt) × variant (plain/sticker/locked/source-over) × draw-on progress
  (`.15/.5/.85/1`), plus a blink (`closedEyes`) case per size for the two guides. The
  variant/draw-on/blink machinery in `build`/`frame` is kind-independent, so this validates those
  dimensions thoroughly without repeating them for all 34 kinds.
- **Locals** — every one of the 150 CritterDex critters at 24/96/300pt × common/sticker/locked,
  fully drawn (`p=1`), seeded with the critter's own `no` (design's `c.no`, the canonical seed for
  locals). No draw-on/blink sweep per critter — that machinery is already validated
  kind-independently by the deep-dive cases above.
- **Mutation check** — `heart` rendered with its accent forced to a jarring colour must fail
  threshold against the unmutated render; this is the "does the harness actually have teeth"
  check called out in the phase file.

## Thresholds

From `docs/system-architecture.md` §4.7 and the design analysis report: mean abs diff < 0.5/255,
pixels differing > 8/255 < 1%. The report's own CI note carves out an exception — "icons ≤24pt
looser" — because a handful of anti-aliased edge pixels are a much larger share of a tiny
raster's pixel count; `diff.ts` applies a looser bound (mean abs < 1/255, pixels > 8/255 < 5%)
whenever the rendered box's **shorter side** is ≤ 24pt (a non-square icon like `squiggle`,
viewBox 100x20, at `size=96` renders 96x19.2pt and is just as AA-sensitive as a nominally small
icon — the check uses `layout()`'s actual box, not the raw `size` attribute).

## Node vs Chromium at partial draw-on: verified, not a port defect

Every case is scored against **two** renders — the same core output in Chromium and in Node — but
**only the `p=1` (fully drawn, including blink) comparisons gate the run** for the Node column.
Partial draw-on (`p<1`) Node/Chromium diffs are still computed and recorded in `report.json` for
visibility; they never fail the run.

Why: at partial draw-on, washes fade in via `globalAlpha` between 0 and 1 while multiply-blended
against a fully transparent canvas — blend-over-transparent compositing is under-specified enough
that two different Skia builds (Chromium's vs `@napi-rs/canvas`'s) legitimately round it
differently. This was verified empirically, not assumed: rendering the **unmodified**
`design/doodles.js` (no port code involved) through both engines at `size=96, p=.5` reproduces the
same magnitude of diff this harness records for the ported core (e.g. `heart` mean abs ≈0.77 in
both the design script and the port, vs ≈0.01–0.2 at `p=.15` and `p=1` for the same icon). The
Node backend (`packages/critter-bake`, per `docs/system-architecture.md` §4.7) only ever bakes
fully-drawn static assets in production — draw-on animation runs live in the browser or RN Skia,
never through a pre-baked Node frame — so gating Node parity on `p=1` matches how the backend is
actually used, while the full draw-on sweep still gates against Chromium (the browser-core
comparison), which the port matches almost exactly (mean abs typically < 0.01) at every `p`.

If this reasoning is ever in doubt, rerun the check: load the untouched design scripts in both
engines at a mid draw-on `p` and diff them directly, with no `@cp/critter-art` code involved.

## Node vs Chromium at locked (silhouette) mode: verified, not a port defect

A handful of `96pt`/`locked` cases land right at the strict threshold boundary on the **Node**
column only — always with a **bit-perfect (0% diff) browser-core comparison**, proving the port's
geometry and op sequence are exactly right. Example (`report.json`): `cp-130` (Fia, a deer with
antlers + a spotted coat) measures browser meanAbs 0.000 / node meanAbs 0.251, pct>8 exactly 1.00%
— one pixel either way decides pass/fail. `cp-002` and `cp-088` (both `dragon`/`smok` lizards, the
most decorated `lizard` variants) show the same pattern. The pre-existing `gecko` guide (T3, already
shipping) sits on the same continuum at 0.80% — under threshold, but the same phenomenon.

Why: `locked` recolours every op to one flat, fully opaque colour (`model.ts` `applyMask`), so the
rendered image is large flat regions bordered by anti-aliased edges with no interior alpha blending
to soften engine differences — unlike normal colour mode, where washes/fills blend translucently and
absorb small rounding differences. Critters with more total outline perimeter (antlers, spines, many
limbs, coat-pattern strokes) accumulate more AA-edge pixels, so their `pct>8` sits closer to the
1% cutoff purely as a function of decoration complexity, not correctness. This was not assumed: the
diff image for `cp-130` (`golden/out/diffs/cp-130-96pt-locked-p1-node.png`) shows a uniform thin red
trace along the *entire* silhouette outline, not a localized shape error.

This does **not** gate-exempt anything — `packages/critter-bake` genuinely bakes locked/silhouette
PNGs in production, so Node parity at `p=1` locked mode is a real, meaningful check; these are
reported as real (if narrow) misses, not filtered out. Fixing the underlying two-Skia-build
rasterization gap is outside `packages/critter-art`'s reach (same finding as the draw-on section
above, extended to a second rendering mode).
