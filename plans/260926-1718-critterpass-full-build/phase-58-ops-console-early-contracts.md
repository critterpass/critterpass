---
phase: 58
title: Ops console data capture and early contracts
status: done
depends_on: [11, 13, 17]
wave: 7
features: [F-025]
screens: []   # server only; the screens that read this are phase 59
tasks: 7
priority: low (filler lane; never displaces a critical-path lane)
owns:
  - packages/db/src/schema/ops-work.ts
  - packages/db/migrations/*_ops_console_capture.sql
  - packages/db/migrations/*_ai_usage_route.sql
  - packages/db/test/permissions/ops-work.test.ts
  - packages/domain/src/admin/{config-keys,policy,audit-detail,work,operators}.ts   # config-keys and policy taken over from phase 17 once it is done
  - packages/domain/src/jobs/catalogue.ts
  - services/api/src/admin/{command,audit,flags,moderation,work,counts,operators,jobs,webhook-replay}.ts   # command, audit, flags, moderation taken over from phase 17 once it is done
  - services/api/src/ops/kill-switches.ts
  - services/api/test/admin/{audit-detail,flags-history,moderation-intake,work,counts,operators,jobs}.test.ts
  - services/worker/src/boss/{queues,heartbeat}.ts   # queues taken over from phase 11 once it is done
  - services/worker/src/jobs/ops/{ai-cost-guard,cron-summary}.ts
  - services/worker/test/ops/
  - apps/admin/scripts/cmd.ts   # emergency CLI stamps via='cli'
mount_points:
  - packages/ai/src/usage.ts (pass the route name into `recordUsage`)
  - services/api/src/commands/report-content.ts (resolve the author and accept the reporter note)
  - services/api/src/admin/router.ts (mount work, counts, operators and jobs reads)
---
# Phase 58 — Ops console data capture and early contracts

## Context links

| Source | Section |
|---|---|
| Designs | `design/Ops Console.dc.html` (canvas, 21 screens) and `design/Ops - *.dc.html`; renders `docs/design-renders/pages/Ops-*.png` |
| Inventory | `plans/reports/researcher-260928-0214-ops-designs-{queues-people,content-platform,governance-shell}-inventory-report.md` |
| `docs/product-decisions.md` | D4 (admin plugin, own stack), D10 (vendor approval gate), D22 (DeepSeek tiers, no Batches API) |
| `docs/data-model.md` | §3.15 `moderation_reports`, §3.16 `ops.*`, §3.18 `ai_usage` |
| `docs/api-contracts.md` | §4.17 admin commands, §5.9 admin routes |
| Phase files | 17 (console foundation, registry, `runAdminCommand`), 11 (pg-boss catalogue, `redrive`), 13 (`ai_usage`, routing), 54 T9 (kill switches and cost guard: moved here) |

## Overview

The ops console designs (founder brief 2026-09-27, polish pass 2026-09-28) are a low-priority enhancement: the designed screens are built by phase 59 after the app phases. This phase takes only the server work that must exist **early**, for one of three reasons:

1. **History can't be backfilled.** Audit diffs, flag history, the author of a reported item, the AI route of a call and console sessions are only useful if they're recorded from the first day. If this waits until phase 59, the screens open with empty history.
2. **Later phases register into it.** Phases 18, 35, 46, 47, 52, 55 and 56 build their own console panels. If the work registry, counts, area list and command roles exist first, each of those phases adds one registration line instead of phase 59 going back over each one.
3. **It protects money or operations now.** The AI cost guard and kill switches (pulled forward from 54 T9), and a way to redrive dead jobs, which today has no owner in any phase.

Everything here is server-side and can be called through the emergency CLI (`pnpm admin:cmd`). No console UI is built here, and none is restyled.

Done when: every admin command writes a standard audit detail (`summary`, `changes[]`, `via`, `roles`); flag changes keep their old value; reports record author, note and deadline; `/v1/admin/{work,counts,operators,jobs}` answer and are tested against Postgres; the cost guard pauses a tier that goes over its cap within one tick; `redrive_jobs` is audited.

## Requirements

| Area | Behaviour | Role |
|---|---|---|
| Audit detail | `runAdminCommand` writes `detail = {summary, changes: [{field, before, after}], via: 'admin'\|'cli', roles}`. Each command's `audit()` returns `summary` (a human label, e.g. "Maya Chen · Pass+ 30 days") and `changes`. Add indexes on `op_id`, `(action, at)` and `detail->>'key'`. The emergency CLI writes `via='cli'` | all |
| Flag history | `set_feature_flag` records the previous `value` and `audience` in `changes`, and takes an optional `reason` (stored in `ops.admin_audit.reason`). Read: `GET /v1/admin/flags/:key/history` | ops |
| Config key metadata | `ConfigKeyDefinition` gains `group` (limits, fair_use, billing, suppliers, services), `roles?` (per-key override; tier downgrade and spend caps are owner only) and `note`. The Flags read leaves out `group: 'services'` keys | ops |
| Admin areas | Add `work` (all roles), `billing` (support), `content` (content), `community` (ops, content), `services` (ops) and `operators` (`['owner']`, never empty) to `ADMIN_AREAS` and `ADMIN_AREA_ROLES`. Command roles: `redrive_jobs` ops; `set_admin_role` and `revoke_admin_sessions` owner; `approve_content_batch` owner (fix the api-contracts row) | owner |
| Moderation intake | `moderation_reports` gains `author_id` (resolved by the kind handler when the report is filed), `assignee_admin_id`, `due_at` (created_at + `moderation.sla_hours`, default 24) and `reason_counts jsonb`. `ops.moderation_filings` gains an optional `note` (≤ 280 characters, C2, compliance-screened). The queue read filters by `kind` and returns counts per kind. `GET /v1/admin/moderation/authors/:uid` returns identity, joined date, crews, reports against and past verdicts. The `ban_author` verdict takes `ban: {reason, expires_at?}` | ops, support |
| Work registry | `ops.work_claims (queue, item_id, admin_id, claimed_at)`, primary key `(queue, item_id)`. The server registry gains `defineAdminArea({…, count?, work?})`, where `work = {mine(uid), available(roles), due(item)}`. Reads: `GET /v1/admin/work` (mine: overdue, due in 2 h, later) and `/work/available` (unassigned items in my areas). Commands: `claim_work_item {queue, item_id}`, `release_work_item {queue, item_id}`. Desk and moderation are registered here; later phases register their own queues (see Handoff). "Done today" is a count of the admin's closing audit actions since local midnight (SGT) | all |
| Counts | `GET /v1/admin/counts` → `{area: {count, tone: 'urgent'\|'warn'\|'plain'}}` for the areas the caller's role may open, computed from each area's `count()`. It feeds the nav badges, Home and the phone tabs. There is one poll every 20 s instead of one per module | all |
| AI spend capture | `ai_usage.route` (the routing key, e.g. `guide.chat`, `draft.skeleton`, `decide.*`), written by `recordUsage` | – |
| Kill switches and cost guard | Moved from 54 T9, keeping the same files and behaviour: the registry `services/api/src/ops/kill-switches.ts` (`ai.<route>.enabled`, `ai.tier.<tier>.enabled`, `signup.enabled`, `otp.<channel>.enabled`, `billing.enabled`, `postcards.enabled`, `la.<kind>.enabled`, `widgets.push.enabled`, `android.fsi.enabled`), with middleware checks. Every 5 min the `ops.ai_cost_guard` cron reads caps (`ai.cap.daily_usd`, `ai.cap.<tier>.daily_usd`, `spend.month_budget_usd`); at 80 % it alerts, at 100 % it pauses or queues (never re-routes to another model). The last run is stored for the "guard OK" status. Tiers come from the DeepSeek routing (D22), not from the Claude labels in the design | ops; tier and cap keys owner |
| Jobs and DLQ | Queue names, descriptions, cron and retry specs move to `packages/domain/src/jobs/catalogue.ts` (the worker and api both read it). Read `GET /v1/admin/jobs` returns state counts per queue from `pgboss`, the DLQ rows (payload redacted by a per-queue `redact` fn; device tokens show only the last 4), cron last run and output summary, and the worker heartbeat (Redis key with a TTL per instance). `redrive_jobs {queue, job_ids?}` goes through the api producer and is audited. `push.send` gets a DLQ | ops |
| Webhook replay | `replay_webhook {provider, event_id}` (ops) over a registry `defineWebhookReplay({provider, load(event_id), reapply(event)})`; each phase registers its own event store (no shared webhook table). Replay re-runs the idempotent handler and is audited | ops |
| Operators | `GET /v1/admin/operators` merges accounts that hold a console role with allow-list entries that have never signed in. It shows the last console sign-in and the console session count. Console sessions are marked with a Better Auth `additionalFields` column `console boolean` on `auth.session`, set by the admin instance. `set_admin_role {uid, roles[]}` refuses to remove the last owner and deletes the target's console sessions in the same transaction when the roles are cleared. `revoke_admin_sessions {uid}` | owner |

## Architecture & contracts

| Item | Delta (canonical doc) |
|---|---|
| Migration `*_ops_console_capture.sql` | `moderation_reports` + `author_id, assignee_admin_id, due_at, reason_counts`; `ops.moderation_filings.note`; `ops.work_claims` (C2, `admin_reader` SELECT); `auth.session.console`; audit indexes. The permission test extends `ops-console` and adds `ops-work` |
| Migration `*_ai_usage_route.sql` | `ai_usage.route text` + index `(route, at)` |
| Jobs read | Through the api's `app_system` pg-boss connection, the one documented exception to "reads via `admin_reader`" (the pgboss schema is never granted). Payload redaction happens server-side before the response |
| Commands (§4.17) | New: `claim_work_item`, `release_work_item`, `redrive_jobs`, `replay_webhook`, `set_admin_role` (handler), `revoke_admin_sessions`. Changed: `set_feature_flag` (+`reason`), `moderate_item` (+`ban`), `report_content` (+`note`), `approve_content_batch` (owner) |
| Routes (§5.9) | `GET /v1/admin/{work, work/available, counts, operators, jobs, flags/:key/history, moderation/authors/:uid}`. Jobs is a custom panel, not the mounted pg-boss dashboard (replace that §5.9 line) |
| Handoff | Replaces phase 17's handoff row "jobs, DLQ redrive → 11" (phase 11 said "admin UI phase 17"; neither had a task) |

Handoff — later phases register into the contracts above in their own files:

| Registration | Phase |
|---|---|
| `work` + `count` for content batches (owner review is its own section); 18 shares wave 7 with this phase, so phase 59 T3 registers it | 59 |
| `work` + `count` for vendor desk tasks (reuses the desk source); WhatsApp and Viator webhook replay | 35 |
| `count` for billing (failed webhooks 24 h, FTF review); RevenueCat webhook replay | 46 |
| `work` + `count` for feedback (reply due at 2 days) and pending ideas; tracker webhook replay | 47 |
| `work` + `count` for shared-plan reports | 52 |
| `count` for pickup gaps in draft and ask-group links broken | 55 |
| `work` + `count` for driver listing flags | 56 |

## Tasks

### T1 — Standard audit detail, flag history, CLI via
- Goal: every admin action is recorded with a readable summary and a before/after diff from now on.
- Files: `packages/domain/src/admin/audit-detail.ts`, `services/api/src/admin/{command,audit,flags}.ts`, `apps/admin/scripts/cmd.ts`, `packages/db/migrations/<ts>_ops_console_capture.sql` (indexes), `services/api/test/admin/{audit-detail,flags-history}.test.ts`.
- Steps: 1. `auditDetailSchema` (zod), plus a `changesFrom(before, after, fields)` helper. 2. `runAdminCommand` stamps `via` and `roles`; each existing command's `audit()` returns `summary` + `changes`. 3. `set_feature_flag` + `reason`, previous value. 4. History read. 5. CLI passes `via='cli'`.
- Tests: `pnpm --filter @cp/api test -- admin/audit-detail admin/flags-history`
- Done when: every P17 command's audit row passes `auditDetailSchema`; changing `guide.free_daily_limit` from 30 to 40 shows `30 → 40` in history; a CLI command row has `via='cli'`.
- Status: done — 5e29a2c3

### T2 — Areas, config key metadata, per-key roles
- Goal: the policy knows every designed area and which keys only the owner may change.
- Files: `packages/domain/src/admin/{policy,config-keys}.ts`, tests beside.
- Steps: 1. Add six areas + roles (`operators: ['owner']`). 2. `group`, `roles?`, `note` on keys; add services-group keys (kill switches, caps, `spend.month_budget_usd`, `moderation.sla_hours`, `feedback.reply_hours`, `desk.hours`, `ops.on_call`). 3. `set_feature_flag` checks key roles. 4. Command roles table deltas.
- Tests: `pnpm --filter @cp/domain test -- admin/policy admin/config-keys`
- Done when: `ops` can't set `ai.tier.pro.enabled` (`FORBIDDEN`); owner can; each area has a non-empty role list.
- Status: done — 8a75a6a7

### T3 — Moderation intake data
- Goal: reports carry what the moderation screen and author card need.
- Files: `services/api/src/admin/moderation.ts`, mount in `services/api/src/commands/report-content.ts`, migration (moderation columns), `services/api/test/admin/moderation-intake.test.ts`.
- Steps: 1. Kind-handler `author()` called at intake → `author_id`. 2. Note, reason counts, SLA `due_at`. 3. Kind filter + per-kind counts. 4. Author read (reports against, past verdicts). 5. `ban` payload on `ban_author` chained to `ban_user`.
- Tests: `pnpm --filter @cp/api test -- admin/moderation-intake`
- Done when: a re-report with another reason increments `reason_counts`; a ban verdict with an expiry bans until that time; the author read shows prior verdicts.
- Status: done — 0471c726

### T4 — Work registry and counts
- Goal: one assignment model and one counts poll that later phases plug into.
- Files: `packages/domain/src/admin/work.ts`, `packages/db/src/schema/ops-work.ts`, `services/api/src/admin/{work,counts}.ts`, `services/api/src/admin/registry.ts` (mount), `packages/db/test/permissions/ops-work.test.ts`, `services/api/test/admin/{work,counts}.test.ts`.
- Steps: 1. `ops.work_claims` + grants. 2. `defineAdminArea({count, work})`. 3. Desk source (reuses `assignee_admin_id`, `due_at`) and moderation source. 4. Claim/release commands (claiming an item someone else holds → `STATE_INVALID {reason: 'claimed', by}`). 5. `/work`, `/work/available`, `/counts`, done-today.
- Tests: `pnpm --filter @cp/db test:db -- permissions/ops-work && pnpm --filter @cp/api test -- admin/work admin/counts`
- Done when: support sees moderation items in `available` but not desk items; an overdue moderation report sorts first in `mine`; `/counts` omits areas the role can't open.
- Status: done — 571d26ae

### T5 — AI route capture, caps, kill switches, cost guard
- Goal: spend is attributable per route and bounded from now on.
- Files: `packages/db/migrations/<ts>_ai_usage_route.sql`, mount in `packages/ai/src/usage.ts`, `services/api/src/ops/kill-switches.ts`, `services/worker/src/jobs/ops/ai-cost-guard.ts`, `services/worker/test/ops/ai-cost-guard.test.ts`, `services/api/test/ops/kill-switches.test.ts`.
- Steps: as 54 T9 steps 1–3, plus `route` capture and the last-run status record.
- Tests: `pnpm --filter @cp/api test -- kill-switches && pnpm --filter @cp/worker test -- ai-cost-guard`
- Done when: seeded usage over `ai.cap.pro.daily_usd` pauses pro-tier jobs within one tick and alerts; a disabled route returns `STATE_INVALID {reason: 'switched_off', key}` (retryable false; the app shows its existing fallback); no code path changes tier without an audited toggle.
- Status: done — d6ac0131

### T6 — Jobs, DLQ and webhook replay server
- Goal: dead jobs can be seen and redriven safely.
- Files: `packages/domain/src/jobs/catalogue.ts`, `services/worker/src/boss/{queues,heartbeat}.ts`, `services/worker/src/jobs/ops/cron-summary.ts`, `services/api/src/admin/jobs.ts`, tests.
- Steps: 1. Move queue metadata to domain (worker imports it). 2. Per-queue `redact`. 3. Read (counts, DLQ, crons, heartbeat). 4. `replay_webhook` registry + command (tested with a fixture provider). 5. `redrive_jobs` (spike first: does pg-boss 12 `redrive` keep `singletonKey`, and does the DLQ copy keep the last error? If not, the failure hook also writes the error). 6. `push.send` DLQ on.
- Tests: `pnpm --filter @cp/worker test -- boss && pnpm --filter @cp/api test -- admin/jobs`
- Done when: a job failing 3× shows in the DLQ read with a redacted payload; redrive of 2 selected ids runs them once each and writes one audit row; two worker instances report `workers: 2`.
- Status: done — 70878bdb

### T7 — Operators and console sessions
- Goal: roles can be managed without editing env, and console sessions are distinguishable.
- Files: `packages/domain/src/admin/operators.ts`, `services/api/src/admin/operators.ts`, migration (`auth.session.console`), `services/api/test/admin/operators.test.ts`.
- Steps: 1. Session marker via Better Auth `additionalFields` on the admin instance. 2. Operators read (accounts ∪ allow-list). 3. `set_admin_role` with last-owner guard + session purge. 4. `revoke_admin_sessions`.
- Tests: `pnpm --filter @cp/api test -- admin/operators`
- Done when: removing the only owner returns `STATE_INVALID {reason: 'last_owner'}`; clearing a role ends that person's console sessions but not their app sessions; an allow-listed email that never signed in appears with no last sign-in.
- Status: done — 0e8fde9c

## Phase acceptance criteria

- [x] All P17 and P58 commands write a detail that passes `auditDetailSchema`
- [x] `ops.work_claims`, `moderation_reports` columns and `auth.session.console` covered by permission tests
- [x] `/v1/admin/{work,counts,operators,jobs}` covered by api tests against Postgres
- [x] Cost guard pauses within one tick; 54 T9 updated to point here
- [x] api-contracts §4.17/§5.9 and data-model §3.15/§3.16/§3.18 deltas applied in the same PR

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Touching `runAdminCommand` while panels are being added | Additive fields only; old rows stay valid (schema accepts missing detail on rows before this migration) |
| pg-boss internals change | Read only through the pg-boss API where it exists; the spike in T6 records behaviour in a test |
| Cost guard pauses real users | Pausing affects only the route or tier over its cap; kill switches reversible in one command; alerts at 80 % first |

## Open questions

| Question | Default |
|---|---|
| Jobs read via `app_system` instead of `admin_reader` | Yes, documented exception; payload redacted in the api |
| Home activity feed and "done today" for support/content roles (audit area is owner/ops) | Home-scoped summary read (label + time only) open to all roles; full audit stays owner/ops |
| Moderation SLA | 24 h from first filing (`moderation.sla_hours`) |
