---
phase: 1
title: "Server: days on dates lock, draft edits, the check on a draft, the put-back"
status: in progress
branch: feat/plan-days-before-draft
---

# Phase 1. Server: the plan before the draft

## Context

- Versions today: `services/api/src/plan/versioning.ts` (crew versions), `services/api/src/commands/draft/versions.ts` (organiser drafts), `services/worker/src/jobs/ai/draft/persist.ts`, `services/api/src/commands/proposal/send-proposal.ts` (a draft becomes the crew's version).
- Dates lock: `services/api/src/commands/setup/lock-trip-dates.ts` (`SETUP_OPEN_STATUSES` = `won`, `setup`).
- The check: `services/worker/src/jobs/planning/check/{hooks,context,run}.ts`, `services/api/src/planning/fit/check-hook.ts`.
- Streams: `infra/powersync/streams/{core,planning}.yaml` (`trip_draft` already carries organiser versions, their days, items of live drafts and their legs).
- Docs to delta: `docs/api-contracts.md` §4.5/§4.6, `docs/api-contracts-planning.md`, `docs/data-model-sync-and-privacy.md` §4, `docs/system-architecture.md` §7.b.

## Data and contract changes (all additive)

| Change | Why it is additive |
|---|---|
| Migration `<ts>_plan_days_before_draft.sql`: `itinerary_versions.origin text NULL CHECK (origin IN ('dates','hand','guide','restore'))`, `itinerary_versions.checked_at timestamptz NULL` | nullable columns on a synced table; installed builds do not select them. Mobile schema regenerated |
| Command `ensure_plan_days {trip_id}` → `{version_id, created}`: organiser only, idempotent; creates the empty draft for a trip with locked dates, no draft and no crew plan | new name; only the new screens send it |
| Command `review_hand_plan {trip_id, base_version}` → `{version_id}`: organiser only; `setup` with dates, a destination and at least one stop on the draft; works out the draft's numbers and coverage and moves the trip to `draft_review` | new name; the proposal is then built by the unchanged `create_proposal` |
| Command `apply_draft_ops {trip_id, base_version, ops[1..50], confirm_locked?}` → `{version_id}` | new name; nothing sends it today |
| Event `draft.ops_applied {trip_id, version_id, base_version_id, op_count}` (no activity rule, no push) | new type; added to the legs and check triggers only |
| `lock_trip_dates`: writes the empty draft only while the shared `planning.redesign` config is on (read as `services/api/src/planning/ideas/match-to-idea.ts` does); reshapes a draft that exists; result gains `moved_stops[{stable_id, to: 'ideas' \| 'day', day_no?}]` | with the switch off and no draft, payload, result and rows are today's |
| `revert_redraft`: releases the reservation and the quota unit | same payload and result; only the counter differs |
| `trip_draft` stream: `plan_check_issues` of live drafts | organisers only; members' streams untouched |
| Read routes (`/v1/trips/{id}/fit…`, `/v1/places/{id}/context`): an organiser with no crew version gets the draft's days; `base_version` is the draft; `add_mode` gains `draft` | a member, and any trip with a crew version, answers as today |

No new table, so no new RLS policy. The permission test covers what changes: a member cannot read an issue of an organiser version and cannot send `apply_draft_ops`.

## Tasks

### T1. Migration, schema, generated mobile schema
- Files: `packages/db/migrations/<UTC ts>_plan_days_before_draft.sql`, `packages/db/src/schema/plan.ts` (or where `itinerary_versions` is declared), `apps/mobile/src/data/powersync/synced-tables.generated.ts` (generated), `packages/db/test/permissions/plan-draft-check.db.test.ts`.
- No backfill. Test: a member cannot read an issue of an organiser version.
- Status: pending

### T2. The empty plan: when dates lock, and on demand
- Files: `services/api/src/commands/setup/lock-trip-dates.ts`, new `services/api/src/plan/draft-days.ts` (create, reshape), new `services/api/src/commands/draft/ensure-plan-days.ts`, `packages/domain` payload schemas, `services/api/src/commands/draft/index.ts`, `services/api/test/setup/lock-dates-plan-days.db.test.ts`, `services/api/test/commands/draft/ensure-plan-days.db.test.ts`.
- Rules: first lock with the switch on → empty draft; with it off → nothing. Dates moved and a draft exists → a new draft on the new dates: a stop keeps its day number and local time; on a day that no longer exists a place goes back to Ideas and a custom stop moves to the last day; the result lists what moved. `ensure_plan_days` does nothing when a draft or a crew plan exists.
- Tests: switch off (no pointer, result as today), switch on, re-lock same dates, shorter trip (idea returned, custom stop moved, `moved_stops`), `ensure_plan_days` twice, member refused.
- Status: pending

### T3. `apply_draft_ops`
- Files: `packages/domain/src/plan/plan-ops.ts` (payload schema), `packages/domain/src/events/catalogue.ts`, new `services/api/src/commands/draft/apply-draft-ops.ts`, new `services/api/src/plan/draft-versioning.ts` (`commitDraftVersion`: copy as organiser draft with `origin = 'hand'`, supersede the base, move `trips.draft_version_id`, refresh numbers when the base has them, emit `draft.ops_applied`), `services/api/src/commands/draft/index.ts`, `services/api/test/commands/draft/apply-draft-ops.db.test.ts`.
- Rules: organiser only (`FORBIDDEN`); statuses `setup` and `draft_review` (`STATE_INVALID{reason: draft_running}` while `drafting`/`redrafting`, `STATE_INVALID{reason: plan_shared}` once there is a crew plan); stale base → `PLAN_VERSION_CONFLICT{latest}` so the app's rebase works unchanged; lock rules as `apply_plan_ops`.
- Folding: committing on a base with `origin = 'hand'` deletes that base (days, items, legs, issues) when nothing else refers to it, tried inside a savepoint; an untouched empty plan is deleted the same way.
- Tests: add, move, reorder, retime, remove; two hundred edits leave one hand-edited version and the organisers' stream queries return only live drafts' items and legs (`packages/db/test/` stream bound test beside the crew plan's); member refused; stale base; while drafting; the crew's stream gets nothing; `apply_plan_ops` on a trip without a crew plan still answers `STATE_INVALID{no_plan}`.
- Status: pending

### T4. Readers of the draft pointer stay honest
- Files (read all, change only where a reader assumed "pointer set = guide drafted"): `services/api/src/cost/preview.ts`, `services/worker/src/cost/inputs.ts`, `services/api/src/commands/proposal/create-proposal.ts`, `services/api/src/commands/draft/{request-redraft,restore-draft-version}.ts`, `services/api/src/bookings/plan-sync.ts`, `services/worker/src/jobs/ai/draft/persist.ts`; tests beside each one changed.
- Found while planning: cost, proposal build, redraft and restore are gated by the trip status and need no change (tests pin it). The installed draft history lists every organiser version, so an untouched empty plan (`origin = 'dates'`, no stops) is deleted when the guide's draft, a hand edit or a dates change replaces it, and never shows as a history row.
- Known difference for installed builds: the draft review screen sends an organiser to the drafting screen only when the draft pointer is null and a job runs. With an empty plan the pointer is set, so opening the review by link during the first draft shows its "no draft yet" state until the job ends. Phase 3 fixes the condition (trip status) for both switch states.
- Test: a `setup` trip with an empty draft: cost preview, proposal build and redraft answer as they do today for a trip with no draft; after the first guide draft the trip has exactly one organiser version.
- Status: pending

### T5. Add to plan, the place page and Ideas read the organiser's draft
- Files: `services/api/src/planning/fit/context.ts`, `services/api/src/explore/{plan-read,place-context}.ts`, new `services/api/src/plan/visible-version.ts` (the crew's version, else the caller's draft when they organise), `docs/api-contracts-explore.md`, `docs/api-contracts-planning.md`, tests in `services/api/test/planning/` and `services/api/test/explore/`.
- Test: organiser with an empty draft gets days and a slot; a member of the same trip gets today's answer.
- Status: pending

### T6. The plan check on a draft
- Files: `services/worker/src/jobs/planning/check/{hooks,context,run}.ts`, `services/api/src/planning/fit/check-hook.ts`, `packages/domain/src/planning/legs.ts` (trigger list), `infra/powersync/streams/planning.yaml`, `docs/data-model-sync-and-privacy.md`, `services/worker/test/planning/check-draft.db.test.ts`.
- Rules: the run checks the crew's version when there is one, else the draft; triggers add `draft.ready`, `redraft.kept`, `draft.version_restored`, `draft.ops_applied`; a draft run writes its issues, stamps `itinerary_versions.checked_at`, counts against the daily cap, and leaves the trip-wide row's version, status and counts alone.
- Tests: issues written for a draft; a member's query returns none (RLS); the trip-wide row unchanged; a crew-version run unchanged.
- Status: pending

### T7. A put-back gives the redraft back
- Files: `services/api/src/commands/draft/keep-redraft.ts`, `services/api/test/commands/draft/redraft-quota.db.test.ts`, `docs/api-contracts.md`.
- Rule: `revert_redraft` settles the reservation `released` and calls `app.release_quota`; delivered redrafts still count against the silent fair-use cap (product call 1).
- Test: counter before = counter after a put-back; a kept redraft still counts.
- Status: pending

### T8. A plan built by hand can be sent
- Files: new `services/api/src/commands/draft/review-hand-plan.ts`, `services/api/src/commands/draft/versions.ts` (first numbers and coverage for a version that has none), payload schema in `packages/domain`, `docs/api-contracts.md`, `services/api/test/commands/draft/review-hand-plan.db.test.ts`.
- Rule: needs what `start_draft` needs (dates locked, a destination, no draft job running) plus at least one stop; other set-up steps (budget, rooms, must-dos) are not required, as for a guide draft. Emits `trip.status_changed {from: setup, to: draft_review}`.
- Tests: refused with no stops, while drafting, for a member; after it `create_proposal` and `send_proposal` work unchanged and the crew reads the plan.
- Status: pending

## Risks and rollback

Rollback is a revert of the PR: the columns stay (nullable). With the switch off no empty draft was ever written.
