# Guide voice font: Borel replaces Mynerve

Date: 2026-09-30
Status: decided (founder). Supersedes [Guide voice font: Mynerve](20260930-guide-voice-mynerve.md).

## Context

Mynerve replaced Caveat earlier the same day so the guide could speak Vietnamese. After seeing it
on a device, the founder chose **Borel** (Rosalie Wagner, Google Fonts, SIL OFL 1.1, one weight 400)
instead: a rounder, looped school hand that still covers Vietnamese in full, ₫ included.

## Decision

- **Borel 400** is the guide voice everywhere Mynerve was: the `voice`, `voice.postcard` and
  `voice.signature` tokens, the app (`Borel-400`, PostScript name = file name), the web
  (`Borel-400.woff2`) and share images (`@cp/critter-art` `SCRIPT_STYLE`).
- Built by `tools/scripts/fonts/build-fonts.py` from the pinned `google/fonts` source (commit and
  sha256 in `sources.json`), subset like the other faces, licence at
  `packages/design-tokens/fonts/OFL-Borel.txt`. Borel's critical range is the full `vietnamese`
  range (as for Archivo), so `--check` fails on any missing Vietnamese letter or ₫. The
  `vietnameseLetters` range, which only existed because Mynerve lacked ₫, is gone.
- Fallbacks are unchanged: Noto Sans Thai 400 italic for Thai, the OS face in italic for CJK, Geist
  500 italic under "plain text for guide".
- The mobile font payload goes from 1.77 MB to 1.75 MB (Borel 154 KB replaces Mynerve 167 KB).
- **Map labels stay on Caveat**, as the Mynerve record decided: they need new SDF glyphs generated
  and uploaded before the style can switch.

## Metrics, line height and size

Measured from the subset TTF (em units):

| | Caveat 600 | Mynerve | Borel |
|---|---|---|---|
| hhea ascent / descent | 0.96 / 0.30 | 0.93 / 0.38 | 0.986 / 1.014 |
| x-height | 0.358 | 0.454 | 0.486 |
| `l` top / `g` bottom | 0.659 / −0.202 | 0.745 / −0.367 | 0.986 / −0.514 |
| highest mark (`Ẳ`) | — | 0.922 | 1.203 |
| width of 3a-2's line ("Just a first name is fine…") | 17.7 | 22.8 | 27.4 |

- **Line height 1.1 → 1.5.** Borel's ascenders and descenders span 1.5 em (0.986 + 0.514), so at
  1.1 a looped `g`/`y` on one line runs into the `l`/`h` loops of the next. 1.5 keeps loops apart.
  Borel's hhea box is 2 em tall, so any line shorter than that pins the baseline 1.014 em above the
  line's bottom; `glyph-room.ts` carries the measured metrics and gives the first line its top
  room (0.717 em at 1.5), so the stacked marks (Ẳ, Ệ) are never clipped.
- **Size 20 → 16 (postcard 26 → 21, signature 22 → 18, share images 40 → 32 px).** Borel sets
  about 55 % wider than Caveat, the face the design renders use, and 20 % wider than Mynerve.
  At 20 pt 3a-2's guide line needs 547 pt against the render's two lines of about 278 pt, so it
  would wrap to a third line. At 16 pt it needs 438 pt and keeps its two lines; its x-height is
  7.8 pt against Caveat's 7.2 pt at 20, so it reads at the renders' visual size. With the 1.5 line
  height a 16 pt line is 24 pt tall (22 pt before), so blocks keep their height. Every voice size
  scales by the same 0.8, and the web's hard-coded voice sizes follow (26 → 21 px and so on, line
  height 1.5).

## Verification

Jest (`resolve`, `text`, `glyph-room`), the web checks and the critter-art goldens (postcard-back,
postcard-back-print, recap-stamp-post, recap-stamp-story regenerated on macOS; no other golden
changed). Device sheets for the guide-voice and vote flows in English and Vietnamese are attached
to the pull request once an Android build with the embedded font exists.
