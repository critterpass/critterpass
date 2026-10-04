---
phase: 7
title: Add to plan, Ideas, placing them and the review
status: done
depends_on: [1, 3, 4, 5]
wave: 3
screens: [7f-1, 7f-2, 7h-6, 7h-7]
replaces: [3e-3]
tasks: 8
gate: T2 follows the Q-24 amendment (plan.md contradiction 3); without it, matches keep their ChangeSet and also become ideas
owns:
  - services/api/src/commands/ideas/**
  - services/api/src/planning/ideas/**
  - services/api/src/commands/places/save-place.ts
  - services/api/src/commands/explore/swipe-vote.ts
  - services/api/src/explore/match-to-changeset.ts
  - services/api/test/commands/ideas/**
  - packages/planner/src/placement/**
  - packages/planner/test/placement/**
  - services/worker/src/jobs/planning/ideas/**
  - services/worker/test/planning/{ideas-seed,place-ideas}.db.test.ts
  - apps/mobile/src/features/plan/{add,ideas,review}/**
  - apps/mobile/src/app/(trip)/[tripId]/{add,ideas}/**
  - apps/mobile/src/app/(trip)/[tripId]/review/**
  - packages/i18n/locales/{en,vi}/plan/{add,ideas,review}.*
  - e2e/plan/{add-to-plan,ideas,placing,review}.yaml
mount_points:
  - services/api/src/cost/preview.ts (driving minutes delta)
  - services/api/src/planning/register.ts, services/worker/src/jobs/planning/index.ts, apps/mobile/src/features/planning-register.ts (one line each)
  - packages/i18n/locales/en/notifications.* (placement-ready ping text)
  - docs/api-contracts-planning.md (refine own rows), docs/undesigned-states.md
---
# Phase 7 — Add to plan, Ideas, placing them and the review

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | Q-24 (swipe matches; see founder decision), Q-30 (organiser applies, members propose), Q-35/Q-44 (just me, own share), C41 (decider policy, "NEEDS 3 YESES"), C13 (placing ideas is not a redraft), C1/C28 |
| `docs/api-contracts-explore.md` | `save_place`, `swipe_vote` rows (match → proposed ChangeSet today) |
| Code | `services/api/src/commands/places/save-place.ts` (save/unsave/request), `commands/explore/swipe-vote.ts:90-126` + `explore/match-to-changeset.ts:41`; `packages/planner/src/feasibility/changeset-delta.ts` (`changeSetReview`), `services/api/src/cost/preview.ts:112,127`; `services/worker/src/ai/job-runner.ts:271` (`defineAgentJob`, steps, `job.progress`); `apps/mobile/src/features/plan/review/**` (3e-3: `review-view.tsx`, `change-card.tsx`, `review-chips.tsx`, `data/use-changeset.ts:118,234`); `features/plan/day/add-item-sheet.tsx` (the old add sheet: time field, attendees, member "Suggest to the crew"); `features/plan/day/time-range-field.tsx` |
| Renders | `7f-1_Add_to_plan.png`, `7f-2_Ideas.png`, `7h-6_Tokek_is_placing_them.png`, `7h-7_Review_changes.png`; old `3e-3_Review_changes.png` |
| Captions | 7f-1 "One sheet for every add, from the map, a card, search or a place. The dot on each day says how well it fits: green good, orange possible, grey no. Picking another day moves the block and redoes the reasons. ADD drops the block into the day with a bounce and the map draws the new leg." · 7f-2 "Everything saved but not placed, from search, links, swipes and the map … Holding a row lifts it; the day chips light up green, orange or grey as it passes over them, and dropping it opens Add to plan on that day." · 7h-6 "Leaving doesn't cancel it: the review waits as a card on the trip and a quiet ping." · 7h-7 "Every change Tokek makes lands here first, from a fix, a swap or placing ideas … Sending puts the whole set to the crew as one vote" |

## Overview

Goal: one Add to plan sheet for every add, the Ideas list of everything saved but not placed (with drag onto a day), Tokek placing ideas in the background, and the review restyled so every proposed set (fixes, swaps, placed ideas, weather, chat) goes to the crew as one vote.

Done when: adding from any entry opens 7f-1 with Tokek's day and time and reasons; organiser adds apply, member adds become a change set; Ideas lists crew saves, link imports, swipe matches and map saves with fit lines and drags onto days on Android and iOS; PLACE THEM FOR ME produces a private draft reviewed in 7h-7 and sent as one vote that a second device approves; device sheets match 7f-1, 7f-2, 7h-6, 7h-7.

## Requirements

### 7f-1 Add to plan

| Area | Behaviour |
|---|---|
| Opening | Route `(trip)/[tripId]/add/[placeId]?day&start&after&source`, registered `7f-1`; presets from a drop on a day (7f-2), "+ right after this stop" (7e-2) or a fixer |
| Days | `DayChips` with fit dots from `useFit(…, include_context)`; Tokek's best day preselected; picking another day moves the block and recomputes reasons locally (`useLocalFit`) |
| Block | Day header ("SAT 17 · FREE DAY"), a leave-the-stay line when the stop follows the stay ("07:15 · LEAVE THE VILLA · CAR 45 MIN"), the new block (time, length, "New · quiet till about 10"), then the nearby suggestion from phase 4's nearby route ("Gunung Kawi is 10 min on. Add it too?" +) |
| Why | `ReasonGrid` titled "WHY {time}" from reason codes (opens at, busy from, drive minutes + "Grab works", dry mornings in {month}) |
| Who's going | Avatars + "Everyone ›" → attendee picker; unticking someone updates the per-person cost when the place has a price ("The split follows") |
| Commit | Organiser: `apply_plan_ops` add (+ the nearby add if ticked). Member: change set created and sent; button reads "SUGGEST FOR {DAY} · {time}" (undesigned). Sheet closes; the caller screen bounces the block in |
| Later | "Just save it for later" → `save_idea` (toast + Ideas count hop) |
| Time | Tapping the time opens the existing 15-minute time field; reasons recompute locally |

### 7f-2 Ideas

| Area | Behaviour |
|---|---|
| List | `useTripIdeas`: crew ideas not in the current version, minus my hidden places; rows with category thumb, name, fit line by tone (fits: yellow, split: pink, needs a move: orange), saver avatars, drag handle |
| Counts | Body "Eight saved places that aren't in a day yet." and PLACE THEM FOR ME sub-line ("Six fit without moving anything booked. Two need the crew.") from idea fits |
| Drag | Long-press lifts a row; the day chips glow green/orange/grey from that idea's per-day grade as it passes; drop opens 7f-1 preset to that day; a11y action "Add to a day…" opens 7f-1 |
| Links | Row → place detail (`7e-1`); split row → `7e-3`; ◎ MAP → places map (`7c-1`, ideas filter); ← TRIP |
| Placement | PLACE THEM FOR ME → `start_idea_placement` → 7h-6 |

### 7h-6 Tokek is placing them

Route `(trip)/[tripId]/ideas/placing/[jobId]`, registered `7h-6`: mini-map where saved pins slide into numbered stops in their day's colour as partial results arrive, the guide sprite hops in the middle, four step lines tick from `job.progress` ("Opening hours for all 8", "Nothing booked moves", "Routing Saturday and Wednesday", "Leaving the split one for you"), "Keep browsing" leaves without cancelling. Done → replaces itself with 7h-7. Left early → the review waits as a card on the trip (phase 10 renders it from `usePendingReviews`) and a quiet ping.

### 7h-7 Review changes (all triggers)

| Area | Behaviour |
|---|---|
| Header | Back to where it came from; "ONLY YOU SEE THIS" while the set is my unsent draft; headline for ideas "{n} PLACED, {m} FOR YOU", fixes and swaps from their trigger, other triggers keep the guide headline they have today |
| Rows | Day tag in the day's colour, "+ PLACE" / moved / removed, time, reason ("08:00 · before the buses", "16:00 · Dev's, while the spa runs"); tick toggles strike-through and the totals recount (`set_changeset_item`) |
| Needs you | Ideas left out: split → SEE opens `7e-3`; needs a move → SEE explains what would have to move |
| Totals | "+RP 210K EACH" (cost delta each), "+1H20 DRIVING" (new: driving minutes delta), "0 BOOKINGS MOVED"; odometer recount |
| Actions | SEND TO CREW · NEEDS {k} YESES (`send_changeset`, decider policy per C41); "Apply to my plan only" (personal apply, Q-35) |

Reuse / extend / new: reuse `usePlanEditor` (now `data/plan`), `time-range-field`, attendee lanes, `changeSetReview` + cost preview, the review screen's data hooks, change cards, chips, chat card and push actions, `defineAgentJob`; extend `save_place` (trip context), `swipe_vote` (match → idea), cost preview (driving delta), the review layout (7h-7); new add sheet, Ideas screen, drag to day, placement engine and job, placing screen.

## Architecture & contracts

| Kind | Delta (`api-contracts-planning.md` rows) |
|---|---|
| Commands | `save_idea` `{trip_id, poi_id? \| pin{name, lat, lng}, source, source_url?}` → `{idea_id, backer_ids}`; also saves the POI to the caller's `saved_items`; outside the destination → `VALIDATION{reason: outside_destination}` · participant · events `idea.saved`. `remove_idea` `{idea_id}` → caller leaves the backers; last backer or an organiser soft-deletes · `idea.removed`. `hide_place` / `unhide_place` `{poi_id}` → `{hidden}` · self. `start_idea_placement` `{trip_id, idea_ids?}` → `{job_id}`; one running per requester per trip (input-hash dedupe); counts toward `fair_use.system_jobs_per_trip_day` (wired here) |
| Changed commands | `save_place` / `unsave_place`: a POI inside the destination of the caller's active trips also adds/removes the caller's backing on those trips' ideas. `swipe_vote`: a match upserts the trip idea with every yes voter as a backer (`sources += swipe`) and returns `match{match_id, idea_id}`; no ChangeSet (founder decision on Q-24). Matches already turned into proposed ChangeSets stay as they are |
| Job | `ai.place_ideas` (agent job kind `place_ideas`, no model call): steps hours → locks → routing (touched days) → needs-you; writes a draft change set (trigger `ideas`, author = requester); emits `ideas.placed` → push router: one quiet push to the requester (BUDGET, collapse per trip) + inbox row |
| Job | `ideas.seed`: on trip destination set and on a member joining, and once as a backfill: participants' saved POIs inside the destination + unslotted swipe matches → `trip_ideas` |
| Route delta | `POST /v1/trips/{id}/costs/preview` adds `driving_delta_min` (planning travel over the set's ops) |
| Realtime | `trip_plan:` `ideas.changed{idea_id}`; `swipe:` `match{…, idea_id}` (replaces `change_set_id, day_no` for new matches); `user:#uid` `job.progress` for placement |
| Pure | `packages/planner/src/placement/**`: assign ideas to days by fit (scarcest first), never moving booked or must-do items, never placing split ideas, at most the pace limit per day, deterministic ties |

## Tasks

### T1 — Ideas commands, save hooks and seeding
- Goal: ideas exist for every way a place gets saved.
- Files: `services/api/src/commands/ideas/**`, `services/api/src/planning/ideas/{seed,register}.ts`, `services/api/src/commands/places/save-place.ts`, `services/worker/src/jobs/planning/ideas/seed.ts`, `services/api/test/commands/ideas/**`, `services/worker/test/planning/ideas-seed.db.test.ts`
- Steps: 1. Handlers with the display copy taken from `pois` (or the pin). 2. `save_place`/`unsave_place` trip hook. 3. `ideas.seed` (events + backfill command). 4. Realtime hint.
- Tests: `pnpm test:remote @cp/api -- commands/ideas` (happy path + outsider deny + outside destination); `pnpm test:remote @cp/worker -- planning/ideas-seed.db`
- Done when: two members saving the same place make one idea with two backers; an outsider gets `NOT_FOUND`.
- Status: done — 5a47b01d3 (#613)

### T2 — Swipe matches go to Ideas
- Goal: "matches drop into Ideas with everyone who said yes" (7g-2).
- Files: `services/api/src/commands/explore/swipe-vote.ts`, `services/api/src/planning/ideas/match-to-idea.ts`, `services/api/src/explore/match-to-changeset.ts` (kept for existing rows, no new callers)
- Steps: 1. In the vote transaction: unique match row, then idea upsert with the yes voters. 2. Contract + realtime payload. 3. Apply only after the founder confirms the Q-24 change; otherwise keep the ChangeSet path and still add the idea.
- Tests: `pnpm test:remote @cp/api -- commands/explore/swipe` (20 concurrent yes votes → one match, one idea, all yes voters as backers)
- Done when: a match shows in Ideas on both devices with the yes voters' faces.
- Status: done — 05478f796

### T3 — Placement engine and job
- Goal: PLACE THEM FOR ME in the background with progress.
- Files: `packages/planner/src/placement/**`, `packages/planner/test/placement/**`, `services/worker/src/jobs/planning/ideas/place-ideas.ts`, `services/api/src/commands/ideas/start-idea-placement.ts`, `services/worker/test/planning/place-ideas.db.test.ts`, `packages/i18n/locales/en/notifications.*`
- Steps: 1. Pure assignment over fit results. 2. Agent job steps and partial results (placed idea → day, number) for the 7h-6 animation. 3. Draft change set (author-only). 4. Ping + inbox row. 5. Wire the per-trip system jobs cap.
- Tests: `pnpm --filter @cp/planner test -- placement` (property, 60 s budget: never moves a locked item, never places a split idea, same input → same output); `pnpm test:remote @cp/worker -- planning/place-ideas.db`
- Done when: the Bali fixture places 6, leaves 2 "for you" with their reasons; the draft is invisible to other members (stream test from phase 2 covers the rule).
- Status: done — c37fc93a3

### T4 — Add to plan sheet (7f-1)
- Goal: one sheet for every add.
- Files: `apps/mobile/src/features/plan/add/**`, `apps/mobile/src/app/(trip)/[tripId]/add/[placeId].tsx`, `apps/mobile/src/features/planning-register.ts` (one line), `packages/i18n/locales/{en,vi}/plan/add.*`
- Steps: 1. Fit with context; day chips + dots; block preview; nearby suggestion. 2. Local re-evaluation on day/time change. 3. Who's going + split. 4. Organiser apply / member suggest; save for later; registered `7f-1`.
- Tests: `pnpm --filter @cp/mobile test -- features/plan/add` (state machine: preset day honoured, day switch recomputes reasons, member path produces a change set op)
- Done when: adding Tirta Empul on a seeded trip shows SAT 17 · 08:00 with the four reasons, and the stop appears with its leg on a second device.
- Status: done — 66e28b41f

### T5 — Ideas screen with drag onto a day (7f-2)
- Goal: everything saved but not placed, placeable by hand.
- Files: `apps/mobile/src/features/plan/ideas/{ideas-screen,idea-row,use-drag-to-day,drag-hit}.ts(x)`, `apps/mobile/src/app/(trip)/[tripId]/ideas/index.tsx`, `packages/i18n/locales/{en,vi}/plan/ideas.*`
- Steps: 1. Rows from `useTripIdeas` with fit lines. 2. Drag with Gesture Handler 3: lift, chip hit-testing (pure `dragHit`), grade glow, drop → 7f-1. 3. Counts and PLACE THEM FOR ME. 4. Links via `useScreenHref`. 5. Registered `7f-2`.
- Tests: `pnpm --filter @cp/mobile test -- features/plan/ideas` (hit-testing at chip edges, scroll while dragging)
- Done when: drag works on the Android emulator and on an iPhone run; a11y action adds without dragging.
- Status: done — 8af575c16

### T6 — Placing screen (7h-6)
- Goal: the background job made visible, leavable.
- Files: `apps/mobile/src/features/plan/ideas/placing/**`, `apps/mobile/src/app/(trip)/[tripId]/ideas/placing/[jobId].tsx`
- Steps: 1. Subscribe to `job.progress`; poll fallback (`jobs-route`). 2. Pins slide into numbered stops (≤ 8 animated views; reduce motion = fades). 3. Keep browsing; done → replace with 7h-7. 4. Registered `7h-6`.
- Tests: `pnpm --filter @cp/mobile test -- features/plan/ideas/placing` (progress reducer: out-of-order and repeated steps)
- Done when: leaving mid-run still yields the review card and a ping.
- Status: done — e53ceec65

### T7 — Review changes (7h-7)
- Goal: one review for every set, in the new design.
- Files: `apps/mobile/src/features/plan/review/**`, `apps/mobile/src/app/(trip)/[tripId]/review/[changesetId].tsx`, `services/api/src/cost/preview.ts`, `packages/i18n/locales/{en,vi}/plan/review.*`
- Steps: 1. Layout per 7h-7 (rows with day tags, needs-you section, only-you label). 2. `driving_delta_min` in the cost preview + chip. 3. Headlines per trigger. 4. `review/register.ts` registers `7h-7` and re-registers `3e-3` (same route; the layout switches on `planning.redesign`).
- Tests: `pnpm test:remote @cp/api -- cost/preview.db` (driving delta); `pnpm --filter @cp/mobile test -- features/plan/review` (strike + recount)
- Done when: send from 7h-7 creates the approval poll; a second device approves from the chat card; the plan updates on both.
- Status: done — e0b162b0f

### T8 — Device flows and undesigned states
- Goal: proof on device, gaps logged.
- Files: `e2e/plan/{add-to-plan,ideas,placing,review}.yaml`, `docs/undesigned-states.md`
- Steps: 1. Flows with shots named `7f-1-*`, `7f-2-*`, `7h-6-*`, `7h-7-*` (EN + VI). 2. Rename the old review flow's shots to `7h-7`. 3. Log the states below.
- Tests: `gh workflow run device.yml --ref <branch> -f platform=android -f build_url=<e2e-test APK> -f flows="e2e/plan/add-to-plan.yaml,e2e/plan/ideas.yaml,e2e/plan/placing.yaml,e2e/plan/review.yaml" -f mode=compare -f pr=<n> -f shards=1`; iOS once for `add-to-plan.yaml` (sheet presentation)
- Done when: sheets reviewed, `ui-reviewed` label applied by the controller.
- Status: done — 5186afb5f (#622, b643446bb)

## Device flows

| Flow | Platform | Covers |
|---|---|---|
| `e2e/plan/add-to-plan.yaml` | Android + iOS | 7f-1 organiser add, member suggest, day switch, save for later |
| `e2e/plan/ideas.yaml` | Android | 7f-2 list, drag onto a day, split row → 7e-3 |
| `e2e/plan/placing.yaml` | Android | 7h-6 progress, leave early → card on the trip |
| `e2e/plan/review.yaml` | Android | 7h-7 strike/recount, send, approve on a second account |

## Phase acceptance criteria

- [ ] T1–T8 done-when checks pass.
- [ ] Every add path (map card, list row, search result, place page, nearby card, drop on a day, fixer) opens 7f-1.
- [ ] Placing ideas never moves a booked item and never consumes a redraft (C13).
- [ ] Unsent drafts never reach another member's phone.

## Risks & rollback

| Risk | Likelihood × impact | Mitigation / rollback |
|---|---|---|
| Drag onto a day conflicts with list scroll on Android | M × M | long-press activation (320 ms, as the timeline), auto-scroll off while dragging; a11y action as the alternative |
| Placement quality disappoints | M × M | deterministic, reviewable before sending; NEEDS YOU explains what was left |
| Q-24 change not approved | M × L | T2 keeps the ChangeSet path and still lists the idea |
| Review restyle regresses other triggers (weather, dropout, chat) | M × H | existing review flow shots renamed and kept for those triggers; rollback = `planning.redesign` off keeps the old route |

## Migration (existing users' data and screens)

- `ideas.seed` backfill: every active trip gets its crew's saved places in the destination and its unslotted matches.
- Proposed ChangeSets from earlier matches remain in review/chat until decided.
- The old add sheet (`day/add-item-sheet.tsx`) stays on the old day screen until phase 14; the old review route serves 7h-7 when `planning.redesign` is on.

## Undesigned states to log

Member variant of the add button ("SUGGEST FOR …"); no day fits (all grey: "Nowhere fits yet" + save for later); place already in the plan (sheet shows its stop with "Move it"); attendee picker sheet; offline add (queued badge, reasons from the last fit); Ideas empty (ways to add: search, paste, swipe); Ideas offline (rows without fit lines, "Fits will update with signal"); placement found nothing to place; placement failed; review headlines for fixes/swaps; needs-a-move explainer.

## Open questions

1. Default attendees for placed ideas: default everyone (the design shows "Everyone ›"), not just the backers.
2. Should "Just save it for later" also save to the member's personal list? Default yes (`save_idea` writes `saved_items`).
