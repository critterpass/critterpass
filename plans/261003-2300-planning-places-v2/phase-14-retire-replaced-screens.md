---
phase: 14
title: Retire the replaced screens and finish the migration
status: superseded
depends_on: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
wave: 5
screens: []
replaces: [3d-1, 3d-2, 3d-3, 3d-4, 3e-1, 3e-2, 3e-3]
tasks: 6
gate: founder approval of section 7 on staging and TestFlight (release gate), and the decision "Retire the 15-minute timeline, live cursors and the calendar tab"
owns:
  - apps/mobile/src/lib/navigation/planning-switch.ts
  - e2e/happy/planning-places-fresh.yaml
mount_points:
  - every file listed in T2–T6 (deletions and id renames inside phases that are done)
---
# Phase 14 — Retire the replaced screens and finish the migration

Superseded by [`plans/261005-1210-remove-old-planning-flow/`](../261005-1210-remove-old-planning-flow/plan.md), which removed the earlier screens, the switch and the docs.

## Context links

| Source | Section |
|---|---|
| CLAUDE.md | design ids allowed as product data keys; no deferral language; fresh-user verification; release gate (staging happy-path e2e with video before a TestFlight rollout) |
| Phase 1 | id map, `LEGACY_PARENTS`, 3d/3e PNGs kept until now |
| Code (call sites of old ids) | `features/trip/hub/{hub-links.ts:43,59,62, screen.tsx:89,91,179}`, `features/vote/routes.ts:4,27,29`, `features/home/routes.ts:45`, `features/proposal/your-version/your-version-screen.tsx:108,160`, `features/proposal/tracker/tracker-screen.tsx:77`, `lib/dev-tools/dev-screens.ts:51,56`, `features/plan/draft/routes.ts:54`, `features/home/__tests__/home-screen.test.tsx:78`, `ui/__tests__/inputs.test.tsx:103`, `tools/scripts/ci-device/sweep-coverage.test.ts:43`, `e2e/happy/fresh-proposal.yaml:157`, `e2e/screens/sweep/subflows/labs-plan.yaml:44-67`, `e2e/you/formats-en.yaml:157` |
| Replaced code | `features/plan/overview/**` (list screen, reorder days), `features/plan/timeline/**` (15-minute editor, rain band, ghost, cursors), `features/plan/views/plan-calendar.tsx` and the LIST/MAP/CALENDAR tabs, `features/plan/day/{add-item-sheet,place-search,server-place-search,use-add-search}.ts(x)`, `features/explore/{screens/explore-map-screen,components/explore-map-canvas}` parts superseded, `services/api/src/explore/{slot-suggest,match-to-changeset}.ts`, duplicate span helpers (`planner/draft/day-minutes.ts:24`, `fit-status.ts spansFor`, `travel-data/crowds-route.ts spansOn`) |

## Overview

Goal: section 7 is the only planning and places UI: the switch is gone, replaced code and assets are deleted, every link uses 7x ids, old flows are replaced by 7x flows, and a fresh user can plan a trip end to end on staging.

Done when: `grep -rn "3[de]-[1-4]" apps/mobile/src e2e tools` finds only product data keys that still exist in the design; no 3d/3e PNG remains; the fresh-user happy path passes on Android and iOS on staging with a video; the founder releases the build.

## Requirements

| Item | Behaviour |
|---|---|
| Switch | `planning.redesign` removed from the app and the config keys; function routes for old ids become plain 7x routes or are deleted |
| Retired screens | 3e-1 list overview, 3e-2 timeline editor (with rain band, ghost, live cursors) and the calendar tab, per the founder decision; item time edits stay in the item sheet; calendar export lives under SHARE |
| Kept | 3g-2 decision view, comments, presence avatars, personal overlay, item sheet, export sheet, draft screens (3c-*) |
| Fresh user | New account → crew → destination vote → 7i-1 → paste a TikTok fixture link → Ideas → PLACE THEM FOR ME → 7h-7 → send → second account approves → day plan with legs → plan check count → airplane mode day plan |

## Architecture & contracts

| Kind | Delta |
|---|---|
| Config | retire `planning.redesign` (key removed after one release that ignores it) |
| Server | delete `suggestSlot` and `matchToChangeSet` (if the founder amended Q-24); `swipe_vote` contract drops `change_set_id/day_no` for new matches (kept nullable for history) |
| Docs | `api-contracts-explore.md` status line and rows point at `api-contracts-planning.md`; `design-system.md` 3d/3e references → 7x; `undesigned-states.md` rows for retired screens marked retired |

## Tasks

### T1 — Switch on everywhere, then remove it
- Files: `apps/mobile/src/lib/navigation/planning-switch.ts`, planning register modules (function routes), `packages/domain/src/admin/config-keys.ts`
- Steps: 1. Founder turns `planning.redesign` on in production after the staging review. 2. One release later, remove the switch and simplify the registrations.
- Tests: `pnpm --filter @cp/mobile test -- lib/navigation`
- Done when: no code reads `planning.redesign`.
- Status: todo

### T2 — Delete replaced code
- Files: the "Replaced code" list above, their tests and dev lab scenes, `app/(dev)/{plan-edit-lab,plan-views-lab}.tsx` scenes that only show retired screens
- Steps: 1. Delete per the retirement decision. 2. Switch the duplicate span helpers to `openSpans`. 3. Remove the old add sheet's search copies. 4. Remove JS clustering if no map still uses it.
- Tests: `pnpm --filter @cp/mobile test`, `pnpm --filter @cp/planner test`, `pnpm --filter @cp/api test` (narrowest first; CI runs the rest)
- Done when: lint and typecheck clean; no unused exports flagged.
- Status: todo

### T3 — 7x ids at every call site
- Files: call sites listed in Context links; `apps/mobile/src/lib/navigation/parents.ts`; `tools/design-renders/extract-parents.ts`
- Steps: 1. `hrefFor('3e-1')` → `7a-1` or the hub, `3e-2` → `7b-1`, `3e-3` → `7h-7`, `3d-1` → `7g-3`/`7g-1`, `3d-2` → `7g-2`, `3d-3` → `7e-1`, `3d-4` → `7c-1`. 2. Regenerate parents without `LEGACY_PARENTS`.
- Tests: `pnpm --filter @cp/mobile test -- features/home features/trip/hub lib/navigation`
- Done when: the grep in Overview is clean.
- Status: todo

### T4 — Design assets and tooling
- Files: `docs/design-renders/screens/3{d,e}-*.png`, `docs/design-renders/{sections,screen-offsets}.json`, `tools/scripts/ci-device/sweep-coverage.test.ts`
- Steps: 1. Delete the 7 PNGs. 2. Drop `3d`/`3e` blurbs and offsets. 3. Sweep coverage expects 7x shots.
- Tests: `pnpm tsx tools/scripts/ci-device/sweep-coverage.ts --check`
- Done when: the nightly sweep pairs every planning shot with a 7x render.
- Status: todo

### T5 — Flows: old out, fresh-user happy path in
- Files: old `e2e/plan/{overview,day-edit,timeline,views,overlay,item-sheet-scroll,guide-text-vi}.yaml` (delete or rename to 7x states), `e2e/happy/fresh-proposal.yaml`, `e2e/screens/sweep/subflows/labs-plan.yaml`, `e2e/you/formats-en.yaml`, `e2e/happy/planning-places-fresh.yaml`
- Steps: 1. Keep only flows that cover kept behaviour (overlay, decision view, item sheet) with 7x names. 2. Fresh-user happy path (no seed) on staging, two accounts.
- Tests: `gh workflow run device.yml --ref <branch> -f platform=android -f build_url=<e2e-test APK> -f flows="e2e/happy/planning-places-fresh.yaml" -f shards=1`, then `-f platform=ios` once
- Done when: both platforms pass with a recorded video attached to the release gate.
- Status: todo

### T6 — Docs close-out
- Files: `docs/api-contracts-explore.md`, `docs/api-contracts-planning.md`, `docs/design-system.md`, `docs/undesigned-states.md`, `docs/data-model.md` (notes), `plans/260926-1718-critterpass-full-build/plan.md` (note)
- Steps: 1. Fold planning deltas that changed explore rows. 2. Mark retired screens. 3. Full-build plan: 3d/3e screens of phases 29/30 superseded by this plan.
- Tests: `pnpm format:check`
- Done when: no doc describes a retired screen as current.
- Status: todo

## Device flows

`e2e/happy/planning-places-fresh.yaml` (Android, then iOS once) plus the nightly sweep (`preset: sweep`) on `main`.

## Phase acceptance criteria

- [ ] T1–T6 done-when checks pass.
- [ ] Every user-facing behaviour of the old plan and explore screens either exists in section 7 or was retired by a founder decision recorded in plan.md.

## Risks & rollback

| Risk | Likelihood × impact | Mitigation / rollback |
|---|---|---|
| A deep link or push from an older app build points at a deleted route | M × M | route paths kept (`/plan`, `/day/[day]`, `/review/[id]`, `/explore/place/[id]`, `/explore/map`); only screens change |
| Deleting the timeline loses something a crew used | M × M | deletion only after the founder decision; git history keeps it |
| Fresh-user path breaks on iOS sheets or keyboard | M × H | iOS run before release; fix before the build ships (release gate) |

## Migration (existing users' data and screens)

No data. Old app builds keep working against the server (additive contracts; `suggested_slot` kept until the oldest supported build no longer reads it).

## Undesigned states to log

None new; retired rows are marked.

## Open questions

1. When can `suggested_slot` leave the place context payload? Default: when the minimum supported app version is the first build with section 7.
