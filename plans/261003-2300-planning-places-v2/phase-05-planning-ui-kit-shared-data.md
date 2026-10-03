---
phase: 5
title: Planning UI kit, map layers and shared app data
status: pending
depends_on: [2]
wave: 2
screens: [7a-1, 7a-2, 7a-3, 7b-1, 7b-2, 7b-3, 7c-1, 7c-2, 7c-3, 7f-1, 7f-2]
tasks: 6
owns:
  - apps/mobile/src/ui/sheet/{map-sheet,use-map-sheet,map-sheet-snap}.ts(x)
  - apps/mobile/src/ui/sheet/__tests__/map-sheet-snap.test.ts
  - apps/mobile/src/ui/map/planning/**
  - apps/mobile/src/ui/planning/**
  - apps/mobile/src/data/plan/**
  - apps/mobile/src/data/fit/**
  - apps/mobile/src/data/ideas/**
  - apps/mobile/src/data/checks/**
  - apps/mobile/src/data/legs/**
  - apps/mobile/src/features/planning-register.ts
  - apps/mobile/src/lib/navigation/planning-switch.ts
  - apps/mobile/src/app/(dev)/planning-map-lab.tsx
  - packages/i18n/locales/{en,vi}/planning/**
  - e2e/plan/planning-map-perf.yaml
mount_points:
  - apps/mobile/src/app/_layout.tsx (one import of planning-register)
  - apps/mobile/src/lib/dev-tools/dev-screens.ts (lab entry)
  - packages/i18n/lingui.config.ts (sub-areas for every folder this plan creates; explore catalog split)
  - packages/i18n/locales/{en,vi}/explore.* (moved into per-area catalogs)
  - apps/mobile/src/features/plan/day/{use-trip-plan,use-plan-editor,commands}.ts, plan/overview/data/{use-plan-data,plan-commands}.ts, plan/review/data/changeset-commands.ts, explore/commands.ts, explore/hooks/use-add-to-day.ts, guide/chat/data/use-plan-card.ts (imports move to data/plan; duplicates deleted)
  - docs/design-system.md (planning components and motion)
---
# Phase 5 — Planning UI kit, map layers and shared app data

## Context links

| Source | Section |
|---|---|
| `docs/code-standards.md` | §4 (feature modules; `ui/` presentational, `data/` shared), §5 (PowerSync live queries; no TanStack Query in the app, reads use `useTravelRead`), §6 tokens, §7 motion (presets, feedback bus, reduce motion, ≤ 30 animated views), §9 a11y, §17 (RNTL only for interaction logic with branches) |
| `docs/system-architecture.md` | §3 import rules (`ui` may not import `data`; features use other features only through `index.ts`) |
| `docs/design-system.md` | tokens, guide colours (C5), motion presets |
| Code | `ui/sheet/Sheet.tsx:127` (modal only: scrim, large/medium/fit), `use-modal-presentation.ts:50,80`; `ui/map/CpMap.tsx:91` (Markers because Android view annotations are dropped on style swap), `clusterPlaces.ts:39` (JS grid clustering), `RouteLine.tsx`, `useFlyTo.ts`; `features/explore/components/explore-map-canvas.tsx` (tile URL logic, texture mode on Android); `features/plan/day/use-trip-plan.ts:128` and `overview/data/use-plan-data.ts:81` (two plan readers); `day/use-plan-editor.ts:56,94,115,169,196`; `apply_plan_ops` defined three times (`day/commands.ts:21`, `overview/data/plan-commands.ts:10`, `explore/commands.ts:40`); change-set commands offline in `day/commands.ts:27,34,63` but online-only in `review/data/changeset-commands.ts:13,28,48`; `data/travel-data/use-travel-read.ts`; `lib/navigation/screen-registry.ts`; `packages/i18n/lingui.config.ts:85-96` (`planSubAreas`) |
| Renders | 7a-1 (map + peek sheet, day chips with colour underline, avatar stack, Tokek line + CHECK), 7a-2 (half sheet, stop rows, legs, dashed gap slot), 7a-3 (full sheet, day rows, pace bars), 7b-1 (mini-map, stop timeline, Tokek note, add bar), 7b-3 (mini route sketches), 7c-1/7c-2 (dots, clusters, label pop, carousel card), 7c-3 (place rows with fit lines), 7f-1 (day chips with fit dots, reason grid), 7f-2 (rows with drag handles) |

## Overview

Goal: the shared pieces every section 7 screen is built from, so wave-3 phases compose rather than reinvent: a non-modal map sheet, layer-based map rendering that holds 500 places on Android, presentational planning components, one plan reader/editor/command set, shared hooks for fit, ideas, checks, legs and pending reviews, and the wiring for registration, the rollout switch and the plan hub choice.

Done when: the lab screen shows every component and layer on both platforms; the Android map perf run (500 places, pan + zoom) stays inside the dropped-frame budget; the old screens run on `data/plan` with no behaviour change (their existing device flows stay green); fit parity tests pass in the app suite.

## Requirements

| Piece | Behaviour (render) |
|---|---|
| `MapSheet` | Non-modal sheet over a live map with snap points peek / half / full (7a-1 → 7a-2 → 7a-3); drag, velocity snap, programmatic snap; content scrolls only at full; Android back collapses one step before leaving; a11y actions "Expand" / "Collapse"; reduce motion = timed fades, no spring |
| `PlanningMapCanvas` | Region pack or world tiles (explore canvas logic), stay marker (yellow diamond, bed), camera: fit a day, fly to a place, ease so a picked place sits above the cards (7c-2) |
| `PlaceDotsLayer` | GeoJSON source with native clustering; clusters split as you zoom; saved icons appear at town zoom, Tokek's dots at street zoom (7c-1 caption); marker size by crew relevance (in plan, saves, must-see); a filter fades the rest to 20 % instead of removing it (no jump) |
| `StopRouteLayer` | Numbered stops in the day's colour joined by straight segments; other days at half strength (7a-1); a day chip redraws the route tracing out from the stay |
| `MapLabel` | The only label on the map: one pop-in label for the picked dot or stop (7c-2, 7a-2); Android draws it as a `Marker` |
| `EdgeIndicator` | Off-screen stop pill at the edge ("1 ← JATILUWIH") |
| `ui/planning` components | `DayChips` (number, weekday, colour underline, selected ring, fit dot green/orange/grey, drop-target glow), `PlaceRow`, `PlaceCard`, `StopCard` + `LegConnector` + `TimeColumn`, `GapSlot` (dashed), `TokekNote` (guide colour voice line + CTA), `PaceBars`, `MiniRouteSketch`, `DayRow`, `ReasonGrid`, `FilterChipRow` (counts, selected, removable ×), `StanceBar`, `HourBars` (lit slot), `OptionRadioCard` |
| `data/plan` | One `useTripPlan(tripId, {version})` (current crew version, or the organiser's draft) that replays queued edits; one `usePlanEditor` (organiser applies, member proposes a change set, rebase once on `PLAN_VERSION_CONFLICT`, personal skip); one command module whose offline flags match the server's sync-eligible list |
| Shared hooks | `useFit(tripId, poiIds)` (server, last-good in memory), `useLocalFit(context, choice)` (re-evaluates a chosen day/time with `@cp/planner` on the phone), `fitLine(reasons)` (Lingui), `useTripIdeas(tripId)` (synced ideas minus placed minus my hides, counts), `usePlanCheck(tripId)`, `useDayLegs(versionId, dayId)` (stored legs, straight-line "about" fallback), `usePendingReviews(tripId)` (my finished placement jobs with an unsent draft), `usePlanningMapPreview` (Zustand: a preview route a sheet asks the map behind it to draw, e.g. 7h-2) |
| Wiring | `features/planning-register.ts` (append-only, union-merged; each phase adds its `register` import); `planning-switch.ts`: `planningRedesign()` and `planHub()` from public config, read at navigation time so the founder can switch without a release |

Reuse / extend / new: reuse tokens, motion presets, feedback bus, gesture kit, `ui/map` pins and `useFlyTo`, the explore canvas tile logic, the two plan readers' SQL and the editor; extend `ui/sheet` (non-modal variant) and `ui/map` (layers); new components listed above. Moving the plan reader/editor/commands is a move, not a rewrite: the old call sites import from `data/plan`, duplicates are deleted.

## Architecture & contracts

| Kind | Delta |
|---|---|
| Imports | `ui/planning` and `ui/map/planning` are props-only (no `data/` import); `data/fit` imports `@cp/planner` (allowed) |
| i18n | catalogs `planning/fit` (reason lines: "Fits Sat at 08:00", "On the way, Wed 16:00", "The crew is split 2–2", "Only fits if Wed lunch moves", "Open late · fits Mon night"), `planning/kit`; lingui sub-areas for `plan/{trip-map,day-plan,all-days,add,ideas,check}`, `explore/{places,search,split,trip-explore}` |
| Config | reads `planning.redesign`, `plan.hub` (phase 2 keys) |
| Docs | `design-system.md`: planning components, sheet snaps, label pop 340 ms `cubic-bezier(.3,1.5,.5,1)` (prototype), route trace, 20 % fade |

## Tasks

### T1 — Map sheet
- Goal: the peek/half/full sheet every map screen uses.
- Files: `apps/mobile/src/ui/sheet/{map-sheet,use-map-sheet,map-sheet-snap}.ts(x)`, `apps/mobile/src/ui/sheet/__tests__/map-sheet-snap.test.ts`
- Steps: 1. Pure `resolveSnap(position, velocity, points)`. 2. Gesture Handler 3 + Reanimated worklets; map gestures pass through above the sheet. 3. Scroll handoff at full; Android back; a11y actions; reduce motion.
- Tests: `pnpm --filter @cp/mobile test -- ui/sheet/__tests__/map-sheet-snap` (thresholds, fling up/down, boundaries)
- Done when: on the lab screen the sheet snaps on both platforms with the map pannable above it.
- Status: todo

### T2 — Planning map canvas and layers
- Goal: dots, clusters, routes and one label without view annotations per pin.
- Files: `apps/mobile/src/ui/map/planning/**`, `apps/mobile/src/app/(dev)/planning-map-lab.tsx`, `apps/mobile/src/lib/dev-tools/dev-screens.ts`, `e2e/plan/planning-map-perf.yaml`
- Steps: 1. Canvas with tiles, stay marker, camera helpers. 2. `PlaceDotsLayer` (native clustering, zoom tiers, size expression, 20 % fade via data-driven opacity, category sprites). 3. `StopRouteLayer` (numbered symbols, half strength, trace-out). 4. `MapLabel` + `EdgeIndicator`. 5. Lab with 500 places from the Bali dev fixture.
- Tests: `gh workflow run device.yml --ref <branch> -f platform=android -f build_url=<e2e-test APK> -f flows="e2e/plan/planning-map-perf.yaml" -f shards=1`
- Done when: dropped frames within the existing map pan budget on the Android CI emulator; tapping a dot shows exactly one label.
- Status: todo

### T3 — Planning components
- Goal: the presentational pieces in the renders.
- Files: `apps/mobile/src/ui/planning/**`, `packages/i18n/locales/{en,vi}/planning/kit.*`
- Steps: 1. Components listed above, tokens only, shared `Text`/`Sticker` (ui-qa guards). 2. Drop-target state on `DayChips` driven by props (the drag itself lives in phases 7 and 10). 3. Lab scenes for each.
- Tests: none beyond typecheck (no render/snapshot tests, §17); lab screenshots in the PR.
- Done when: every component renders in the lab in EN and VI with no `[ui-qa]` report.
- Status: todo

### T4 — One plan reader, one editor, one command set
- Goal: every planning screen reads and edits the plan the same way.
- Files: `apps/mobile/src/data/plan/**` + the call-site mounts in frontmatter
- Steps: 1. Merge `usePlanData` and `useTripPlan` (draft flag, queued-edit replay). 2. Move `usePlanEditor`, `plan-ops.ts`, `stopName`. 3. One command module; align offline flags with the server's sync-eligible commands. 4. Point old call sites at `data/plan`; delete the duplicates.
- Tests: `pnpm --filter @cp/mobile test -- data/plan` (existing reader/editor tests move with the code); `gh workflow run device.yml … -f flows="e2e/plan/overview.yaml,e2e/plan/day-edit.yaml,e2e/plan/review.yaml"` stays green
- Done when: `grep -rn "name: 'apply_plan_ops'" apps/mobile/src` returns one definition; old screens behave as before on device.
- Status: todo

### T5 — Shared planning hooks
- Goal: fit, ideas, checks, legs and pending reviews in one place.
- Files: `apps/mobile/src/data/{fit,ideas,checks,legs}/**`, `packages/i18n/locales/{en,vi}/planning/fit.*`
- Steps: 1. `useFit` over `useTravelRead`; `useLocalFit` with `@cp/planner` fit. 2. `fitLine` from reason codes (Lingui, guide voice). 3. Ideas, checks, legs, pending-review live queries; the map preview store. 4. Run phase 4's fit fixtures in the app's Jest to prove parity.
- Tests: `pnpm --filter @cp/mobile test -- data/fit data/ideas` (local re-evaluation matches the fixtures; placed and hidden ideas are excluded)
- Done when: parity fixtures pass in Jest.
- Status: todo

### T6 — Wiring: registration, rollout switch, plan hub, catalogs, design system
- Goal: later phases register screens and read the switch without touching shared files.
- Files: `apps/mobile/src/features/planning-register.ts`, `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/lib/navigation/planning-switch.ts`, `packages/i18n/lingui.config.ts`, `docs/design-system.md`
- Steps: 1. Aggregator imported once from `_layout.tsx`, after every feature register, so its registrations win; re-pointing an old id (3d-*, 3e-*) is always a switch-aware function route registered from a planning register module, never an edit to the old registration file. 2. `planningRedesign()` / `planHub()` from the flag values the api already hands the app (#480). 3. Lingui sub-areas for every folder named in this plan, and split the single `explore.po` into per-area catalogs (`explore/{destination,place,map,swipe,saved,home,sponsored}`) with the existing EN and VI messages moved, so wave-3 and wave-4 phases never extract into the same catalog. 4. Design-system section for the planning kit.
- Tests: `pnpm --filter @cp/mobile test -- lib/navigation` (switch read falls back to off when config is missing)
- Done when: toggling `planning.redesign` on staging changes nothing yet (no 7x screen registered), the app still boots offline, and `pnpm --filter @cp/i18n run extract` leaves every VI translation in place after the explore split.
- Status: todo

## Device flows

| Flow | Platform | Why |
|---|---|---|
| `e2e/plan/planning-map-perf.yaml` (new) | Android | 500-place pan/zoom budget |
| `e2e/plan/{overview,day-edit,review}.yaml` (existing) | Android | T4 moved the reader/editor; behaviour unchanged |
| Lab capture of the sheet | iOS once | sheet presentation and safe areas |

## Phase acceptance criteria

- [ ] T1–T6 done-when checks pass.
- [ ] No `ui/` file imports `data/` (lint boundaries).
- [ ] One plan reader and one `apply_plan_ops` definition in the app.

## Risks & rollback

| Risk | Likelihood × impact | Mitigation / rollback |
|---|---|---|
| Native clustering/symbol layers behave differently on Android | M × H | lab + Android perf flow first; fallback is the existing JS clustering with `Marker`s at ≤ 40 pins (today's `MAX_PINS`) |
| Sheet gesture fights the map pan | M × M | sheet only takes vertical drags that start on the sheet; lab on both platforms |
| Moving the plan reader breaks an old screen | M × H | move with tests; old device flows must stay green before merge; revert is one PR |
| `ui-qa` reports on dense rows (VI strings longer) | M × L | VI lab scenes in T3 |

## Migration (existing users' data and screens)

No data. Old screens switch to `data/plan` with identical behaviour. No native build: MapLibre layers, gestures and the sheet are JS-only (no EAS build for this phase).

## Undesigned states to log

Sheet at half when content is shorter than half (snaps to content), map label for a cluster (shows the count, not a name), Android back with the sheet expanded.

## Open questions

1. Sheet peek height: default the 7a-1 render's sheet top (≈ 300 pt on a 844 pt screen), scaled by screen height.
