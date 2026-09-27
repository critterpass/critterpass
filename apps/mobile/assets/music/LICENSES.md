# Music theme licences

Tracks every guide theme's source and licence. Populate one row per file as each licensed track
lands in this directory (never commit a track before it has a row here).

| Guide | File | Source | Licence | Notes |
|---|---|---|---|---|

## Current state

None of the 6 guide themes are licensed yet (plan §"Non-code dependencies": 3 named — gamelan
lo-fi, koto and rain, slow sea shanty — plus 3 commissioned; owner: founder, commission/licence).
Until they land:

- `manifest.json` lists all 6 guides with `"available": false` and no `asset` module.
- `src/motion/music`'s theme picker hides a guide's theme card at `available: false` (runtime safety
  only — this is not the release gate).
- `tools/scripts/check-audio-assets.ts --mode release` fails the build until all 6 are `available:
  true` with a licensed file; `--mode pr` only warns.
- Never commit a `.m4a`/`.ogg` file here without a matching row above recording its licence.
