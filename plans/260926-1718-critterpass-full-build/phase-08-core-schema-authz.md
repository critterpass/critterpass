---
phase: 8
title: Core schema, authz + RLS backstop, domain events
status: pending
depends_on: [1]
wave: 2
features: [F-037, F-015]
screens: [3c-1, 3c-3, 3c-9, 3c-11, 3d-1, 3e-1, 3e-3, 3f-5, 3k-1, 3b-4, 3m-1]
tasks: 9
owns:
  - packages/db/drizzle.config.ts
  - packages/db/src/client.ts
  - packages/db/src/tx.ts                      # withUser / withSystem / withGuideReader
  - packages/db/src/schema/identity.ts         # users, user_settings, consents, media_objects
  - packages/db/src/schema/crews.ts
  - packages/db/src/schema/trips.ts            # trips, trip_participants, destinations, guides
  - packages/db/src/schema/plan.ts             # itinerary_versions, plan_days, plan_items, change_sets, guide_actions
  - packages/db/src/schema/platform.ts         # cmd_log, cmd_results, rt_outbox, domain_events, activity_events
  - packages/db/src/schema/ops-core.ts         # ops.admin_audit, ops.ops_config, client_config view
  - packages/db/src/schema/index.ts
  - packages/db/src/events.ts                  # appendDomainEvent, enqueueRealtime, recordCmdResult, claimOpId
  - packages/db/src/publication.ts             # PowerSync allow-list
  - packages/db/sql/                           # hand-written roles, helpers, triggers, publication SQL sources
  - packages/db/migrations/*_core_roles_and_schemas.sql
  - packages/db/migrations/*_identity_and_crews.sql
  - packages/db/migrations/*_trips_and_participants.sql
  - packages/db/migrations/*_plan_versions_and_changesets.sql
  - packages/db/migrations/*_command_and_event_log.sql
  - packages/db/migrations/*_ops_core_and_publication.sql
  - packages/db/seed/
  - packages/db/test/helpers/
  - packages/db/test/permissions/_matrix.ts
  - packages/db/test/permissions/{users,user_settings,consents,media_objects,crews,crew_members,trips,trip_participants,destinations,guides,itinerary_versions,plan_days,plan_items,change_sets,guide_actions,activity_events,cmd_results,infra}.test.ts
  - packages/domain/src/ids.ts
  - packages/domain/src/channel-names.ts        # crew:{id}, trip_*:{id}, user:#{uid} builders shared by SQL fns + api + worker
  - packages/domain/src/errors.ts
  - packages/domain/src/privacy.ts
  - packages/domain/src/commands/envelope.ts
  - packages/domain/src/events/
  - packages/domain/src/state/trip.ts
  - packages/domain/src/state/machine.ts
  - packages/domain/src/policy/
  - packages/domain/src/enums/
  - tools/scripts/check-publication.ts
---
# Phase 8 — Core schema, authz + RLS backstop, domain events

## Context links
| Source | Section |
|---|---|
| `docs/data-model.md` | §1 conventions, §2 roles + RLS backstop, §3.1 (`users`, `user_settings`), §3.2 (`crews`, `crew_members`, epochs), §3.3 (`trips`, `trip_participants`, `destinations`, `guides`, `itinerary_versions`, `plan_days`, `plan_items`, `change_sets`, `guide_actions`, `activity_events`), §3.10 `media_objects`, §3.16 `ops.admin_audit`, §3.14 `ops_config`, §3.17 `consents`, §3.18 infra tables |
| `docs/data-model-sync-and-privacy.md` | §1 private-field strategy, §2 `llm` views (grant scaffold only), §3.1 Trip machine, §3.6 one-line machines, §4 Sync Streams (`me`, `crews`, `crew_people`, `trip`, `trip_draft`, `catalog`), §7 table → phase |
| `docs/api-contracts.md` | §2 envelope + pipeline + tables, §3 error codes |
| `docs/api-contracts-async.md` | §1 `user:#uid` channel (`cmd.result`), `rt_outbox` relay contract |
| `docs/system-architecture.md` | §3 import rules, §4.1 commands, §5 authorisation model, §6 envs |
| `docs/code-standards.md` | §13 Database, §17 Testing, §18 Security |
| `docs/product-decisions.md` | §1 D4, D12, D19; §2 C1, C3, C26, C36, C41 |
| Master report | §2 rows F-015, F-037; §0.2 C3/C26/C41; R3, R17 risks |
| Backend report | §4.3 ORM/migrations/tests, §4.4 authorisation model, §4.7 offline sync (publication, `powersync_repl`) |
| Renders (consumers of this model) | `docs/design-renders/screens/3e-1_*.png` (plan days/lanes), `3e-3_*.png` (ChangeSet diff), `3k-1_*.png` (ticker from activity), `3b-4_*.png` (inbox fed by events), `3f-5_*.png` (RSVP) |

## Overview
Goal: the single Postgres 18 schema foundation every later phase extends — roles, schemas, RLS backstop helpers, per-transaction identity (`withUser`), identity/crew/trip/plan core tables, the Trip status machine (TS + SQL parity), idempotent command bookkeeping (`cmd_log`, `cmd_results`), `rt_outbox`, append-only `domain_events` + `activity_events`, the PowerSync publication allow-list, the app-layer policy module and the Testcontainers permission contract harness.
Done when: `pnpm --filter @cp/db test` spins a Postgres 18 container, applies all migrations, and the permission matrix (outsider / ex-member / member / organiser / anonymous × every table here) passes; `pnpm --filter @cp/domain test` passes policy + state machine tests; the publication check passes; `pnpm --filter @cp/db seed` loads a realistic crew/trip fixture.

## Requirements
### F-037 Trip & plan model
| Aspect | Requirement |
|---|---|
| Trip lifecycle | `trips.status` machine exactly per sync doc §3.1: `voting → won → setup → drafting → draft_review ⇄ redrafting → proposed → confirmed → pre_trip → in_trip → post_trip → archived`, solo `— → setup`, `cancelled` from setup/proposed/confirmed/pre_trip. `phase` generated column (`planning/pre/in/post/cancelled`). `setup_step` `when → budget → rooms → must_dos → done` |
| Enforcement | table-driven machine in `packages/domain/src/state/trip.ts` used by handlers; SQL trigger `app.trips_status_guard` rejects illegal `(old,new)`; a test asserts TS table == SQL table (generated from the same JSON) |
| Participants | `trip_participants` role (organiser/member), rsvp (`unopened/opened/maybe/in/out/waitlisted`), `holds_seat` generated (`rsvp <> 'out' AND rsvp <> 'waitlisted'`), `waitlist_position`, `chosen_options`, `landed_at`, `countdown_target_at`. Seat counting SQL fn `app.trip_seats_held(trip)` (cap itself comes from phase 12 entitlements, C26) |
| Co-organisers | multiple `role='organiser'` rows allowed; `app.is_trip_organiser` true for any (Q-11 default) |
| Plan versions | `itinerary_versions` (visibility organiser/crew, status drafting/draft/proposed/current/superseded, parent_id) — private draft visible only to organisers (RLS + `trip_draft` stream) |
| Days/items | `plan_days` uk (version_id, day_no); `plan_items.stable_id` survives across versions (diffs key on it); `lane` + `attendee_ids` model subgroups/splits; every wall-clock item stores `starts_at` + IANA `tz` (validated against `pg_timezone_names`); `created_by_kind` user/guide |
| Guide never writes | `plan_items` INSERT/UPDATE denied to `app_user` except via SECURITY DEFINER `app.apply_change_set(change_set_id)` which requires `change_sets.status='approved'`; `guide_actions` system-only (C3: ChangeSet = proposed mutation, GuideAction = executed side effect with inverse) |
| ChangeSet base | `change_sets` columns per data-model §3.3 (ops jsonb semantic validation by `packages/planner` in phase 16; structural zod shape defined here: `{op, target, before, after, reason, affected_user_ids, booking_impact, source_ids?}` in `packages/domain/src/plan/change-set-ops.ts` — the single op schema; phase 13 imports it), status machine `draft/proposed/voting/approved/applied/rejected/reverted/stale`; `approved_by_kind` (`vote`/`organiser`/`self`/`policy`) + `approved_by`; only `app_system` may set `approved_by_kind='policy'` in `packages/domain/src/state/change-set.ts` |
| Offline | all tables here that are C1/C2 are published and streamed (`crews`, `trip`, `trip_draft`, `me`); optimistic concurrency via `version` + `base_version` |
| Multiplayer | crew membership epoch: every join/leave/remove bumps `crews.membership_epoch` in the same tx and writes an `rt_outbox` `unsubscribe` row for the removed user on `crew:{crew_id}` / `crew_*:{crew_id}` / its trip channels (trigger `app.crew_members_epoch`; names from `app.channel_name(ns, id)` mirroring `packages/domain/src/channel-names.ts`) |
| Solo trip (undesigned, F-062 consumer) | model supports `is_solo` + direct `setup` start; no poll required |
| Concurrent trips | many non-archived trips per crew/user (Bali in_trip while Kyoto votes, Q-07) — no uniqueness on active trip |

### F-015 Domain events + activity log
| Aspect | Requirement |
|---|---|
| Event log | `domain_events` append-only (no UPDATE/DELETE grant to anyone but purge job role), columns per data-model §3.18 + `crew_id?`, `trip_id?` for fan-out (doc delta). Type naming `aggregate.past_tense`; registry `packages/domain/src/events/catalogue.ts` (zod payload per type, no C3 fields — test enforces via privacy registry) |
| Same-tx writes | `appendDomainEvent(tx, evt)` inside the command tx; consumers (pg-boss, phase 11) enqueue in the same tx later — expose a `onEventAppended` hook list the job runner registers into |
| Activity log | `activity_events` crew-visible projection (ticker 3k-1, recap 3m, inbox 3b-4 seeds). Projection rules: `packages/domain/src/events/activity-rules.ts` maps event type → `{verb, object_kind, text_key}` or null (private events never project). Written by SECURITY DEFINER `app.append_activity` |
| Guide as actor | `actor_kind` user/guide/system — ticker shows "Tokek moved dinner" |
| Undo support | events reference `compensates_id`-able aggregates; activity text keys i18n (`activity.<verb>`) — rendering is later phases |
| Analytics feed | events carry ids/enums only (PostHog export in phase 19) |
| Retention | `domain_events` 400 d, `activity_events` life of trip; purge job registered in phase 11 (`maint.purge`) — this phase supplies `app.purge_expired_platform_rows()` |

### Cross-cutting
- D4 authz: app policy first (`packages/domain/src/policy`), RLS backstop FORCED on every user-data table; `SET LOCAL ROLE app_user` + `set_config('app.uid'| 'app.device', …, true)`; PgBouncer-safe (all LOCAL).
- C36 crew visibility: `users` holds only C1 columns + non-sensitive C2 (home airport/currency); private fields live in split tables (phase 9 `user_private`).
- Undesigned states to design in code: none (no UI in this phase). Error copy keys `errors.<CODE>` registered in `packages/domain/src/errors.ts` for phase 7 catalogs.

## Architecture & contracts
### Migrations (hand-reviewed, `packages/db/migrations/<timestamp>_<what>.sql`)
| Migration | Creates |
|---|---|
| `core_roles_and_schemas` | schemas `app`, `llm`, `ops`, `auth`; roles `app_owner` (DDL), `app_user` (NOLOGIN), `app_system`, `guide_reader` (NOLOGIN), `powersync_repl` (REPLICATION), `auth`, `admin_reader`; `GRANT app_user, guide_reader TO <api login>`; extensions `pgcrypto`, `citext`, `pg_trgm`, `vector`; `app.uid()`, `app.device()`, `app.touch_updated_at()`, `app.valid_tz(text)` |
| `identity_and_crews` | `users`, `user_settings`, `consents`, `media_objects`, `crews`, `crew_members` + helpers `app.is_crew_member`, `app.shares_crew`, epoch trigger, partial index `crew_members(user_id, crew_id) WHERE status='active'` |
| `trips_and_participants` | `destinations`, `guides` (colour CHECK per C5 palette), `trips` (+ generated `phase`, status guard trigger), `trip_participants` (+ generated `holds_seat`) + `app.is_trip_member`, `app.is_trip_participant`, `app.is_trip_organiser`, `app.trip_seats_held` |
| `plan_versions_and_changesets` | `itinerary_versions`, `plan_days`, `plan_items`, `change_sets`, `guide_actions`, `app.apply_change_set` (SECURITY DEFINER shell: copies version, applies ops JSON of kinds add/move/remove/retime/swap with stable_id, sets `result_version_id`; op semantics validated by planner in phase 16 before approval) |
| `command_and_event_log` | `cmd_log`, `cmd_results`, `rt_outbox`, `domain_events`, `activity_events`; SECURITY DEFINER write fns (EXECUTE to `app_user`, no table INSERT grants): `app.claim_op`, `app.record_cmd_result`, `app.append_event`, `app.enqueue_rt` (rejects any channel the caller `app.uid()` cannot subscribe to — own `user:#uid`, member crew/trip channels; `unsubscribe`/`disconnect` kinds only from triggers/`app_system`), `app.append_activity`, `app.channel_name`, `app.purge_expired_platform_rows` |
| `ops_core_and_publication` | `ops.admin_audit`, `ops.ops_config`, view `public.client_config` (keys with `is_public`), `CREATE PUBLICATION powersync FOR TABLE <allow-list>`; `guide_reader` has USAGE on `llm` only (views arrive in phase 13) |

### RLS summary (data-model legend)
| Table | RLS | Stream | Class |
|---|---|---|---|
| users | read self or shares crew; write O | me, crew_people | C1/C2 |
| user_settings, consents | O | me | C2 |
| media_objects | S (read via API) | — | C2 |
| crews, crew_members | M | crews | C1 |
| trips, trip_participants | T | crews (header), trip | C1 |
| destinations, guides, client_config | R | catalog | C0 |
| itinerary_versions/plan_days/plan_items/change_sets | T; `visibility='organiser'` rows only `app.is_trip_organiser`; no direct INSERT/UPDATE on plan_items | trip / trip_draft | C1/C2 |
| guide_actions, activity_events | T read, S write | trip | C1 |
| cmd_results | O | me | C2 |
| cmd_log, rt_outbox, domain_events, ops.* | S (app_user writes only through the SECURITY DEFINER fns above; no INSERT/SELECT grant) | — | — |

### Transaction helpers (`packages/db/src/tx.ts`)
| Fn | Behaviour |
|---|---|
| `withUser(uid, device, fn)` | BEGIN; `SET LOCAL ROLE app_user`; set `app.uid`, `app.device`; fn(tx); COMMIT |
| `withSystem(fn)` | same with `app_system`, no uid |
| `withGuideReader(uid, tripId, fn)` | `guide_reader` + `app.uid` + `app.trip` (used by phase 13) |
| `claimOpId(tx, {op_id, uid, cmd, payload_hash})` | calls `app.claim_op` (`INSERT … ON CONFLICT DO NOTHING RETURNING`); returns `new` / `duplicate(result)` / `mismatch` |
| `recordCmdResult(tx, r)` | `app.record_cmd_result`: writes `cmd_results` + `cmd_log.result` + `rt_outbox` row on `user:#uid` `cmd.result` |
| `appendDomainEvent(tx, e)` | zod-validates against catalogue, inserts via `app.append_event`, runs registered same-tx hooks, calls `app.append_activity` when rule projects |
| `enqueueRealtime(tx, {channel, payload, kind})` | `app.enqueue_rt` with channel from `channel-names.ts` (relay built in phase 10/11) |

### Policy module (`packages/domain/src/policy`)
`can(actor, action, resource) → {ok} | {deny: 'FORBIDDEN'|'NOT_FOUND'|'NOT_ELIGIBLE'|'STATE_INVALID'}`; resources loaded by handlers (pure fn over loaded facts). Rules here: crew rename/leave/remove, trip create/transition (organiser-only transitions), RSVP self, version visibility, change-set propose (member) / decide (delegated to poll policy later, C41), epoch check (`base_epoch < joined_epoch` → FORBIDDEN). Later phases add rule files per area.

### Commands
None exposed here (pipeline + registry are phase 10). Domain contracts: `CommandEnvelope` zod (api-contracts §2.1), error code table (§3) with HTTP + retry + `message_key`.

## Tasks
### T1 — DB package scaffold, roles, tx helpers, Testcontainers harness
- Goal: migrations run against a real Postgres 18 container; `withUser`/`withSystem` proven PgBouncer-safe.
- Files: `packages/db/drizzle.config.ts`, `packages/db/src/{client,tx}.ts`, `packages/db/sql/roles.sql`, `packages/db/migrations/<ts>_core_roles_and_schemas.sql`, `packages/db/test/helpers/{pg-container,migrate,actors}.ts`, `packages/db/test/tx.test.ts`, `packages/db/package.json` scripts.
- Steps: 1. Drizzle 0.45 config with `entities.roles`, schemaFilter `public,app,ops,llm`. 2. Container helper: image `pgvector/pgvector:pg18` with `wal_level=logical`, one container per test file worker, migrate once, template DB per test. 3. Roles/schemas/extensions/helper fns migration. 4. `tx.ts` helpers with `pg` Pool (no session state, statement timeout 15 s). 5. Tests: `app.uid()` visible inside tx, empty in next pooled tx; `current_user` is `app_user`; `app_user` cannot `SET ROLE app_system`; no BYPASSRLS.
- Tests: `pnpm --filter @cp/db test -- tx`
- Done when: tests green; `pnpm --filter @cp/db migrate` applies cleanly twice (idempotent runner).
- Status: done — 466fdaae

### T2 — Domain primitives: ids, errors, privacy classes, envelope, enums
- Goal: leaf contracts every package imports.
- Files: `packages/domain/src/{ids,errors,privacy,channel-names}.ts`, `packages/domain/src/commands/envelope.ts`, `packages/domain/src/enums/{trip,crew,plan,platform}.ts`, `packages/domain/test/*.test.ts`, `packages/db/sql/gen-checks.ts` (emits `CHECK (col IN …)` from zod enums).
- Steps: 1. UUIDv7 generate/parse/time-extract. 2. Error table from api-contracts §3 (code, http, retry, message_key). 3. Privacy registry `{table → class, columns?}` used by publication + event-payload tests. 4. Envelope zod (`op_id` uuidv7, `actor.via` enum, `device.tz` IANA). 5. Enum → CHECK generator.
- Tests: `pnpm --filter @cp/domain test`
- Done when: every api-contracts §3 code present (test diffs against a list); UUIDv7 monotonic within ms; generator output snapshot matches migrations.
- Status: done — d0c4c911

### T3 — Identity and crew tables, membership epochs
- Goal: `users`, `user_settings`, `consents`, `media_objects`, `crews`, `crew_members` with RLS + helpers.
- Files: `packages/db/src/schema/{identity,crews}.ts`, `packages/db/migrations/<ts>_identity_and_crews.sql`, `packages/db/sql/helpers-crew.sql`, `packages/db/test/permissions/{users,user_settings,consents,media_objects,crews,crew_members}.test.ts`.
- Steps: 1. Drizzle tables + `pgPolicy`. 2. `app.is_crew_member` (active; chat variant `app.is_crew_chat_member` incl. former+keep_in_chat), `app.shares_crew(a,b)`. 3. Epoch trigger bumps `membership_epoch`, sets `joined_epoch`, writes `rt_outbox` kind `unsubscribe` for removed/left user on `crew:{crew_id}`, `crew_*:{crew_id}` + trip channels via `app.channel_name` (`#` is reserved for user-limited `user:#uid` only). 4. `users.username` citext unique; `member_ceiling` default 16 CHECK.
- Tests: `pnpm --filter @cp/db test -- permissions/(users|crews|crew_members)`
- Done when: outsider sees 0 rows, ex-member loses crew rows immediately after removal, epoch increments exactly once per membership change and emits one unsubscribe row.
- Status: done — 81318781

### T4 — Trips, participants, catalogue tables, Trip status machine
- Goal: F-037 trip lifecycle with TS/SQL parity.
- Files: `packages/domain/src/state/{machine,trip}.ts`, `packages/domain/src/state/trip.transitions.json`, `packages/db/src/schema/trips.ts`, `packages/db/migrations/<ts>_trips_and_participants.sql`, `packages/db/test/permissions/{trips,trip_participants,destinations,guides}.test.ts`, `packages/db/test/trip-machine.test.ts`.
- Steps: 1. Generic table-driven machine (`canTransition`, `transition` returning side-effect tags). 2. Trip transitions JSON (sync doc §3.1) → TS + generated SQL guard trigger. 3. Tables with generated `phase`, `holds_seat`; tz validation; `seat_cap`/`redraft_limit` columns filled by phase 12 materialiser. 4. Helpers `is_trip_member/participant/organiser`, `trip_seats_held`.
- Tests: `pnpm --filter @cp/domain test -- state`; `pnpm --filter @cp/db test -- trip`
- Done when: every legal transition accepted and every illegal pair rejected by both TS and trigger (exhaustive loop test); `rsvp='out'` frees a seat in `trip_seats_held`.
- Status: done — 770e614

### T5 — Plan versions, days, items, ChangeSets, GuideActions
- Goal: plan model with stable ids, private drafts, apply-only-via-approved-ChangeSet.
- Files: `packages/db/src/schema/plan.ts`, `packages/db/migrations/<ts>_plan_versions_and_changesets.sql`, `packages/domain/src/plan/{change-set-ops,plan-item}.ts`, `packages/domain/src/state/change-set.ts`, `packages/db/test/permissions/{itinerary_versions,plan_days,plan_items,change_sets,guide_actions}.test.ts`, `packages/db/test/apply-change-set.test.ts`.
- Steps: 1. Tables + indexes `(trip_id, stable_id)`. 2. Visibility policy: organiser-only drafts. 3. `app.apply_change_set`: requires approved; copies base version → new version; applies ops by `stable_id`; conflict when base ≠ current → marks `stale`. 4. Change-set state machine + trigger. 5. ops zod in domain.
- Tests: `pnpm --filter @cp/db test -- plan|change`
- Done when: member cannot SELECT an organiser draft nor INSERT `plan_items`; applying an approved change-set yields a new `current` version with stable_ids preserved; stale base → `stale`, no writes.

### T6 — Command bookkeeping, outbox, domain events, activity log
- Goal: F-015 plumbing and idempotency primitives.
- Files: `packages/db/src/schema/platform.ts`, `packages/db/src/events.ts`, `packages/db/migrations/<ts>_command_and_event_log.sql`, `packages/domain/src/events/{catalogue,envelope,activity-rules}.ts`, `packages/db/test/{events,idempotency}.test.ts`, `packages/db/test/permissions/{activity_events,cmd_results,infra}.test.ts`.
- Steps: 1. Tables per data-model §3.18 (+ `crew_id`, `trip_id` on `domain_events`). 2. Catalogue seeded with core events (`crew.member_joined/left/removed`, `trip.created/status_changed`, `plan.version_created`, `change_set.proposed/applied/reverted/rejected`, `rsvp.changed`); later phases append. 3. SECURITY DEFINER `app.claim_op`/`app.record_cmd_result`/`app.append_event`/`app.enqueue_rt` (pinned `search_path`, EXECUTE to `app_user`) + TS wrappers `claimOpId`, `recordCmdResult`, `appendDomainEvent`, `enqueueRealtime`, activity projection. No table INSERT grants to `app_user` on `cmd_log`/`rt_outbox`/`domain_events`/`cmd_results`. 4. Privacy test: no catalogue payload field maps to a C3 column. 5. Purge fn with retention windows.
- Tests: `pnpm --filter @cp/db test -- events|idempotency`
- Done when: same op_id+hash → `duplicate` with stored result; different hash → `IDEMPOTENCY_MISMATCH`; event + activity + outbox rows commit or roll back together inside `withUser`; direct `INSERT` on `rt_outbox` as `app_user` is denied and `app.enqueue_rt` to a non-member crew channel raises `FORBIDDEN`; `app_user` cannot UPDATE/DELETE `domain_events`.

### T7 — App-layer policy module
- Goal: `can()` for crew/trip/plan actions shared by api + worker.
- Files: `packages/domain/src/policy/{index,crew,trip,plan,types}.ts`, `packages/domain/test/policy/*.test.ts`.
- Steps: 1. Actor model `{uid, isAnonymous, roles[], via}`; facts loaded by caller. 2. Rules per Requirements. 3. Map denials to error codes (never leak existence: outsider → NOT_FOUND). 4. Table-driven tests actor × action.
- Tests: `pnpm --filter @cp/domain test -- policy`
- Done when: 100% branch coverage on policy files; matrix mirrors RLS outcomes for the same fixtures (shared fixture file).

### T8 — Ops core, client config, PowerSync publication + check
- Goal: publication allow-list with CI guard; config store.
- Files: `packages/db/src/schema/ops-core.ts`, `packages/db/src/publication.ts`, `packages/db/migrations/<ts>_ops_core_and_publication.sql`, `tools/scripts/check-publication.ts`, `packages/db/test/publication.test.ts`.
- Steps: 1. `ops.admin_audit`, `ops.ops_config(key, value, is_public)`, view `client_config`. 2. Allow-list = privacy class ≤ C2 non-S tables. 3. Migration creates publication explicitly; `powersync_repl` SELECT only on listed tables. 4. Check script compares `pg_publication_tables` to allow-list and fails on C3/`S` tables. 5. `guide_reader` has no grant on `public`.
- Tests: `pnpm --filter @cp/db test -- publication`; `pnpm tsx tools/scripts/check-publication.ts`
- Done when: publication equals allow-list; `powersync_repl` cannot read `cmd_log`/`ops.*`; script wired in CI (`turbo run check:publication`).

### T9 — Permission contract matrix + dev seed
- Goal: reusable actor × table × op matrix and realistic seed.
- Files: `packages/db/test/permissions/_matrix.ts`, `packages/db/test/helpers/fixtures.ts`, `packages/db/seed/{index,crew-bali-six,trip-kyoto-solo}.ts`, `packages/db/package.json` (`seed` script).
- Steps: 1. Fixture builder: outsider, ex-member, member, organiser, co-organiser, anonymous. 2. Matrix runner: expected {select,insert,update,delete} per table declared once; each table test calls it. 3. Coverage test: every RLS-enabled table in `pg_tables` has a matrix entry and FORCE RLS on. 4. Seed from design: Winston's "The Bali Six" (Bali Oct 12–19, 4 in, Tokek), Kyoto solo trip (Pon), plan version with 2 days.
- Tests: `pnpm --filter @cp/db test`; `pnpm --filter @cp/db seed` against docker-compose Postgres.
- Done when: full suite green; coverage test fails if a new table lacks FORCE RLS or matrix entry.

## Phase acceptance criteria
- [ ] All six migrations apply on a clean Postgres 18 container and re-run as no-ops.
- [ ] Every user-data table has ENABLE + FORCE RLS; coverage test enforces it.
- [ ] Permission matrix green for all tables owned here (6 actors).
- [ ] Trip machine: TS and SQL trigger agree on all (from,to) pairs.
- [ ] `plan_items` unwritable by `app_user` except via approved change-set apply.
- [ ] Idempotency: duplicate/mismatch semantics proven.
- [ ] Domain event, activity row, outbox row atomic with the command tx.
- [ ] Publication equals allow-list; no C3 or S table published; `guide_reader` has no `public` grant.
- [ ] Seed loads; no plan/phase/feature ids in migrations, test names or comments.
- [ ] Plan lint: `rg -n -- '--filter @critterpass/|--filter mobile ' plans/` returns nothing (every command uses `@cp/<pkg>`).

## Risks & rollback
| Risk | Mitigation / rollback |
|---|---|
| PowerSync Sync Streams subquery limits (`crew_people`) | model keeps `crew_members` indexed; fallback denormalised table added by phase 10 if spike fails |
| PgBouncer + prepared statements | `pg` unnamed statements; test under PgBouncer in S-DB spike |
| SECURITY DEFINER misuse | pinned `search_path`, owner `app_owner`, explicit EXECUTE grants, tests call as `app_user` |
| Parallel phases generating migrations (drizzle journal conflicts) | hand-named SQL migrations; rebase + regenerate snapshot before merge; one migration per PR |
| Forward-only schema errors | expand/contract only; fix via new migration |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| PlanetScale Postgres org + roles allowed (REPLICATION for `powersync_repl`) | local docker-compose + Testcontainers; S-DB spike (phase 2) validates |
| Destination/guide catalogue content (phase 18) | seed uses the 6 designed guides + destinations from `docs/product-decisions.md` §6 |

## Open questions
| Q | Default implemented |
|---|---|
| Doc delta: sync doc §7 assigns `itinerary_versions/plan_days/plan_items` to 28 and `change_sets/guide_actions` to 13 | created here (F-037 owns the model); 13/28 add columns by expand migrations — update §7 |
| Doc delta: `domain_events`/`rt_outbox` columns differ between data-model §3.18 and api-contracts §2.4 | data-model wins (`aggregate_kind`, `actor_kind`, `payload`, `occurred_at`, `published_at`) + add `crew_id`, `trip_id`; update api-contracts §2.4 |
| Trip visibility after `rsvp='out'` (data-model UQ 5) | still crew-visible |
| Former-member read scope (data-model UQ 3) | chat + ledger rows naming them only |
