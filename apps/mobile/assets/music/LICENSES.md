# Music theme licences

Tracks every guide theme's source and licence. Populate one row per file as each licensed track
lands in this directory (never commit a track before it has a row here).

| Guide | File | Source | Licence | Notes |
|---|---|---|---|---|
| Tokek | tokek.m4a / tokek-preview.m4a | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | final |
| Pon | pon.m4a / pon-preview.m4a | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | final |
| Lundi | lundi.m4a / lundi-preview.m4a | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | final |
| Ajo | ajo.m4a / ajo-preview.m4a | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | pending founder listening-gallery approval |
| Sardi | sardi.m4a / sardi-preview.m4a | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | pending founder listening-gallery approval |
| Paco | paco.m4a / paco-preview.m4a | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | pending founder listening-gallery approval |
| Chà Vá | chava.m4a / chava-preview.m4a | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | pending founder listening-gallery approval |

## Current state

Every guide theme is composed in-house and procedurally by `@cp/sound-art`
(`packages/sound-art`), never a licensed or commissioned recording
(`docs/decisions/20260927-in-house-procedural-audio.md`):

- `manifest.json` lists every guide with `"available": true` and their `asset`/`sampleAsset` paths.
- `src/motion/music/themes.ts`'s `MUSIC_ASSET_MODULES`/`MUSIC_SAMPLE_MODULES` have one entry per
  guide.
- `tools/scripts/check-audio-assets.ts --mode release` passes: every guide's asset file exists
  under this directory.
- Ajo, Sardi, Paco and Chà Vá are wired and playable, but `manifest.json`'s
  `pendingFounderApproval: true` on those four rows records that they still need the founder's
  listening-gallery sign-off (`docs/decisions/20260927-in-house-procedural-audio.md` §"Founder
  review gate") before they're treated as final — this does not block wiring or playback.
- Never commit a `.m4a`/`.ogg` file here without a matching row above recording its licence.
