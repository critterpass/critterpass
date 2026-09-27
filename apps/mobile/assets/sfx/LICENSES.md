# SFX asset licences

Tracks every bundled clip's source and licence. Populate one row per file as each licensed asset
lands in this directory (never commit an asset before it has a row here).

| File | Cue id(s) | Source | Licence | Notes |
|---|---|---|---|---|

## Current state

No SFX assets are licensed yet (plan §"Non-code dependencies": ~40 clips across 6 families — thud,
slap, peel, chimes, flap, ambient — owner: founder, licence or commission). Until they land:

- `src/motion/feedback/sfx-pool.ts`'s `SFX_ASSET_MODULES` map is empty, so every `sfx`/`ambient` cue
  plays its haptic only (no crash, no missing-file error).
- `tools/scripts/check-audio-assets.ts --mode release` fails the build on this gap; `--mode pr`
  (the default in CI outside a release build) only warns.
- Never commit a `.caf`/`.m4a`/`.ogg` file here without a matching row above recording its licence.
