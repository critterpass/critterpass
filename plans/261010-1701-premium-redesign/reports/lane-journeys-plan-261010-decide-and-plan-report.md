# Lane report: Journeys B, part 4 (decide and plan, the premium map)

Branch `feat/premium-journeys-plan` (worktree `final-collab`), merged with `origin/feat/premium-redesign` and `origin/feat/premium-kit` up to 11 Oct ~18:00.

## Premium map (for Journeys D)

`apps/mobile/src/features/plan/premium/map/**`, exported from the plan area's public index (`@/features/plan`): `PremiumMapCanvas` (light / night style from the app appearance, region tiles, `onRegionChange`, `still`), `PlanRouteLayer` (day-coloured routes over white casing, walk dotted, boat arcs, numbered pins, faded days), `StayFlag`, `dayColours` / `EMPTY_DAY`, `MAP_PALETTES` / `MAP_MARKS`, detents (`PEEK_VISIBLE`, `HALF_VISIBLE` 544, `FULL_TOP`, `sheetHeight`, `settleDetent`, `cameraPadding`), `planMapFeatures` / `dayLegs` / `traceLegs` / `boatArc`. The crew map can import it as `import { PremiumMapCanvas, StayFlag } from '@/features/plan'`.

## Screens done (code → file)

| code | screen | premium file | route switch |
|---|---|---|---|
| 4.05 | Vote showdown | `features/vote/premium/final/showdown-screen.tsx` | `app/vote/[pollId]/index.tsx` |
| 4.06 | Winner stamp | `features/vote/premium/final/winner-reveal.tsx` (+ `reveal-footer.tsx`, `reveal-lines.ts`, `reveal-outcome.ts`) | `app/vote/[pollId]/reveal.tsx` |
| 4.08 / 4.09 | Setup together, organiser / member's part | `features/setup/premium/checklist/setup-checklist-screen.tsx` | `app/(trip)/[tripId]/setup/index.tsx` |
| 4.18 | Getting there | `features/setup/premium/getting-there/getting-there-screen.tsx` | `app/(trip)/[tripId]/setup/getting-there.tsx` (new) |
| 4.20 / 4.21 | Drafting, slow | `features/plan/premium/draft/drafting-view.tsx` (logic stays in `DraftingScreen`, now look-pluggable) | `app/(trip)/[tripId]/draft/drafting.tsx` |
| 4.22 / 4.23 | The guide's draft | `features/plan/premium/draft/draft-review-view.tsx` (logic stays in `DraftReviewScreen`) | `app/(trip)/[tripId]/draft/index.tsx` |
| 9.18 | Last free redraft (view by Journeys A) | hosted on `app/(trip)/[tripId]/draft/last-redraft.tsx` with `useLastRedraft` | same |
| 4.25–4.27 | The plan: peek, one day at half (hold to reorder), whole trip | `features/plan/premium/plan-map/plan-map-screen.tsx` and parts | `app/(trip)/[tripId]/plan/map.tsx` |
| 4.29 | Stop menu | `plan-map/stop-menu.tsx`, `stop-overlays.tsx` | (in the map) |
| 4.30 / 4.31 / 4.33 / 4.57 | Find: empty, plain words, no results, offline | `features/explore/premium/search/find-screen.tsx` and parts, `find-pin.tsx` | `app/(trip)/[tripId]/search/index.tsx` |
| 4.34 | Places layer + filter chips on the plan map | `plan-map/places-layer.tsx`, `use-map-filters.ts` | (in the map) |
| 4.36 / 4.37 | A place | `features/explore/premium/place/place-page.tsx`, `place-sections.tsx`, `place-screen.tsx` | `app/explore/place/[placeId].tsx` |
| 4.39 | Add to plan | `features/plan/premium/add/*` (the `AddSheet` container takes a `look`) | `app/(trip)/[tripId]/add/[placeId].tsx` (native form sheet in premium) |
| 4.40 | Ideas with must-do stars | `features/plan/premium/ideas/ideas-sheet.tsx`, `ideas/use-ideas-model.ts`, `ideas/use-must-do-stars.ts` | `app/(trip)/[tripId]/ideas/index.tsx` (form sheet) |
| 4.49 | Day trips from the stop | `features/explore/premium/day-trips/day-trips-screen.tsx` | `app/(trip)/[tripId]/day-trips/index.tsx` (new) |
| 4.53 | Trip settings | `features/plan/premium/settings/trip-settings-screen.tsx` | `app/(trip)/[tripId]/settings/index.tsx` (new) |
| 4.54 | Change dates | `settings/change-dates-screen.tsx`, `dates-impact.tsx`, `range-calendar.tsx` | `settings/dates.tsx` (modal) |
| 4.55 | Cancel the trip | `settings/cancel-trip-screen.tsx` (hold to confirm) | `settings/cancel.tsx` |
| 4.56 | Nothing saved yet | `plan-map/empty-plan.tsx` | (in the map) |

Navigation: in the premium look `(trip)/[tripId]/_layout.tsx`, `setup/_layout.tsx` and `explore/_layout.tsx` render `PremiumStack` (native pushes); Add to plan and Ideas are native form sheets; change dates is a modal. The current look is unchanged.

## Not built yet (legacy screen still shows in the premium look)

4.01 new poll, 4.02 search places, 4.03 guest guide, 4.04 destination guide, 4.07 solo confirm; 4.10–4.17 setup steps (when heatmap, calendar sheets, no week fits, budget sweet spot, waiting on maxes, private max + sleep; the checklist opens the current step pages in any order once dates lock), 4.19 the route (row not tappable while the route switch is off); 4.24 redraft diff; 4.28 all days grid (reached from the plan's ⋯); 4.32 link import sheet, 4.35 place carousel (a pin opens the place page), 4.38 crew split, 4.41 placing, 4.42 swipe together, 4.43–4.48 fixes (the ⋯ menu and check lines open the current plan check), 4.50 day-trip day, 4.51 who's in, 4.52 slide to board. Logic hooks for several already exist (`use-link-screen`, `use-split`, `use-swipe-screen`, `use-place-detail`).

## Design conflicts resolved (plan decision 5)

- Setup numbering: rows have no "n of 7" ordinal on the checklist; step pages keep their current header.
- Budget privacy: copy says "Nobody sees it, not even the crew" (product rule) instead of "Only Tokek sees it".
- Draft header: 4.22 (Build the proposal) is canonical; 4.23's miss card is drawn in the same page.
- Stop numerals: the map keeps white numerals; sheet discs use sticker ink.
- 4.06 member exit: "Back home" with the line on who has the setup; ✕ on every full screen.
- 4.25/4.26 way out: glass back in the map's top bar; ⋯ beside the search pill opens Ideas, all days, the plan check, share and trip settings.
- 4.36 two right actions over the photo kept (share + ♥) on clear glass.
- Search placeholder: "Find anything, or ask {guide}" on Find; the map pill names the destination.
- Toasts use the existing island toast (the kit's `ToastHost` is not mounted on these routes).

## Backend added (phase 1, earlier in the lane)

`trips.plan_change_rule` + `set_plan_change_rule`; setup together in any order with per-member parts (`trip_member_setup`), drafting as answers arrive and `trips.sketched_days`; `set_getting_there`; reads `GET /v1/trips/{id}/dates-impact` and `/cancel-summary`; client checklist model and reads.

## Follow-ups for the founder and controller

1. Promote to the kit: `GuideDock`, `Doodle`, `PlaceThumb`, `PlaceResultRow` (exported from `@/features/explore` for now), `GlassMenu` (plan-map), the range calendar, the setup `StatusDisc` / checklist row, `crewColour`.
2. The place page draws its photo with the current `PlacePhoto` (credits and the lightbox); the kit has no media layer yet. Place profile, live details, partner offers and "remove for everyone" are not on the premium place page yet.
3. Two files taken verbatim from Journeys A's branch (`features/monetize/premium/last-redraft-premium.tsx`, `monetize-palette.ts`) so its 9.18 view can be hosted; identical content, so merging A's branch is clean.
4. New message ids need extraction and Vietnamese (`plan`, `setup`, `explore`, `vote` catalogs); not extracted in this lane.
5. Getting there has no arrival-time picker (no date-time picker dependency); the member picks the way and where from.
6. Change dates: "Change it now" sends `lock_trip_dates`; whether the server accepts it after setup is not confirmed here.
7. Share invite on the setup header, Nudge on free days, and the route step (4.19) are not wired.

## Checks

Prettier on every changed file; ESLint on all premium files and touched routes is clean except test files (jest globals not resolved in a bare eslint run). Jest could not run on this Mac (load average 80–150, jest sat idle over an hour); new pure-logic tests: `plan/premium/settings/__tests__/range-calendar.test.ts`, `plan/ideas/__tests__/must-do-stars.test.ts`, plus the earlier `vote/premium/final/__tests__/reveal-outcome.test.ts` and `plan/premium/map/__tests__/premium-map.test.ts`. No tsc (lane rule); CI's typecheck is the first full pass.

Status: DONE_WITH_CONCERNS
