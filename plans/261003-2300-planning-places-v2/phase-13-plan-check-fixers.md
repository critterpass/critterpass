---
phase: 13
title: Plan check and its fixers
status: in progress
depends_on: [1, 3, 4, 5, 7]
wave: 4
screens: [7h-1, 7h-2, 7h-3, 7h-4, 7h-5]
tasks: 8
gate: T7 follows the founder decision "Balance the crew: where the numbers live"; T5's crowd copy follows "Crowd data source"
owns:
  - packages/planner/src/{reorder,swaps,fixers}/**
  - packages/planner/test/{reorder,swaps,fixers}/**
  - services/api/src/planning/fixers/**
  - services/api/src/commands/checks/**
  - services/api/test/{planning/fixers,commands/checks}/**
  - apps/mobile/src/features/plan/check/**
  - apps/mobile/src/app/(trip)/[tripId]/check/**
  - packages/i18n/locales/{en,vi}/plan/check.*
  - e2e/plan/{plan-check,less-driving,rain-crowds,fill-gap,balance}.yaml
mount_points:
  - packages/planner/src/check/index.ts (register the three fixers)
  - services/api/src/planning/register.ts, apps/mobile/src/features/planning-register.ts (one line each)
  - packages/i18n/locales/{en,vi}/notifications.* (the private ask to a member)
  - docs/api-contracts-planning.md, docs/undesigned-states.md
---
# Phase 13 — Plan check and its fixers

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | Q-30 (organiser applies, members propose), Q-36 (collisions push later items), Q-37 (unasked changes; a FIX is asked), C41 (one vote for a set), C13 (weather replans are free), C28 (nobody named; passive signals private), C3 (GuideAction = executed side effect with inverse) |
| Phase 4 | `plan_check_issues` kinds, params, `fix` descriptor, the fixer registry interface |
| Code | `packages/planner/src/draft/{schedule-day.ts:178,sequence.ts:134,158}` (`bestOrder` minimises rule breaks, not travel), `disruption/weather-replan.ts:60` (`suggestWeatherMove`, ignores travel), `services/api/src/plan/lock-rules.ts:23,50`; `services/worker/src/jobs/disruptions/weather-replan.ts` (`ai.replan` → change set `trigger='weather'`), `commands/disruptions/dismiss-weather-suggestion.ts`; `guide_actions` (inverse + `undo_until`) and `undo_guide_action`; `services/worker/src/guide-actions` (executor, undo expiry); trip-feed UNDO (#546); `must_dos` (C1, synced) |
| Renders + captions | 7h-1 "Runs by itself whenever the plan changes and shows up as a count on the trip. Issues deal in one by one, worst first. Each FIX opens its own screen (7h-3, 7h-4) or applies a one-liner with an undo; FIX ALL gathers everything into one review (7h-7)." · 7h-2 "Opens from any dashed slot. Tokek builds the options from saves first, then from what fits the time, the weather and who's free. Picking one draws its little route on the map behind the sheet; the button changes to match." · 7h-3 "The old route draws first, then untangles into the new one while the drive time counts down from 2h10 to 1h05. Booked stops show a lock and never move. The list re-sorts with a spring, and each row says where it used to be." · 7h-4 "The rain band drifts in over the day's blocks, and the clash on the ridge walk pulses pink. Ticking a swap slides its block from the NOW lane into place on SWAPPED. Three days out the band firms up from the real forecast and Tokek says if anything changed." · 7h-5 "Only the organiser sees this, and nobody is named in the chat. The squares fill in each person's colour as their saves land in days. When someone's at zero, Tokek looks for their saves that fit without moving anything and offers those first." |

## Overview

Goal: the plan check the trip already computes (phase 4) becomes something you act on: one screen of issues worst first, one-tap fixes with undo, a fixer screen each for driving, rain and crowds, a sheet for free time, an organiser-only view of whose picks made it, and FIX ALL into one review.

Done when: on the Bali seed the check shows 3 to fix and 2 to know in the render's order; each FIX works for an organiser (applies, undo from the trip feed) and for a member (a change set); Less driving cuts Tuesday's drive with booked stops fixed; Rain and crowds swaps three blocks; Fill a gap adds the chosen idea for the people who are free; Balance adds Dev's two saves or asks Dev privately; device sheets match 7h-1…7h-5.

## Requirements

### 7h-1 Plan check

| Area | Behaviour |
|---|---|
| Header | ← TRIP; "CHECKED {time ago}" from `plan_checks.checked_at` ("CHECKING…" while running) |
| Headline | "{n} TO FIX, {m} TO KNOW"; body "Opening hours, drives, bookings and everyone's saves, against all {d} days. Nothing changes until you say so." |
| Cards | Dealt in worst first: tags (kind colour + day), title and explanation from params ("The class ends at 13:00. Monkey Forest is booked for 12:00."), "→ {fix summary}" and FIX |
| FIX | `apply` fix → `apply_check_fix` (organiser: applied with a guide-action undo, card slides off, toast "Dinner moved to Jimbaran. Undo it from the trip feed."; member: sent as a change set); `screen` fix → `7h-3`/`7h-4`/too-far detail |
| To know | Dashed card with the know items |
| FIX ALL | "FIX ALL {n} · REVIEW FIRST" → `POST …/check/fix-all` → `7h-7` |
| Balance | Organiser-only row "Whose picks made it ›" at the end (undesigned entry) → `7h-5` |

### 7h-3 Less driving

"ONLY YOU SEE THIS"; "SAME DAY, LESS DRIVING"; "{before} → {after} in the car" counting down; BEFORE/AFTER route sketches (old draws, then untangles); rows: number, new time, name, BOOKED with lock (never moves) or "WAS 12:00"/"WAS 4TH"; USE THIS ORDER (organiser apply / member proposes) and "Send it to the crew first" (change set sent).

### 7h-4 Rain and crowds

"RECHECKS {date}" (the day minus 3, while outside the forecast horizon; "FORECAST {time}" inside it); "RAIN AT 1, BUSES AT 10"; a source line that says where each number comes from (forecast or the month's usual; crowd source per the founder decision); chart: RAIN band (forecast or normals), CROWDS bars, NOW lane, SWAPPED lane, the clashing block pulsing pink; swaps with ticks (unticking keeps that block); USE ALL {n}; "Send to the crew first". A pending weather change set from the forecast watch (`ai.replan`) for that day is shown here as its swaps (single source); unticking all dismisses it (`dismiss_weather_suggestion`).

### 7h-2 Fill a gap

Sheet over the trip map from any dashed slot or FILL IT: "{DAY} · {from}–{to}", "FOUR OF YOU ARE FREE", avatars, context line ("Maya and Rin are at the spa till 18:00. Dinner is at 19:30."), "TOKEK HAS THREE IDEAS" from `GET …/gaps/ideas` (radio cards with chips: minutes, cost each, whose save, who voted), the CTA follows the pick ("ADD COFFEE + MARKET"), the picked route drawn on the map behind (`usePlanningMapPreview`), "Something else" → `7d-1` scoped to the gap. Add → the free people as attendees (organiser applies; member proposes).

### 7h-5 Balance the crew (organiser and co-organisers only)

"ONLY YOU SEE THIS"; "WHOSE PICKS MADE IT"; summary line; per member: avatar, name ("(you)"), must-do with ✓ when placed, squares filling in their colour as their saves land in days, "{k} OF {n} SAVES IN" (pink at 0); for someone at zero: the guide's line and their saves that fit without moving anything (idea fit good, no `needs_move`); ADD BOTH (organiser applies; the change reasons name places, never the balance); ASK {NAME} FIRST → `ask_member_about_saves` → toast "Tokek asked Dev privately. Nobody else sees it."

Reuse / extend / new: reuse `scheduleDay`, lock rules, `suggestWeatherMove`, the weather replan change sets and dismissal, guide actions with inverse and undo, the trip-feed UNDO, the review (7h-7), `HourBars`, `MiniRouteSketch`, `OptionRadioCard`; extend the plan check job (fixers registered) and `suggestWeatherMove` (multi-block swaps with crowds and travel); new reorder engine, swaps engine, too-far alternative, fixer routes, two commands, five screens.

## Architecture & contracts

| Kind | Delta (`api-contracts-planning.md`) |
|---|---|
| Pure | `packages/planner/src/reorder/**` (exact search for ≤ 8 movable stops, booked/locked stops fixed in time, opening spans and meal windows respected, objective = drive minutes, ties → fewer moves); `swaps/**` (outdoor blocks out of rain windows and busy blocks out of busy windows by swapping with flexible blocks or moving to dry/quiet slots, travel-aware); `fixers/too-far.ts` (replace the far item with the same category near the route home); all registered in the check's fixer registry so issues carry fix ops and summaries |
| Routes | `GET /v1/trips/{id}/days/{dayId}/reorder` → `{before{order[], drive_min}, after{order[], drive_min, schedule[{stable_id, starts_at}]}, locked[], was[{stable_id, position, starts_at}]}`. `GET /v1/trips/{id}/days/{dayId}/swaps` → `{rain{from, to, source: forecast\|normal, recheck_on?}, crowds{source, hourly[]}, now[], swapped[], swaps[{stable_id, from, to, reason_code}]}`. `POST /v1/trips/{id}/check/fix-all` `{issue_ids[]}` → `{change_set_id}` (draft, author-only, trigger `check`) · all participants, no-store |
| Commands | `apply_check_fix` `{issue_id, base_version}` → organiser: ops applied + `guide_actions` row (kind `check_fix`, inverse ops, undo until the item starts or 24 h) → `{applied, guide_action_id}`; member: change set created and sent → `{change_set_id}`; stale issue → `STATE_INVALID{reason: stale_issue}` · participant. `ask_member_about_saves` `{trip_id, user_id, idea_ids[1..3]}` → `{ask_id}`: a `member_asks` row (two-party, phase 2) with pre-validated ops, a private guide line and an inbox actionable to that member only; never in crew chat · organiser / co-organiser. `answer_member_ask` `{ask_id, accept}` → accept applies the ops under the asker's authority if they are still an organiser (else a change set), decline closes it · the asked member only |
| Push | `check.ask_member` (BUDGET, the member only) |
| Realtime | uses `check.updated`; `guide_actions` changes sync as today |

## Tasks

### T1 — Fixer engines
- Goal: reorder, swaps and too-far alternatives as pure, registered fixers.
- Files: `packages/planner/src/{reorder,swaps,fixers}/**`, `packages/planner/test/{reorder,swaps,fixers}/**`, `packages/planner/src/check/index.ts` (registration)
- Steps: 1. Reorder with fixed booked stops and windows. 2. Swaps (rain + crowds, travel-aware). 3. Too-far alternative via fit + nearby candidates passed in. 4. Register; summaries as params.
- Tests: `pnpm --filter @cp/planner test -- reorder swaps fixers` (property tests, 60 s budget: a booked stop's time never changes; reorder never increases drive minutes; swaps never put an outdoor block into a wetter hour)
- Done when: Bali Tuesday goes 2h10 → 1h05 with the cooking class fixed; Wednesday's three swaps match 7h-4.
- Status: todo

### T2 — Fixer routes and commands
- Files: `services/api/src/planning/fixers/**`, `services/api/src/commands/checks/{apply-check-fix,ask-member-about-saves,answer-member-ask}.ts`, `services/api/test/{planning/fixers,commands/checks}/**`
- Steps: 1. Reorder and swaps routes with chart data. 2. Fix-all into one draft. 3. `apply_check_fix` with guide-action inverse (undo from the trip feed) and the member path. 4. `ask_member_about_saves` + `answer_member_ask` with the private line and inbox action.
- Tests: `pnpm test:remote @cp/api -- commands/checks planning/fixers` (organiser applies + undo restores; member gets a change set; a non-organiser cannot ask; the ask never reaches another member's streams)
- Done when: undoing a one-liner from the trip feed restores the plan version's items.
- Status: todo

### T3 — Plan check screen (7h-1)
- Files: `apps/mobile/src/features/plan/check/{check-screen,issue-card,issue-copy,use-fix}.ts(x)`, `apps/mobile/src/app/(trip)/[tripId]/check/index.tsx`, `packages/i18n/locales/{en,vi}/plan/check.*`
- Steps: 1. Header, headline, cards dealt worst first (stagger; reduce motion = fade). 2. Issue copy from params. 3. FIX paths. 4. FIX ALL → review. 5. Balance row for organisers. 6. Register `7h-1`.
- Tests: `pnpm --filter @cp/mobile test -- features/plan/check/use-fix` (organiser vs member path; stale issue refreshes)
- Done when: the trip map's CHECK and the whole-trip SEE open this screen with the seed's 3 + 2.
- Status: todo

### T4 — Less driving (7h-3)
- Files: `apps/mobile/src/features/plan/check/less-driving/**`, `apps/mobile/src/app/(trip)/[tripId]/check/less-driving/[dayId].tsx`
- Steps: 1. Count-down and before/after sketches. 2. Rows with locks and WAS badges, spring re-sort. 3. Use / send. 4. Register `7h-3`.
- Tests: none beyond typecheck (the engine is tested in T1)
- Done when: USE THIS ORDER applies and the day plan shows the new order with new legs.
- Status: todo

### T5 — Rain and crowds (7h-4)
- Files: `apps/mobile/src/features/plan/check/rain-crowds/**`, `apps/mobile/src/app/(trip)/[tripId]/check/rain/[dayId].tsx`
- Steps: 1. Chart with band, crowds, NOW/SWAPPED lanes; pulse on the clash. 2. Swap ticks slide blocks. 3. Source line per the crowd decision. 4. Weather change set shown as swaps; dismissal. 5. Register `7h-4`.
- Tests: `pnpm --filter @cp/mobile test -- features/plan/check/rain-crowds/use-swaps` (ticks → ops; weather change set merge)
- Done when: the day plan's "SEE" under the ridge walk opens this screen and USE ALL 3 applies.
- Status: todo

### T6 — Fill a gap (7h-2)
- Files: `apps/mobile/src/features/plan/check/fill-gap/**`, `apps/mobile/src/app/(trip)/[tripId]/check/gap.tsx`
- Steps: 1. Sheet over the trip map with the gap params. 2. Ideas, chips, CTA following the pick. 3. Map preview via `usePlanningMapPreview`. 4. Add for the free people; "Something else" → search. 5. Register `7h-2`.
- Tests: none beyond typecheck (gap ideas tested in phase 4)
- Done when: FILL IT on Wed 16:00 adds coffee + market for the four free people.
- Status: todo

### T7 — Balance the crew (7h-5)
- Files: `apps/mobile/src/features/plan/check/balance/**`, `apps/mobile/src/app/(trip)/[tripId]/check/balance.tsx`
- Steps: 1. Organiser gate (route and entry). 2. Numbers on the phone from synced must-dos, idea backers and plan items (or the server route if the founder chooses it). 3. Suggestions for anyone at zero. 4. ADD BOTH / ASK FIRST. 5. Register `7h-5`.
- Tests: `pnpm --filter @cp/mobile test -- features/plan/check/balance/model` (saves counted once per place; must-do ✓ only when placed; non-organiser gets nothing)
- Done when: Dev goes from 0 to 2 of 3 after ADD BOTH; ASK sends Dev an inbox action and nothing to crew chat.
- Status: todo

### T8 — Device flows and undesigned states
- Files: `e2e/plan/{plan-check,less-driving,rain-crowds,fill-gap,balance}.yaml`, `docs/undesigned-states.md`
- Tests: `gh workflow run device.yml --ref <branch> -f platform=android -f build_url=<e2e-test APK> -f flows="e2e/plan/plan-check.yaml,e2e/plan/less-driving.yaml,e2e/plan/rain-crowds.yaml,e2e/plan/fill-gap.yaml" -f mode=compare -f pr=<n> -f shards=1`; `balance.yaml` separately (two accounts)
- Done when: sheets reviewed; `ui-reviewed` applied.
- Status: todo

## Device flows

| Flow | Platform | Covers |
|---|---|---|
| `e2e/plan/plan-check.yaml` | Android | 7h-1 cards, one-liner FIX + undo from the trip feed, FIX ALL → 7h-7, member variant |
| `e2e/plan/less-driving.yaml` | Android | 7h-3 use and send |
| `e2e/plan/rain-crowds.yaml` | Android | 7h-4 ticks, use all, recheck label |
| `e2e/plan/fill-gap.yaml` | Android | 7h-2 from a dashed slot, preview route, add |
| `e2e/plan/balance.yaml` | Android | 7h-5 organiser only, add both, ask privately (second account sees the ask, crew chat does not) |

## Phase acceptance criteria

- [ ] T1–T8 done-when checks pass.
- [ ] Every fix respects locks (property tests) and goes through `apply_plan_ops` or a change set.
- [ ] Nothing from 7h-5 appears in crew chat, change-set reasons or another member's streams.
- [ ] The timeline weather ghost and 7h-4 never show different swaps for the same day.

## Risks & rollback

| Risk | Likelihood × impact | Mitigation / rollback |
|---|---|---|
| Reorder search too slow for long days | L × M | ≤ 8 movable stops exact; more → keep the current order and offer nothing |
| Fixes feel bossy (applied without enough context) | M × M | one-liners only for the organiser, always with undo; screens for anything bigger |
| Two sources of weather suggestions disagree | M × M | 7h-4 reads the weather change set when one exists; the check's rain issue links to it |
| Balance feels like surveillance | M × H | organiser-only, never stored, never in chat; founder decision on where it lives |

## Migration (existing users' data and screens)

No data. Pending weather change sets from the forecast watch show in 7h-4. The old timeline ghost stays behind `planning.redesign` off until phase 14.

## Undesigned states to log

Check running; check failed; nothing to fix ("All good" card); stale issue after a newer edit; member FIX labels ("Suggest the fix"); too-far detail screen (no render: a short sheet with the alternative and its leg); no better order; no swaps; forecast unavailable (normals only); gap with no ideas; Balance entry row; ask already sent; member declines the ask.

## Open questions

1. Undo window for a one-liner fix: default until the item starts or 24 h (the existing guide-action undo rule).
2. Who sees "TO KNOW" items: default everyone on the trip.
