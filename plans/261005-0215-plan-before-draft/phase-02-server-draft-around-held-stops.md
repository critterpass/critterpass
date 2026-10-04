---
phase: 2
title: "Server: the guide drafts around held stops"
status: pending
branch: feat/draft-around-held-stops
depends_on: [1]
---

# Phase 2. Server: the guide drafts around what is already there

## Context

- Pipeline: `services/worker/src/jobs/ai/draft/{load,plan-input,job-context,persist}.ts`, `services/worker/src/jobs/ai/redraft.ts`, `services/worker/src/jobs/ai/draft/redraft-store.ts`.
- Planner: `packages/planner/src/draft/{types,candidate-pools,schedule-day,sequence,validate-itinerary,repair-targets}.ts`. Today nothing is fixed in time: a must-do is held to a time of day (`wish-time.ts`), bookings are laid on after the draft (`writeBookedPlanItems`).
- Prompts: `packages/ai/src/prompts/draft/{context,skeleton,day,repair,redraft}.ts`.

## The rule

A **held stop** is an item of the organiser's draft with `created_by_kind = 'user'` and no booking. When the guide drafts:

1. Held stops stay on their day at their time. Their rows are copied into the new draft unchanged (id, time, attendees, custom place, note), never rebuilt from the guide's answer.
2. The guide is told what each day already holds and plans the rest: fewer picks on a day with less free time, none of the held places again.
3. The scheduler places the guide's stops in the free time around the held blocks, with travel to and from them.
4. A held stop that names a must-do, or is at a must-do's place, counts that must-do as made.
5. Validation and repair never move or drop a held stop: when a guide stop cannot fit beside one, the guide stop goes.

What the planner needs: `TripFrame.held: readonly HeldStop[]` (`stableId`, `dayNo`, `poiId | null`, `point`, `startMin`, `endMin`, `mustDoId | null`), read by `candidatePools` (exclude, count must-dos), `scheduleDay` and `sequence` (fixed blocks), `validateItinerary` and `repairTargets` (never a target).

## Tasks

### T1. Held stops in the planner
- Files: `packages/planner/src/draft/{types,candidate-pools,schedule-day,sequence,validate-itinerary,repair-targets,index}.ts`, new `packages/planner/src/draft/held-stops.ts`, `packages/planner/test/draft/held-stops.test.ts`.
- Tests (pure, with a fast-check property under an explicit budget): no guide stop overlaps a held block; held stops come out with their own ids and times; a held place is never a candidate; with `held` empty the output equals today's for the same input.
- Status: pending

### T2. The guide is told what is held
- Files: `packages/ai/src/prompts/draft/{context,skeleton,day,repair}.ts`, their existing tests, `packages/ai/evals/draft/cases.ts` (one case with held stops).
- Rule: the lines are added only when the day has held stops, so today's prompts are byte-identical without them.
- Test: prompt text unchanged for an input with no held stops (existing fixtures); the held lines name day, place and time.
- Status: pending

### T3. The draft job reads and keeps them
- Files: `services/worker/src/jobs/ai/draft/{load,plan-input,persist}.ts`, `services/worker/test/jobs/ai/draft/held-stops.db.test.ts`.
- Rule: `persistDraft` copies held rows from the superseded draft under the trip lock and sets `origin = 'guide'`; the draft's numbers and must-do coverage count them.
- Test: two hand-placed stops (one a custom place) survive a draft with id, time and attendees intact; no duplicate place; a draft of an empty plan equals today's.
- Status: pending

### T4. A one-day redraft holds them too
- Files: `services/worker/src/jobs/ai/redraft.ts`, `services/worker/src/jobs/ai/draft/redraft-store.ts`, `packages/ai/src/prompts/draft/redraft.ts`, `services/worker/test/jobs/ai/redraft.db.test.ts`.
- Rule: stops she added by hand on the day stay; a guide stop she only retimed is the guide's to change, and the diff shows it so she can turn that change off.
- Status: pending

### T5. Saved Ideas are offered to the guide as preferred candidates
- Files: `services/worker/src/jobs/ai/draft/{load,job-context}.ts` (idea places join the `include` list `candidatePools` already takes), test beside T3.
- Status: pending

## Coordination

- Waits for the plan-quality lane (the planner's schedule rules), which owns `packages/planner/src/draft/**` and `packages/ai/src/prompts/draft/**` until it merges: this phase starts when the controller says that change is on main. The server rules lane's redraft reasons land first too: merge main before touching `prompts/draft/redraft.ts`.
- Prompts find a persona through the one resolver; no direct pack lookup.

## Risks

- Draft quality: one eval pass with held stops before merge; without held stops nothing changes.
- `packages/ai/src/prompts/draft/day.ts` is already over 300 lines: the held lines go in a new file it imports.
