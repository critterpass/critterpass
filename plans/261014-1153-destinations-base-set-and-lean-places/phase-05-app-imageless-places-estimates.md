---
phase: 5
title: Places without photos, and estimates in the app
status: pending
depends_on: [4]
lane: C
tasks: 4
gate: "#913 (`fix/premium-ui-clean-sweep`, another session) merged first; no file #913 owns is touched before then. T3 needs phase 4 T4 on staging"
owns:
  - apps/mobile/src/features/explore/premium/place/{place-page.tsx,place-sections.tsx}
  - apps/mobile/src/features/explore/premium/components/{place-result-row.tsx,place-thumb.tsx}
  - apps/mobile/src/features/explore/places/places-list-rows.tsx
  - apps/mobile/src/features/plan/ideas/idea-row.tsx
  - apps/mobile/src/features/explore/{place-photo.ts,hooks/use-place-photos.ts}
  - apps/mobile/src/features/explore/components/{place-hero-photo.tsx,generic-photo-label.tsx,place-live-details.tsx}
  - apps/mobile/src/features/explore/data/use-place-live.ts
  - apps/mobile/src/features/explore/search/use-pick-live.ts
  - apps/mobile/src/data/places/more-places.ts
  - apps/mobile/src/data/media/use-subject-media.ts
  - apps/mobile/src/features/setup/{must-dos,premium/must-dos}/more-places*.tsx
  - apps/mobile/src/ui/planning/photo-credit.tsx
  - apps/mobile/src/ui/premium/cards/** (one new card or header variant only)
  - apps/mobile/src/features/explore/__tests__/{place-photo,foursquare-place-photos,profile-photo}.test.ts(x)
  - e2e/explore/{foursquare-photos,place-live,place-imageless,place-estimates}.yaml
  - docs/undesigned-states.md (append)
---
# Phase 5 — Places without photos, and estimates in the app

## Context links

| Source | Section |
|---|---|
| Founder decisions 2–4 (14 Oct 13:25–13:30) | plan.md; D38. "No big empty cover with a small centred icon" |
| Premium kit | `apps/mobile/src/ui/premium/{cards,gallery,glass,icons,text,theme,…}`; `docs/design-system-premium.md`; renders `docs/design-renders/screens/7e-1*.png` (place), `7c-3` (list) |
| Today (3d8ff4078; re-grep after #913, which changes ~3,000 files incl. most of `features/explore/**`) | place header `features/explore/premium/place/place-page.tsx:26,57-58` (`PlacePhoto`, `heroUrl`); rows `features/explore/premium/components/{place-result-row,place-thumb}.tsx`, `places/places-list-rows.tsx`, `plan/ideas/idea-row.tsx`; photo rule `features/explore/place-photo.ts` (`poi:<id>` assets, generic stock label); Foursquare UI `components/place-live-details.tsx`, `data/use-place-live.ts`, `src/data/places/more-places.ts:91,115`, `features/setup/must-dos/more-places-section.tsx:100`, `search/use-pick-live.ts`; `include=foursquare` in `src/data/media/use-subject-media.ts` |
| Api | phase 4 T4 (profile `estimates`, crowd `source: 'estimate'`), T5 (photos only for popular places) |

## Overview

Goal: a place without a photo looks deliberate (most places), a popular place shows its curated photo or clip, and estimates read as estimates.

Done when: the place list, search results, Ideas rows and the place page have no empty photo frame; estimates appear with an "estimate" tag and a source link when cited; no Foursquare UI or request remains; Android design | device sheets (EN, VI; light, dark) reviewed and `ui-reviewed` applied; JS only (no native build).

## Requirements

| Surface | Rule |
|---|---|
| List rows | No thumbnail slot when there is no photo: a category glyph chip (premium icon set, guide accent tint) at text height, name, one line of our own text (why go or the category and area), fit or distance on the right. With a curated photo: the existing thumb |
| Place header | No cover image area: a compact title block (category chip, name, local name, area), then the key facts row (open hours we hold, visit length, best time) and the actions. With a curated photo or clip: the existing hero with its credit |
| Estimates | Visit length, best time, busy-time bars, entry fee, tips, what to wear, each with an "Estimate" tag (or the source chip when cited); busy bars say "estimate" in their caption (D21 copy rule) |
| Removed | Foursquare live details and "Powered by Foursquare", "More places" (live search), generic stand-in photos and their "not this place" label, profile photos |
| Undesigned | Each new state logged in `docs/undesigned-states.md` (screen, state, rationale) |

## Tasks

### T1 — Imageless place rows
- Files: row components in `owns`, `ui/premium/cards/**` (one variant), `place-photo.ts`, `use-place-photos.ts`, `use-subject-media.ts`.
- Steps: build the row variant from premium tokens; one rule decides photo vs glyph; stop asking for Foursquare photos; delete the generic-photo label.
- Tests: `pnpm --filter @cp/mobile test -- place-photo` (photo only from a place's own approved asset; none otherwise); delete the Foursquare and profile-photo tests.
- Done when: list, search and Ideas sheets show both variants.
- Status: todo

### T2 — Place header without a cover
- Files: `place-page.tsx`, `place-sections.tsx`, `place-hero-photo.tsx`.
- Steps: compact header per Requirements; the hero stays for places with curated media; the transition into the page keeps working from a row without a photo.
- Tests: none new (render-only; covered by sheets).
- Done when: place page sheets in both variants.
- Status: todo

### T3 — Estimates on the place page
- Files: `place-sections.tsx`, profile data types in `src/data/places/**` (read path only).
- Steps: render the `estimates` block and estimate crowd curves per Requirements; cited fields link their source.
- Tests: a unit test for the label choice (cited vs estimate) if it branches beyond a field read.
- Done when: a Đà Lạt popular place shows estimates on staging.
- Status: todo

### T4 — Foursquare out of the app, flows and sheets
- Files: Foursquare UI files in `owns`; e2e flows.
- Steps: delete the Foursquare surfaces; replace `foursquare-photos.yaml` and `place-live.yaml` with `place-imageless.yaml` and `place-estimates.yaml`; one Android `mode=compare` run for the PR; read the sheets; label.
- Done when: CI green, sheets reviewed, `ui-reviewed`.
- Status: todo

## Risks

| Risk | L×I | Mitigation |
|---|---|---|
| Collides with #913 | H×M | Start after it merges; re-grep owns then |
| Imageless rows look sparse | M×M | Founder reviews the sheets; variants built from the premium kit, not new tokens |
| Old builds still call Foursquare routes | L×L | Routes answer unavailable since phase 3 T2 |

## Rollback

Revert the PR; it is JS only, so an update to the current runtime restores the previous screens.
