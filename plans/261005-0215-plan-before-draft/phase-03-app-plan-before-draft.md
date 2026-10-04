---
phase: 3
title: "App: the empty plan, the editable draft, the check's tags, members before the plan"
status: pending
branch: feat/app-plan-before-draft
depends_on: [1, 2]
---

# Phase 3. App

All of it behind `planning.redesign`. Renders: 3c-9, 7i-1, 7f-1, 7f-2, 7a-1…7a-3, 7b-1. Every departure is logged in `docs/undesigned-states.md`.

## Context

- Plan reader and editor: `apps/mobile/src/data/plan/{use-trip-plan,use-plan-editor,commands,queries}.ts`.
- Trip map: `features/plan/trip-map/{use-trip-map-data,use-trip-map-model,peek-sheet,day-sheet,empty-trip-sheet}.tsx`.
- Day plan and all days: `features/plan/day-plan/{day-plan-screen,day-plan-view}.tsx`, `features/plan/all-days/`, `features/plan/day/item-sheet-host.tsx`.
- Ideas, Add to plan, place page: `features/plan/ideas/ideas-screen.tsx`, `data/ideas/use-trip-ideas.ts`, `features/plan/add/{add-sheet.tsx,add-model.ts}`, `features/explore/place-detail/{model.ts,place-detail-screen.tsx}`.
- Check: `data/checks/use-plan-check.ts`. Redraft: `features/plan/draft/data/quota.ts`, `features/plan/draft/redraft/redraft-diff-screen.tsx`. History: `features/plan/draft/data/use-draft-version.ts`.

## Tasks

### T1. The editor writes to the draft
- Files: `data/plan/{commands,use-plan-editor,use-trip-plan}.ts` and their tests.
- Rule: in draft mode `submit` sends `apply_draft_ops` on the draft version; queued draft edits replay over the synced draft like queued plan edits; conflicts rebase the same way; `skipForMe` and `propose` are not offered on a draft.
- Tests: the command chosen per mode; queued draft ops replay; a conflict rebases once.
- Status: pending

### T2. The trip map and day plan on a draft
- Files: `features/plan/trip-map/{use-trip-map-data,use-trip-map-model,peek-sheet,empty-trip-sheet}.tsx`, `features/plan/day-plan/{day-plan-screen,day-plan-view}.tsx`, `features/plan/day/item-sheet-host.tsx`, `features/plan/all-days/all-days-screen.tsx`, copy files beside them, EN + VI catalogs.
- Rules: a draft is read-only only while the guide is drafting (with a line that says so); the stop sheet on a draft shows When, Move to and Remove, not "just me"; the peek carries "Let {guide} draft the rest" while the trip is in `setup` and "Only you see this" on a draft; LET {GUIDE} DRAFT IT goes to the draft route when setup is finished; with a stop placed in `setup` the peek offers "Let {guide} draft the rest" and "Send it as it is" (`review_hand_plan`) side by side; opening the plan of a trip with dates and no plan sends `ensure_plan_days`; a dates change says which stops moved and where.
- Tests: `isReadOnly` per status and role; the stop sheet's actions per mode.
- Status: pending

### T3. Ideas, Add to plan and the place page before the crew plan
- Files: `features/plan/ideas/ideas-screen.tsx`, `data/ideas/use-trip-ideas.ts`, `features/plan/add/{add-sheet.tsx,add-model.ts,add-copy.ts}`, `features/explore/place-detail/{model.ts,place-detail-screen.tsx}`.
- Rules: the organiser gets day chips and the add on her draft; on a draft, Ideas rows ask the fit route for their fits (the server stores none for a private draft); PLACE THEM FOR ME is hidden until the crew's plan exists.
- Tests: `add-model` with an empty plan (a day is named, the button is enabled), with no visible plan (member: SAVE TO IDEAS), the place page model's add state for each.
- Status: pending

### T4. Members before the plan
- Files: `features/plan/trip-map/empty-trip-sheet.tsx` (member variant), `features/plan/ideas/ideas-screen.tsx`, `features/plan/add/add-sheet.tsx`, `docs/undesigned-states.md`.
- Rule: "{organiser} is still putting the plan together. Save places to Ideas and they'll see them." No day chips, no disabled button.
- Status: pending

### T5. The check's tags on a draft
- Files: `data/checks/use-plan-check.ts`, `features/plan/trip-map/use-trip-map-model.ts`, tests beside.
- Rule: issues are those of the version on screen; on a draft "checked" comes from the version's `checked_at`.
- Test: issues of another version are not shown; a draft's counts come from its own issues.
- Status: pending

### T6. The put-back and the history
- Files: `features/plan/draft/data/quota.ts`, `features/plan/draft/redraft/redraft-diff-screen.tsx` (copy: putting it back gives the redraft back, on the earlier diff screen too), `features/plan/draft/data/use-draft-version.ts` (a run of hand edits is one history row), tests beside.
- Status: pending

### T7. Earlier screens key on the trip's status, not the draft pointer
- Files: `features/plan/draft/review/draft-review-screen.tsx`, `features/plan/draft/drafting/drafting-screen.tsx`, `features/trip/hub/data/{queries,use-hub}.ts`, Home's trip card data, `features/plan/draft/data/{draft-trip,use-draft-version}.ts`; change only a reader that assumes "pointer set = the guide drafted".
- Test: a set-up trip with an empty draft, switch off: Home, the hub tile, the earlier draft screens and the earlier plan screens show what they show today for a trip with no draft.
- Status: pending

### T8. Device sheets
- `device.yml`, Android, `shards=1`, EN + VI, `mode=compare` on the PR: the empty plan with days (map sheet, Ideas, Add to plan, place page), the draft being edited (day plan, stop sheet, all days), the check's tags on a draft, the member's states. New flows under `e2e/plan-before-draft/`, seeds in the existing dev scenes.
- Status: pending

## Risks

Other lanes edit the trip map, Add to plan and the day plan this week: merge main before every push, touch the fewest lines, and take file-level conflicts to the controller.
