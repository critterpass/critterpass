# Licenses

Every sound and music file under `packages/sound-art/out/` is synthesised entirely in-house from the
TypeScript source in `packages/sound-art/src/` (`pnpm --filter @cp/sound-art bake`).

- No audio samples of any kind (no recorded instruments, no foley, no field recordings).
- No third-party sound libraries, sample packs, loop packs or stock music.
- No third-party audio synthesis engines, plugins or SDKs — the oscillators, envelopes, noise
  generators, filters, FM/additive/Karplus-Strong synthesis, reverb/delay, mixer, limiter and
  sequencer are all original code in this package (see `docs/decisions/<date>-in-house-procedural-audio.md`
  for the method).
- Scale/style references (pelog, slendro, the Japanese "in" scale, fado, Andean pan flute and
  charango, gamelan metallophone timbre, etc.) are used only as stylistic inspiration for original
  compositions; no melodies, recordings or notated scores were copied.

© Critterpass. All sound and music assets in this package are original works owned by Critterpass.
