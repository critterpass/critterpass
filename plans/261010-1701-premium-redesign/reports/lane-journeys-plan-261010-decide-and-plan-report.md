# Lane report: Journeys B, part 4 (decide and plan, the premium map)

Branch `feat/premium-journeys-plan` (worktree `final-collab`), merged with `origin/feat/premium-redesign` and `origin/feat/premium-kit` up to 11 Oct ~18:00 (`9ade70c0f`), then the remaining screens in flow order: vote `e5b88eb41`, setup steps `99972619f`, plan `758fd33e9`, fixes `156fa8e32`, proposal and day trip `32aee8871`, calendar connected `bb7e63b85`.

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
| 4.01 | New poll | `features/vote/premium/poll/new-poll-sheet.tsx` | `app/vote/new-poll.tsx` (sheet in `vote/_layout.tsx`) |
| 4.02 | Search places | `features/vote/premium/places/search-places.tsx` | `app/places/search.tsx` (full screen) |
| 4.03 | Guest guide | `features/vote/premium/places/guest-guide.tsx` | `app/places/[placeId].tsx` |
| 4.04 | Destination guide | `features/explore/premium/destination/destination-page.tsx`, `month-card.tsx`, `picks-carousel.tsx` | `app/explore/[destination].tsx` |
| 4.07 | Solo pass | `features/vote/premium/places/solo-sheet.tsx` (shared `useSoloStart`) | from the guest guide |
| 4.10 / 4.14 / 4.15 | When (heat calendar, own calendar card, no week fits) | `features/setup/premium/steps/when-view.tsx`, `heat-calendar.tsx`, `own-calendar-card.tsx` | `app/(trip)/[tripId]/setup/[step].tsx` |
| 4.13 | Calendar connected | `features/setup/premium/calendar/connected-view.tsx` | `app/setup/calendar/connected.tsx` |
| 4.16 / 4.17 | Budget sweet spot, waiting on maxes; private max + sleep | `steps/budget-view.tsx`, `budget-breakdown.tsx`, `private-max-view.tsx`, `sleep-choices.tsx` | `setup/[step].tsx` |
| 4.19 | The route | `features/setup/premium/route/route-screen.tsx` (`set_trip_stops`) | `app/(trip)/[tripId]/setup/route.tsx` (new; the checklist row links it) |
| 4.24 | Redraft diff | `features/plan/premium/draft/redraft-view.tsx` | `draft/redraft/[redraftId].tsx` |
| 4.28 | All days | `features/plan/premium/all-days/all-days-view.tsx` | `plan/days.tsx` |
| 4.32 | Link import | `features/explore/premium/search/link-sheet.tsx` | `search/link.tsx` (native sheet) |
| 4.35 | Place cards on the map | `plan-map/place-carousel.tsx` (nearest first) | (in the map) |
| 4.38 | Crew split | `features/explore/premium/split/split-page.tsx` | `split/[placeId].tsx` |
| 4.41 | Placing | `features/plan/premium/ideas/placing-view.tsx` (real map) | `ideas/placing/[jobId].tsx` |
| 4.42 | Swipe together | `features/explore/premium/swipe/swipe-page.tsx` (kit `SwipeDeck`, MATCH stamp) | `swipe/[sessionId].tsx` |
| 4.43 / 4.44 | Plan check, fix panels | `features/plan/premium/check/check-view.tsx` | `check/index.tsx` |
| 4.45 / 4.46 | Less driving, rain and crowds | `check/fix-pages.tsx` | `check/less-driving/[dayId].tsx`, `check/rain/[dayId].tsx` |
| 4.47 | Balance the crew, gap ideas | `check/balance-gap.tsx` | `check/balance.tsx`, `check/gap.tsx` (native sheet) |
| 4.48 | Review changes | `check/changes-view.tsx` | `review/[changesetId].tsx` |
| 4.50 | Day-trip day | `features/explore/premium/day-trips/area-page.tsx` | `day-trip/[destinationId].tsx` |
| 4.51 | Who's in | `features/proposal/premium/tracker-view.tsx` | `proposal/[id]/tracker.tsx` |
| 4.52 | Slide to board | `features/proposal/premium/board-view.tsx` (pan slide track, a11y activate) | `proposal/[id]/board.tsx` |

Pattern: each legacy container takes a `View` (or `look` / `views`) prop and keeps every read and command; the premium file is only the drawing, picked in the route by `usePremiumUi()`. Containers changed this way: when, budget and setup steps, calendar connected, all days, redraft diff, link import, placing, plan check and its fixes, gap, review changes, who's in, board, day-trip area, destination page. Shared pieces exported for both looks: `ownCalendarWords`, `budgetLine` / `lockLine`, `changeCardWords`, `metricWords`, `couldBe`, `whyWords`, `connectedWords`, `useSoloStart`, `useCityGuide`.

Navigation: in the premium look `(trip)/[tripId]/_layout.tsx`, `setup/_layout.tsx` and `explore/_layout.tsx` render `PremiumStack` (native pushes); Add to plan and Ideas are native form sheets; change dates is a modal. The current look is unchanged.

## Still drawn by the current look inside premium pages

- 4.11 / 4.12 calendar connect sheets and the week picker (overlays inside the when step); the rooms and must-dos setup steps.
- Link paste and pick-one sheets, the plan sheet's item sheet host, move-stop sheet and move preview; the ask card inside the plan check.
- Fix-in-place inside the plan sheet: the plan's check line opens the premium check page instead.
- All days: drag a stop to another day is "Move a stop" on long press; day cards show a pins strip, not mini maps.
- Rain chart and less-driving route sketches are left out; photos with credits use the current `MediaLayer` / `PlacePhoto`.
- Swipe: "who is swiping" stays hidden (privacy).

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

## Backend added

- `change_trip_dates` (`31e4209b7`, `b0ff48549`): the organiser moves a proposed, confirmed or pre-trip trip to new dates; the plan follows (days shift, stops keep their local time, stops on lost days go to Ideas or onto the last day, bookings keep their times) as a new plan version, with `trip.dates_changed` and a recompute. Domain schemas in `packages/domain/src/planning/trip-settings.ts` (`DATES_CHANGE_STATUSES`), command in `services/api/src/planning/trip-settings/change-trip-dates.ts`, contract row in `docs/api-contracts-planning.md`. DB test `services/api/test/planning/trip-settings/change-trip-dates.db.test.ts` (5 cases) passed on GitHub (run 38148041115). Change dates sends it after setup and `lock_trip_dates` before.
- Outside my areas: `tools/scripts/test-images.ts` gives `git ls-files` a 64 MB buffer (`b8a76ead0`); the scan failed with ENOBUFS on the remote run.
- Earlier in the lane: `trips.plan_change_rule` + `set_plan_change_rule`; setup together in any order with per-member parts (`trip_member_setup`), drafting as answers arrive and `trips.sketched_days`; `set_getting_there`; reads `GET /v1/trips/{id}/dates-impact` and `/cancel-summary`; client checklist model and reads.

## Follow-ups for the founder and controller

1. Promote to the kit: `GuideDock`, `Doodle`, `PlaceThumb`, `PlaceResultRow` (exported from `@/features/explore` for now), `GlassMenu` (plan-map), the range calendar, the setup `StatusDisc` / checklist row, `crewColour`.
2. The place page draws its photo with the current `PlacePhoto` (credits and the lightbox); the kit has no media layer yet. Place profile, live details, partner offers and "remove for everyone" are not on the premium place page yet.
3. Two files taken verbatim from Journeys A's branch (`features/monetize/premium/last-redraft-premium.tsx`, `monetize-palette.ts`) so its 9.18 view can be hosted; identical content, so merging A's branch is clean.
4. New message ids need extraction and Vietnamese (`plan`, `setup`, `explore`, `vote` catalogs); not extracted in this lane.
5. Getting there has no arrival-time picker (no date-time picker dependency); the member picks the way and where from.
6. New feature index exports: `@/features/vote` (`createPollCommand`, `money`, `crewColour`, `SoloPassSheet`, `useDestinationSearch`), `@/features/explore` (`Doodle`, `GuideDock`, `fitColour`, `PlaceResultRow`, `PlaceThumb`, `placeIcon`), `@/features/plan` (premium map, `draftRoutes`, `usePlanGuide`), new `@/features/setup` index (`lockTripDatesCommand`, `setMustDosCommand`).
7. Share invite on the setup header and Nudge on free days are not wired.

## Checks

Prettier on every changed file. ESLint ran on the earlier commits (clean apart from test files); from the vote flow on, the coordinator's rule stopped local eslint, jest and vitest (the Mac was out of memory), so lint, typecheck and tests on the commits after `9ade70c0f` run first in CI on the integration branch. Pure-logic tests added earlier: `plan/premium/settings/__tests__/range-calendar.test.ts`, `plan/ideas/__tests__/must-do-stars.test.ts`, `vote/premium/final/__tests__/reveal-outcome.test.ts`, `plan/premium/map/__tests__/premium-map.test.ts`. Server: the `change_trip_dates` DB test passed remotely. No device screenshots from this lane.

Status: DONE_WITH_CONCERNS
