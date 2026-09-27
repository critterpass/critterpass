# In-house procedural audio (`@cp/sound-art`)

Date: 2026-09-27
Status: decided (founder). Named themes (Tokek, Pon, Lundi) are final; the three proposed themes
(Ajo, Sardi, Paco) and the design-system Q3/Q4 defaults below need a founder listening pass before
they're treated as final (`plans/reports/critterpass-builder-260927-1415-in-house-procedural-audio-report.md`).

## Context

Critterpass's sound effects and music were an open licensing/commissioning dependency
(phase-06-motion-feedback-gestures.md "Non-code dependencies": SFX library licence, 6 music themes,
critter chirp audio — all launch gates owned by the founder). The founder decided today to compose
every sound in-house and procedurally instead: the same "drawn from code, not licensed" approach
already used for the critters (`packages/critter-art`), with no samples and no third-party audio.

## Decision

- A pure-TypeScript deterministic synthesis core, `packages/sound-art` (`@cp/sound-art`): every sound
  is code + a string seed, never a recorded sample. Same seed → bit-identical PCM, always (this is
  what makes the bake `--check` mode possible).
- Output is mono Float32 PCM at 48 kHz throughout (see "Why mono" below).
- A bake CLI (`pnpm --filter @cp/sound-art bake` / `--check`) renders every cue/theme, loudness-
  normalises, verifies clean loop seams, and writes the platform files + a manifest.
- A generated static listening gallery (`packages/sound-art/gallery/`) for founder review — nothing
  ships to the app until the founder has listened.
- The app never reads `@cp/sound-art`'s TypeScript at runtime; it plays the baked files the same way
  it already expected to (see "Wiring into the app").

## Method (synthesis core, `src/core/`, `src/loudness/`)

| Building block | File | Notes |
|---|---|---|
| Seeded PRNG | `core/prng.ts` | mulberry32 seeded from an FNV-1a string hash; every cue/theme/note derives a `childSeed` so sub-parts stay independent but reproducible |
| Oscillators | `core/oscillator.ts` | sine/triangle/saw/square/pulse, phase-accumulator so pitch sweeps stay continuous |
| Envelopes | `core/envelope.ts` | ADSR + breakpoint curves + exponential decay |
| Noise | `core/noise.ts` | white/pink (Paul Kellet)/brown, seeded |
| Filters | `core/filter.ts` | RBJ cookbook biquads (LP/HP/BP/notch/peaking/shelf/allpass), both one-shot and stateful (`BiquadFilter`) for swept filters |
| FM | `core/fm.ts` | 2-operator phase-modulation synthesis |
| Additive | `core/additive.ts` | inharmonic-partial synthesis for bells/metallophones (gamelan, marimba) |
| Karplus-Strong | `core/karplus-strong.ts` | plucked strings (koto, guitar, charango) |
| Effects | `core/effects.ts` | delay, a small Schroeder reverb (parallel combs → series allpasses), a soft-clip limiter, and a linear-envelope feed-forward compressor (sustained/bus material only — no look-ahead, so it is not used for transient-heavy cues/themes; see its doc comment) |
| Mixer / loop seam | `core/mixer.ts` | multi-track mixing; `makeLoopSeamless` crossfades a loop's tail into its own head and forces the exact wrap sample equal, so a loop never clicks at the repeat point |
| True peak | `loudness/peak.ts` | cubic-Hermite 8x oversampled peak estimate (a practical approximation of a BS.1770 true-peak meter without a resampling library) |
| Integrated loudness | `loudness/lufs.ts` | BS.1770-4 K-weighting (standard 48 kHz coefficients) + 400 ms/75%-overlap gated blocks + absolute (-70 LUFS) and relative (-10 LU) gating |

Music (`src/music/`) adds a small sequencer (`sequencer.ts`: tempo, swing, step patterns, seeded
humanisation of timing/velocity), a scale table (`scale.ts`: pelog, slendro, the Japanese "in" scale,
plus Western pentatonic/modal scales) and a shared instrument palette (`instruments.ts`) built purely
from the primitives above (metallophone/marimba = additive; koto/guitar/charango = Karplus-Strong;
reed/pan-flute = oscillator+noise blends). `render-theme.ts` composes a guide's sections into one
seamless loop plus a short preview clip.

**Non-equal-tempered scale approximations.** Pelog, slendro and the Japanese "in" scale are not
12-TET in the real instruments. `scale.ts`'s cent tables are documented Western approximations chosen
for a lo-fi mobile app, not ethnomusicological transcription — this is a deliberate simplification,
not a bug, and is called out again in the founder listening notes.

**Why mono.** Every cue and theme renders single-channel audio. This keeps the synthesis core,
determinism hashing and loudness measurement simple (YAGNI: nothing in the spec asked for stereo
width, and the app's SFX pool/music player don't need it either). If a future pass wants stereo
(e.g. a wider music mix), it is an additive change to `render-theme.ts`'s output stage, not a
rearchitecture.

## Loudness and peak targets

- **SFX/ambient/notify cues**: normalised to a **family target LUFS** (so every cue in a family reads
  at a consistent level regardless of which one plays), then a **true-peak ceiling of −1 dBTP** is
  applied on top, always. Family targets (`scripts/manifest-types.ts`): stickers-and-stamps −16 LUFS,
  effects −18 LUFS, critter-voices −20 LUFS, per-guide notify motifs −16 LUFS.
- **Music themes**: target **−16 LUFS integrated**, with the same **−1 dBTP** true-peak ceiling taking
  precedence when they conflict. A sparse, plucked arrangement (Pon's koto, Sardi's solo guitar waltz)
  can have gated integrated loudness far below its transient peaks; forcing exactly −16 LUFS on such a
  piece would require a make-up gain that clips. Peak safety always wins — this is standard mastering
  practice for dynamic/ambient material, not a shortfall. The founder report records each theme's
  actual measured LUFS so this is visible, not hidden.
- **Loop seams**: `makeLoopSeamless` + a bake-time check (`measureLoopSeam`) guarantee the wrap-point
  sample is bit-identical between a loop's end and its start. True seamlessness at the musical level
  (no audible discontinuity, not just no click) comes from composing whole-bar sections that already
  repeat cleanly — the crossfade is the final safety net, not the mechanism.

## Formats and the bake pipeline

`scripts/bake.ts` renders every cue/theme in memory (deterministic PCM), then shells out to `ffmpeg`
(via a minimal intermediate WAV, `scripts/wav.ts`/`scripts/encode.ts`) to produce:

- `sfx/<name>.caf` — uncompressed 16-bit PCM in a Core Audio Format container, what iOS expects for
  short SFX (as `sound.tokens.json` already names them).
- `sfx/<name>.ogg` — **Ogg Opus**, not Ogg Vorbis: this environment's ffmpeg build has no `libvorbis`
  encoder, and Opus is arguably the better fit anyway (lower latency, good quality at low bitrate);
  Android's `MediaExtractor`/ExoPlayer both play Ogg-encapsulated Opus natively. If a future machine's
  ffmpeg build only has `libvorbis`, swap the codec in `scripts/encode.ts` — the manifest/hash pipeline
  doesn't care which codec produced the `.ogg`.
- `music/<guide>.m4a` / `music/<guide>-preview.m4a` — AAC.

`--check` re-renders every cue/theme in memory and compares **PCM content hashes** (SHA-256 of the
16-bit-quantised samples, `core/hash.ts`) against the committed `out/manifest.json` — never the
encoded file bytes, which vary by ffmpeg version/build across machines. This is what makes CI stable
across different developers' machines.

## How to add or iterate a cue

1. Add (or edit) a render function in `src/cues/<family>.ts` (or `src/music/themes/<guide>.ts` for a
   theme), built from the `core/` primitives, seeded with a stable string (`sfx:<id>:v1`) so re-runs
   are reproducible. Bump the seed's version suffix if you want a deliberately new take on an existing
   cue without touching its id.
2. Register it in `src/cues/registry.ts` (SFX/ambient) or `src/music/registry.ts` (themes).
3. `pnpm --filter @cp/sound-art test` — new logic needs unit tests (bounds: finite, peak, DC offset,
   duration; determinism: same seed twice).
4. `pnpm --filter @cp/sound-art bake` — regenerates `out/` and the gallery, and updates the committed
   manifest (new/changed PCM hashes).
5. Listen in the gallery (`packages/sound-art/gallery/index.html`, served over any static file server
   — audio elements need `http://`, not `file://`) before asking for founder sign-off.

## Founder review gate

Nothing here ships to the app until the founder has listened via the gallery and approved:

- The 3 named themes (Tokek, Pon, Lundi) as composed.
- The 3 **proposed** themes (Ajo — marimba lo-fi; Sardi — fado-style plucked guitar waltz; Paco —
  Andean pan flute + charango) — proposals, not final, per `docs/design-system.md` open question 3.
- The critter chirp and the 6 per-guide notification motifs (design-system open question 4's default:
  `assets/sfx/notify-<guide>.caf/.ogg`, a short motif built from that guide's own theme instrument).

## Wiring into the app (for the controller, once this branch merges)

This phase deliberately does **not** write into `apps/mobile/assets/` — that tree is owned by the
still-open motion-feedback-gestures branch. Once both merge:

1. Copy `packages/sound-art/out/sfx/*.{caf,ogg}` into `apps/mobile/assets/sfx/`.
2. Copy `packages/sound-art/out/music/*.m4a` into `apps/mobile/assets/music/`.
3. Add one `require('../../../assets/sfx/<file>')` entry per cue to
   `apps/mobile/src/motion/feedback/sfx-pool.ts`'s `SFX_ASSET_MODULES`, and one entry per guide to
   `apps/mobile/src/motion/music/themes.ts`'s `MUSIC_ASSET_MODULES` (+ `MUSIC_SAMPLE_MODULES` for the
   `-preview.m4a` clips), matching the `sound.tokens.json` asset paths (already correct — this
   package's `assetBasename`s are derived from the same token file).
4. Set each guide's `available: true` (and `asset`/`sampleAsset` paths) in
   `apps/mobile/assets/music/manifest.json`.
5. Run `tools/scripts/check-audio-assets.ts --mode release` — it should pass once every cue and guide
   is wired.
