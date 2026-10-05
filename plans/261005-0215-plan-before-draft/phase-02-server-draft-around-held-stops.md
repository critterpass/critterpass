---
phase: 2
title: "Server: the guide drafts around held stops"
status: in review
branch: feat/draft-around-held-stops
depends_on: [1]
---

# Phase 2. Server: the guide drafts around what is already there

## Who owns what

- This lane: the worker's draft and redraft jobs and the api side (`services/worker/src/jobs/ai/**`, `services/api/src/commands/draft/**`).
- The plan-quality lane: the planner and the draft prompts (`packages/planner/**`, `packages/ai/**` draft and redraft). Its second pass protects a stop with `locked_reason = 'user'` wherever a stop can be trimmed, moved or dropped. Nothing in this phase edits those packages.

## The rule

A **held stop** is a row of the organiser's draft with `created_by_kind = 'user'` and no booking.

1. A draft plans the rest of the trip: held places are not offered to the guide again, and a must-do she placed herself is not placed twice and counts as made.
2. When the guide's days are checked and settled, her stops go back in exactly where she put them. A stop of the guide's that overlaps one of hers or repeats its place gives way; a booking or a must-do of the guide's stays, for the plan check to show and her to settle.
3. Her rows are carried over whole (id, time, who is going, a dropped pin, category, note, lock), and a stop she has not timed yet is copied as it is.
4. A one-day redraft reads her stops as locked (the guide is told to keep them) and puts them back the same way; every stop a redraft keeps is the same row it was.
5. Places the crew saved to Ideas are offered to the guide ahead of the rest.

## Tasks

### T1. Held stops in the draft job
- Files: new `services/worker/src/jobs/ai/draft/held-stops.ts` (load, hold, carry rows), `services/worker/src/jobs/ai/draft/{job-context,plan-input,validate-repair,persist}.ts`, `services/worker/src/jobs/ai/draft.ts`, `services/worker/test/jobs/ai/draft/held-stops.test.ts`, `held-stops.db.test.ts`.
- Tests: her stop goes back at her time, what overlaps or repeats it gives way, a must-do or booking of the guide's stays, no held stops = the itinerary as it came; the whole job on recorded replies keeps two timed stops and an untimed one with ids, times, people and pins, and her plan stays in the history.
- Status: done — 7415dba7b

### T2. A one-day redraft holds them too
- Files: `services/worker/src/jobs/ai/redraft.ts`, `services/worker/src/jobs/ai/draft/redraft-store.ts`, `services/api/src/commands/draft/versions.ts` (a dropped pin survives a restored draft and a kept redraft with changes turned off), test in `held-stops.db.test.ts`.
- Status: done — 80fcceb3b

### T3. Saved Ideas are offered to the guide
- With T1 (`job-context.ts`, `plan-input.ts`): idea places join the list `candidatePools` always offers.
- Status: done — 7415dba7b

### T4. The planner is given her stops
- Files: `services/worker/src/jobs/ai/draft/{held-stops,job-context,plan-input,validate-repair}.ts`, `services/worker/test/jobs/ai/draft/{held-stops.db.test.ts,hand-plan.ts}`.
- Her stops go in as `DraftPlanInput.held` before the outline, with the organiser's app language as `locale`. A stop of hers at a meal place (or filed as food) that starts at lunch or dinner time is the day's meal. A stop on a dropped pin gets a stand-in place for the draft (the pin, under the stop's id, never offered), so the planner routes and times around it; the saved row is hers.
- Who narrows the offer: the worker, where the offer is built. The planner tells her place or must-do apart from the guide's only within one day, so her places and the must-dos she placed herself are kept out of the pools and the frame for the whole trip; her places stay in the planner's place map (names for the guide, travel times).
- Putting her stops back after the check stage stays as the guarantee.
- Test: a draft over a hand-started plan with a held lunch: one lunch that day, her stops back with their ids and times, no overlap and no gap over two hours on her days, first check clean with no repair call.
- Status: done

## Left for the planner lane

A one-day redraft with a pinned stop has no recorded model run: the hold is tested at the store level only.
