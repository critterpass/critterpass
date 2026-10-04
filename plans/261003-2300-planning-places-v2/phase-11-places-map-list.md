---
phase: 11
title: Places map and list
status: in review
depends_on: [1, 3, 4, 5]
wave: 3
screens: [7c-1, 7c-2, 7c-3]
replaces: [3d-4]
tasks: 5
owns:
  - apps/mobile/src/features/explore/places/**
  - apps/mobile/src/features/explore/screens/{explore-map-screen,explore-list-screen}.tsx
  - apps/mobile/src/features/explore/components/{explore-map-view,explore-map-canvas,place-carousel,filter-chips,doodle-pin,pin-cluster,guide-sprite,region-pack-card}.tsx
  - apps/mobile/src/features/explore/{map-model,map-queries}.ts
  - apps/mobile/src/app/explore/map.tsx
  - apps/mobile/src/app/(trip)/[tripId]/places/**
  - services/api/src/planning/hub/**
  - services/api/test/planning/hub/**
  - packages/i18n/locales/{en,vi}/explore/places.*
  - e2e/explore/{places-map,places-list,map,map-vi,map-offline}.yaml
  - e2e/explore/subflows/map-scenes.yaml
mount_points:
  - services/api/src/planning/register.ts, apps/mobile/src/features/planning-register.ts (one line each)
  - docs/api-contracts-planning.md, docs/undesigned-states.md
---
# Phase 11 — Places map and list

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | Q-23/D7 (sponsored: ≤ 1 labelled slot per list, free tier only), C1 (crew-visible saves inside the trip destination), C28 (hides are private), D25 (open-data places beyond the curated set are server-only) |
| `docs/api-contracts-explore.md` | `GET /v1/explore/sponsored` (map carousel and search lists) |
| Code | `features/explore/screens/explore-map-screen.tsx` (3d-4: `MAX_PINS=40`, in-memory filters), `components/{explore-map-canvas.tsx:39-41,77-88,118,121,149-178, place-carousel.tsx, filter-chips.tsx:32-40}`, `map-model.ts:23,36,44,76`, `map-queries.ts:67-87` (CREW PICKS = yes votes + matches), `explore-list-screen.tsx` (`ExploreListView`), `data/use-offline-pack.ts`; `ui/map/useFlyTo.ts`; `infra/powersync/streams/places.yaml:16-41` (curated POIs on the phone) |
| Renders + captions | 7c-1 "86 places and not one label until you tap. Clusters split as you zoom in; saved icons arrive at town zoom and Tokek's dots at street zoom. A filter fades everything else to 20% rather than removing it, so nothing jumps. Tapping a dot opens its label in place (7c-2)." · 7c-2 "Tapping a dot opens its label with a small pop, and the map eases so the place sits above the cards. Swiping the carousel moves the label to the next place; nearest first. + opens Add to plan (7f-1); the card opens the place (7e-1)." · 7c-3 "The same places as rows, grouped by where they stand: saved but not placed, in the plan, and Tokek's picks. Each row says when it would fit. Swipe a row right to save it, left to hide it. MAP goes back with the same filters on." |

## Overview

Goal: every place the crew might care about, on a quiet map and as rows that say where each would fit, with one tap to add, save, hide or open it.

Done when: the trip's places map and list match 7c-1/7c-2/7c-3 on device with a Bali seed, filters fade instead of removing, the carousel and label move together, the list groups and sorts by fit, swipe-to-save/hide works with undo, MAP/LIST keep filters, the search results mode works, and the non-trip Explore map still downloads a region for offline.

## Requirements

### 7c-1 Places map

| Area | Behaviour |
|---|---|
| Data | Curated places on the phone + crew ideas (display copies) + plan stops, minus my hidden places; open-data places only when saved, in the plan or in a search result |
| Chips | "ALL {n}", "SAVED {n}", "IN THE PLAN {n}", categories; one filter at a time fades the rest to 20 % |
| Zoom tiers | clusters at region zoom; saved icons from town zoom; Tokek's dots from street zoom |
| Sheet | Peek "{n} PLACES IN VIEW · Biggest first: what fits your days" + "≡ LIST" |
| Region pack | Outside a trip or without a downloaded region: the existing region pack card (undesigned in section 7) |

### 7c-2 Place picked

Label pop on the picked dot ("TIRTA EMPUL · SAVED BY ALEX + RIN"); camera eases the place above the cards; carousel "1 OF {n} IN VIEW · NEAREST FIRST" ordered by distance from the picked place; card: photo, name, saver avatars, "{category} · {n} min from the {stay}", hours and price, fit chip ("FITS SAT · 08:00"), + → `7f-1`; a neighbour card can carry "NEXT DOOR" (≤ 10 min); swiping moves the label; card → `7e-1` (grow transition).

### 7c-3 Places list

| Group | Rows |
|---|---|
| "SAVED, NOT IN A DAY · {n}" | crew ideas with fit lines ("Fits Sat at 08:00", "On the way, Wed 16:00"), SPLIT chip → `7e-3` |
| "IN THE PLAN · {n}" | one collapsed row: day dots + "Jatiluwih, Biah Biah, Karsa Spa and 19 more" → the plan hub |
| "TOKEK SUGGESTS · {n}" | curated places not saved, hidden or placed, ranked by fit, with editorial best time ("Light beams 09–10 · fits Sat"), + → `7f-1` |

"SORTED BY FIT FOR YOUR DAYS ▾" (menu: fit, nearest, A–Z — undesigned); swipe right = `save_idea`, left = `hide_place`, each with an undo toast; "◎ MAP" returns to the map with the same filters; at most one labelled sponsored row per list where `sponsored(u,t)` holds (existing rules).

Results mode: opened from 7d-2 MAP or LIST with the search's filters as chips; same screens, result set only.

Reuse / extend / new: reuse the explore map's tile logic, carousel, filter chips, flyTo, region pack card and offline pack, `ExploreListView` rows logic, sponsored slot route; extend filters (fade, counts), carousel (fit chip, nearest-first), list (groups, fit sort, swipe actions); new layer-based map (kit), suggest ranking route, results mode.

## Architecture & contracts

| Kind | Delta (`api-contracts-planning.md`) |
|---|---|
| Route | `GET /v1/trips/{id}/places/suggest?category&limit≤30&cursor` → curated places not saved, hidden by the caller or in the plan, ranked by fit (coarse pass on hours, gaps, crowds; planning travel for the top 20), each with `fit{best, days[]}`; cached per (trip version, category, caller) 10 min · participants · private no-store to the client |
| Fit | carousel and idea rows use `useFit` / synced idea fits; no new fit route |
| Sponsored | existing `GET /v1/explore/sponsored` with `list_kind = map_carousel \| search` |
| Commands | uses `save_idea`, `hide_place`/`unhide_place` (phase 7) |
| Registry | `places/register.ts` registers `7c-1`, `7c-2`, `7c-3` and re-registers `3d-4` → `7c-1` through a function route reading `planning.redesign` (the old `explore/routes.ts` entry stays until phase 14) |

## Tasks

### T1 — Suggest ranking route
- Goal: "Tokek suggests", sorted by fit, fast enough to scroll.
- Files: `services/api/src/planning/hub/{suggest-route,rank}.ts`, `services/api/test/planning/hub/**`, `services/api/src/planning/register.ts` (one line)
- Steps: 1. Candidate set (curated, destination, minus saved/hidden/placed). 2. Coarse fit pass, routing for the top 20, cache. 3. Cursor pagination.
- Tests: `pnpm test:remote @cp/api -- planning/hub` (hidden places excluded for the caller only; outsider `NOT_FOUND`; cache invalidates on a new plan version)
- Done when: 64 Bali suggestions return in ≤ 2 pages with fit lines, p95 < 600 ms per page on staging.
- Status: todo

### T2 — Places map (7c-1) and place picked (7c-2)
- Files: `apps/mobile/src/features/explore/places/{places-map-screen,places-carousel,use-places-in-view,label-sync}.ts(x)`, `apps/mobile/src/app/(trip)/[tripId]/places/index.tsx`, `packages/i18n/locales/{en,vi}/explore/places.*`
- Steps: 1. Data hook (curated + ideas + stops − hidden), counts. 2. Kit layers with zoom tiers and fade. 3. Label + carousel nearest-first sync; + → 7f-1; card → 7e-1. 4. Region pack card outside a trip.
- Tests: `pnpm --filter @cp/mobile test -- features/explore/places/use-places-in-view` (filters, counts, hidden excluded, nearest-first order)
- Done when: on device 86 Bali places render with no labels until a tap; the filter fades without moving markers.
- Status: todo

### T3 — Places list (7c-3) with swipe actions and sort
- Files: `apps/mobile/src/features/explore/places/{places-list-screen,place-groups,swipe-row,sort-menu}.ts(x)`, `apps/mobile/src/app/(trip)/[tripId]/places/list.tsx`
- Steps: 1. Groups from ideas, plan and the suggest route. 2. Swipe right/left with thresholds and undo. 3. Sort menu. 4. MAP keeps filters; results mode params from 7d-2.
- Tests: `pnpm --filter @cp/mobile test -- features/explore/places/swipe-row` (thresholds, undo restores, offline queues)
- Done when: swiping a suggestion right moves it to the saved group on a second device.
- Status: todo

### T4 — The old Explore map onto the new canvas
- Goal: one map for places inside and outside a trip.
- Files: `apps/mobile/src/features/explore/screens/{explore-map-screen,explore-list-screen}.tsx`, `apps/mobile/src/app/explore/map.tsx`, the old explore map components
- Steps: 1. Non-trip variant of the places map (no fit, no plan chip). 2. Keep offline pack offer and airplane-mode search. 3. `3d-4` function route.
- Tests: `gh workflow run device.yml … -f flows="e2e/explore/map-offline.yaml"` (renamed shots `7c-1-offline-*`)
- Done when: the non-trip map works offline with a downloaded region.
- Status: todo

### T5 — Device flows and undesigned states
- Files: `e2e/explore/{places-map,places-list,map,map-vi,map-offline}.yaml`, `e2e/explore/subflows/map-scenes.yaml`, `docs/undesigned-states.md`
- Tests: `gh workflow run device.yml --ref <branch> -f platform=android -f build_url=<e2e-test APK> -f flows="e2e/explore/places-map.yaml,e2e/explore/places-list.yaml" -f mode=compare -f pr=<n> -f shards=1`
- Done when: sheets reviewed; `ui-reviewed` applied.
- Status: todo

## Device flows

| Flow | Platform | Covers |
|---|---|---|
| `e2e/explore/places-map.yaml` | Android | 7c-1 tiers, fade, 7c-2 label + carousel, + and card |
| `e2e/explore/places-list.yaml` | Android | 7c-3 groups, fit lines, swipe save/hide + undo, MAP keeps filters, results mode |
| `e2e/explore/map-offline.yaml` | Android | non-trip map offline with a region pack |

## Phase acceptance criteria

- [ ] T1–T5 done-when checks pass.
- [ ] Hidden places never leave the hider's phone (stream rule from phase 2) and never affect others' lists.
- [ ] ≤ 1 sponsored row per list, none for Pass+ or boosted trips.

## Risks & rollback

| Risk | Likelihood × impact | Mitigation / rollback |
|---|---|---|
| Fit ranking cost for 300+ curated places | M × M | coarse pass + top-20 routing + cache; cursor pages |
| Swipe gestures clash with horizontal scroll or back swipe on iOS | M × M | thresholds tuned on device; actions also in a long-press menu |
| Removing the old 3d-4 entry loses offline region download | L × H | T4 keeps the region pack card and flow |

## Migration (existing users' data and screens)

No data. `/explore/map` keeps its path; the 3d-4 id points at the new map when `planning.redesign` is on. Swipe yes votes keep feeding CREW PICKS on the non-trip map.

## Undesigned states to log

Sort menu; region pack card on the new map; non-trip map variant; results-mode header; no places in view; location denied (no "you" dot; nearest-first from the map centre); sponsored row in the list; hidden-places list to unhide (Settings → "Hidden places", undesigned).

## Open questions

1. Where can a person see and restore hidden places? Default: a "Hidden places" row at the bottom of the list's sort menu.
