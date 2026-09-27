# SFX asset licences

Tracks every bundled clip's source and licence. Populate one row per file as each licensed asset
lands in this directory (never commit an asset before it has a row here).

| File | Cue id(s) | Source | Licence | Notes |
|---|---|---|---|---|
| thud-heavy.caf / .ogg | thud.heavy | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| thud-soft.caf / .ogg | thud.soft | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| slap.caf / .ogg | slap | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| peel.caf / .ogg | peel | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| whoosh.caf / .ogg | whoosh | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| tick.caf / .ogg | tick | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| snap.caf / .ogg | snap | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| success.caf / .ogg | success | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| warning.caf / .ogg | warning | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| error.caf / .ogg | error | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| vote.caf / .ogg | vote | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| bell.caf / .ogg | bell | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| alarm-guide.caf / .ogg | alarm | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| egg-crack.caf / .ogg | crack | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| egg-pop.caf / .ogg | pop | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| critter-chirp.caf / .ogg | chirp | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | founder listening pass per docs/decisions/20260927-in-house-procedural-audio.md §"Founder review gate" |
| flap.caf / .ogg | flap | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| printer.caf / .ogg | printer | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| scanner.caf / .ogg | scanner | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| shutter.caf / .ogg | shutter | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| pen.caf / .ogg | pen | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| page.caf / .ogg | page | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| envelope.caf / .ogg | envelope | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | |
| notify-tokek.caf / .ogg | (none yet — guide notification motif) | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | staged for a future guide-notification feature; no `sound.tokens.json` cue references it yet |
| notify-pon.caf / .ogg | (none yet — guide notification motif) | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | staged, see above |
| notify-lundi.caf / .ogg | (none yet — guide notification motif) | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | staged, see above |
| notify-ajo.caf / .ogg | (none yet — guide notification motif) | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | staged, see above; theme pending founder approval |
| notify-sardi.caf / .ogg | (none yet — guide notification motif) | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | staged, see above; theme pending founder approval |
| notify-paco.caf / .ogg | (none yet — guide notification motif) | @cp/sound-art (in-house, procedural) | Critterpass-owned, no third-party audio | staged, see above; theme pending founder approval |

## Current state

Every `sound.tokens.json` cue with a non-null `sfxAsset` is wired: composed in-house and
procedurally by `@cp/sound-art` (`packages/sound-art`), never a recorded or licensed sample
(`docs/decisions/20260927-in-house-procedural-audio.md`). `src/motion/feedback/sfx-pool.ts`'s
`SFX_ASSET_MODULES` map has one entry per cue, each picking that cue's `.caf` (iOS) or `.ogg`
(Android) file. `tools/scripts/check-audio-assets.ts --mode release` passes: every cue's `.caf`
exists under this directory.

The 6 `notify-<guide>.caf/.ogg` motifs are also bundled here (copied straight from
`packages/sound-art/out/sfx/`) but have no `sound.tokens.json` cue yet — they're staged for the
guide-notification feature `docs/design-system.md` open question 4 describes, not wired into
`SFX_ASSET_MODULES` by this pass.

The critter chirp and the notify motifs for the Ajo/Sardi/Paco themes still need the founder's
listening-gallery sign-off (`docs/decisions/20260927-in-house-procedural-audio.md` §"Founder review
gate") before they're treated as final — bundling them now doesn't block on that pass.
