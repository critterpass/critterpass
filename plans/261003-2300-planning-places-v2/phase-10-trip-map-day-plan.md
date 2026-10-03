---
phase: 10
title: Trip map, day plan, all days and the empty trip
status: pending
depends_on: [1, 3, 4, 5]
wave: 3
screens: [7a-1, 7a-2, 7a-3, 7b-1, 7b-2, 7b-3, 7i-1]
replaces: [3e-1, 3e-2]
tasks: 9
gate: the founder decision "Plan hub" sets the `plan.hub` default; both hubs are built either way
owns:
  - apps/mobile/src/features/plan/{hub,trip-map,day-plan,all-days}/**
  - apps/mobile/src/features/plan/{overview,day,timeline,views}/**
  - apps/mobile/src/app/(trip)/[tripId]/{plan,day}/**
  - packages/i18n/locales/{en,vi}/plan/{trip-map,day-plan,all-days}.*
  - e2e/plan/{trip-map,day-plan,day-plan-offline,all-days,nothing-saved}.yaml
  - e2e/plan/{overview,day-edit,timeline,views,overlay,item-sheet-scroll,guide-text-vi}.yaml
mount_points:
  - apps/mobile/src/features/planning-register.ts (one line)
  - docs/undesigned-states.md
---
# Phase 10 — Trip map, day plan, all days and the empty trip

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | C14 (countdown source), C41/Q-30 (organiser applies, members propose), Q-36 (collisions push later items), C44 (organiser draft visible only to them), D12 (offline plan) |
| Prototype | `design/Critterpass Prototype.dc.html`: `hub` prop (Map first / Plan first), Trip hub PLAN → `hubName()`; Trip map: list → Places list, search → Search, check → Plan check, sheet → one day; one day: rain → Rain and crowds, gap → Fill a gap, ALL DAYS → all days; all days: SEE → Plan check, IDEAS → Ideas, SHARE → Share the plan, day row → that day; Day plan: add bar → Search (sheet), expand → map open, ALL DAYS → All days |
| Code | `features/plan/overview/{plan-overview-screen.tsx:45, model/plan-model.ts:123 buildDayCards, day-card.tsx:39 dayTileColour, share-slot.tsx, routes.ts:8,21,31}`; `features/plan/day/{day-screen.tsx:38, item-detail-sheet.tsx:193-202, plan-ops.ts:24,55 moveToDayOp, fit-check.ts}`; `features/plan/views/{plan-map.tsx, export-sheet.tsx, data/calendar-export.ts}`; `features/plan/timeline/**` (15-minute editor, rain band, ghost, cursors); `features/plan/collab/use-presence.ts:62`; `features/trip/hub/screen.tsx:172-180` (PLAN tile → `hrefFor('3e-1')`), `hub-links.ts:41-62`; `app/(trip)/[tripId]/{plan/index.tsx, day/[day].tsx}`; `app/(trip)/trip/[tripId]/[...rest].tsx` (push/inbox forwarder) |
| Renders | `7a-1_Trip_map.png`, `7a-2_Trip_map_one_day.png`, `7a-3_Trip_map_all_days.png`, `7b-1_Day_plan.png`, `7b-2_Day_plan_map_open.png`, `7b-3_All_days.png`, `7i-1_Nothing_saved_yet.png`; old `3e-1_Trip_plan.png`, `3e-2_Day_planning.png` |
| Captions | 7a-1 "Markers land collapsed and sized by how much each place matters to the crew … Day 3's stops are numbered in its blue; other days sit back at half strength. Drag the sheet up for the day (7a-2), further for the whole trip (7a-3). A day chip redraws the route as a line tracing out from the villa." · 7a-2, 7a-3, 7b-1, 7b-2, 7b-3, 7i-1 as quoted in Requirements |

## Overview

Goal: the plan's home: a trip map whose sheet goes from a day to the whole trip, a day plan with a live mini-map and Tokek's notes under the stops they concern, a full-screen map strip, all days at a glance with stops dragged between days, and the empty trip's four ways to start. Both hubs exist; `plan.hub` picks which one the trip hub's PLAN tile opens.

Done when: on a seeded Bali trip and on a fresh trip the seven screens match their renders on Android (and the sheet on iOS); legs show offline; a reorder or cross-day move on one phone shows on another within 1 s (organiser) or becomes a change set (member); `planning.redesign` off restores the old 3e screens.

## Requirements

### 7a-1 Trip map (peek)

| Area | Behaviour |
|---|---|
| Top | Search pill "Search {destination}, or ask {guide}" → `7d-1` (scope map); "≡ LIST" → `7c-3` |
| Chips | "DAY {n} · {WEEKDAY}" (the selected day), "SAVED {n}", "CREW PICKS", categories; a chip fades everything else to 20 % |
| Map | `StopRouteLayer` for the selected day (numbered in its colour, route traced out from the stay when a day chip is picked), other days at half strength, `PlaceDotsLayer` (saved icons with the saver's colour dot, Tokek's curated dots, clusters), stay marker, `EdgeIndicator` for stops off screen |
| Sheet | Day chips with colour underline; "{DATE} · DAY {n} OF {m}"; day title (`plan_days.theme`); crewmates going that day; "{k} stops · {h} in the car" (legs); `TokekNote` "Three things to fix before {date}." + CHECK → `7h-1` (counts from `usePlanCheck`); a placed-ideas review card when `usePendingReviews` has one (undesigned) |

### 7a-2 One day (half)

"The sheet settles at half and the map zooms out to fit the day above it, so Tokek's dots step aside and only saved places and stops stay. Tapping a stop opens its marker, the only label on the map. Legs say how you get there; the dashed slot is time some of you have free. SWAP? opens the rain swap (7h-4), FILL IT the ideas for the gap (7h-2)."
Rows: `TimeColumn` + `StopCard` (subtitle from the item: driver, vote state "4 of 6 voted · Rp 60k each" + VOTE → the decision view, rain issue → SWAP? → `7h-4`), `LegConnector` from `useDayLegs`, `GapSlot` from phase 4 gaps ("FOUR OF YOU ARE FREE · Alex, Jordan, Dev and you, till dinner · FILL IT" → `7h-2`); header "ALL DAYS" snaps to full.

### 7a-3 Whole trip (full)

"Pulled all the way up, the sheet becomes the whole trip and the map shrinks to the island with each day's stops as coloured dots. Pace bars fill to show how full each day is, and the flags are what Tokek found. SEE opens the plan check (7h-1). IDEAS opens what's saved but not placed (7f-2)."
Header "{CREW} · {dates}", SHARE, "THE WHOLE TRIP", countdown (C14 source); plan-check card; `DayRow`s with chips (BOOKED from bookings, VOTE from open polls, CLASH/RAIN/TOO FAR from issues) and `PaceBars`; a row opens that day at half; footer "{n} saved places aren't in a day yet · IDEAS ›" → `7f-2`.

### 7b-1 Day plan

"The day is the home screen, with a live mini-map that redraws as you drag a stop up or down the timeline. Every add starts from the bar at the bottom: a name, plain words or a pasted link (7d). Tokek's notes sit right under the stop they're about. Tapping the mini-map opens it (7b-2); ALL DAYS zooms out (7b-3)."

| Area | Behaviour |
|---|---|
| Header | ← TRIP, ALL DAYS → `7b-3`, SHARE; day chips; title + date + rain chip ("RAIN LIKELY 13–15" from forecast or normals) |
| Mini-map | Live: straight segments redraw while a stop is dragged; ⤢ or tap → `7b-2`; "{k} STOPS · {h} IN THE CAR" |
| Timeline | Stops with time, length, legs; vote and rain chips; `TokekNote` under the stop an issue names ("Rain at 1, right on the ridge. Swap it with the spa?" SEE → the issue's fixer) |
| Reorder | Long-press a stop, drag up/down; drop → new order rescheduled by the planner (lengths kept, legs inserted, booked items fixed; an impossible drop shakes back with the reason); organiser → `apply_plan_ops`; member → change set ("Suggest this order", undesigned) |
| Add bar | "+ Add a place, or paste a link" → `7d-1` (scope day; a clipboard link shows on top) |
| Stop tap | The existing item sheet (time, who's going, notes, comments, remove, open the place) |

### 7b-2 Map open

"Pulling the mini-map down fills the screen with it. The day's stops become a strip along the bottom, and swiping the strip moves the one label from stop to stop. With SAVED on, saved places near the route say how far off it they are, like Dev's coffee place, three minutes from the ridge."
Day pill with picker; chips SAVED ✓ / TOKEK'S PICKS / OTHER DAYS / categories; strip of stop cards with legs between; "ON THE WAY · +{n} MIN" labels on ideas whose fit for this day has `on_the_way`.

### 7b-3 All days

"Pinching out from a day shows all eight. Each card redraws its route small, and its pace bar says how full it is. Hold a stop on one day and drag it onto another: Tokek reroutes both and shows the change before it sticks."
Two-column grid of day cards (`MiniRouteSketch`, day label, pace, title, summary, chip); pinch-out from 7b-1 and tap back; long-press a stop dot → drag onto another card → preview sheet with both days before/after and drive minutes (fit + legs) → confirm (organiser applies `moveToDayOp` + reschedule; member proposes). A11y and small-screen alternative: long-press a card → its stops → "Move to day…".

### 7i-1 Nothing saved yet

"What the Bali Six saw the day Bali won. The map is empty apart from Tokek, who floats where the villa will go. Each way in lands in the same places: a draft fills the days, the other three fill Ideas."
Shown when the crew version has no items and the trip has no ideas: "{DEST} · {dates} · {n} GOING", "NOTHING SAVED YET", "Four ways to start. Most crews mix two."; LET TOKEK DRAFT IT → the drafting flow (organiser; members see "Ask {organiser} to draft", undesigned); PASTE WHAT YOU SAVED → `7d-3`/screenshot; SWIPE TOGETHER → `7g-2`; COPY A CREW'S PLAN → `3o-1` with the destination's plan count (hidden until community plans register it).

Reuse / extend / new: reuse `data/plan` (reader/editor), `buildDayCards`, `dayTileColour`, the share slot and calendar export sheet (moved under SHARE), the item sheet, `moveToDayOp`, presence, region packs; extend day rows with legs, issues and gaps; new trip map screen, sheets, day plan, map open, all-days grid with cross-day drag, empty trip. The 15-minute timeline editor, live cursors and the calendar tab are not part of section 7: they stay reachable only with `planning.redesign` off and are retired in phase 14 after the founder decision.

## Architecture & contracts

| Kind | Delta |
|---|---|
| Routes | `(trip)/[tripId]/plan/index.tsx` → hub (`planHub()`: map → trip map, day → today's or the next day's plan) when `planning.redesign` is on, else the old overview; `plan/map.tsx` (7a), `plan/days.tsx` (7b-3), `day/[day].tsx` → day plan when on, old day screen when off; `day/[day]/map.tsx` (7b-2) |
| Registry | `7a-1/2/3`, `7b-1/2/3`, `7i-1` registered; `3e-1` → hub and `3e-2` → day plan through function routes reading `planning.redesign`, so the trip hub, inbox, push and proposal links keep working |
| Data | reads only: `data/plan`, `useDayLegs`, `usePlanCheck`, `useTripIdeas`, `usePendingReviews`, polls, bookings, phase 4 gaps (`GET …/gaps/ideas` not needed here) |
| Server | none new |

## Tasks

### T1 — Hub, routes and registrations
- Goal: the PLAN tile opens the chosen hub; old ids resolve correctly with the switch on or off.
- Files: `apps/mobile/src/features/plan/hub/**` (incl. `hub/register.ts`), `apps/mobile/src/app/(trip)/[tripId]/{plan,day}/**`, `apps/mobile/src/features/planning-register.ts` (one line)
- Steps: 1. Hub selection from `planHub()`. 2. `hub/register.ts` registers the 7x ids and re-registers `3e-1`/`3e-2` as function routes reading `planning.redesign` (the old `overview/routes.ts` and `day/register.ts` stay untouched until phase 14). 3. Draft versions: organiser sees their draft on the hub (C44).
- Tests: `pnpm --filter @cp/mobile test -- features/plan/hub` (switch off → old screens; hub map/day; push forwarder targets)
- Done when: trip hub PLAN, inbox rows and a review push open the right screens in both switch states.
- Status: todo

### T2 — Trip map and peek sheet (7a-1)
- Files: `apps/mobile/src/features/plan/trip-map/{trip-map-screen,peek-sheet,trip-map-filters,use-trip-map-data}.ts(x)`, `packages/i18n/locales/{en,vi}/plan/trip-map.*`
- Steps: 1. Canvas + layers from the kit with day/place data. 2. Filters (20 % fade). 3. Peek sheet content incl. check line and pending-review card. 4. Day chip → route trace. 5. Draw any route in `usePlanningMapPreview` (sheets over the map, e.g. Fill a gap, set it).
- Tests: `pnpm --filter @cp/mobile test -- features/plan/trip-map/use-trip-map-data` (marker sizing inputs, filter → visible set)
- Done when: the Bali seed matches 7a-1 on device.
- Status: todo

### T3 — One day at half (7a-2)
- Files: `apps/mobile/src/features/plan/trip-map/{day-sheet,stop-list}.tsx`
- Steps: 1. Rows with legs, vote, rain, gaps. 2. Stop tap → map label and camera ease. 3. Map zoom to fit the day; Tokek's dots hidden at half.
- Tests: none beyond typecheck (layout)
- Done when: SWAP? and FILL IT open their screens once phase 13 registers them (`useScreenHref`), and are hidden before.
- Status: todo

### T4 — Whole trip at full (7a-3) and SHARE
- Files: `apps/mobile/src/features/plan/trip-map/{trip-sheet,share-sheet}.tsx`, `apps/mobile/src/features/plan/views/export-sheet.tsx` (reused)
- Steps: 1. Header, countdown, check card, day rows with chips and pace. 2. SHARE sheet: share the plan (slot) + "Add to my calendar" (existing export). 3. IDEAS footer.
- Tests: `pnpm --filter @cp/mobile test -- features/plan/trip-map/pace` (pace from planned minutes vs the day's waking hours)
- Done when: the Bali seed's chips match 7a-3 (BOOKED, CLASH, RAIN, BOOKED, VOTE, –, TOO FAR, –).
- Status: todo

### T5 — Day plan (7b-1)
- Files: `apps/mobile/src/features/plan/day-plan/{day-plan-screen,mini-map,stop-timeline,use-reorder,add-bar}.ts(x)`, `packages/i18n/locales/{en,vi}/plan/day-plan.*`
- Steps: 1. Header, chips, rain chip. 2. Live mini-map. 3. Timeline with legs and Tokek notes (issues → note + SEE). 4. Long-press reorder with planner rescheduling and lock rules; organiser apply / member change set. 5. Add bar → search.
- Tests: `pnpm --filter @cp/mobile test -- features/plan/day-plan/use-reorder` (lift/cross/drop/cancel; booked stop rejects with reason; member path makes a change set)
- Done when: reordering on phone A redraws phone B's day within 1 s; legs show "about" until the new legs land.
- Status: todo

### T6 — Map open (7b-2)
- Files: `apps/mobile/src/features/plan/day-plan/{day-map-screen,stop-strip}.tsx`, `apps/mobile/src/app/(trip)/[tripId]/day/[day]/map.tsx`
- Steps: 1. Full map, day pill picker, chips. 2. Strip ↔ label sync. 3. On-the-way labels from idea fits.
- Tests: none beyond typecheck
- Done when: swiping the strip moves the single label stop to stop.
- Status: todo

### T7 — All days with cross-day drag (7b-3)
- Files: `apps/mobile/src/features/plan/all-days/{all-days-screen,day-card,use-cross-day-drag,move-preview}.ts(x)`, `apps/mobile/src/app/(trip)/[tripId]/plan/days.tsx`, `packages/i18n/locales/{en,vi}/plan/all-days.*`
- Steps: 1. Grid with sketches and pace. 2. Pinch-out entry. 3. Dot drag + hit-testing; preview with both days rerouted (local fit + legs/straight-line); confirm. 4. "Move to day…" alternative.
- Tests: `pnpm --filter @cp/mobile test -- features/plan/all-days/use-cross-day-drag` (hit-testing, drop on the same day = no-op, booked stop cannot move)
- Done when: moving a stop from Tue to Sat on device shows the preview and applies.
- Status: todo

### T8 — Nothing saved yet (7i-1)
- Files: `apps/mobile/src/features/plan/trip-map/empty-trip-sheet.tsx`
- Steps: 1. Empty condition (no items, no ideas). 2. Four ways with role variants. 3. Floating guide where the stay will be (or the destination centre).
- Tests: none beyond typecheck
- Done when: a fresh trip after the destination vote shows 7i-1; each way opens its flow.
- Status: todo

### T9 — Device flows, deep links, undesigned states
- Files: `e2e/plan/{trip-map,day-plan,day-plan-offline,all-days,nothing-saved}.yaml`, existing `e2e/plan/*.yaml` kept for `planning.redesign` off, `docs/undesigned-states.md`
- Tests: `gh workflow run device.yml --ref <branch> -f platform=android -f build_url=<e2e-test APK> -f flows="e2e/plan/trip-map.yaml,e2e/plan/day-plan.yaml,e2e/plan/all-days.yaml,e2e/plan/nothing-saved.yaml" -f mode=compare -f pr=<n> -f shards=1`; `day-plan-offline.yaml` separately; iOS once for `trip-map.yaml` (sheet drag, safe areas)
- Done when: sheets reviewed; `ui-reviewed` applied; old 3e flows still green with the switch off.
- Status: todo

## Device flows

| Flow | Platform | Covers |
|---|---|---|
| `e2e/plan/trip-map.yaml` | Android + iOS | 7a-1 → 7a-2 → 7a-3, filters, stop label, CHECK/IDEAS entries |
| `e2e/plan/day-plan.yaml` | Android | 7b-1 legs, notes, add bar, reorder on two accounts |
| `e2e/plan/day-plan-offline.yaml` | Android | airplane mode: plan, legs, ideas |
| `e2e/plan/all-days.yaml` | Android | 7b-3 grid, cross-day drag, preview, member variant |
| `e2e/plan/nothing-saved.yaml` | Android | fresh trip, 7i-1 four ways |

## Phase acceptance criteria

- [ ] T1–T9 done-when checks pass.
- [ ] Map screens stay inside the Android perf budget with a real trip (≈ 100 places, 8 days).
- [ ] No feature of the old plan screens is lost with the switch on: share, calendar export, item edits, comments, presence avatars, just-you overlay, decision view.

## Risks & rollback

| Risk | Likelihood × impact | Mitigation / rollback |
|---|---|---|
| Map + sheet + layers heavy on low-end Android | M × H | kit perf budget, ≤ 30 animated views, layers not views; rollback `planning.redesign` off |
| Drag gestures conflict (reorder vs scroll, pinch vs scroll, dot drag) | H × M | long-press activation, explicit alternatives (Move to day…, a11y actions) |
| Founder used the timeline editor on the trip and misses it | M × M | it stays behind the switch until phase 14 and the founder's decision |
| Legs missing (phase 3 not live) | M × L | straight-line "about" minutes |

## Migration (existing users' data and screens)

No data. With `planning.redesign` on, every link to the plan, a day or the overview lands on the new screens; with it off, nothing changes. Organiser drafts keep their privacy (C44). Personal overlay items ("just you") render in the day plan with their tag.

## Undesigned states to log

Pending review card on the peek sheet; avatars meaning on the peek sheet (crewmates going that day); hub when only an organiser draft exists; loading (map tiles and sheet skeleton); legs "about"; member reorder ("Suggest this order"); impossible drop reason; transit cities shown as walk/car; trips longer than 8 days (chip row scrolls, grid scrolls); SHARE sheet with calendar export; empty trip for members (no draft action); copy-a-crew's-plan hidden until community plans exist.

## Open questions

1. Day plan default day when opened from the hub: default today during the trip, else the first day with stops, else day 1.
2. Keep live cursors anywhere? Default no (not in section 7); presence avatars stay.
