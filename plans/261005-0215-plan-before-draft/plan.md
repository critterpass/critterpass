---
title: "A plan before the draft"
description: "A trip has its days when its dates lock, the organiser's draft is hers to edit by hand, the guide drafts around what she placed, and the plan check runs on her draft."
status: awaiting approval
priority: P1
branch: feat/plan-days-before-draft
created: 2026-10-05
phases: 3
---

# A plan before the draft

Source: the live test's desk audit (`plans/reports/live-test/designer-261005-design-and-flow-logic-audit-report.md`, findings 5.1, 2.1, 2.4, 3.4) and the controller's calls 1 and 2 (`controller-261005-0215-live-test-decisions-and-fix-lanes.md`). Builds on `plans/261003-2300-planning-places-v2/` (phases 2, 4, 7, 10, 13).

## The one idea

The empty plan **is** the organiser's private draft with no stops in it. `lock_trip_dates` creates it (`itinerary_versions` row, `visibility = 'organiser'`, `status = 'draft'`, one `plan_days` row per date, `trips.draft_version_id` pointing at it) while the trip stays in `setup`. Everything else follows from treating that version like any draft:

| Rule | How |
|---|---|
| Days exist when dates lock | `lock_trip_dates` writes the empty draft; a migration backfills trips already in `setup` with dates |
| The draft is hers to edit | new command `apply_draft_ops`: the same ops as `apply_plan_ops`, committed as a new organiser draft version |
| The guide drafts around her stops | stops she placed (`created_by_kind = 'user'`) are held: the planner schedules around them and the new draft carries their rows over unchanged |
| The check runs on the draft | the check reads the draft while there is no crew plan; its issues ride the organisers' stream |
| A put-back is free | `revert_redraft` releases the reservation instead of committing it |

Members never receive an organiser version (streams and RLS are unchanged for them), so before the proposal they see what is true: the organiser is still putting the plan together, and saving to Ideas works.

## Which version each screen reads and writes

| Trip status | Organiser reads | Organiser writes | Member reads | Member writes |
|---|---|---|---|---|
| `setup`, dates locked | the empty or hand-built draft | `apply_draft_ops` | no plan: "{name} is still putting the plan together" | Ideas only (`save_idea`) |
| `drafting`, `redrafting` | the draft, read-only while the guide works | nothing (the command answers `STATE_INVALID{draft_running}`) | as above | Ideas only |
| `draft_review` | the draft | `apply_draft_ops`, redraft, restore | as above | Ideas only |
| `proposed` and later | the crew's version | `apply_plan_ops` (today) | the crew's version | change sets (today) |

The app rule is the existing `draft-or-current` choice in `useTripPlan`: the crew's version when there is one, else my draft when I organise.

## Phases (one PR each, in this order)

| # | Phase | PR can merge and deploy alone because | Status |
|---|---|---|---|
| 1 | [Server: days on dates lock, draft edits, the check on a draft, the put-back](./phase-01-server-plan-before-draft.md) | additive: one new command, one new event, two nullable columns, one more stream query; no installed build sends or reads any of it | pending |
| 2 | [Server: the guide drafts around held stops](./phase-02-server-draft-around-held-stops.md) | with no held stops every prompt and schedule is byte-identical to today's; held stops only exist once phase 3 ships | pending |
| 3 | [App: the empty plan, the editable draft, the check's tags, members before the plan](./phase-03-app-plan-before-draft.md) | behind `planning.redesign`; needs phases 1 and 2 deployed | pending |

## Acceptance

1. Lock dates on a new trip, save one place, draft nothing: the trip map's sheet shows the days, Ideas shows day chips and takes a drop, Add to plan names a day and adds, the place page offers the add. A member sees the "still putting the plan together" states and can save to Ideas.
2. In `setup` and `draft_review` the organiser adds, moves, reorders, retimes and removes stops on her draft; each lands as a new organiser draft version. No edit control shows while the guide is drafting.
3. Draft after placing two stops by hand: both are in the new draft at the day and time she set, the guide's stops sit around them, no place appears twice.
4. Forty-five seconds after a draft or a hand edit the organiser's days carry the check's tags; members receive no issue of an organiser version.
5. Put a redraft back: the trip's redraft count is what it was before she asked.
6. `planning.redesign` off: every existing command, route and screen answers as today (the tests named in each phase).

## Risks

| Risk | Guard |
|---|---|
| A reader treats "has a draft version" as "the guide drafted" (old screens, cost, proposal) | phase 1 audits every reader of `draft_version_id`; each relies on the trip status, and the tests pin `setup` + empty draft for cost, proposal build and the old draft screens |
| Hand edits flood the draft history | `itinerary_versions.origin` marks them; the history folds a run of hand edits into one row |
| A draft job finishes over edits made while it ran | edits are refused while `drafting`/`redrafting`; `persistDraft` reads held stops under the trip lock |
| Prompt changes move draft quality | the held-stops lines are added only when there are held stops; recorded fixtures stay valid, the draft evals run once with held stops |
| The plan check leaks a private draft | issues stay version-scoped (RLS and stream); the trip-wide `plan_checks` row is not written for a draft run except its daily counter |
| Other lanes edit the same app files | narrow edits, merge main before each push, no reformatting |

## Product calls for the controller

Listed with a recommendation in the phase files and in the lane's report: put-back refunds and the fair-use cap; whether saved Ideas are offered to the guide when it drafts; what a one-day redraft holds; what a dates change does to stops already placed; PLACE THEM FOR ME before the crew plan exists.
