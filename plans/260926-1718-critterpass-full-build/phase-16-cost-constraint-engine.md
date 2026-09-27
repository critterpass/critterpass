---
phase: 16
title: Cost & constraint engine
status: done
depends_on: [12, 13, 14, 15]
wave: 8
features: [F-020]
screens: [3c-1, 3c-5, 3c-7, 3c-9, 3c-10, 3e-3, 3f-3, 3f-4, 3f-7]
tasks: 7
owns:
  - packages/cost-engine/src/{quotes,shares,rooms,budget,resplit,boost-split,display}/**
  - packages/cost-engine/test/{quotes,shares,rooms,budget,resplit,boost-split,golden}/**
  - packages/planner/src/feasibility/**
  - packages/planner/test/feasibility/**
  - packages/db/src/schema/cost.ts
  - packages/db/migrations/*_cost_components_and_share_calcs.sql
  - packages/db/migrations/*_destination_cost_indices.sql
  - packages/db/test/permissions/{cost-components,share-calcs,destination-cost-indices}.test.ts
  - services/api/src/cost/**
  - services/worker/src/cost/**
---
# Phase 16 — Cost & constraint engine

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D7 (Boost split = ledger IOUs), D10 (no stay holds; real cancellation deadlines), C13, C26 (seat cap), C28 (private objections), C43 (reply-by vs free-cancel), C44 (fit status pre/post draft), C46 |
| `docs/system-architecture.md` | §3 import rules (pure packages, no I/O), §7.d boost → IOUs |
| `docs/data-model.md` | §1 money conventions (minor units, `fx_snapshots`), §3.4 (`price_quotes`, `cost_components`, `share_calcs`, `trip_budget_aggregates`, `budget_plans`, `room_plans`, `must_dos`), §3.5 proposals |
| `docs/data-model-sync-and-privacy.md` | §1 derived C1 projections (budget band rule k ≥ 4), §2 (numbers in prompts from engine) |
| `docs/api-contracts.md` | §1 money wire format, §5.5 `/v1/budget/{trip_id}/band`, §6 tools `cost_quote`, `fit_check` |
| Reports | master §2 row F-020, §6 numbers rule, §13 R3 (number consistency); `design-analysis-260926-1143-next-trip-explore-report.md` §3c-1, §3c-5, §3c-7, §3c-9, §3c-10; `design-analysis-260926-1143-plan-proposal-crew-report.md` (3e-3, 3f-3, 3f-4, 3f-7) |
| Renders | `docs/design-renders/screens/3c-1_Vote_showdown.png`, `3c-5_Budget.png`, `3c-9_Pon_s_draft.png`, `3e-3_Review_changes.png`, `3f-3_Your_version.png`, `3f-4_Not_sure_yet.png`, `3f-7_Dev_s_out.png` |

## Overview

Goal: one price truth. `packages/cost-engine` (pure TS, shared client/server) turns versioned quotes into per-origin, per-person shares with exact minor-unit allocation, budget sweet spots that respect private maxes, room pricing, dropout re-splits and Boost split IOUs. `packages/planner/feasibility` checks hours, travel time, chronotypes, must-dos and fixed bookings and returns `fits | tight | clash` with reason codes. Server services persist `cost_components` / `share_calcs`, recompute on input change, and expose `cost_quote` / `fit_check` tools so the guide only words numbers.

Done when: golden tests reproduce the design's number chain (vote $1,480 vs $1,920 → budget $1,350 → draft $1,310 → dropout $1,334, change review +$22 each, objection options −$140 / −$64) from one fixture; property tests prove sums and privacy invariants; recompute job and tool executors pass integration tests.

## Requirements

### F-020 Cost & constraint engine

| Area | Behaviour (screen) |
|---|---|
| Versioned quotes | `QuoteSet{version (content hash), components[{kind: flight\|stay\|activity\|transfer\|food\|fun, unit: person\|room\|group, origin?, amount_minor, currency, source, seen_at, frozen_at?}]}`; freeze for polls/proposals so numbers never drift after a vote opens (3c-1, C43) |
| Per-origin shares | flights priced per member's origin (member home airport or invitee origin once known, C34); share = own flight + allocated shared components + own personal options |
| Allocation | integer minor units; largest-remainder allocation with deterministic tie order (uid order); every allocation sums exactly to the total; FX via one `fx_snapshot_id` per calc; display rounding: "each" figures rounded to whole major units half-up, underlying ledger exact |
| Vote showdown (3c-1) | per-option "each" (crew mean or viewer's own share per spec), flight hours; tie rule: cheaper for the majority origin group on frozen quotes ("$440 cheaper for the four flying from Singapore") — returns the explanatory numbers for copy |
| Budget (3c-5) | sweet spot band = [feasible low, min(maxes)] from write-only maxes (never returned); no band at all until k ≥ 3 maxes submitted (`waiting` state below that); band upper edge = min(maxes) floored to a fixed coarse step of $50 (USD-equivalent via snapshot FX, displayed in trip currency) and never equals the lowest max, so no single max is pinned more finely than one step; `under_all` boolean; bucketed anonymous dots only when k ≥ 4 maxes; states: waiting (k of N), no sweet spot (lowest max < feasible low), knob above band (warning); breakdown flights/stays/food/fun re-flows with knob target (client-side pure fn); stay mix candidate chosen deterministically from stay options within target |
| Rooms (3c-6 support) | room packing by capacity + trait grouping; per-room price allocation (room price ÷ occupants); swap preview deltas |
| Draft & proposal (3c-9, 3f-3) | cost_pp for a plan version; personal option deltas ("Skip the Nara day and save $64"); per-recipient share for personalised versions |
| Private objection (3f-4) | option repricing (share big room −$140, skip Nara −$64) computed only for the viewer; never exposed to others (C28) |
| Change review (3e-3) | ChangeSet cost delta per person ("+$22 EACH"), bookings moved count, must-dos touched count |
| Dropout re-split (3f-7) | remove member → re-pack rooms, re-split shared components, withdraw per-person items; returns before/after per member ("$1,310 → $1,334, +$24 each") and the change list for a ChangeSet |
| Boost split | ~$12 consumable split across chosen members → IOU amounts (exact minor units, buyer absorbs remainder — the one explicit exception to the largest-remainder rule; P33/P46 must call `splitBoost`, never the generic allocator); P33/P46 write ledger entries |
| Feasibility (planner) | inputs: plan items, POI hours (tz), travel matrix (P14), chronotype windows (early bird / night owl), must-dos, fixed bookings, 15-min grid, capacity, dietary flags; outputs: per-item violations with codes (`CLOSED_AT_TIME`, `TRAVEL_TOO_LONG`, `OVERLAP`, `CHRONOTYPE`, `MUST_DO_MISSING`, `BOOKING_MOVED`, `OFF_GRID`) + `fit_status` for must-dos: pre-draft feasibility vs dates/hours/skeleton; post-draft members see fits/tight/clash only, no day numbers pre-draft (C44) |
| Single source | every number shown in app, web, notifications, widgets and guide output comes from these functions; server persists results, client recomputes previews with the same package |

Undesigned states to design in code (engine returns discriminated results; UI phases render): multi-currency crew (all shares in viewer home currency with FX note), member without origin (uses crew majority origin, flagged `estimated_origin`), missing fare (component `amount:null` → share shown as range "~" with missing flag), stale quote (> 72 h, flagged), zero-participant edge.

## Architecture & contracts

| Kind | Delta |
|---|---|
| Tables | `cost_components`, `share_calcs` (data-model §3.4) + table `trip_share_totals` (trip_id, uid, total_minor, currency, calc_version; written only by `cost.recompute` as `app_system`; others see totals only — a real table because PowerSync logical replication cannot carry views; **doc delta**). New `destination_cost_indices` (destination_id, stay_type, nightly_minor_low/high, food_pp_day_minor, fun_pp_day_minor, currency, source, reviewed_at; C0, `catalog`) — **doc delta** |
| RLS | `share_calcs`: own row full; others via `trip_share_totals` only (trip-member RLS via `app.is_trip_member`, outsider denial tested); personal option deltas never visible to others; writes `app_system` |
| Streams | `cost_components`, `trip_share_totals`, own `share_calcs` rows in `trip` stream |
| Budget band | P27 owns `trip_budget_aggregates` and wires the pure `computeBudgetBand` from this phase into a worker job that reads `budget_max_private` as `app_system` (**doc delta**: data-model names a SQL fn `app.recompute_budget_band`; the worker job replaces it so band logic lives in one TS function) |
| Jobs | `cost.recompute` (trigger: quotes, participants, rooms, plan version, fx snapshot change; key `(trip_id, input_hash)`; 3 retries) — **doc delta** async §2.2 |
| Routes | `GET /v1/trips/{id}/costs?version` (shares, components, freshness) and `POST /v1/trips/{id}/costs/preview` (ops → deltas) — **doc delta** §5.5 |
| Tools | executors `cost_quote`, `fit_check` registered in P13 registry |
| Centrifugo | `trip:{trip_id}` `tiles` update on recompute; `trip_setup:{trip_id}` `budget.band` published by P27 using this engine |
| Import rules | `cost-engine` imports `domain` only; `planner/feasibility` imports `domain`, `cost-engine`; no I/O |

## Tasks

### T1 — Quotes model + vote showdown
- Goal: versioned, freezable QuoteSets and per-origin option pricing.
- Files: `packages/cost-engine/src/quotes/{quote-set,freeze,version-hash,showdown}.ts`, `packages/cost-engine/test/quotes/*.test.ts`, `packages/cost-engine/test/golden/design-chain.fixture.ts`.
- Steps: 1. Types + zod (via `domain`). 2. Stable content hash version. 3. Freeze semantics. 4. `showdown(options, crewOrigins)` incl. tie rule on frozen quotes with explanatory numbers. 5. Golden fixture (crew of 6: 4 from SIN + 2 others) → Kyoto $1,480 vs Lisbon $1,920, tie → "$440 cheaper for the four from SIN".
- Tests: `pnpm --fail-if-no-match --filter @cp/cost-engine test -- quotes`
- Done when: golden passes; version changes iff any component changes.
- Status: done — a6d34f6c

### T2 — Shares, allocation, FX, display rounding
- Goal: exact per-person shares.
- Files: `packages/cost-engine/src/shares/{allocate,per-origin,personal-options}.ts`, `packages/cost-engine/src/display/round.ts`, tests incl. property tests (`fast-check`).
- Steps: 1. Largest-remainder allocation. 2. Per-origin flights + shared room/group components. 3. Personal option deltas. 4. FX with snapshot id. 5. Display rounding rules. 6. Golden: draft $1,310 each; "skip Nara −$64".
- Tests: `pnpm --fail-if-no-match --filter @cp/cost-engine test -- shares golden`
- Done when: property: Σ shares = Σ components (minor units) for random inputs; golden matches.
- Status: done — 2117fcc3

### T3 — Budget sweet spot + privacy invariants
- Goal: 3c-5 numbers without leaking maxes.
- Files: `packages/cost-engine/src/budget/{band,dots,breakdown,stay-mix}.ts`, tests.
- Steps: 1. `computeBudgetBand(maxes, feasibleLow)` → band/under_all/state. 2. No band below k = 3; $50 step floor on the upper edge; bucketed dots only k ≥ 4, jittered into buckets. 3. Breakdown re-flow for a knob target (flights/stays/food/fun from QuoteSet + `destination_cost_indices`). 4. Golden: $1,350 = 520 + 470 + 220 + 140, "2 ryokan nights, 5 apartment". 5. Property tests: output never contains any exact max; band high ≠ lowest max; k < 3 → no band; k < 4 → no dots; for any 3–4 member input, the set of lowest-max values consistent with the output spans ≥ one full $50 step.
- Tests: `pnpm --fail-if-no-match --filter @cp/cost-engine test -- budget`
- Done when: goldens + privacy properties green.
- Status: done — 66dce8a3

### T4 — Rooms, dropout re-split, Boost split
- Goal: 3f-7 and Boost IOU amounts.
- Files: `packages/cost-engine/src/{rooms/pack.ts,resplit/dropout.ts,boost-split/split.ts}`, tests.
- Steps: 1. Room packing with traits + per-room allocation. 2. `dropout(state, uid)` → new state, per-member before/after, change list (room released, apartment split 6→5, per-person entries withdrawn). 3. Golden $1,310 → $1,334 (+$24). 4. Objection options golden (−$140 share big room, −$64 skip Nara → $1,170). 5. `splitBoost(total, buyer, members)` exact minor units; explicit exception to largest-remainder: the buyer absorbs the whole remainder (golden: $12.00 over 5 → 4 × $2.40 IOUs, buyer $2.40; $12.00 over 7 → 6 × $1.71 IOUs, buyer $1.74).
- Tests: `pnpm --fail-if-no-match --filter @cp/cost-engine test -- rooms resplit boost-split`
- Done when: goldens green; dropout of the last member is rejected with a typed error.
- Status: done — bb83926e

### T5 — Planner feasibility + fit status
- Goal: deterministic constraint checks for drafts, edits, must-dos.
- Files: `packages/planner/src/feasibility/{check,hours,travel,chronotype,must-dos,grid,fit-status,changeset-delta}.ts`, `packages/planner/test/feasibility/*.test.ts`.
- Steps: 1. Violation codes + inputs (travel matrix injected). 2. Hours via `domain/places` open-at in POI tz. 3. Chronotype windows. 4. Must-do fit (pre-draft vs post-draft per C44). 5. ChangeSet cost delta + counts (bookings moved, must-dos touched) → 3e-3 golden "+$22 EACH, 1 booking moved, 0 must-dos touched". 6. Performance: must-do suggest fit <20 ms per candidate.
- Tests: `pnpm --fail-if-no-match --filter @cp/planner test -- feasibility`
- Done when: fixtures cover each violation code; 3e-3 golden green; benchmark under budget.
- Status: done — f13d685f

### T6 — Persistence, recompute job, permissions
- Goal: server-side single source persisted and synced.
- Files: `packages/db/src/schema/cost.ts`, `packages/db/migrations/<ts>_cost_components_and_share_calcs.sql`, `<ts>_destination_cost_indices.sql`, `packages/db/test/permissions/{cost-components,share-calcs,destination-cost-indices}.test.ts`, `services/worker/src/cost/{recompute,inputs}.ts`, `services/worker/test/cost/recompute.test.ts`.
- Steps: 1. Tables (incl. `trip_share_totals` table) + RLS + stream entries; permission test: outsider cannot read `trip_share_totals`, member cannot read another member's `share_calcs`. 2. Inputs loader (fare_cells/price_quotes, rooms, participants, plan version, cost indices, fx). 3. `cost.recompute` idempotent on input hash; writes components + share_calcs version; emits `costs.updated`. 4. Seed cost indices for the 6 destinations from cited sources (reviewed_at required).
- Tests: `pnpm --fail-if-no-match --filter @cp/db test -- permissions/share-calcs permissions/trip-share-totals` ; `pnpm --fail-if-no-match --filter @cp/worker test -- cost/recompute`
- Done when: member cannot read another member's personal option deltas (test); rerun with same inputs writes nothing.
- Status: done — 07ddb661

### T7 — Cost API + tool executors
- Goal: reads and previews for app and guide.
- Files: `services/api/src/cost/{routes,preview,tool-executors}.ts`, `services/api/test/cost/*.test.ts`.
- Steps: 1. `GET /v1/trips/{id}/costs` (authz: trip member; own full share, others totals). 2. `POST /v1/trips/{id}/costs/preview` with ChangeSet ops → per-person delta. 3. Register `cost_quote` and `fit_check` executors (guide gets only engine outputs). 4. Contract test: guide tool output never includes another member's personal options or any budget max.
- Tests: `pnpm --fail-if-no-match --filter @cp/api test -- cost`
- Done when: preview matches engine golden; tool contract test green.
- Status: done — 743839e3

## Phase acceptance criteria

- [x] Golden chain from one fixture: $1,480/$1,920 + $440 tie note → $1,350 (520/470/220/140) → $1,310 → $1,334 (+$24); +$22 each; −$140/−$64 → $1,170
- [x] Property tests: allocation sums exact; no max leaks; k < 4 → no dots
- [x] Feasibility covers all violation codes; C44 fit visibility respected
- [x] `cost-engine` and `planner` have zero I/O imports (boundary lint)
- [x] `cost.recompute` idempotent; permission tests green
- [x] `cost_quote` / `fit_check` executors registered and contract-tested

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Design numbers not mutually derivable | fixture tunes inputs (C35: demo data is fixture only); goldens assert engine consistency, not vendor prices |
| Rounding drift between client preview and server | same package + version; server result wins and replaces preview |
| Stay prices unavailable (no stay API) | `destination_cost_indices` ranges labelled "~"; booked stays replace estimates from wallet (P34) |
| Travel matrix latency in feasibility | matrix precomputed per draft (P28) and injected |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Editorial cost indices per destination (stay, food, fun) | budget breakdown shows flights + known components; others flagged missing |
| Founder decision on share display (crew mean vs viewer share) on vote cards | default viewer's own share when origin known, crew mean otherwise |

## Open questions

1. Display rounding — default half-up to whole major unit for "each" labels; exact minor units in money screens.
2. Feasible low for the budget band — default: cheapest QuoteSet for locked dates with min stay index.
3. Dot bucketing — default 5 % track buckets with deterministic jitter.
4. Doc delta: `destination_cost_indices` table; `cost.recompute` job; `/v1/trips/{id}/costs` + `/costs/preview` routes; budget band computed in worker (not SQL SECURITY DEFINER fn).
5. Tight vs clash thresholds — default tight = feasible with <15 min slack or crowd peak; clash = any hard violation.
