---
phase: 2
title: Planning data, contracts and wiring
status: pending
depends_on: []
wave: 1
screens: []
tasks: 6
owns:
  - packages/domain/src/planning/**
  - packages/db/src/schema/planning.ts
  - packages/db/migrations/*_planning_places_tables.sql
  - packages/db/migrations/*_planning_places_column_deltas.sql
  - packages/db/test/permissions/{trip-ideas,place-hides,place-stances,plan-legs,plan-checks,member-asks,route-cache,climate-normals,change-set-drafts}.test.ts
  - packages/db/test/permissions/sync-streams-planning.test.ts
  - infra/powersync/streams/planning.yaml
  - services/api/src/planning/register.ts
  - services/worker/src/jobs/planning/index.ts
  - docs/api-contracts-planning.md
mount_points:
  - packages/db/src/schema/{plan,travel-data,ai,trips}.ts (column/CHECK deltas listed below)
  - packages/db/src/publication.ts (exception set: route_cache, climate_normals)
  - packages/domain/src/index.ts (export planning)
  - packages/domain/src/ai/tables.ts (AGENT_JOB_KINDS += place_ideas)
  - packages/domain/src/guide-actions/** (kind += check_fix)
  - packages/domain/src/plan/{changesets,plan-item,plan-ops}.ts (trigger values, custom_place)
  - packages/domain/src/admin/config-keys.ts + packages/db/seed/catalog-products-perks.ts (config keys and defaults)
  - infra/powersync/streams/core.yaml (change_sets drafts author-only)
  - apps/mobile/src/data/powersync/synced-tables.generated.ts (regenerated)
  - services/api/src/feature-routes.ts (one call: registerPlanning)
  - services/worker/src/job-registry.ts (one spread: planningJobs)
  - docs/{data-model,data-model-sync-and-privacy,api-contracts,api-contracts-async,README}.md
  - .gitattributes (union merge for the three aggregators and api-contracts-planning.md)
---
# Phase 2 — Planning data, contracts and wiring

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D12 (local-first), C1/C28 (crew visibility, passive signals), Q-30 (who edits), C41 |
| `docs/code-standards.md` | §13 (forward-only migrations, publication edits, every user-data table: RLS + grants + privacy class + permission test), §17 |
| `docs/data-model.md` | §1 legend (row format `\| Table \| Key columns \| Relations / indexes \| Authz \| RLS \| Stream \| Class \| Ret \|`), §3.3 plan, §3.13 POI (`crowd_forecasts` row :365) |
| `docs/data-model-sync-and-privacy.md` | §2 LLM views, §4 streams (`trip` :136, `trip_draft` :137, `me` :130), §6 retention, §7 table → phase |
| `docs/api-contracts-explore.md` | the companion-doc pattern `api-contracts-planning.md` copies |
| Code | `packages/db/src/schema/plan.ts:65,112` (plan_items, change_sets), `travel-data.ts:116` (crowd_forecasts), `infra/powersync/streams/core.yaml` (change_sets queries), `packages/domain/src/ai/tables.ts:10`, `services/api/src/feature-routes.ts:108` (`registerExplore` pattern), `services/worker/src/job-registry.ts:108` (`planJobs` pattern), `.gitattributes` (union merge precedent) |

## Overview

Goal: every table, column, stream, contract, config key and wiring point the planning and places redesign needs, landed once, so the wave-2 and wave-3 phases build in parallel without touching migrations, streams or the generated mobile schema.

Done when: migrations apply on a fresh database and on a staging copy; permission and stream tests pass for every new table; the mobile synced schema is regenerated; contracts compile; the three server aggregators are registered (empty lists are allowed only in the aggregators); doc deltas are written.

## Requirements

| Need (render) | Data |
|---|---|
| Ideas: saved but not placed, with who saved it and where it fits (7f-2, 7a-3 footer, 7c-3 group, 7h-5) | `trip_ideas` (crew-visible inside the trip's destination, as saves already are on the place page) |
| Swipe left to hide a place (7c-3) | `place_hides` (owner-only: a passive signal, C28) |
| Want it / rather not with each person's own words (7e-3) | `place_stances` (explicit public stance; never derived from swipe "no" or hides) |
| Legs "CAR · 1H10", "5 stops · 2h40 in the car", offline plan (7a-2, 7b-1, 7i-2) | `plan_legs` per plan version, synced like `plan_items` |
| Background check with counts on the trip (7h-1, 7a-1, 7a-3 chips) | `plan_checks`, `plan_check_issues` |
| Hourly crowds and "busy from 10" (7e-1, 7f-1, 7h-4) | `crowd_forecasts` gains editorial and visit-derived sources |
| "October afternoons are usually wet from 1 to 3" before a forecast exists (7h-1, 7h-4) | `climate_normals` |
| Drive minutes reused across jobs | `route_cache` (server only) |
| "ONLY YOU SEE THIS" on fixes, swaps and placed ideas (7h-3, 7h-4, 7h-7) | unsent `change_sets` visible to their author only |
| DROP A PIN (7d-4) | `trip_ideas` pin rows; `plan_items.custom_place` |
| Tokek placing ideas in the background (7h-6) | `agent_jobs.kind` += `place_ideas` |
| "ASK DEV FIRST": a private ask nobody else sees (7h-5) | `member_asks` (two-party, never in the trip stream) |

## Architecture & contracts

### Tables (data-model.md rows, doc delta)

| Table | Key columns | Relations / indexes | Authz | RLS | Stream | Class | Ret |
|---|---|---|---|---|---|---|---|
| `trip_ideas` | id, trip_id, poi_id? (null for a dropped pin), name, name_local?, category, lat, lng (display copy so a phone needs no `pois` row), backer_ids uuid[] (who saved it, swiped yes on it or imported it), sources text[] (save/link/swipe/search/map/pin/guide), source_url? (link a member pasted), fit jsonb? (best day and slot, per-day grade, reason codes; `planning/fit.ts` schema), fit_version_id?, created_by, created_at, updated_at, deleted_at | uk (trip_id, poi_id) WHERE poi_id IS NOT NULL AND deleted_at IS NULL; (trip_id) | participant via `save_idea`/`remove_idea`; sys (swipe match, seed, fit) | T | trip | C1 | life |
| `place_hides` | user_id, poi_id, created_at | pk (user_id, poi_id) | self via `hide_place`/`unhide_place` | O | me | C2 | acct |
| `place_stances` | trip_id, poi_id, user_id, stance (want/rather_not), note? (≤ 140 chars, crew-visible), updated_at | pk (trip_id, poi_id, user_id) | self via `set_place_stance`/`clear_place_stance` | T | trip | C1 | life |
| `plan_legs` | trip_id, version_id, day_id, from_key (`stay` or a stable_id), to_key, mode (walk/drive/ride/driver), minutes, meters, source (valhalla/straight_line; never a Navigation API result), approx bool, computed_at | pk (version_id, from_key, to_key); (trip_id, version_id) | sys (`plan.legs`) | T + version visibility as `plan_items` | trip (crew versions), trip_draft (organiser versions) | C1 | life |
| `route_cache` | key (hash of rounded from/to points, mode, hour bucket), minutes, meters, source, computed_at | pk key; (computed_at) | sys | X (no app_user grant) | — | C4 | 30 d |
| `plan_checks` | trip_id (pk), version_id, status (queued/running/done/failed), checked_at, fix_count, know_count, runs_on (date), runs_today | — | sys | T | trip | C1 | life |
| `plan_check_issues` | id, trip_id, version_id, kind (clash/closed/too_far/rain/crowds/pace/booking_note), severity (fix/know), day_id?, stable_ids uuid[], params jsonb (numbers and ids the app words from templates), fix jsonb? ({kind: apply/screen/none, screen?: less_driving/rain_crowds/fill_gap, ops?, summary params}), rank, fingerprint | (trip_id, version_id, rank) | sys | T | trip | C1 | life |
| `member_asks` | id, trip_id, asked_by (organiser or co-organiser), member_id, idea_ids uuid[], ops jsonb (validated planner ops), status (open/accepted/declined/expired), created_at, answered_at | (member_id, status); (trip_id) | asker via `ask_member_about_saves`; member via `answer_member_ask` | X + two-party: `asked_by` or `member_id` only | me (both parties) | C2 | life |
| `climate_normals` | destination_id, cell (0.1° grid key), month, rain_pct smallint[24], source (weatherapi_history), years, computed_at | uk (destination_id, cell, month) | sys | R | — (HTTP only; publication exception) | C0 | content |

### Column and constraint deltas

| Table | Delta |
|---|---|
| `crowd_forecasts` | `source` adds `editorial`, `visits`; adds `approved_at?` (editorial rows show only once approved), `crew_count?` (visits rows exist only at ≥ 5 distinct crews, C5 aggregate); uk becomes (poi_id, source, dow). Stream `trip_pack` keeps its destination filter and adds `source <> 'editorial' OR approved_at IS NOT NULL` |
| `change_sets` | `trigger` adds `check`, `ideas`, `gap`, `split`; a `draft` row is visible to its `author_id` only (organisers when `author_id` is null): RLS + both `core.yaml` queries |
| `plan_items` | `custom_place jsonb?` `{name, lat, lng}` for a stop on a dropped pin (no `pois` row) |
| `destinations` | `drive_factor real not null default 1.0` (calibrates free-flow drive minutes to local traffic; editorial) |
| `agent_jobs` | `kind` adds `place_ideas` (CHECK + `AGENT_JOB_KINDS`) |
| `fair_use_counters` | metric CHECK adds `search_parse`, `link_import`, `place_compromise` |

### LLM views (guide_reader, data-model-sync §2)

`llm.trip_ideas` (trip-scoped, no `source_url`), `llm.place_stances` (stance + note, notes reach a model only inside an untrusted crew-message block), `llm.plan_check_issues`.

### Streams (`infra/powersync/streams/planning.yaml`)

| Stream | Adds |
|---|---|
| `trip` | `trip_ideas`, `place_stances`, `plan_checks`, `plan_check_issues`, `plan_legs` of crew versions |
| `trip_draft` | `plan_legs` of organiser-only versions |
| `me` | `place_hides`, `member_asks` (rows where the user is the asker or the member) |

No new `pois` rows reach phones (still editorial only, `places.yaml:22-41`). New place data on phones = the display copy inside `trip_ideas` for places the crew saved, plus approved editorial `crowd_forecasts` rows for curated places already in `trip_pack`.

### Contracts (`packages/domain/src/planning/**`)

`fit.ts` (FitGrade good/possible/no, FitReason codes with params: opens_at, closes_at, busy_from, quiet_until, drive_minutes, walk_minutes, rain_likely, dry_window, free_day, after_item, before_item, who_free, needs_move, crew_split, booked_nearby), `gaps.ts`, `ideas.ts`, `stances.ts`, `checks.ts` (issue kinds, params per kind, fix descriptor), `legs.ts`, `search-filter.ts` (chip vocabulary: categories, attributes, open_past, max_minutes{from: stay|poi|day_route}, exclude_day_ids, price_max), `imports.ts` (SSE event union), `commands.ts` (zod for `save_idea`, `remove_idea`, `hide_place`, `unhide_place`, `set_place_stance`, `clear_place_stance`, `start_idea_placement`, `post_place_decision`, `apply_check_fix`, `ask_member_about_saves`, `answer_member_ask`), `queues.ts` (`plan.legs`, `plan.check`, `ideas.seed`, `climate.normals`, `ai.place_ideas`), `rt.ts` (`trip_plan:` events `legs.updated`, `check.updated`, `ideas.changed`), `config.ts` (keys below).

### Config keys (public = sent to the app)

| Key | Default | Public |
|---|---|---|
| `planning.redesign` | false (rollout switch: old 3d/3e screens vs section 7) | yes |
| `plan.hub` | `map` (`map` = 7a-1, `day` = 7b-1) | yes |
| `plan.check.max_runs_per_trip_day` | 96 | no |
| `plan.check.thresholds` | `{too_far_day_min: 180, too_far_leg_min: 90, rain_pct: 50, normal_rain_pct: 40, busy_level: 70, pace_stops_per_9h: 6}` | no |
| `routing.walk_max_m` | 1200 | no |
| `fair_use.search_parse_per_day` / `link_import_per_day` / `place_compromise_per_day` | 100 / 30 / 20 | no |
| `imports.platforms` | `["tiktok","youtube","instagram","apple_maps","google_maps"]` (founder decision) | yes |

### Wiring aggregators (append-only, `merge=union`)

| File | Pattern |
|---|---|
| `services/api/src/planning/register.ts` | `registerPlanning(app, doors)` calls each planning module's `register…`; mounted once in `feature-routes.ts` |
| `services/worker/src/jobs/planning/index.ts` | `planningJobs(deps)` spreads each planning job list and event hook; mounted once in `job-registry.ts` |
| `apps/mobile/src/features/planning-register.ts` | created by phase 5 |

Each later phase adds one import line and one call/spread line; no other edits.

## Tasks

### T1 — Planning contracts and config keys
- Goal: one typed vocabulary for fit, ideas, stances, checks, legs, search filters, imports and the new commands.
- Files: `packages/domain/src/planning/**`, `packages/domain/src/index.ts`, `packages/domain/src/admin/config-keys.ts`, `packages/db/seed/catalog-products-perks.ts`, `packages/domain/src/plan/{changesets,plan-item,plan-ops}.ts`, `packages/domain/src/ai/tables.ts`
- Steps: 1. Zod schemas above; reason codes carry params, never words. 2. Command contracts with result and error codes (reuse `VALIDATION`, `STATE_INVALID{reason}`, `FORBIDDEN{reason}`, `NOT_FOUND`; no new codes). 3. Config keys + seeds. 4. `trigger` values, `custom_place`, `place_ideas`.
- Tests: `pnpm --filter @cp/domain test -- planning` (schema round-trips for each issue kind's params and each SSE event; rejects unknown reason codes)
- Done when: `pnpm --filter @cp/domain typecheck` passes; every contract has a zod input and result.
- Status: todo

### T2 — Tables, column deltas, views and grants
- Goal: schema for the redesign, forward-only.
- Files: `packages/db/src/schema/planning.ts`, `packages/db/src/schema/{plan,travel-data,ai,trips}.ts`, `packages/db/migrations/<ts>_planning_places_tables.sql`, `packages/db/migrations/<ts>_planning_places_column_deltas.sql`, `packages/db/src/publication.ts`
- Steps: 1. Tables + indexes for every FK and policy predicate. 2. ENABLE + FORCE RLS; policies for app_user via `app.is_trip_participant()`; `place_hides` owner-only; `member_asks` readable by `asked_by` and `member_id` only; `route_cache` no app_user grant. 3. CHECK expansions (crowd source, change_set trigger, agent job kind, fair-use metrics); `crowd_forecasts` unique swap as expand (new index) → contract (drop old) in the second file. 4. `change_sets` SELECT policy: drafts author-only. 5. LLM views + guide_reader grants. 6. Publication: guarded `DO` block per table; exceptions for `route_cache`, `climate_normals`. 7. Privacy registrations in `planning.ts`. Migration timestamps generated after rebasing on `main`.
- Tests: `pnpm test:remote @cp/db -- publication`
- Done when: migrations apply on a fresh database and replay idempotently; publication test lists exactly the new C1/C2 tables.
- Status: todo

### T3 — Streams and the mobile synced schema
- Goal: phones receive the new rows, nobody receives what they should not.
- Files: `infra/powersync/streams/planning.yaml`, `infra/powersync/streams/core.yaml`, `apps/mobile/src/data/powersync/synced-tables.generated.ts`
- Steps: 1. Stream queries per the table above, `plan_legs` filtered by version visibility like `plan_items`. 2. `change_sets` queries in `trip` and `trip_draft` add `AND (status <> 'draft' OR author_id = auth.user_id())`. 3. Audit every draft producer (`match-to-changeset.ts`, `propose-plan-changes.ts`, `weather-replan.ts`, member edits in `use-plan-editor.ts:94`) and record in the PR which ones send at once and which stay drafts. 4. `pnpm --filter @cp/mobile exec tsx src/data/powersync/test-support/synced-schema-source.ts --write`.
- Tests: `pnpm --filter @cp/mobile test -- data/powersync/synced-schema`
- Done when: build-config output contains the new queries; the synced schema test passes.
- Status: todo

### T4 — Permission and stream tests
- Goal: every new table proven per actor.
- Files: `packages/db/test/permissions/{trip-ideas,place-hides,place-stances,plan-legs,plan-checks,route-cache,climate-normals,change-set-drafts}.test.ts`, `packages/db/test/permissions/sync-streams-planning.test.ts`
- Steps: 1. Outsider, ex-member, member, organiser for each table (read, write via app_user). 2. Stream harness: member sees ideas/stances/legs/checks; outsider sees none; a peer never sees another member's `place_hides`; a `member_asks` row reaches only its asker and its member; a member never sees another member's draft change set; an organiser sees legs of a private draft only through `trip_draft`. 3. guide_reader reads the three views and nothing from the base tables.
- Tests: `pnpm test:remote @cp/db -- permissions/trip-ideas permissions/place-hides permissions/member-asks permissions/change-set-drafts permissions/sync-streams-planning`
- Done when: all listed suites pass on the remote runner.
- Status: todo

### T5 — Server wiring aggregators
- Goal: later phases register routes, commands, hooks and jobs without sharing files.
- Files: `services/api/src/planning/register.ts`, `services/worker/src/jobs/planning/index.ts`, `services/api/src/feature-routes.ts`, `services/worker/src/job-registry.ts`, `.gitattributes`
- Steps: 1. `registerPlanning(app, doors)` and `planningJobs(deps)` mounted once. 2. `.gitattributes`: `merge=union` for both aggregators, `apps/mobile/src/features/planning-register.ts` and `docs/api-contracts-planning.md`. 3. A short header comment in each aggregator: one import + one line per module, no logic.
- Tests: `pnpm --filter @cp/worker test -- job-registry` (registry-wide rules still hold)
- Done when: api and worker boot with the aggregators in place.
- Status: todo

### T6 — Doc deltas
- Goal: the contracts are written down where agents look.
- Files: `docs/data-model.md`, `docs/data-model-sync-and-privacy.md`, `docs/api-contracts-planning.md` (new), `docs/api-contracts-async.md`, `docs/api-contracts.md` (index link), `docs/README.md` (row)
- Steps: 1. Rows above in §3.3/§3.13 style with `(doc delta: …)` for column changes. 2. §4 stream rows, §6 retention, §7 table → creating plan. 3. `api-contracts-planning.md`: Commands, Routes, AI routes, Realtime, Jobs sections with every row from this plan's phases (each phase refines its own rows). 4. Async: queues `plan.legs`, `plan.check`, `ideas.seed`, `climate.normals`, agent job `ai.place_ideas`; `trip_plan:` events.
- Tests: `pnpm format:check` on the docs.
- Done when: every table, stream, queue, channel event, command, route and AI route in this plan has a doc row.
- Status: todo

## Device flows

None (no UI). The mobile synced-schema test is the device-facing check.

## Phase acceptance criteria

- [ ] T1–T6 done-when checks pass.
- [ ] No C2/C3 data leaves its owner: `place_hides` owner-only, `member_asks` two-party, drafts author-only, `route_cache` unreadable by app_user.
- [ ] `trip_ideas` exposes only what the place page already exposes (crewmates who saved a place in the trip's destination).

## Risks & rollback

| Risk | Likelihood × impact | Mitigation / rollback |
|---|---|---|
| Author-only drafts hide a draft another screen expects to see (guide chat plan card, organiser review) | M × H | T3 audit + T4 tests; a producer that must be crew-visible sends at once (status `proposed`); rollback = revert the stream/RLS edit only (no data change) |
| Unique-key swap on `crowd_forecasts` fails on duplicate rows | L × L | table has no writer today (`crowds-refresh.ts` only deletes); expand/contract in two files |
| Union merge garbles an aggregator | L × M | aggregators hold import + call lines only; typecheck catches a bad merge |
| Synced schema regenerated by two phases | M × M | only this phase adds synced tables in this plan; later phases that need a column come back here (plan.md rule) |

## Migration (existing users' data and screens)

- Expand-only: no existing row changes meaning. Existing draft change sets become author-only; T3's audit lists any draft another member was reading.
- `trip_ideas` starts empty; phase 7's `ideas.seed` backfills from participants' saved places and unslotted swipe matches.
- `plan_legs`, `plan_checks` fill when phases 3 and 4 run their backfills.
- Đà Nẵng: no bulk writes to `da-nang` POIs before 2026-10-05 00:00 +07 (founder on the trip); this phase writes no POI rows.

## Undesigned states to log

None (no UI).

## Open questions

1. `trip_ideas` vs deriving Ideas from `saved_items` at read time: default the table (offline Ideas, swipe backers, one row per place per trip). Derivation would need other members' C2 saves on the phone.
2. Stance notes length: default 140 characters (the render's longest line is 39).
