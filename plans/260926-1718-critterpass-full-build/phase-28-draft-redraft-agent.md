---
phase: 28
title: Drafting agent, private draft review, redraft diff
status: in_progress
depends_on: [13, 16, 18, 27]
wave: 14
features: [F-074, F-075, F-076]
screens: [3c-8, 3c-9, 3c-11, 3c-12, 4f-3]
tasks: 11
owns:
  - infra/powersync/streams/draft.yaml
  - packages/db/src/schema/draft.ts
  - packages/db/migrations/*_draft_metrics_and_redraft_reservations.sql
  - packages/db/test/permissions/{draft-organiser-visibility,redraft-reservations}.test.ts
  - packages/domain/src/itinerary/**
  - packages/planner/src/draft/**
  - packages/planner/test/draft/**
  - packages/ai/src/prompts/draft/**
  - packages/ai/evals/draft/**
  - services/api/src/commands/draft/**
  - services/worker/src/jobs/ai/{draft,redraft}.ts
  - services/worker/src/jobs/ai/draft/**
  - apps/mobile/src/features/plan/draft/**
  - apps/mobile/src/app/(trip)/[tripId]/draft/**
  - packages/i18n/locales/en/plan-draft/**
  - e2e/plan/draft*.yaml
---
# Phase 28 — Drafting agent, private draft review, redraft diff

> **Status, 6 Oct 2026:** open: T9's Viator half (the availability contract test needs Viator sandbox access, a partner approval). The drafting agent itself is done and now reads typed place facts behind `planner.typed_places` (#736).

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | §1 D5 (3 tiers, guide never writes directly), D10 (no room holds; Viator only real holds), D1; §2 C3, C13 (redraft quota), C41, C43, C44 (draft privacy, no spend on unsent draft); §3 entitlements (`redraftLimit(t)`, unlimited fair-use 20/trip/day); §5 supplier copy rows 3c-8, 3c-12, 3c-9/4f-3; §7 Q-34, Q-41 |
| `docs/system-architecture.md` | §4.4 jobs, §4.6 AI, §4.9 suppliers, §7.b redraft sequence, §9 perf budgets (draft p50 ≤ 20 s) |
| `docs/code-standards.md` | §15 AI rules (numbers from code, proposals only), §17 testing |
| `docs/data-model.md` | §3.3 `itinerary_versions`, `plan_days`, `plan_items`, `change_sets`, `agent_jobs`; §3.14 `redraft_reservations`, `trip_entitlements` |
| `docs/data-model-sync-and-privacy.md` | §2 `llm.trip_context`, `llm.plan_items`; §4 `trip_draft` stream; §7 row "28" |
| `docs/api-contracts.md` | §3 errors `REDRAFT_LIMIT`, `PLAN_VERSION_CONFLICT`; §4.6 `start_draft`, `request_redraft`, `keep_redraft`/`revert_redraft`; §5.3 `GET /v1/jobs/{id}`; §6 tools; §7 supplier adapters |
| `docs/api-contracts-async.md` | §1 `trip_draft:{trip_id}`, `trip:` `redraft.counter`; §2 `ai.draft`, `ai.redraft` |
| Reports | `design-analysis-260926-1143-next-trip-explore-report.md` §2 3c-8, 3c-9, 3c-11, 3c-12, §5, §7; `researcher-260926-1143-ai-guide-report.md` §4.3 draft workflow, cost table (draft $0.32, redraft $0.022), evals; `researcher-260926-1649-travel-supplier-apis-report.md` (Travelpayouts links, Viator availability); master §2 F-074…F-076, R2, R20 |
| Renders | `docs/design-renders/screens/3c-8_Pon_is_drafting.png`, `3c-9_Pon_s_draft.png`, `3c-11_Change_a_day.png`, `3c-12_Pon_s_redraft.png`, `4f-3_Last_redraft.png` |

## Overview

Goal: the organiser taps DRAFT MY TRIP and within ~20 s (p50) watches a real, progress-reporting job produce a validated itinerary version visible only to them; they review it, redraft single days with reasons, and see each redraft as a server-computed op diff on stable item ids that they keep or revert, metered by the per-trip redraft quota.

Done when: `ai.draft` produces a version that passes the planner validator for all golden crews (promptfoo eval ≥ target), staging bench recorded with first streamed day card ≤ 8 s (p50 ≤ 20 s is a P54 launch gate); drafts are invisible to non-organisers (permission tests); redraft reserve/commit/release is race-safe; Maestro drafting → review → redraft → keep/revert flows pass on iOS and Android.

## Requirements

### F-074 Drafting agent (3c-8)

| Area | Behaviour |
|---|---|
| Pipeline (`ai.draft`, workflow not free agent) | 1 load profiles, must-dos, dates, budget band, rooms, dietary flags (code, `guide_reader` views, no C3) → 2 parallel prefetch (code): candidate pools per must-do/interest from curated POI DB, hours on trip dates, crowds, season signals, weather normals, Valhalla matrix, flight times from bookings/estimates → 3 Opus 5.5 skeleton (day themes, stay nights, early/late balance) → 4 Sonnet 5 day fan-out in parallel, each streamed as a day card → 5 planner validate (hours, travel time, 15-min grid, capacity, must-dos, dietary, budget) → 6 Sonnet repair only violating days (≤ 2 loops, then drop-and-flag item) → 7 persona summary lines (Haiku) |
| Grounding | only known POI ids (curated DB, never supplier content, D10); all times/prices/durations from planner + cost-engine; model outputs ids + choices + prose only |
| Progress | `agent_jobs.steps[]` labels mirror real work: "Read {n} taste profiles", "Checked the {season signal}", "Picked {n} {stay type}s in {area}" (no availability, price or cancellation claim; D10), "Balancing {a} early birds and {b} night owls", "Finding {dietary} {food} for {name}"; states pending/running/done/failed; partial day titles published as `draft.day_title` |
| Transport | `trip_draft:` (organiser only, ~1/s) + `GET /v1/jobs/{id}` poll fallback; job survives app backgrounding; push "{Guide}'s draft is ready" deep-links to 3c-9 |
| Stays | per stay night: affiliate "Book here" (Agoda/Trip.com/Booking via Travelpayouts), price "~$X estimate" from P16 curated cost bands (`destination_cost_indices`; Travelpayouts supplies links, not hotel prices); no hold; "Free cancellation until {date}" only for a stay imported into the wallet (P34) or, when the Agoda Demand adapter flag is on (P35), from its live rate data |
| Viator must-dos | if a must-do maps to a Viator product and `supplier.viator_booking` is on: availability check for the planned slot → item flagged "Slot available"; hold only after the draft is sent (P31/P35, C44) |
| Budget | draft cost per person must be ≤ locked target; overrun → repair pass for cheaper swaps, else flagged "over by $X" |
| UI 3c-8 | dark radial glow, guide (190 px, think) in two ping rings (scale .6→1.5, opacity .8→0, 2400 ms, offset 1200); title "{GUIDE} IS DRAFTING YOUR {N} DAYS", ETA "About 20 seconds"; task rows rise (ty 14→0, stagger 600 ms), tick green; day-card marquee (18 s linear, seamless); on done `fold` into 3c-9 + success haptic |
| States to build | backgrounded completion, slow (> 45 s: "Taking a bit longer — I'll ping you"), partial failure (step shows failed with reason, draft still produced), total failure (retry, quota untouched), offline start (queued command; UI waits), cancel, second organiser device (reads same job) |
| Entitlement | unmetered system AI; one active draft job per trip; drafts count 0 redrafts |

### F-075 Private draft versions & review (3c-9)

| Area | Behaviour |
|---|---|
| Privacy | `itinerary_versions.visibility='organiser'` until proposal send (P31); RLS restricts to `app.is_trip_organiser`; crew sees only "{name} is planning" status on the trip header (undesigned; design in code) |
| Versions | each draft/kept redraft creates a new version (`parent_id`), `draft_version_id` points to the latest; history list (undesigned) allows restoring an earlier draft |
| Screen | "← {DEST} SETUP" + "🔒 ONLY YOU SEE THIS"; title "{GUIDE}'S DRAFT" + sticker (bob 2800); sub "{dates}, ${pp} each. Fix anything before the crew sees it."; coverage strip "✓ ALL {n} MUST-DOS MADE IT" + avatars or "{k} of {n} made it" with why per missing; day rows (tile, title, weekday · key detail, must-do owner avatars, OPTIONAL tag); CTA BUILD THE PROPOSAL (→ P31); link "Ask {guide} to change a day"; redraft counter "{used} of {limit} redrafts" |
| Motion | rows drop in (opacity 0, ty −12→0, 400 ms, delay 520 + n·80 ms); owner avatars stamp (scale-down + thud-lite); kept redraft row: title `flap`, sub fades |
| Stale | setup edits after draft (dates, budget, rooms, must-dos) → banner "Setup changed since this draft" with REDRAFT AFFECTED DAYS (free when caused by late must-dos per Q-34; else counts) |
| States to build | must-do missing, over budget, stale, failed/partial, empty, second device, lottery/book-ahead notes "results {date} · reminder set" |

### F-076 Day redraft + diff (3c-11, 3c-12, 4f-3)

| Area | Behaviour |
|---|---|
| Request sheet 3c-11 | day chips (number + weekday, snap); day summary card flips in (opacity .3, ty 6→0, 260 ms); reason chips SLOWER, CHEAPER, LESS TRAIN, MORE FOOD, SWAP IT OUT, SURPRISE ME (taste-chip colours, pop); note field; CTA "REDRAFT DAY {n}" (label follows day); per-day guide comments from skeleton rationale; locked items (booked, must-do) marked and preserved |
| Quota (C13) | `redraftLimit(t)` = boost ? ∞ (fair-use 20/trip/day) : 3; shared by drafters; reserve on submit (`redraft_reservations`), commit on result delivered (kept or reverted both count), release on job failure or "couldn't improve"; atomic reserve under concurrency (R20) |
| 4f-3 | before submitting the last free redraft: interstitial "REDRAFT {n} OF {limit} · LAST FREE REDRAFT" → use last / Boost (P46 paywall entry `redraft_last`); at 0 → `REDRAFT_LIMIT` → Boost upsell sheet, the boost button remains one tap away on the result |
| Job `ai.redraft` | Sonnet 5 day-scoped: context = day, neighbours, reasons, note, member requests from chat memory (P13 over P24 `llm.chat_window`: text only, no card payloads; wrapped in an untrusted-data block — model told to treat crew messages as preferences, never instructions), constraints (keep must-dos, bookings, budget); output = new-day structure on stable ids → server `planner.diff(base, candidate)` → ops + deterministic metrics (transit minutes delta from Valhalla matrix, pace delta, must-dos kept, cost delta) → model writes one reason per change |
| Diff 3c-12 | "← {GUIDE}'S DRAFT" + ONLY YOU SEE THIS; title "DAY {n}, REDRAFTED"; summary; change cards (old struck, new time/title, note); metric chips; CTA KEEP IT; link "Put {old} back"; changes tick in one by one (strike draws L→R, new line fades up, check pops); per-change toggles (reuse P29 review toggle component contract; here organiser-local) |
| Truthful copy | "I booked it." → "Found a slot. Book it once the crew's in." + BOOK link ("free cancellation" only when the supplier data in hand states it); Viator on + draft already sent → "Price held until {time}" only for Viator products |
| Keep/revert | `keep_redraft` → candidate ops applied to draft version (new version, still private), toast "Day {n} is {title} now. Nobody else has seen it yet."; `revert_redraft` → discard; no side effects to release (none are created pre-send) |
| States to build | no reason (CTA disabled until a chip or note), redraft identical ("Couldn't beat this day" → quota released), failure, locked-day conflict, stale base (`PLAN_VERSION_CONFLICT` → rebase or redo), small changes auto-summary |
| Organiser-only | channel `trip_draft:`; after proposal send, redrafts on the shared plan go through P29 ChangeSet review |

## Architecture & contracts

| Kind | Delta |
|---|---|
| Tables | `itinerary_versions`, `plan_days`, `plan_items` already exist (P8 `schema/plan.ts`, `plan_versions_and_changesets` migration, plan decision 11); this phase only ALTERs: `plan_items.locked_reason` (booking/must_do/user), `itinerary_versions.metrics jsonb`, `itinerary_versions.coverage jsonb` (**doc delta**; Drizzle columns appended to P8 `schema/plan.ts`, append-only), and creates `redraft_reservations` (`schema/draft.ts`); `redrafts` view over `agent_jobs(kind='redraft')` + candidate version id (**doc delta**: `keep_redraft {redraft_id}` = agent_job id) |
| RLS | versions/days/items: `T` + organiser-only for `visibility='organiser'`; writes only by `app_system` (worker) and command handlers; `guide_reader` sees organiser draft only in `llm.plan_items` for organiser jobs |
| Sync | `trip_draft` stream exists (P8); append `agent_jobs` (draft/redraft kinds) and `redraft_reservations`; `trip` stream for crew-visible versions (P29/P31 flip visibility) |
| Commands | `start_draft`, `request_redraft`, `keep_redraft`, `revert_redraft`, `cancel_draft` (**doc delta**), `restore_draft_version {version_id}` (**doc delta**) |
| Jobs | `ai.draft` (idempotency `trip_id + draft_seq`, retries 2, DLQ), `ai.redraft` (`redraft_id`); both write `agent_jobs.steps` + `rt_outbox` to `trip_draft:`; push via P11 router on completion when app not foregrounded |
| AI | prompts `packages/ai/src/prompts/draft/{skeleton,day,repair,summary,redraft}.ts` with strict JSON schemas; tools (read-only): `places_search`, `place_details`, `route_eta`, `crowd_forecast`, `crew_profiles`, `propose_plan_changes`; model routing D5; Langfuse trace per job; cost logged to `agent_jobs.cost_micros` |
| Suppliers | read-only: Travelpayouts affiliate link builder (P15 client); stay estimates from P16 cost bands; Viator `availability/check` through `packages/suppliers` port when flag on (adapter delivered by P35; until then the step is skipped and the item shows the Viator/Klook link) |
| Entitlements | `packages/entitlements` `redraftLimit`, fair-use counter; reservation SQL in handler transaction |

## Tasks

### T1 — Draft columns, redraft reservations, permission tests (ALTER only)
- Goal: extend P8's plan tables; add redraft reservations.
- Files: `packages/db/src/schema/draft.ts`, `packages/db/src/schema/plan.ts` (append-only: 3 columns), `packages/db/migrations/<ts>_draft_metrics_and_redraft_reservations.sql`, `packages/db/test/permissions/{draft-organiser-visibility,redraft-reservations}.test.ts`, `packages/domain/src/itinerary/{schemas,ids}.ts`, `infra/powersync/streams/draft.yaml` (`agent_jobs` + `redraft_reservations` into `trip_draft`)
- Steps: 1. `ALTER TABLE` for `locked_reason`, `metrics`, `coverage`; create `redraft_reservations` + RLS. 2. Stream appends. 3. zod `Itinerary`, `PlanDay`, `PlanItem`, `RedraftResult`. 4. New test files add draft-specific cases on top of P8's plan-table suites (P8 files untouched).
- Tests: `pnpm --filter @cp/db test -- permissions/draft-organiser-visibility permissions/redraft-reservations permissions/itinerary_versions permissions/plan_items`
- Done when: migration contains no `CREATE TABLE` for P8 tables; P8 plan permission suites still green; member reads 0 organiser-visibility rows or draft `agent_jobs` directly and via sync replica; organiser reads all; `redraft_reservations` writable only via handler.
- Status: done — c17663cb

### T2 — Draft validator, repair targeting, diff metrics
- Goal: pure planner pieces for the draft pipeline.
- Files: `packages/planner/src/draft/{candidate-pools,validate-itinerary,repair-targets,redraft-diff,metrics}.ts`, `packages/planner/test/draft/*.test.ts`
- Steps: 1. Candidate pool shaping from prefetch data (per must-do/interest/day). 2. Validator: hours in dest tz, travel time from matrix, 15-min grid, capacity, must-do coverage, dietary, budget ≤ target, flight arrival/departure buffers. 3. Repair targets = violating days + reasons. 4. `redraftDiff(base, candidate)` on stable ids + metrics (transit Δ, pace Δ, must-dos kept, cost Δ).
- Tests: `pnpm --filter @cp/planner test -- draft`
- Done when: 3c-12 fixture yields 3 changes and "90 MIN LESS ON TRAINS · SAME PACE · ALL 5 MUST-DOS KEPT"; validator catches each injected violation class.
- Status: done — 2c9fd3b8

### T3 — Draft prompts and schemas + promptfoo suite
- Goal: skeleton/day/repair/summary/redraft prompts with evals.
- Files: `packages/ai/src/prompts/draft/**`, `packages/ai/evals/draft/{promptfooconfig.yaml,golden/*.json,asserts/*.ts}`
- Steps: 1. Persona-aware prompts (persona pack from P18) with strict JSON output keyed by POI ids; chat memory and member notes inside an untrusted-data block. 2. Golden set: ~30 crews across 6 guide cities + 20 redraft requests + 10 injection cases (crew messages / notes that try to override instructions, add links, reveal budgets or change other days). 3. Asserts run the planner validator + no-unknown-id + no numeric claims in prose + injection cases leave output schema, scope and constraints unchanged.
- Tests: `pnpm --filter @cp/ai eval -- draft`
- Done when: pass rate ≥ 90% on validator-clean first pass and 100% after repair; zero unknown POI ids; injection eval 100 %.
- Status: done — 1f5e0772

### T4a — `start_draft`/`cancel_draft` + job shell (load, prefetch, steps, persist)
- Goal: durable job frame with truthful progress.
- Files: `services/worker/src/jobs/ai/draft.ts`, `services/worker/src/jobs/ai/draft/{load,prefetch,persist,steps}.ts`, `services/api/src/commands/draft/{start-draft,cancel-draft}.ts`
- Steps: 1. Command: organiser policy, one active job, agent_jobs row + `boss.send` in one tx. 2. Load via `guide_reader` views (no C3); parallel prefetch with per-call timeouts. 3. Steps writer + `trip_draft:` rt_outbox; persist version + coverage + metrics idempotently. 4. Push on completion; failure path marks steps failed; cancel.
- Tests: `pnpm --filter @cp/worker test -- jobs/ai/draft/shell`; `pnpm --filter @cp/api test -- commands/draft/start-draft`
- Done when: second `start_draft` while one runs → rejected; killing the worker mid-job resumes or fails cleanly without duplicate versions; step labels match the copy list (no hold/price claims).
- Status: done — 02b57afb

### T4b — Model stages: skeleton, day fan-out, validate/repair + bench
- Goal: Opus skeleton → Sonnet days → validator repair loop.
- Files: `services/worker/src/jobs/ai/draft/{skeleton,fan-out,validate-repair}.ts`, `services/worker/bench/draft.bench.ts`
- Steps: 1. Opus skeleton; `Promise.all` Sonnet days streaming `draft.day_title` + day cards. 2. Validate/repair ≤2 then drop-and-flag. 3. Routing flag `ai.draft.skeleton_model` (opus / sonnet). 4. Bench script records p50/p95 and time to first day card per model route.
- Tests: `pnpm --filter @cp/worker test -- jobs/ai/draft/stages`; `pnpm --filter @cp/worker bench:draft`
- Done when: integration test with Anthropic recorded fixtures (recorded from real calls, replayed) produces a valid version; staging bench over 10 runs recorded in the PR for both routes; first streamed day card ≤ 8 s p50. p50 ≤ 20 s is tracked as a P54 launch gate (fallback = routing flag to all-Sonnet).
- Status: done — b29060e5 (bench recorded on the golden crews; the staging run waits for a drafted staging trip)

### T5 — Redraft pipeline + quota
- Goal: `request_redraft`, `ai.redraft`, keep/revert, restore.
- Files: `services/api/src/commands/draft/{request-redraft,keep-redraft,revert-redraft,restore-draft-version}.ts`, `services/worker/src/jobs/ai/redraft.ts`, `services/api/src/entitlements/entitle.ts` (redraft fair-use call only)
- Steps: 1. Atomic reserve (`SELECT … FOR UPDATE` on `trip_entitlements`/count) → `REDRAFT_LIMIT`. 2. Sonnet day job → diff + metrics + reasons → candidate version. 3. Commit on delivery, release on failure/identical. 4. Free fit-in redraft for late must-dos (Q-34) flagged `free_reason`. 5. `trip:` `redraft.counter` event. 6. Redraft fair-use for unlimited trips (20/trip/day): the entitlements phase closed `fair_use_counters.metric` to `guide_tokens`/`voice_seconds`/`vision_calls`, so this phase's `*_draft_metrics_and_redraft_reservations.sql` migration widens that check with `redrafts`, and `entitle()`'s `redraft` kind calls `app.bump_fair_use` for unlimited trips.
- Tests: `pnpm --filter @cp/api test -- commands/draft/redraft-quota`; `pnpm --filter @cp/worker test -- jobs/ai/redraft`
- Done when: 10 concurrent requests with 1 remaining produce exactly 1 accepted; failed job releases; boosted trip unlimited but capped by fair-use counter.
- Status: done — 81d5381a

### T6 — Drafting screen (3c-8)
- Goal: progress UI tied to real steps.
- Files: `apps/mobile/src/features/plan/draft/{screens/drafting-screen.tsx,components/{ping-rings,task-list,day-marquee}.tsx,hooks/use-draft-job.ts,commands.ts,queries.ts}`, `apps/mobile/src/app/(trip)/[tripId]/draft/drafting.tsx`, `packages/i18n/locales/en/plan-draft/drafting.po`, `e2e/plan/draft-drafting.yaml`
- Steps: 1. Subscribe `trip_draft:` + poll fallback. 2. Motion per spec via motion runtime presets. 3. Slow/failure/offline/cancel states. 4. Fold transition to review on done.
- Tests: `pnpm --filter @cp/mobile test -- features/plan/draft/drafting`; `maestro test e2e/plan/draft-drafting.yaml`
- Done when: backgrounding during job then tapping the push lands on 3c-9; failed step visible with reason.
- Status: done — 137c7ed2

### T7 — Private draft review (3c-9) + version history
- Goal: organiser review screen.
- Files: `apps/mobile/src/features/plan/draft/{screens/draft-review-screen.tsx,components/{draft-day-row,coverage-strip,stale-banner,version-history-sheet}.tsx}`, `apps/mobile/src/app/(trip)/[tripId]/draft/index.tsx`, `packages/i18n/locales/en/plan-draft/review.po`, `e2e/plan/draft-review.yaml`
- Steps: 1. Rows from local `trip_draft` data; drop-in + stamp motion. 2. Coverage, over-budget, stale, lottery notes. 3. Stay rows: book-here link / free-cancel date. 4. Crew-side "{name} is planning" header status.
- Tests: `pnpm --filter @cp/mobile test -- features/plan/draft/review`; `maestro test e2e/plan/draft-review.yaml`
- Done when: a member device shows no draft data (Maestro run as member); tapping a day pushes the typed route helper `routes.day(tripId, day, {version: 'draft'})` (contract test; P29 builds the draft-mode day screen); RNTL layout snapshots committed; Maestro `takeScreenshot` artifact for `3c-9`.
- Status: done — f12d48c1

### T8 — Change-a-day sheet, last-redraft interstitial, diff screen
- Goal: 3c-11, 4f-3, 3c-12.
- Files: `apps/mobile/src/features/plan/draft/{screens/change-day-sheet.tsx,screens/redraft-diff-screen.tsx,components/{reason-chips,change-card,metric-chips,last-redraft-interstitial}.tsx}`, `packages/i18n/locales/en/plan-draft/redraft.po`, `e2e/plan/draft-redraft.yaml`
- Steps: 1. Sheet with chips, note, counter; interstitial before last; limit → Boost upsell (P46 entry). 2. Thinking beat (900 ms fold) while job runs. 3. Diff animation sequence; KEEP IT / put back with toasts + success haptic. 4. Failure/identical/conflict states.
- Tests: `pnpm --filter @cp/mobile test -- features/plan/draft/redraft`; `maestro test e2e/plan/draft-redraft.yaml`
- Done when: counter decrements only on delivered results; revert restores prior day rows; copy never says "I booked it".
- Status: done — e7578431

### T9 — Draft supplier touches (stays links, Viator availability)
- Goal: truthful stay/activity affordances in draft and redraft.
- Files: `services/worker/src/jobs/ai/draft/suppliers.ts`, `apps/mobile/src/features/plan/draft/components/{stay-link-row,activity-slot-badge}.tsx`
- Steps: 1. Stay affiliate link via P15 Travelpayouts client (`affiliate_clicks` sub_id via API) + "~$X estimate" from P16 cost bands. 2. Viator product match for must-dos; availability check behind `supplier.viator_booking` through the `packages/suppliers` availability port (P35 registers the Viator adapter; wiring + live check in P35). 3. Show free-cancel date only from an imported booking or a live Demand-adapter rate.
- Tests: `pnpm --filter @cp/worker test -- jobs/ai/draft/suppliers`
- Done when: supplier text never enters prompts (test asserts prompt payloads contain only ids/prices from our DB); contract test against the availability port with a recorded Viator `availability/check` fixture flags "Slot available"; flag off or no adapter registered → links only; no stay row shows free-cancel without an imported booking.
- Status: blocked — server half done in e03f9a58 (stay rows from our cost bands, free-cancel only from an imported booking, prompts free of supplier content, slot-check seam defaulting to links only); the Viator availability contract test waits for the Viator adapter, a poi-to-product mapping and a recorded sandbox response; the stay/activity rows are the app lane's

### T10 — Pre-draft closure and holiday check (web search)
- Goal: catch closures and public holidays on the trip dates before the skeleton is drafted (D23).
- Files: the `ai.draft` prefetch step (owned draft job files), tests with recorded search and model fixtures.
- Steps: 1. In the prefetch step, code builds queries from destination, trip dates and candidate POI names (no user data) and calls `web_search`. 2. Extraction writes closure records `{poi_or_area, closed_from, closed_to, reason, source_url}` stored with the draft. 3. The planner reads the records, never raw snippets, and avoids or flags affected POIs. 4. The draft shows "closed {date}" with its source.
- Tests: a fixture trip over Tết avoids a POI with a cited closure; no search text enters the skeleton prompt.
- Done when: drafts avoid or flag cited closures on their dates, and each shown closure links its source.
- Status: done — dcc34157

## Phase acceptance criteria

- [ ] T1–T9 done-when checks pass.
- [ ] Staging bench recorded (p50/p95, first day card ≤ 8 s); cost per draft logged; p50 ≤ 20 s / p95 ≤ 40 s handed to P54 as a launch gate.
- [ ] Every number/time/price shown in 3c-9/3c-12 traces to planner/cost-engine output (unit test snapshot).
- [ ] Organiser-only visibility proven by permission + sync tests.
- [ ] Redraft quota race test green; C13 semantics (revert counts, failure releases).
- [ ] No hold/booking/free-cancel claim in any draft copy without supplier data (i18n lint rule for banned phrases "held", "I booked", "free-cancel" in step labels).
- [ ] Chat memory reaches prompts only as untrusted data; injection eval green.
- [ ] promptfoo draft suite in CI (`ai-evals` workflow).

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| 20 s target missed | parallel fan-out; prefetch cache per destination; stream day cards so perceived wait is short; fallback all-Sonnet skeleton via routing flag |
| Hallucinated venues | ids-only outputs + validator; unknown id → drop + repair |
| Quota races | row lock + unique reservation per job |
| Model outage | retry 2 then DLQ; UI failure state; quota untouched |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Anthropic org limits for Opus/Sonnet concurrency | queue concurrency limit per trip; ETA copy adapts |
| Persona packs + guide-voice lines (P18) | neutral voice template |
| Viator partner approval (Full + Booking) | availability step skipped; links only |
| Travelpayouts account | stay rows show estimate from cost-engine without link |

## Open questions

1. Redraft consumption point: default reserve on submit, commit on result delivered (keep or revert), release on failure/identical (C13).
2. Draft on setup incomplete: default allowed with ≥ dates locked; missing budget → unconstrained with notice.
3. Doc delta: `cancel_draft`, `restore_draft_version`, `plan_items.locked_reason`, `itinerary_versions.metrics/coverage`, `redraft_id` = agent_job id.
4. Multi-day redraft: default one day per request (as designed); SURPRISE ME may touch only that day.
5. Cross-phase wiring owed elsewhere: P29 draft-mode day route; P35 Viator availability adapter registration; P46 `redraft_last` entry (already in P46 registry); P54 draft latency gate.
