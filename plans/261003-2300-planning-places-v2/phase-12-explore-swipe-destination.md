---
phase: 12
title: Explore in a trip, swipe together and the destination guide
status: in-review
depends_on: [1, 4, 5, 7]
wave: 4
screens: [7g-1, 7g-2, 7g-3]
replaces: [3d-1, 3d-2]
tasks: 4
owns:
  - apps/mobile/src/features/explore/trip-explore/**
  - apps/mobile/src/features/explore/screens/{destination-screen,swipe-screen,explore-home-screen}.tsx
  - apps/mobile/src/features/explore/components/{destination-view,dest-hero,month-bars,month-panel,picks-row,destination-actions,swipe-view,swipe-card,swipe-controls,match-stamp,deck-summary,why-this-sheet,explore-home-view,sponsored-card,save-button}.tsx
  - apps/mobile/src/features/explore/hooks/use-swipe-session.ts
  - apps/mobile/src/features/explore/routes.ts
  - apps/mobile/src/app/explore/{index,[destination]}.tsx
  - apps/mobile/src/app/(trip)/[tripId]/{swipe,explore}/**
  - packages/i18n/locales/{en,vi}/explore/{trip-explore,destination,swipe,home}.*
  - e2e/explore/{trip-explore,destination,destination-vi,fresh-destination,swipe,swipe-vi}.yaml
  - e2e/explore/subflows/{destination-scenes,swipe-scenes}.yaml
mount_points:
  - apps/mobile/src/features/planning-register.ts (one line)
  - docs/undesigned-states.md
---
# Phase 12 — Explore in a trip, swipe together and the destination guide

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | C30 (Explore under HOME and TRIPS, no 6th tab), Q-24 (swipe: founder decision on matches → Ideas), Q-23 (sponsored picks), C5 (guide colours), Q-25 (re-pricing per crew airports) |
| Code | `features/explore/screens/destination-screen.tsx` (3d-1: `/v1/explore/destinations/{id}?trip_id&month`, save, solo trip, pitch), `components/{dest-hero,month-bars,month-panel,picks-row}.tsx`, `screens/swipe-screen.tsx:54-66` ("suggested for Day N" toast), `components/{swipe-card,match-stamp,deck-summary,why-this-sheet}.tsx`, `hooks/use-swipe-session.ts:35,103,110,138`, `routes.ts:72,90-110`; `features/trip/hub/screen.tsx:89,91` (`hrefFor('3d-2')`, `hrefFor('3d-1', {placeId, tripId})`); `features/home/routes.ts:45`, `features/vote/routes.ts:27,29` |
| Renders + captions | 7g-1 "Tokek walks in from the edge and sits on the hero; the search bar docks under it and pins to the top on scroll. FOR YOUR GAPS is built from the plan, so it changes as the days fill. Every card shows where it stands: saved, in a day, or one tap to add." · 7g-2 "When the crew says yes to the same place, MATCH stamps on and the card drops into Ideas with everyone who said yes. Tokek finds it a day later, so nothing lands in the plan unannounced." · 7g-3 "Pon walks in from the edge and sits on the hero. The month bars grow from zero when the section scrolls into view, and tapping a month re-prices the whole page for your crew's airports." Old: `3d-1_Destination_guide.png`, `3d-2_Swipe_together.png` |

## Overview

Goal: Explore inside a trip shows what fills your gaps, the guide's picks with where each stands, and a way into swiping together whose matches land in Ideas; outside a trip the destination guide keeps its month bars and re-pricing.

Done when: the trip hub's Explore entry opens 7g-1 with live gap ideas and pick states; a swipe match on two devices lands in Ideas with both faces and no plan change; the destination guide matches 7g-3; device sheets reviewed.

## Requirements

### 7g-1 Explore in a trip

| Area | Behaviour |
|---|---|
| Hero | Guide colour with dot texture, "← TRIP", "♡ {n} SAVED" (crew ideas count → `7f-2`), destination, "YOUR GUIDE: {GUIDE}", tagline; guide walks in and sits |
| Search | Docked under the hero, pins to the top on scroll → `7d-1` (scope explore) |
| For your gaps | The next gap from the plan (phone-side planner gaps): "{WEEKDAY} {from}–{to} · Four of you are free while the spa runs", FILL IT → `7h-2` with the gap; three idea chips from `GET …/gaps/ideas` (online; hidden offline) |
| Picks | "{GUIDE}'S FIRST-TIMER PICKS" with "{n} ›" → `7c-3`; each card shows ♥ SAVED, IN DAY {n} or + (one tap saves to Ideas, toast "{place} is in Ideas.") |
| Swipe | Pink card "SWIPE TOGETHER · Can't agree? 30 places, everyone swipes, matches go to Ideas." + "{n} LIVE" from swipe presence → `7g-2` (starts or joins the session) |

### 7g-2 Swipe together

The existing deck, card physics, social pills, WHY THIS?, presence and progress stay. Changes: a match stamps, then the card drops toward the Ideas count with the yes voters' faces; toast "{place} is in Ideas. {guide} will find it a day."; the deck summary lists matches as Ideas with "See them in Ideas" → `7f-2`; no "suggested for Day N" copy.

### 7g-3 Destination guide

The existing 3d-1 screen with the guide sticker sitting on the hero (not a ghost), month bars that grow on scroll, month chips, re-pricing per crew airport, picks, "{n} CREW PLANS ›" (→ `3o-1` once community plans register it), PITCH TO THE CREW, SOLO TRIP.

Reuse / extend / new: reuse the destination screen and its server route, month bars/panel, picks, the whole swipe UI and session hook, sponsored card; extend the destination screen with a trip mode, the swipe match toast and summary; new gaps card and pick state chips.

## Architecture & contracts

| Kind | Delta |
|---|---|
| Registry | `7g-1` (trip mode, `tripId` param), `7g-2`, `7g-3` registered; `3d-1` with a `tripId` → `7g-1`, without → `7g-3`; `3d-2` → `7g-2`, through function routes reading `planning.redesign` |
| Data | `useTripIdeas` (counts, states), plan gaps (planner, phone), `GET /v1/trips/{id}/gaps/ideas` (phase 4), swipe presence; server swipe change in phase 7 |
| Server | none new |

## Tasks

### T1 — Explore in a trip (7g-1)
- Files: `apps/mobile/src/features/explore/trip-explore/**`, `apps/mobile/src/app/(trip)/[tripId]/explore/index.tsx`, `apps/mobile/src/features/explore/routes.ts`, `packages/i18n/locales/{en,vi}/explore/trip-explore.*`
- Steps: 1. Trip mode of the destination screen (shared hero). 2. Docked search. 3. Gaps card with idea chips. 4. Pick states + one-tap save. 5. Swipe card with live count. 6. Register `7g-1`; `3d-1` with trip → here.
- Tests: `pnpm --filter @cp/mobile test -- features/explore/trip-explore` (pick state from ideas and plan; gap chosen = next upcoming gap)
- Done when: the trip hub's Explore entry opens 7g-1 on the Bali seed with Wed 16:00–19:00 and three ideas.
- Status: done — d9cda6ea4

### T2 — Swipe together, matches to Ideas (7g-2)
- Files: `apps/mobile/src/features/explore/{screens/swipe-screen.tsx,components/{match-stamp,deck-summary}.tsx,hooks/use-swipe-session.ts}`, `packages/i18n/locales/{en,vi}/explore/swipe.*`
- Steps: 1. Match → idea toast and fly-to-Ideas motion. 2. Summary as Ideas. 3. Register `7g-2`.
- Tests: `pnpm --filter @cp/mobile test -- features/explore/swipe` (match payload with `idea_id` handled; older payload with `change_set_id` still handled)
- Done when: a match made on two devices shows in Ideas on both with both faces.
- Status: done — 5a51f2693

### T3 — Destination guide (7g-3) and entry ids
- Files: `apps/mobile/src/features/explore/{screens/destination-screen.tsx,components/dest-hero.tsx}`, `apps/mobile/src/app/explore/[destination].tsx`
- Steps: 1. Sticker sits on the hero. 2. Register `7g-3`; `3d-1` without a trip → here.
- Tests: none beyond typecheck
- Done when: matches 7g-3 on device (EN, VI).
- Status: done — 3ee4324db

### T4 — Device flows and undesigned states
- Files: `e2e/explore/{trip-explore,destination,destination-vi,fresh-destination,swipe,swipe-vi}.yaml`, `e2e/explore/subflows/{destination-scenes,swipe-scenes}.yaml`, `docs/undesigned-states.md`
- Tests: `gh workflow run device.yml --ref <branch> -f platform=android -f build_url=<e2e-test APK> -f flows="e2e/explore/trip-explore.yaml,e2e/explore/swipe.yaml,e2e/explore/destination.yaml" -f mode=compare -f pr=<n> -f shards=1`
- Done when: sheets reviewed; `ui-reviewed` applied.
- Status: done — add9ecb26 (flows and sheets posted; `ui-reviewed` is the controller's)

## Device flows

| Flow | Platform | Covers |
|---|---|---|
| `e2e/explore/trip-explore.yaml` | Android | 7g-1 gaps, pick states, one-tap save, swipe entry |
| `e2e/explore/swipe.yaml` | Android | 7g-2 match on two accounts → Ideas |
| `e2e/explore/destination.yaml` | Android | 7g-3 bars, re-price, pitch, solo |

## Phase acceptance criteria

- [ ] T1–T4 done-when checks pass.
- [ ] No 6th tab; Explore reachable from Home and the trip (C30).
- [ ] Sponsored rules unchanged (picks row ≤ 1 labelled slot, free tier only).

## Risks & rollback

| Risk | Likelihood × impact | Mitigation / rollback |
|---|---|---|
| Q-24 not amended | M × L | 7g-2 keeps today's "suggested for Day N" toast and also shows the idea; copy switches by the server's match payload |
| Gap ideas slow on open | M × L | the card renders the gap first, chips when they arrive |

## Migration (existing users' data and screens)

No data. Old swipe sessions keep working; their earlier matches stay as proposed change sets. The trip hub's Explore and swipe entries keep calling `hrefFor('3d-1'|'3d-2')`, which now resolve to 7g screens when the switch is on.

## Undesigned states to log

No gaps ("Your days are full" card); gap ideas offline; pick saved by a crewmate vs me (♥ SAVED for either); swipe with no matches at the end; Explore in a trip with nothing planned yet.

## Open questions

1. "+" on 7g-1 picks saves to Ideas in one tap (caption "one tap to add", prototype toast "is in Ideas"), while + in lists opens Add to plan (7f-1 caption). Default as stated.
