# Critter render engine: design analysis, measurements, port strategy

Date 2026-09-26. Scope: procedural critter/doodle renderer in `design/doodles.js`, `critters-data.js`, `critters-draw-1.js`, `critters-draw-2.js` + its use across all `*.dc.html` files (792 `<doodle-art>` instances) + tg-* motion elements.
Probe code, bench JSON, renders: `docs/design-renders/engine-probe/` (referred to below as `probe/`).

## 0. Verdict (TL;DR)

- Renderer is **tiny and portable**: every pixel = filled polylines + round-join polyline strokes + alpha + one blend mode (`multiply`) + one drop shadow on one cached image. No curves in the renderer (splines are tessellated in JS), no text, gradients, clips, filters, image data, Path2D. Portable to any Skia/CG/Android/Impeller canvas.
- **Proven empirically**: the *unmodified* design scripts run in Node on `@napi-rs/canvas` (Skia) via a ~25-line DOM shim and produce **pixel-equivalent output to Chromium** (mean abs diff 0.06–0.42 /255 per channel). A build-time asset pipeline needs no port at all.
- Runtime cost is **raster-bound, not geometry-bound**, and dominated by the sticker+shadow composite that the design redraws every frame (75–85% of frame cost at 300pt). Caching the finished frame makes it 30× cheaper (7.4 ms → 0.23 ms at 300pt).
- Design approach (one canvas per sticker, full redraw per frame/blink, 2 backing stores each) does **not** scale on mid-range: 12 simultaneous 96pt draw-ons = 25 fps at 4× CPU throttle; a 150-sticker Critterdex = 69 MB canvas memory at DPR 3.
- **Recommendation**: (a) extract a pure TypeScript `critter-art` core emitting a display list → backends: Canvas2D (web + Node prerender), RN Skia (app runtime; record `SkPicture` → cached `SkImage`), plus (c) build-time/on-device baked bitmaps for every non-animated surface (lists, widgets, Live Activities, notifications, icons, OG/store). Native rewrites only if the app stack is Flutter/Swift/Kotlin; then keep the JS core for web + pipeline and golden-test the port against it.
- Biggest non-engineering gap: **forms are not data**. Only Tokek has 3 of 4 forms drawn; Pon has common + Sakura legendary; the other 148 critters × 4 forms (≈590 forms) have no palette/pose/edge spec, and 10 of 15 archetypes cannot do "epic adds a pose".

## 1. Architecture

### 1.1 Files, registration, boot

| File | Lines / bytes (gz) | Role |
|---|---|---|
| `doodles.js` | 445 / 37.9 KB (11.7 KB) | RNG, Catmull-Rom spline, ribbon, `K` registry (6 guide creatures + 28 icons), `<doodle-art>`, `<tg-motion>`, `<tg-confetti>`, `<tg-type>`, `<tg-count>`; exports `window.DoodleKit = {K,E,eyes,cheeks,extras,toes,CREATURES}` |
| `critters-data.js` | 232 / 23.2 KB (7.6 KB) | `window.CritterDex = {places, list, byId}`: 61 places, 150 critters |
| `critters-draw-1.js` | 306 / 37.3 KB (11.3 KB) | helpers (`X.h`), 36 accessories, ears/horns/tails/masks/muzzles/patterns, archetypes `sit`, `stand` |
| `critters-draw-2.js` | 385 / 41.1 KB (12.2 KB) | archetypes `bird wader fish lizard frog turtle snake bug octo crab seal whale nessie` + `boot()` |

Total 139.5 KB raw / 41.5 KB gz.

Plugin registration (`window.__cp`): each draw file pushes `[order, fn(DK, X)]` onto `window.__cp`. `boot()` (draw-2 tail) polls every 30 ms until `DoodleKit`, `CritterDex` and 2 parts exist, runs parts sorted by order (part 1 fills `X.h` helpers + `X.A.sit/stand`; part 2 reads `X.h`, adds rest of `X.A`), then for every CritterDex entry **without** `spec.k` registers `DK.K['cp-###'] = (d,o) => X.A[spec.b](d,o,spec,C)` with `C = {f: o.fill||c[0], dk: o.spot||c[1], bl: o.belly||c[2]}` wrapped in try/catch, marks it in `CREATURES` (enables blink + 1500 ms draw-on), sets `dex.ready`, re-`setup()`s any already-mounted `cp-` elements, fires `critterdex-ready`.
Gotcha: the 6 guides (`spec.k`) are **not** registered under their cp-id: `kind="cp-112"` silently renders the `spark` fallback. Callers must use `c.kind`.

### 1.2 `<doodle-art>` attributes (observed = triggers full rebuild)

| Attr | Observed | Default | Effect |
|---|---|---|---|
| `kind` | y | `gecko` | K function; unknown → `spark` |
| `size` | y | 48 | CSS width px; height = size·(vbH+2pad)/(vbW+2pad) |
| `pose` | y | – | `idle/wave/cheer/think/point/sleep` (+`crack` for egg); support varies per kind (§3.2) |
| `ink` | y | `#221e19` | line colour (not the hard-coded `INK` in draw-1/2) |
| `fill` `spot` `belly` | y | per kind | colour triplet override → how rare/epic/legendary recolour is done |
| `accent` | y | – | guides: cheek colour; icons: wash colour; ignored by cp- critters (cheeks hard-coded `#ff7fa8`) |
| `eye` `pupil` | y | `#fffdf6`, ink | eye white / pupil |
| `leaf` | **n** | `#54d6a4` | tanuki leaf only |
| `seed` | y | 7 | base seed; each line/stroke/wash op takes `seed+n` |
| `blend` | y | `multiply` | wash/under-stroke composite op; 287 instances set `source-over` (icons on dark UI) |
| `sticker` | y | – | colour of die-cut sticker outline; enables outline cache + drop shadow + padding |
| `sticker-w` | n | 5 | outline half-width (local units); pad = w+4 |
| `locked` | y | – | recolour every op to one colour, alpha 1, `source-over` → silhouette; `locked=""` → `#3a3466` |
| `anim` | n | – | `none` = no draw-on |
| `blink` | n | – | `false` = no closed-eye op list, no blink loop |
| `delay` | n | 0 | draw-on start delay ms |

There is **no `form`/`tier`/`rarity` attribute**. Forms are expressed as colour attrs + `pose` + a CSS wrapper `filter: drop-shadow(±2px 0 0 #ff5fa8)…` ×4 (epic pink edge) or `±3px #ffd84a` (legendary gold die-cut). 4 wrapper instances in the whole design.

Usage census (all html): 792 instances; 679 `anim="none"`, 113 animate (all ≥44px critters); 424 sticker (`#f4efe4` 318, locked-grey `#2c2750` 89, locked-gold `#3a2f14` 15); `locked` 108 (`#3a3466` 87, `#6b5a24` 15, `#6f698c` 4, `#0f2624` 1); sizes 11–620 px, 86 distinct. Critters by size: ≤24: 8, 25–44: 159, 45–96: 189, 97–200: 104, >200: 24. Icons: ≤24: 249, 25–44: 50.

### 1.3 Drawing DSL and op model

Kind functions draw in a 100×100 local space (annotation icons: custom `vb`) through `d`:
- `d.line(pts,{w,close,taper,color})` → op `line`: spline, arc length `L`, ribbon params `{w, taper = !close && taper!==false, seed: sid++, amp .45}`.
- `d.stroke(pts,color,w)` → op `under`: tapered ribbon, `amp .3`, drawn in the wash pass (colour under-strokes: spots, tails, stripes).
- `d.wash(pts,color,{al=.9,off=1.6})` → op `wash`: closed spline, watercolour fill.
- `d.fill(pts,color)` / `d.dot(x,y,r,color,al)` → op `fill` (no seed).
- Helpers `W` = wash+closed line, `F` = fill+closed line; call counts: doodles 120 line/51 wash/18 fill/19 dot/10 stroke; draw-1 86/17/49/37/26 (+49 F, 13 W); draw-2 146/48/52/33/23 (+23 F, 25 W).

Per critter (measured, 150 critters): median 36 ops, 1,426 spline points (801 `cp-144` … 2,067 `cp-118`), ~1,280 ribbon vertices; gecko 42 ops (11 line, 7 under, 2 wash, 22 fill), 1,121 pts.

### 1.4 Pipeline

1. **Points**: hand-authored control polygons (arrays of `[x,y]`), procedural shapes (`E` ellipse n-gon, `blob` superellipse `arcB`, `fluff` star-ish, quadratic `bez`, `tube` = offset outline of a centreline, `crs` Catmull-Rom).
2. **Spline** `spl(pts, close, step=1.1)`: uniform Catmull-Rom, segment subdivision k = max(2, ceil(chord/1.1 units)). Resolution-independent (same point count at 24pt and 512pt; 1.1 units = 4.6 CSS px at 420pt — visible facets only in tight inner corners, see `probe/fidelity-checks.png`).
3. **Setup** (once per attr change): run K fn → `opsOpen`; if creature & not locked & blink≠false run again with `o.closed=true` → `opsClosed`; `total` = Σ line L. If sticker: draw outline into offscreen canvas `oc` (same backing size): for wash/fill ops `stroke(w=2·stkW)+fill`, for line/under ops `stroke(w=2·stkW + op.w)`, round join/cap, sticker colour.
4. **Paint** `draw(p)` (full clear every call):
   - sticker: `drawImage(oc)` with `globalAlpha=min(1,4p)`, shadow `rgba(0,0,0,.32)`, `shadowBlur 5·dpr` (Gaussian σ = 2.5 pt), `shadowOffsetY 2.5·dpr`.
   - `setTransform(k,0,0,k,pad·k,pad·k)`; `minW = 1.05·dpr/k` (→ **ribbons never thinner than 1.05 pt**).
   - pass 1 (all `wash`/`under`, op order, `globalCompositeOperation = blend`): wash = translate by seeded offset `ox∈[-off,off], oy∈[-.2off,.8off]` (misregistration biased down), fill α .9·fa, then edge stroke α .28·fa, lineWidth 1.4, **default miter join** (pooled watercolour edge); under = ribbon α .9·fa.
   - pass 2 (`fill` + `line` interleaved in op order, source-over): fill α = al·(p≥1 ? 1 : fa); line = ribbon, revealed by arc-length budget `p·total·1.02`, strokes drawn sequentially in authored order, truncated at **vertex granularity** (`P.slice(0,i+1)`).
   - `fa = clamp((p−.25)/.55)`: washes/fills fade in between p .25–.8.
5. **Ribbon** (variable-width brush): per point i: wobble `Q = P + amp·(sin(.07i+ph), cos(.061i+ph2))` (phases from seed; **wobble frequency is per point index**, so tessellation must be bit-identical to keep the look); normal from Q[i−1]→Q[i+1]; pressure: closed → `.78+.22 sin(4πt+ph)`; tapered → `sqrt(max(.02, sin(π(.06+.88t))))`; untapered → 1; width `max(minW, w·press·(.9+.2 sin(.19i+ph2)))`; polygon = L forward + R backward, `fill()` nonzero (self-overlaps at tight turns rely on nonzero).
6. `locked`: rewrites op colours to one colour, `al=1`, blend `source-over`.

### 1.5 Animation loop and lifecycle

- `connectedCallback`: creates `<canvas>`, sizes it (`box()`), click → `play(0)` (tap replays draw-on); **lazy**: `IntersectionObserver` (rootMargin 150px) → first visibility runs `setup()`, then `draw(1)` if rendered width <44 px, else `play(delay)`. Never torn down when scrolled away (memory stays).
- `play`: skipped (→ `draw(1)`) if `anim="none"` or `prefers-reduced-motion`; duration 1500 ms creatures / 700 ms icons; easeInOutQuad; own `requestAnimationFrame` loop **per element**; full redraw each frame.
- Blink: per-element `setTimeout` 2.6–6.2 s random; if visible & not animating: `draw(1)` with closed ops, 150 ms later `draw(1)` open → 2 full redraws per blink. Not gated by reduced motion.
- Idle motion is **not** in the canvas: `<tg-motion fx=float|bob|hop…>` wraps the element and animates CSS transforms (compositor, 0 canvas cost).
- `attributeChangedCallback`: every attribute set → full `setup()` (both op lists + outline raster) + `draw(1)`. Prototype handlers set up to 6 attrs in a row (`variant()`, `avatarPick()`, `wake()`), i.e. 6 rebuilds.
- Cached: op geometry (splines), sticker outline bitmap. Not cached: ribbon geometry (trig per point per frame), final composite (incl. shadow blur) — redrawn every frame and every blink.

### 1.6 devicePixelRatio / size

- Backing scale `dpr = min(2, devicePixelRatio)·1.25` → 1.25× on 1x, **2.5× on both 2x and 3x** (iPhone 3x renders at 2.5× then upscaled 1.2×: slightly soft). Native port: use real screen scale.
- 96 pt sticker → 240×240 backing ×2 canvases = 460 KB; 300 pt → 750² ×2 = 4.5 MB.
- Sticker padding shrinks the art: with sticker the 100-unit art occupies size·100/118 (96 pt sticker ≈ 81 pt critter). Layout contract to preserve.
- **Size-dependent line weight** (minW 1.05 pt): small renders get bolder lines and lose taper; a 300 pt render downscaled to 24 pt looks thin/broken (`probe/fidelity-checks.png`, bottom-left pair). ⇒ bitmaps must be rendered per size bucket, not downscaled from one master.

### 1.7 Determinism quirks (golden-test relevant)

- RNG = mulberry32 variant seeded `(s·1000003)>>>0`, `Math.imul`; trivially portable (int32 wrap).
- Seeds differ across screens for the same critter: default 7, collection `c.no`, marketing 41–46 (gecko/tanuki/puffin/axolotl/sardine/alpaca), egg 12, detail/encounter 205/381/391. Production needs one canonical seed per critter (+ optional per-form).
- `sid++` is consumed by line/stroke/wash only; open vs closed eyes consume equal seeds for `eyes()`/`iris()` but **not** for `dotEyes()` (seal, dugong, naga), octo, axolotl → on blink, later strokes (mouth, extras) get new seeds and wobble shifts. Visible jitter at large sizes; replicate or fix deliberately (stable per-op seed).

### 1.8 Design-prototype inefficiencies to not carry over

2 full-res canvases per sticker; full redraw per frame and per blink; shadow blur recomputed every frame; per-element rAF + timers; attr-by-attr rebuild; closed-eye list built even when never shown; ops as nested JS arrays (≈124 KB heap per critter, measured 18.6 MB for 150).

## 2. Canvas2D API surface (exact)

Static (`doodles.js`; draw-1/2 and data make **zero** ctx calls):

| Member | Uses (grep) | Where / values |
|---|---|---|
| `getContext('2d')` | 3 | main canvas, sticker offscreen `oc`, confetti |
| `setTransform` | 4 | uniform scale+translate only |
| `clearRect` | 2 | full clear per frame |
| `save`/`restore` | 5/5 | per wash/under/fill op; confetti particle |
| `translate` | 2 | wash offset; confetti |
| `rotate` / `scale` / `fillRect` | 1/1/1 | confetti only (`scale(1, cos 2r)` = non-uniform flip) |
| `beginPath`/`moveTo`/`lineTo`/`closePath` | 2/2/3/2 | polylines only — no arc/bezier/quadratic/ellipse/rect |
| `fill` | 4 | nonzero default |
| `stroke` | 3 | sticker outline (round join/cap), wash edge (miter, width 1.4) |
| `globalAlpha` | 6 | .28, .9, cheeks .5, fades |
| `globalCompositeOperation` | 2 | `multiply` (default) / attr (`source-over`) |
| `fillStyle`/`strokeStyle` | 6/2 | CSS strings: `#rrggbb`, `rgba()`, `transparent` |
| `lineWidth`/`lineJoin`/`lineCap` | 3/1/1 | `round` only on `oc` |
| `shadowColor`/`shadowBlur`/`shadowOffsetY` | 1/1/1 | sticker drop shadow |
| `drawImage(canvas,0,0)` | 1 | sticker composite |

Not used: gradients, patterns, clip, `filter`, text, Path2D, `ellipse/arc/bezierCurveTo`, image data, `OffscreenCanvas`, `imageSmoothing`, dashes.
Outside the canvas: CSS `filter: drop-shadow()` ×4 for tier edges; CSS `mix-blend-mode: multiply` in App Icon "tinted" preview; WAAPI for tg-motion.

Runtime per frame (instrumented, 96 pt): gecko+sticker `draw(1)`: 42 fills, 1,683 `lineTo`, 32 save/restore, 9 multiply ops, 1 shadowed `drawImage`, 2 strokes; `setup`: 42 outline strokes, 24 fills, 1,079 `lineTo`. Léon (cp-013)+sticker `draw(1)`: 38 fills, **2,610 `lineTo`**, 6 multiply, 6 strokes. Icon `pin`: 2 fills, 486 `lineTo`.

Portability (all map 1:1; caveats only):

| Target | Fill/stroke | Multiply | Shadow | Caveats |
|---|---|---|---|---|
| Skia (RN Skia, CanvasKit, `@napi-rs/canvas`, Chromium) | `SkPath` + `drawPath`, nonzero default | `BlendMode.Multiply` (W3C separable) | `ImageFilter.MakeDropShadow(σ=2.5pt)` | same engine as Chrome → near-identical (measured) |
| Flutter (Impeller, default iOS + Android API 29+) | `Path`/`drawPath` | `BlendMode.multiply` | `MaskFilter.blur`/`ImageFilter` | must `saveLayer` to isolate multiply (costly); reported multiply edge artefact (flutter#144227) |
| SwiftUI `Canvas` / CoreGraphics | `fill(Path)` nonzero | `.multiply` inside `drawLayer`/transparency layer | `addFilter(.shadow)` / `setShadow` (blur ≠ σ, calibrate) | AA/gamma slight diffs |
| Android `Canvas` | `Path` WINDING | **`Paint.setBlendMode(BlendMode.MULTIPLY)` API 29+**. `PorterDuff.Mode.MULTIPLY` is NOT equivalent (α = Sa·Da → washes vanish over transparent) | `setShadowLayer` / blur bitmap | `saveLayer` for isolation |
| Node build-time | `@napi-rs/canvas` 1.0.9 (Skia) — verified; `skia-canvas` equivalent | ✓ | ✓ | encode cost dominates (§4) |

Critical fidelity requirement: **multiply must be canvas-local** (blend with the critter's own cream sticker/washes, not with the screen behind). Naive `source-over` changes the art materially (Léon's head goes from multiplied rust to pale yellow; tanuki mask/tail overlaps lose depth) — `probe/fidelity-checks.png` top row. Any port needs an isolated layer (or pre-baked image).

## 3. Critter data model

### 3.1 CritterDex

`PL = [code, name, placeTier, [[city, name, species, spec], …]]` → `places[{code,name,tier,rank,rk,critters}]`, `list[150]`, `byId`. Critter = `{id 'cp-###', no, num '#001', name (local word/nickname, native script), species, city, place, code, tier, rank, spec, kind = spec.k || id}`. Ids are positional (`list.length+1`) — reordering data renumbers every critter.
- **Place tier** (set size, not rarity): 0 Vietnam home set (1 place × 10), 1 rank 1–10 (10 × 5 = 50), 2 rank 11–30 (20 × 3 = 60), 3 rank 31–60 (30 × 1 = 30). 61 places / 150 critters. `rank` = array index (Vietnam null). Source: 2024 UN Tourism arrivals, Macau excluded.
- Naming collision: place `tier` vs form tier (common/rare/epic/legendary). Rename in production (`setGroup` vs `rarity`).

### 3.2 Archetypes (`spec.b`) and pose support

| b | n | Variants (`v`) seen | Pose support |
|---|---|---|---|
| sit | 51 | bat monkey sheep puli capy pangolin loris sloth tarsier | wave/cheer/think arms; others extras only |
| bird | 24 | pigeon bulbul raptor owl kiwi penguin humming magpie goldfinch peacock rooster hoopoe duck pheasant hornbill gull raven | wave/cheer wings (not kiwi/humming/peacock) |
| stand | 20 | buffalo horse dachshund elephant camel guanaco giraffe moose cow | extras only |
| fish | 10 | carp tall shark puffer gold betta mud long | extras only |
| wader | 9 | swan float pelican flamingo | extras only |
| lizard | 7 | dragon croc smok komodo slim | wave/cheer (dragon arm always up) |
| bug | 6 | cicada hopper bee ladybug dragonfly scarab | extras only |
| frog 3, seal 3, whale 4, turtle 2, snake 2, crab 1, octo 1, nessie 1 | | tree/dugong/dolphin/orca/humpback/sea/naga | extras only |
| guides (`spec.k`) | 6 | gecko tanuki puffin axolotl sardine alpaca | gecko: all 6 incl. `point`; tanuki wave/cheer/think; puffin/axolotl wave/cheer; sardine/alpaca extras only |

"extras" = cheer spark lines / sleep "Z" / think dots, plus closed eyes for sleep. 15 archetypes, 77 archetype:variant combos. Every archetype supports blink (all eye helpers honour `o.closed`).

`spec` keys (count of critters): `b` 144, `c` 144, `v` 83, `ears` 60 (19 types), `tail` 47 (16), `muz` 40 (16), `acc` 40 (36 accessories: hats, neckwear, hand-held, props), `pat` 34 (28 patterns), `beak` 19 (+`bc` 13, `lc` 6), `mask` 12, `horns` 12 (10 types), `ec` 8, `ic` 9, `fcol` 6; geometry tweaks `hy hw hh bw er eg`; flags `mane tusks beard ring hair crest teeth red coat arms belly:0 pose fins`; colour overrides `hc hc2 mc tc tt snc sc`.

### 3.3 Colour

- Triplet `c = [f main, dk dark/spot, bl belly/light]`; runtime override via `fill/spot/belly`.
- Guides' palettes are **not in data** (hard-coded defaults inside `K.gecko` etc.; extra slots `accent`, `leaf`, `beak2`, `stripe` — last two not exposed as attrs).
- Hard-coded colours: 29 refs to constant `INK #221e19` (noses, toes) and 81 distinct hex literals in draw-1/2 (cheeks `#ff7fa8`, cat nose pink, accessories). ⇒ palette-only "mono/tinted" variants leak colour on locals (measured 1.6% off-palette px on Léon; pink cheeks/nose remain: `probe/mono-check.png`). Only `locked` mode yields a clean single-colour mask for every kind.

### 3.4 Forms (common / rare / epic / legendary)

Design copy: "Rare changes colour, epic adds a pose and a pink edge, and legendary goes gold and only shows on one day a year or for the hardest thing a place has." Actual markup:

| Form | Mechanism | Designed instances |
|---|---|---|
| common | default palette | all |
| rare | `fill/spot` override | Tokek `#54d6a4/#2e9a74` (card `#54d6a4`, "Temple Tokek", #112) |
| epic | recolour + `pose` + CSS 2px `#ff5fa8` ×4 drop-shadow edge | Tokek `#ff9a4d/#c4623e` + cheer (3m-2). 3m-7 row shows the same epic without pose/edge (inconsistent) |
| legendary | recolour + CSS 3px `#ffd84a` edge ("gold die-cut") | Sakura Pon `#ffc2d9/#c94f86/#fff1f6` + cheer (3l-10). Golden Tokek: only as locked gold silhouette (`sticker #3a2f14`, `locked #6b5a24`) |
| locked | `locked` silhouette | grey `#3a3466` on `#2c2750` sticker; gold `#6b5a24` on `#3a2f14` for legendary |

Tier accents: common label `#a9a3c0`, rare `#4f86ff`, epic `#ff5fa8`, legendary `#ffd84a`.
Gaps: no form data for 148 critters; recolour needs all 3 slots authored per form (probe: changing `fill` alone on Léon barely changes it because the multiplied mane dominates — `probe/renders/leon-2-rare-probe.png`); "epic adds a pose" impossible for 10/15 archetypes (fish with `pose=cheer` only gains spark lines: `probe/renders/chep-epic-probe.png`). Suggested render-spec per form: `{palette:{f,dk,bl,accent?}, pose?, edge: none|epic|legendary, accessory?, seed?}`; edge implemented as an extra outline ring in the sticker pass (width +2/+3 pt, tier colour) instead of 4 image filters.

### 3.5 Legendary windows (3l-9, only for guides)

Nov 1–2 Marigold Ajo (Día de Muertos, Mexico City); early Apr Sakura Pon (blossom peak, after dark); Jun 12 Festa Sardi (Santo António); Jun 24 Inti Paco (Inti Raymi); late Aug Puffling Lundi (Heimaey); any day Golden Tokek (crew challenge: all six on Batur by sunrise). None defined for the 144 locals.

### 3.6 Guides vs doodles kinds vs CritterDex

Six guides = CritterDex entries whose `spec.k` points at hand-drawn `doodles.js` kinds: cp-041 Ajo (axolotl, Mexico City, rank 7), cp-061 Pon (tanuki, Kyoto, 11), cp-076 Sardi (sardine, Lisbon, 16), cp-112 Tokek (gecko, Bali, 28), cp-145 Paco (alpaca, Cusco, 55), cp-148 Lundi (puffin, Reykjavík, 58). They are richer (more poses, accent/leaf slots) and account for most instances (gecko 228, tanuki 60, sardine 24, puffin 18, axolotl 14, alpaca 8). App icon, FAB, chat, LA, notifications, marketing all use guides; the 144 locals appear in Critterdex, detail, encounters, recap, store/site samples.

### 3.7 Icon set (`doodles.js`, non-creature, 28)

`egg`(+`crack`) `star flame lock chat cal pin bed ticket boat wallet bell sun rain spark plane car volcano wave temple camera food check heart` + annotation kinds with own viewBox `underline [100,14]`, `circle [100,50]`, `arrow [100,40]`, `squiggle [100,20]`. Stroke width 5–10 units (heavier than critters), optional `accent` wash, 700 ms draw-on. Mostly 12–24 pt in tab bars/chips (249 of 308 icon instances ≤24 pt). Sheet: `probe/icon-sheet.png`.

### 3.8 Distinct renders

Forms 150 × 4 = 600; locked silhouettes 150 × {grey, gold} = 300; closed-eye twins for anything that blinks (+600); guide poses 6 kinds × 4 forms × ≤6 poses ≈ 144; mono/mask variants for extension surfaces; × size buckets (line weight is size-dependent). Full static prerender of 600 forms + 300 silhouettes × 3 buckets (36/96/232 pt @3x) ≈ 2,700 images ≈ 55 MB WebP (q90) — not bundle-able; render on device + cache instead (§5.4).

## 4. Measurements

Env: Apple M3, Chromium 145 headless shell + new headless with Metal ANGLE (both gave the same numbers → canvas 2D was CPU-rastered in both), `deviceScaleFactor 3` (canvas 2.5×), unmodified design scripts. "4×" = CDP `Emulation.setCPUThrottlingRate 4` as a mid-range Android CPU proxy (not a device measurement). Timings = mean over repeats; "flush" = `draw` + `getImageData(1px)` forcing raster. Raw JSON: `probe/bench-shell.json`, `probe/bench-gpu.json`.

Per critter (median of 150):

| Metric | 96 pt (240² px) | 300 pt (750² px) | 96 pt @4× | 300 pt @4× |
|---|---|---|---|---|
| `setup()` (ops ×2 + outline record) | 0.17 ms | 0.35 ms | 0.67 ms | 1.6 ms |
| `draw(1)` JS only | 0.25 ms | 0.53 ms | 1.0 ms | 2.4 ms |
| `draw(1)` + raster (full frame) | **0.92 ms** | **6.5 ms** | **4.2 ms** | **29.5 ms** |
| mid-animation frame (p .15–.85) | 0.78 ms | 6.2 ms | 3.6 ms | 28.3 ms |
| first paint (create+setup+draw+raster) | 1.9–2.6 ms | 8.2–9.9 ms | 9.3–12.5 ms | 38–44 ms |
| icons (no sticker) full frame | 0.08 ms | 0.18 ms | 0.32 ms | 0.9 ms |

Worst critter: cp-118 (2,067 pts) 1.27 ms @96. Whole bestiary one-shot: Σ 139 ms (96 pt) / 980 ms (300 pt); @4× 634 ms / 4.4 s.

Frame cost breakdown, 300 pt, 1×: gecko sticker+shadow+multiply 7.4 ms; shadow blur off 4.3; no sticker multiply 1.1; no sticker source-over 0.67; **cached finished bitmap blit 0.23 ms**. Léon: 8.6 / 5.1 / 2.0 / 1.3 / 0.25. ⇒ sticker composite ≈75–85%, multiply +50–70% of the vector part; caching wins 30×.

Page-level draw-on (all elements animating simultaneously, rAF intervals over 1.8 s, 60 Hz cap):

| Scene | 1× fps (p95 ms) | 4× fps (p95 ms) |
|---|---|---|
| 1 × 300 pt | 60 (18.5) | 40 (35) |
| 4 × 232 pt | 60 | 20 (82) |
| 6 × 96 pt | 60 | 44 (35) |
| 12 × 96 pt | 60 | **25 (66)** |
| 40 × 96 pt | 32 (50) | 6.7 (252) |
| 88 × 96 pt | 15.5 (98) | 2.9 (517) |

Memory: 150 stickers @96 pt DPR3: canvas backing **69.1 MB** (2 × 240² × 4 B each); JS heap +18.6 MB (op arrays). 300 pt sticker = 4.5 MB.

JS geometry only (ops build + ribbon/polygon emission to a no-op ctx; `probe/geometry-bench.js`, same file in all engines):

| Engine (M3) | build open+closed / critter | full-frame geometry / critter |
|---|---|---|
| Node V8 JIT | 0.11 ms | 0.06 ms |
| V8 `--jitless` | 1.56 ms | 0.46 ms |
| Hermes 0.12 CLI (interpreter, arm64) | 1.28 ms | 0.61 ms |

⇒ on RN/Hermes ≈10× V8-JIT; mid-range Android estimate (3–5× M3) ≈ 4–6 ms build + 2–3 ms geometry per critter-frame. Fine for 1–2 hero critters; too slow for 150 cells at list mount or 12 simultaneous draw-ons (needs caching). Re-measure with current Hermes on a real device.

Node build-time prerender (`probe/node-prerender.mjs`, `@napi-rs/canvas` 1.0.9, unmodified scripts + DOM shim):
- Parity vs Chromium (same attrs): gecko 150 pt sticker mean abs 0.11/255, 0.02% px >8; Léon 0.14, 0.02%; cp-118 96 pt 0.42, 0.43%; tanuki 300 pt 0.06, 0.02%; icon pin 48 pt 0.06, 3.4% (small-size AA), max channel diff 64. Visually identical.
- Sweep 150 critters × {48, 96, 232, 512 pt} × {common, locked} = 1,200 PNGs in **36 s single-threaded**; render 2.5/2.8/3.6/5.5 ms, PNG encode 1.9/4.8/19.5/80 ms each (encode dominates → worker threads + WebP).
- Encoded size per image (@2.5×, 22-critter sample): 24 pt 4.7 KB PNG / 2.9 KB WebP q90; 48 pt 11.9 / 6.2; 96 pt 27.5 / 13.1; 232 pt 72.5 / 33.8; 512 pt 172 / 77. AVIF q80 reported 0.8–6.6 KB (suspiciously small; quality unverified). Locked mask 96 pt 6.3 KB PNG.

Renders (viewed): `probe/contact-sheet.png` (all below on one sheet), individual transparent PNGs in `probe/renders/`:
- Tokek 4 forms: `tokek-1-common`, `tokek-2-rare`, `tokek-3-epic` (pink edge), `tokek-4-legendary-locked` (design), `tokek-4-legendary-probe` (unlocked gold = probe palette from 4a-3 gold-cover gecko, not designed).
- Léon cp-013 4 forms (probe-applied rule): `leon-1-common`, `leon-2-rare-probe`, `leon-3-epic-probe`, `leon-4-legendary-probe`; `chep-epic-probe` (fish can't pose). Pon: `pon-1-common`, `pon-4-legendary-sakura`, `pon-legendary-locked`.
- 6 guides: `guide-gecko|tanuki|puffin|axolotl|sardine|alpaca`.
- Extension variants: `var-locked-mask`, `var-appicon-tinted`, `var-appicon-mono`, `var-stamp`, `var-guide-fab`; draw-on `drawon-0p15…drawon-1`, `blink-closed`, `small-24-native` vs `small-300-scaled`.
- `probe/fidelity-checks.png` (multiply vs source-over, minW, facets), `probe/mono-check.png`, `probe/icon-sheet.png`.

## 5. Port strategy

### 5.1 Options

| | (a) TS core + renderer interface | (b) Native rewrite (Dart / Swift / Kotlin) | (c) Pre-rendered sprites/frames | (d) WebView |
|---|---|---|---|---|
| Fidelity | Identical: same code; Skia everywhere (measured parity) | Near (golden-test needed; CG/Impeller/Android blend & AA diffs, PorterDuff trap) | Identical per size bucket; no draw-on unless frames | Identical |
| Runtime, mid-range Android | Lists/idle: cached `SkImage` blits (~0). Hero draw-on: est 2–3 ms JS + GPU paths → 1–2 simultaneous at 60 fps | Best for animated scenes (geometry ~10× Hermes) | Best (blits); blink = 2-image swap | Worst: CPU canvas raster (proxy: 12 × 96 pt draw-on = 25 fps, 1 × 300 pt = 40 fps @4×) + 30–60 MB per WebView |
| Extensions (widgets/LA/NSE) | Need baked images (JS can't run there) | Swift port can draw natively in widget/NSE; Kotlin in Glance only as bitmaps | ✓ | ✗ |
| Web/site + build pipeline | Same core (Canvas2D / Node) | Still needs JS → 2–3 implementations drift | Pipeline needs a renderer anyway | ✓ web only |
| Bundle | Core ~42 KB gz + RN Skia (+6 MB iOS, +4 MB Android, web 2.9 MB wasm) | Code only | 600 forms × buckets ≈ 55 MB WebP (CDN/on-demand) | WebView runtime |
| Effort (render engine only) | 33–46 pd (breakdown §7) | Flutter ≈ 30–40 pd; Swift+Kotlin ≈ 40–55 pd; + ongoing sync | 8–12 pd (loses draw-on/dynamic forms) | 2–4 pd prototype; not production |

Recommendation: **(a) + (c)**. One TS source of truth; runtime Skia for animated/hero; baked bitmaps for every static/extension surface, produced either at build time (Node) or on device (Skia snapshot → App Group / files dir). If the stack becomes Flutter or native, port only the runtime backend path and keep the TS core for web + pipeline, with CI golden tests (Chromium references from the untouched design scripts).

### 5.2 Surfaces → output

| Surface | Sizes seen | Output | Notes |
|---|---|---|---|
| In-app hero (hatch 3l-1, encounter 3l-4/10, befriended 3l-6, detail 3l-3 form spin, guide pitches, offline 3k-4) | 150–260 pt | Runtime vector, draw-on once → bake to image; blink = swap 2 cached images; idle = view transforms (tg-motion) | Limit concurrent draw-ons to ≤2; others fade/pop |
| Critterdex / lists / chips / chat avatars / FAB | 24–96 pt | Cached bitmap per (kind, form, pose, variant, seed, bucket, scale); LRU mem ~25 MB + disk | Pre-warm visible set; no per-cell canvas |
| Home/lock-screen widgets, StandBy (5c-1..6) | 18–110 pt | Static PNG from App Group (app writes) or bundle; `locked`-mask variant for accented/tinted/vibrant (`widgetAccentedRenderingMode(.accented/.desaturated)`), StandBy night = mask | Lock-screen widgets render vibrant/monochrome: design's full-colour 5c-3 stickers not achievable; widget ext ≈30 MB memory |
| Live Activities / Dynamic Island (5a) | 32–60 pt | Bundled in widget-extension asset catalog or pre-written to App Group; ≤ presentation size (minimal ≤45×36.7 pt) | Push-updated LAs can't wait for the app: guide avatars + 150 critter silhouettes (5a-4 critter nearby) must pre-exist (~0.6 MB masks) |
| Notifications (5b) | 34 pt | iOS communication-notification sender avatar (INImage) via NSE from App Group/bundle, per guide × chosen form ("make it my guide" skin); Android `Person` icon bitmap; Android small icon = monochrome vector (stamp variant → VectorDrawable) | |
| Alternate app icons (3n-5: 4 styles × light/dark/tinted + 6 earned critter icons) | 1024 px | Build time only (must be bundled): iOS icon sets/Icon Composer layers; Android adaptive (fg/bg) + monochrome (alpha, stamp variant) via `activity-alias` | Tinted = grayscale art (App Icon `gk.tinted`); Android mask shapes need 66/108 safe zone (design uses 0.8 scale) |
| Share cards (3l-3 ↗, recap 3m, stories 1080×1920) | 200–400 pt | On-device Skia snapshot | |
| OG images / invite previews | 1200×630 | Server/edge Node + same core (+ layout via Satori/Playwright) cached by hash | |
| Marketing site | 30–260 pt | Core Canvas2D backend (original behaviour: IO-lazy draw-on, reduced motion) + static WebP fallback for LCP/no-JS | Avoid CanvasKit on web (2.9 MB; RN Skia web `PictureRecorder` failure reported Sept 2026, Expensify#102042) |
| Store assets / social kit | up to 620 px CSS | Build time: Playwright screenshots of the existing HTML templates, or Node renders composited | |

### 5.3 Core design (TS)

- Pure modules: `rng`, `spline`, `shapes` (E/blob/fluff/tube/bez/crs), `ribbon`, `ops` builder (DSL `line/stroke/wash/fill/dot`), `archetypes/*`, `guides/*`, `icons/*`, `data/critters` (+ new `forms`). Float32Array points; no DOM.
- API sketch:

```ts
type Spec = { kind: string; pose?: Pose; palette?: Partial<Palette>; locked?: string; sticker?: { color: string; w?: number }; edge?: 'epic' | 'legendary'; blend?: 'multiply' | 'srcOver'; seed: number; closedEyes?: boolean };
type Cmd = | { t: 'poly'; pts: Float32Array; color: string; alpha: number; blend: Blend; dx?: number; dy?: number }
           | { t: 'polyline'; pts: Float32Array; closed: boolean; width: number; join: 'miter' | 'round'; color: string; alpha: number; blend: Blend }
           | { t: 'layer'; cmds: Cmd[]; shadow?: { dy: number; sigma: number; color: string }; alpha: number };
function build(spec: Spec, sizePt: number): Model;            // ops + precomputed ribbon L/R arrays
function frame(model: Model, p: number): Cmd[];                 // p = eased draw-on progress 0..1
interface Backend<T> { render(cmds: Cmd[], sizePx: { w: number; h: number; scale: number }): T; }
```

- Draw-on without per-frame trig: truncated ribbon = prefix of the full ribbon's L/R arrays (widths use `nFull`), except the last vertex → precompute once, slice per frame.
- Backends: Canvas2D (web + Node), RN Skia (record `SkPicture` per (spec,bucket) → `makeImageSnapshot`/offscreen surface → cache; avoid per-vertex JSI: build paths from flat arrays / `MakeFromCmds`), optional SVG export for icons (polygons only → SVG/PDF/VectorDrawable per size bucket).
- Sticker/edges: outline pass (existing), tier edge = second outline ring beneath; shadow as layer filter; everything baked into the cached image.

### 5.4 Asset pipeline (build time)

CLI `critter-render` (Node ≥22, `@napi-rs/canvas`, worker_threads) + manifest `{kind|all, forms, poses, variants: color|mask|stamp, sizesPt, scales, crop: none|face|circle, bg?, format}` → writes `ios/*.xcassets` (imagesets/appiconsets), `android/res/drawable-*` + adaptive icons, `web/public/critters/*.webp` (+srcset), OG templates. CI: golden job renders reference set in Chromium from the untouched design scripts and diffs (thresholds: mean abs <0.5/255, >8/255 px <1%; icons ≤24 pt looser).

Budget:

| Tier | Contents | Est. size |
|---|---|---|
| A: bundled in app/extensions | 6 guides × 4 forms × {idle, cheer, sleep} × {48, 96 pt} @3x × {color, mask}; 150 silhouettes (mask) @60 pt; notification avatars 6×4; ~30 app icon sets | ~6–10 MB PNG (less with HEIF in asset catalogs); icons per store guidance |
| B: on-device cache (Skia render → disk/App Group) | any (kind, form, pose, variant, bucket 36/96/232 pt) on demand | disk cap ~60 MB, memory LRU ~25 MB |
| C: web/CDN | marketing WebP fallbacks, OG, store/social exports | per page |

Full prerender of everything (600 forms + 300 silhouettes × 3 buckets) would be ≈55 MB WebP @3x (Android densities extra) → only viable as CDN, not bundle; runtime vector makes it unnecessary.

## 6. tg-* elements

- **tg-motion** (303 instances; presets bob 38, float 31, wiggle 17, hop 16, ping 15, blink 15, grow 14, pulse 13, spin 4, marquee 3, rise 2; 147 custom `kf`). DSL `"off: tx ty(px|%) s sx sy r(deg) o e=in|out|io|lin|back; …"` → WAAPI keyframes, transform order translate→rotate→scale, easing per keyframe segment, overall `linear`, `iterations: Infinity`, **`startTime = 0` so every loop shares the document clock** (phase-locked across elements); `stagger` animates children with index delays; `origin`; `iter="1"` once; reduced motion → none. Port: compile DSL at build time to keyframe JSON → Reanimated 4 CSS animations (per-keyframe `animationTimingFunction` supported) with negative delay = −((now − appEpoch) mod dur) to emulate the global clock; `%` translate relative to element size (verify RN support, else measure via onLayout). Flutter: one `Ticker` + `TweenSequence`. Widgets/LA: none (static).
- **tg-confetti** (10): canvas overlay, burst of `count` (70) particles each `period` at phase `at` when visible, colours `#ffd84a,#ff5fa8,#4f86ff,#54d6a4,#f4efe4,#ff9a4d`, gravity .32/frame, drag .985, life −.009/frame, flip via `scale(1, cos 2r)`. Physics per **frame, not dt** → 2× speed on 120 Hz. Prototype has a second copy (`confetti(x,y,n)`, 90–140 particles). Port: one Skia overlay, dt-normalised, per-particle transformed rects (flip is non-uniform → Skia `drawAtlas` RSXform can't express it; 140 rect draws are trivial), trigger-based in app (not periodic), + haptic thud.
- **tg-count** (12): plain 1 Hz countdown text from a static `from` seconds, formats `dhms` ("4D 03:12:08"), `hms`, `ms`. Not an odometer (price odometer is prototype-only, 4e). Port: derive from a target timestamp (server time), tabular digits (Geist Mono); widgets/LA use `Text(timerInterval:)`/`.timer` (no days format → static "4D" + timer), Android `Chronometer` countdown in RemoteViews.
- **tg-type** (4): typewriter `speed` ms/char (+260 ms after `, . ?`), `hold` then retype loop, ghost copy reserves final layout, caret 480 ms blink. `s.slice(0,i)` splits surrogate pairs/combining marks → use grapheme segmentation (Vietnamese/emoji). Product use = guide text / LLM streaming: decouple reveal rate from network chunks, full text to accessibility immediately, reduced motion = instant.

## 7. Risks, effort, open questions

Risks:
1. Forms content: ~590 undefined forms; rules not expressible for fish/bug/whale/etc. (no poses) → art direction + new pose mechanics (tilt/hop transform, accessory, extras) before engineering can finish.
2. Fidelity traps: canvas-local multiply (needs layer isolation), Android PorterDuff multiply, size-dependent line weight (per-bucket renders), wobble tied to tessellation index, seed/op-order sensitivity, miter wash edges.
3. Perf: per-frame vector redraw of many stickers (measured 25 fps @12 × 96 pt at 4×); JS geometry on Hermes ~10× V8; must cache and cap concurrent draw-ons.
4. Memory: design approach 69 MB/150 stickers; widget ext 30 MB; LA image size limits.
5. Colour leakage: hard-coded INK/cheek/accessory colours break mono/tinted variants → use `locked` masks; locals ignore `accent`.
6. Seeds inconsistent across screens; `cp-###` ids positional; guide cp-ids not renderable as `kind`.
7. RN Skia bundle weight (+6/+4 MB), web CanvasKit issue (Sept 2026).
8. Frame-rate-dependent confetti; blink ignores reduced motion; no accessibility labels on canvases.
9. Name/IP check for a few locals (e.g. Berlin "Buddy bear" is a trademarked art project).

Effort, recommended (a)+(c), render/motion engine only (person-days): TS core extraction + typing 5–7; golden harness (Chromium refs) 3; Canvas2D/Node backend 1; render CLI + manifests + platform outputs 5–7; RN Skia backend (picture/image cache, draw-on prefix, blink swap, sticker/edge/shadow, clock) 7–10; form data model + preview gallery 3–4; extension image plumbing (App Group, Glance bitmaps, mask variants) 4–6; tg-motion 2–3, confetti 1–2, count + LA timers 1–2, type 1–2. **Total ≈33–46 pd** (+ content/art time for 600 forms, excluded).

Unresolved questions:
1. App stack decision (RN/Expo vs Flutter vs native) — determines backend (5.1); recommendation assumes RN + Skia.
2. Who authors the ~590 missing forms (palettes, poses, names, notes) and what "epic adds a pose" means for pose-less archetypes?
3. Golden Tokek unlocked art (only a locked silhouette exists); are all 150 critters meant to have a legendary + window, or only the 6 guides?
4. Canonical seed per critter/form (design uses 7, `c.no`, 41–46, ad-hoc) — which one ships?
5. Should the blink on-seed jitter (dotEyes/octo/axolotl) be preserved or fixed?
6. Lock-screen widgets are drawn full-colour in 5c-3; accept system vibrant/mask rendering?
7. Tier edge: keep CSS-like 4-offset dilation look or use an outline ring (slightly rounder)?
8. Is the draw-on animation required in lists (Critterdex) or only on hero screens? (Perf data says hero only.)
9. Epic presentation inconsistency (3m-7 epic without pose/edge) — bug or intentional small-size simplification?
10. Hermes/device numbers: need on-device measurement (mid-range Android, e.g. Snapdragon 6-series) before locking the concurrency cap.
11. Offline/first-launch: acceptable for Critterdex thumbnails to render on device (few seconds total at mid-range) or ship a bundled 36 pt set (~3.6 MB WebP for 600 forms)?
