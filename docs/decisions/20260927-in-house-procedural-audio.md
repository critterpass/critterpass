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
| Effects | `core/effects.ts` | delay, a small Schroeder reverb (parallel combs → series allpasses), a soft-clip limiter, and a linear-envelope feed-forward compressor. With `makeupDb: 0` (the only way this package uses it) it can only ever attenuate, so it is safe as a crest-factor reducer ahead of the limiter even on transient-heavy material — see its doc comment for why a non-zero make-up gain would not be |
| Look-ahead limiter | `core/limiter.ts` | brick-wall sample-peak limiter via an O(n) forward sliding-window minimum of the per-sample "gain needed" curve (the offline equivalent of a real-time limiter's look-ahead delay line — no signal delay needed since the whole buffer is already in memory) plus a release-only recovery; provably never produces an over (see its doc comment) |
| Mixer / loop seam | `core/mixer.ts` | multi-track mixing; `makeLoopSeamless` crossfades a loop's tail into its own head and forces the exact wrap sample equal, so a loop never clicks at the repeat point |
| True peak | `loudness/peak.ts` | cubic-Hermite 8x oversampled peak estimate (a practical approximation of a BS.1770 true-peak meter without a resampling library) |
| Integrated loudness | `loudness/lufs.ts` | BS.1770-4 K-weighting (standard 48 kHz coefficients) + gated blocks (the standard 400 ms/100 ms block/hop when a cue is long enough to fit one; a proportionally smaller 20 ms/5 ms block/hop below that, so a short click-train cue's silent gaps are still gated rather than diluting its measured loudness) + absolute (-70 LUFS) and relative (-10 LU) gating |
| Loudness matching | `loudness/match.ts` | `matchLoudnessWithLimiter`: iteratively re-measures loudness and applies gain + the look-ahead limiter (not a single global gain) until convergence, with an optional one-time, attenuation-only compression pass first to narrow a sparse/plucked arrangement's crest factor. This is what lets a peaky cue/theme reach its loudness target without sacrificing level the way a single static gain would — see "Loudness and peak targets" |

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

- **SFX/ambient/notify cues**: matched to a **family target LUFS** (so every cue in a family reads at
  a consistent level regardless of which one plays), within **±1.5 LU**, with a **true-peak ceiling of
  −1 dBTP** that always wins if the two conflict. Family targets (`scripts/manifest-types.ts`):
  stickers-and-stamps −16 LUFS, effects −18 LUFS, critter-voices −20 LUFS, per-guide notify motifs
  −16 LUFS.
- **Music themes**: matched to **−16 LUFS integrated within ±1 LU**, same **−1 dBTP** ceiling.
- **Peak safety by limiting, not by giving up loudness.** The first version of this pipeline held the
  peak ceiling with a single global gain reduction once loudness-normalising overshot it — correct for
  peak safety, but it meant a sparse/plucked arrangement (Pon's koto, Sardi's solo guitar waltz, and
  short click-train SFX like `flap`/`shutter`) landed 6–10 LU under its target, since their gated
  integrated loudness sits far below their transient peaks and a single gain has to back off for the
  worst peak in the whole file. `loudness/match.ts`'s `matchLoudnessWithLimiter` fixes this properly:
  a **look-ahead brick-wall limiter** (`core/limiter.ts`) reduces gain only in the local vicinity of a
  peak that actually needs it, so the rest of the material keeps the loudness gain the quiet parts
  need. An optional one-time, **attenuation-only** compression pass (`makeupDb: 0`, so it can never
  overshoot) narrows a sparse arrangement's crest factor first, for cases the limiter alone can't fully
  close. Two things made a real difference in practice, both fixed in this pass: (1) `integratedLufs`
  originally fell back to a plain whole-buffer mean square for any cue under BS.1770's 400 ms block —
  true of almost every SFX cue in this package — which measured a click-train's *silence* along with
  its clicks; it now gates with a proportionally smaller 20 ms/5 ms block/hop below 400 ms instead.
  (2) the limiter's sample-peak ceiling needs a margin below the true (inter-sample) peak ceiling — an
  empirically-tuned 1.4 dB for this package's material — or the final true-peak safety-net correction
  (needed occasionally regardless) claws back most of the loudness the limiter just fought to keep.
  Every value in the table below is from the current bake (`out/manifest.json`); none needed the
  final safety-net correction to reach it, meaning the limiter's own ceiling already held.
- **Keeping transients musical.** The limiter's look-ahead means its gain reduction begins before a
  peak, not reactively after it — the opposite of a naive compressor's attack-lag artifact, and the
  reason a Karplus-Strong pluck's attack isn't audibly softened. Release is slow enough (120–200 ms)
  that gain recovery is inaudible rather than pumping; `core/limiter.test.ts` asserts the gain curve
  never oscillates (dips, then rises monotonically back toward 1, never dips again mid-recovery) for a
  single isolated transient, which is what "no pumping" means in code.
- **Loop seams**: `makeLoopSeamless` + a bake-time check (`measureLoopSeam`) guarantee the wrap-point
  sample is bit-identical between a loop's end and its start. True seamlessness at the musical level
  (no audible discontinuity, not just no click) comes from composing whole-bar sections that already
  repeat cleanly — the crossfade is the final safety net, not the mechanism. It runs after loudness
  matching (whose per-sample limiter gain can differ a hair between the two ends), so peak safety is
  re-checked once more afterwards rather than assumed.

### Loudness table (current bake, `out/manifest.json`)

| Theme | Duration | LUFS | dBTP |
|---|---|---|---|
| Tokek | 77.8 s | −16.00 | −2.40 |
| Pon | 65.5 s | −16.11 | −1.00 |
| Lundi | 82.8 s | −16.00 | −2.41 |
| Ajo | 78.3 s | −16.01 | −2.04 |
| Sardi | 68.6 s | −16.26 | −1.11 |
| Paco | 75.0 s | −16.00 | −7.08 |

All 6 themes land within ±0.26 LU of −16 LUFS (target ±1 LU) at ≤−1 dBTP. All 23 SFX cues land within
±1.19 LU of their family target (target ±1.5 LU; the widest is `snap` at −19.19 LUFS vs. a −18 LUFS
target); all 6 notify motifs land within ±0.07 LU of −16 LUFS. Full per-cue figures are in
`out/manifest.json` and the founder report.

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
