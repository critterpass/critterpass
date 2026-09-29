# Guide voice font: Mynerve replaces Caveat

Date: 2026-09-30
Status: decided (founder).

## Context

The guide speaks in a handwritten face (`voice` type token: guide lines, postcards, signatures).
It was Caveat 600. Caveat has no Vietnamese: the bundled subset lacked 81 of the 103 code points in
the Vietnamese range (most letters with tone marks, and ₫), so each Vietnamese guide line mixed
Caveat with the platform's fallback face letter by letter ("Có thể bận…" rendered broken).
Vietnamese is a launch language, so the voice face must cover it in full.

## Candidates

The founder compared four handwritten faces at phone size, all on Google Fonts under the SIL OFL
1.1 with a Vietnamese subset: Sriracha, Mynerve, Shantell Sans and Playpen Sans, and chose Mynerve.

## Decision

- **Mynerve 400** is the guide voice (one weight). The `voice` token points at it, and its logical
  family is now `voice`, so code no longer names a face it doesn't use.
- Built by `tools/scripts/fonts/build-fonts.py` from the pinned `google/fonts` source (sha256 in
  `sources.json`), subset to Latin, Latin-1, Latin Extended-A, Vietnamese, punctuation and
  currency like the other bundled faces, with its OFL licence copied to
  `packages/design-tokens/fonts/OFL-Mynerve.txt`. The build fails if any Vietnamese letter is
  missing (`vietnameseLetters` critical range). Mynerve has no ₫; that one symbol falls back per
  glyph like any other missing symbol.
- Fallbacks: Thai uses Noto Sans Thai 400 in italic, CJK the OS face in italic. "Plain text for
  guide" still swaps the voice for Geist 500 italic.
- App, web (`apps/web` guide lines and coming-soon page) and share images (`@cp/critter-art`
  postcard and recap stamp) all switch. The mobile font payload drops from 1.84 MB to 1.77 MB
  (Mynerve 167 KB replaces Caveat 600 and 700).
- **Map labels stay on Caveat for now.** They use SDF glyph PBFs served from R2; switching needs
  new glyphs generated (`pnpm --filter @cp/maps build:glyphs`) and uploaded
  (`upload:r2 --fonts`), then the style's `text-font` changed. Until then the font build writes
  Caveat 600 to `tools/maps/fonts/` only, and the app no longer bundles it.

## Legibility

Mynerve's strokes are thinner than Caveat 600's, and the guide line is the guide colour on ink at
20 pt. Checked on an Android device build (1080 × 2400) in English, Vietnamese and Thai: the
GuideLine gallery page, Tokek's lines on onboarding's name page (3a-2) and quiz (3a-4), and Home's
tip strip (3b-2). The line reads cleanly at 20 pt, stacked Vietnamese marks (ướ, ễ, ị) stay
distinct, and its size matches the designs' voice lines, so the token stays at 20/1.1 (postcard 26,
signatures 22). The guide colours are unchanged.
