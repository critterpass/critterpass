---
phase: 1
title: Design import, screen ids and back targets
status: done
depends_on: []
wave: 1
screens: [7a-1, 7a-2, 7a-3, 7b-1, 7b-2, 7b-3, 7c-1, 7c-2, 7c-3, 7d-1, 7d-2, 7d-3, 7d-4, 7e-1, 7e-2, 7e-3, 7f-1, 7f-2, 7g-1, 7g-2, 7g-3, 7h-1, 7h-2, 7h-3, 7h-4, 7h-5, 7h-6, 7h-7, 7i-1, 7i-2]
replaces: [3d-1, 3d-2, 3d-3, 3d-4, 3e-1, 3e-2, 3e-3]
tasks: 5
owns:
  - design/**
  - docs/design-renders/**
  - tools/design-renders/extract-parents.ts
  - tools/design-renders/__tests__/extract-parents.test.ts
  - apps/mobile/src/lib/navigation/parents.ts
  - tools/scripts/readme/screens.ts
  - README.md
mount_points:
  - plans/260926-1718-critterpass-full-build/plan.md (one note under Progress, ownership transfer of phases 29 and 30)
  - e2e/README.md (union-merged: one row on 7x screenshot names)
---
# Phase 1 — Design import, screen ids and back targets

## Context links

| Source | Section |
|---|---|
| Design worktree | `/Users/quocs/Projects/critterpass-worktrees/design-refresh`, branch `design/planning-places-refresh`, commit `172fe7218` (read only; land it through a PR, never edit the worktree) |
| `docs/design-renders/screens.json` (after landing) | 30 entries `7a-1 … 7i-2`; `caption` = binding behaviour notes |
| `design/Critterpass Prototype.dc.html` | `PARENT` map (back targets), `hub` prop ("Map first" / "Plan first"), flow per screen |
| `apps/mobile/src/lib/navigation/screen-registry.ts:25,45,57` | `registerScreens`, `hrefFor`, `useScreenHref` (an unregistered id returns `undefined`) |
| `tools/scripts/compare-app-screens.ts:73,86` | sheets pair on the PNG file name, never on `screens.json` |
| `tools/scripts/ci-device/sweep-coverage.ts:199-246`, `sweep-coverage.test.ts:43` | registered ids vs PNG folder; expects a `3e-1-plan` shot |
| CLAUDE.md | design ids are allowed as product data keys; plan/phase/task ids are not |

## Overview

Goal: land the section 7 design on `main` so every later phase can pair device screenshots with 7x renders, give the generated back-target map the 7x screens, and keep every 3d/3e screen pairing and navigating until phase 14 retires it.

Done when: `main` holds the 30 renders and the new `screens.json`; `parents.ts` has the 7x back targets plus the 7 legacy ids; `extract-parents --check` runs in CI; the README gallery shows 7x screens; no app behaviour changes.

## Requirements

| Item | Behaviour |
|---|---|
| Renders | 30 PNGs `docs/design-renders/screens/7*.png` + regenerated `screens.json` (already rendered in the design commit). The 7 `3d-*`/`3e-*` PNGs stay in the folder until phase 14: `screens:compare` pairs old flows by file name |
| Id map | The plan.md "Screen id map" is the source: 3e-1 → 7a-3 / 7b-3 (hub 7a-1 or 7b-1), 3e-2 → 7b-1, 3e-3 → 7h-7, 3d-1 → 7g-3 (outside a trip) / 7g-1 (in a trip), 3d-2 → 7g-2, 3d-3 → 7e-1, 3d-4 → 7c-1. Registrations move per phase, never here |
| Back targets | From the prototype `PARENT` map: 7a-1/7b-1 → 3k-1, 7a-2/7a-3 → 7a-1, 7b-2/7b-3 → 7b-1, 7c-1 → 7a-1, 7c-2/7c-3 → 7c-1, 7d-1 → 7a-1, 7d-2/3/4 → 7d-1, 7e-1 → 7c-2, 7e-2 → 7e-1, 7e-3 → 7c-3, 7f-1 → 7e-1, 7f-2 → 7a-3, 7g-1 → 3k-1, 7g-2 → 7g-1, 7g-3 → 3b-1, 7h-1 → 7a-3, 7h-2 → 7a-2, 7h-3/4/5 → 7h-1, 7h-6/7h-7 → 7f-2, 7i-1/7i-2 → 3k-1, 3o-1 → 7g-3 (generator output is the authority; this list is for review) |
| Legacy ids | 3d-1…3d-4, 3e-1…3e-3 keep their current parents in a generated `LEGACY_PARENTS` block until phase 14 deletes it |
| Section blurbs | `sections.json` gains `7a` … `7i` (one sentence each, from the captions); `3d`/`3e` read "Replaced by section 7" until phase 14 removes them |

Reuse / extend / new: reuse the render and extract scripts as they are; extend `extract-parents.ts` (legacy block, duplicate-name rule, `--check` in CI); nothing new.

## Architecture & contracts

| Kind | Delta |
|---|---|
| Generated code | `apps/mobile/src/lib/navigation/parents.ts`: 7x entries + `LEGACY_PARENTS` (7 ids) |
| Tooling | `extract-parents.ts --check` wired into the tools test so a design change without a regenerate fails CI |
| Docs | none beyond the full-build plan note |

## Tasks

### T1 — Land the section 7 design
- Goal: the design commit on `main`.
- Files: `design/**`, `docs/design-renders/screens.json`, `docs/design-renders/screens/7*.png`
- Steps: 1. Branch `feat/design-planning-places` from `origin/main` (the main checkout at `/Users/quocs/Projects/critterpass` is stale at #236: never branch from it). 2. Cherry-pick `172fe7218`; keep the 3d/3e PNGs. 3. `pnpm --filter @cp/design-renders run extract:screens` and confirm the JSON is byte-identical.
- Tests: `pnpm tsx tools/scripts/compare-app-screens.ts --from <an existing capture dir>` still pairs a 3e-1 shot (old flows keep their sheets).
- Done when: 30 7x PNGs and the new `screens.json` are on `main`; old 3d/3e sheets still pair.
- Status: done — 097173fed

### T2 — Section blurbs
- Goal: `sections.json` describes section 7.
- Files: `docs/design-renders/sections.json`, `docs/design-renders/screen-offsets.json`
- Steps: 1. Add `7a` … `7i` blurbs written from the captions (trip map; day plan; places; search; place; add and ideas; explore; plan check; empty and offline). 2. `3d`/`3e` → "Replaced by section 7". 3. `screen-offsets.json`: add 7x offsets if the render script produced them, keep 3d/3e rows.
- Tests: JSON parses (`node -e`).
- Done when: every section id used by a 7x label has a blurb.
- Status: done — 671500c16

### T3 — Back targets for the 7x screens
- Goal: cold-opened 7x screens go back where the prototype says; legacy screens keep theirs.
- Files: `tools/design-renders/extract-parents.ts`, `tools/design-renders/__tests__/extract-parents.test.ts`, `apps/mobile/src/lib/navigation/parents.ts`
- Steps: 1. Resolve a prototype name that matches two labels ("Couldn't read it" is both 6c-3 and 3i-4) by its section order in `STATES`, and fail loudly on any other ambiguity. 2. Emit `LEGACY_PARENTS` for ids that the code still registers but `screens.json` lost. 3. Regenerate. 4. Add `--check` to the tools test.
- Tests: `pnpm --filter @cp/design-renders test -- extract-parents`; `pnpm --filter @cp/mobile test -- lib/navigation/synthesize-stack`
- Done when: `synthesize-stack.test.ts` passes; `7f-1`'s parent is `7e-1`; `3e-2` still resolves to `3e-1`.
- Status: done — c409229f8

### T4 — README gallery and screenshot naming
- Goal: the repo front page shows the new planning screens; agents name 7x shots consistently.
- Files: `tools/scripts/readme/screens.ts`, `README.md`, `e2e/README.md` (one union-merged row)
- Steps: 1. Gallery uses 7a-1, 7b-1, 7e-1, 7g-2 instead of 3d-2/3e-*. 2. e2e README row: name shots `<locale>-7x-n-<state>`; a state the design does not draw keeps the nearest 7x id plus a state suffix.
- Tests: `pnpm tsx tools/scripts/readme/screens.ts --check` (or the script's existing dry run).
- Done when: README renders with 7x images.
- Status: done — 17845d1df

### T5 — Ownership handover note
- Goal: the full-build plan records that this plan takes the 3d/3e screens.
- Files: `plans/260926-1718-critterpass-full-build/plan.md` (Progress note only)
- Steps: 1. One paragraph: phases 29 and 30 close out as they stand; their 3d/3e screens and `features/plan/{overview,day,timeline,review,views}`, `features/explore/**` pass to `plans/261003-2300-planning-places-v2`; phase 37's timeline weather overlay is superseded by 7h-4 (retired in this plan's phase 14 after founder approval).
- Tests: none (plan text).
- Done when: the note is merged with T1's PR.
- Status: done — 7339353da

## Device flows

None: no app behaviour changes. Existing Android sweep (`preset: sweep`) must stay green after T3.

## Phase acceptance criteria

- [ ] T1–T5 done-when checks pass.
- [ ] `screens:compare` pairs both a 3e-1 shot (old) and a 7a-1 shot (new) by file name.
- [ ] `extract-parents --check` fails on a deliberately stale `parents.ts` in its test.

## Risks & rollback

| Risk | Likelihood × impact | Mitigation / rollback |
|---|---|---|
| Regenerated `parents.ts` drops a legacy id and a cold-opened old screen loses its back target | M × M | `LEGACY_PARENTS` block + test on 3e-2; revert the generated file alone |
| The cherry-pick conflicts with design files changed on `main` since #589 | L × L | `design/` is only touched by imports; re-run `render:screens` + `extract:screens` on the merged file |

## Migration (existing users' data and screens)

No data. Screens: nothing moves; old ids keep registering and pairing until each replacing phase re-points them (phases 7–12) and phase 14 removes them.

## Undesigned states to log

None in this phase.

## Open questions

1. Should `sections.json` keep `3d`/`3e` after phase 14? Default: removed with the PNGs.
