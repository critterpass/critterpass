---
phase: 17
title: Back-office & ops console
status: in_progress
depends_on: [8, 9, 10, 12, 14]
wave: 5
features: [F-025]
screens: []   # none designed; the whole console is designed in code (D11)
tasks: 8
owns:
  - apps/admin/{package.json,vite.config.ts,index.html,tsconfig.json}
  - apps/admin/scripts/**
  - apps/admin/src/{main.tsx,app/**,kit/**,lib/**}
  - apps/admin/src/modules/{catalogue,flags,partners,moderation,support,desk,audit}/**
  - services/api/src/admin/{router,auth-guard,audit,registry,reads,catalogue,flags,partners,moderation,support,desk,audit-read}.ts
  - packages/domain/src/admin/**
  - packages/db/src/schema/ops-console.ts
  - packages/db/migrations/*_ops_console.sql
  - packages/db/test/permissions/{admin-reader,ops-console,moderation-reports}.test.ts
  - infra/cloudflare/admin/
  - e2e/admin/
---
# Phase 17 — Back-office & ops console

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D4 (own stack, Better Auth admin plugin, minimal plugin set), D7 (server-driven perk lists, fair-use cap), D8 (free limit server-configurable), D10 (vendor messages only after user approval, partner adapters behind flags, copy switches), D11 (undesigned → design in code), D18 (Singapore controller) |
| `docs/system-architecture.md` | §2 topology (`admin.critterpass.app`), §3 repo + import rules (admin talks to api only, never DB), §5 authz, supplier rules table (vendor messages), §10 ops |
| `docs/code-standards.md` | §1 working rules, §11 logging/PII, security section (R2, HMAC), §17 testing, Definition of Done |
| `docs/data-model.md` | §2 roles (`admin_reader`), §3.13 `ops_config`/`client_config`, §3.15 `moderation_reports`, §3.16 `ops.*` tables, `auth.user`/`auth.session` admin columns |
| `docs/data-model-sync-and-privacy.md` | table → creating phase (row 17), privacy classes C2/C3 |
| `docs/api-contracts.md` | §4.17 admin commands, §5.9 admin routes, command envelope `actor.via = 'admin'`, error codes |
| `docs/api-contracts-async.md` | §2.2 retries/DLQ (`<queue>.dlq` redrive in admin), `flag.changed` / `catalogue.changed` fan-out |
| Reports | master §2 row F-025 (+ dependants F-117, F-151, F-153, F-154, F-155), §8 moderation row; `researcher-260926-1649-custom-hono-backend-report.md` (Better Auth admin, roles); `researcher-260926-1649-travel-supplier-apis-report.md` (partner approvals, WhatsApp Business ops desk); `design-analysis-260926-1143-you-community-help-report.md` §3p (feedback/ideas statuses) |

## Overview

Goal: one internal web console at `admin.critterpass.app` (Vite + React SPA on Cloudflare) through which the founder and ops agents run the service: catalogue/content editing, moderation, support (users, sessions, entitlement grants, deletion status), flags and partner adapter switches, the concierge/ops desk (tasks + user approvals, vendor-message panel slot), and an immutable audit log. It is also a module host: later phases plug their queues/editors into it through a typed registry instead of forking the app.

Done when: an allow-listed admin with role `ops`/`content`/`support`/`owner` signs in, every read goes through `admin_reader` and every write is an audited `/v1/admin/*` command (`actor.via='admin'`, `ops.admin_audit` row in the same transaction); flags, partner adapters, moderation verdicts, entitlement grants and concierge tasks work end to end against real Postgres; Playwright proves role gating and audit writes; Testcontainers proves `admin_reader` cannot read C3 columns.

## Requirements

### F-025 Back-office (none designed; design in code with `packages/design-tokens` + admin kit)

| Area | Behaviour | Role |
|---|---|---|
| Sign-in | Better Auth social sign-in (Google) + `admin` plugin role check; email must be on `ADMIN_ALLOWLIST`; admin auth is a second Better Auth instance (basePath `/v1/admin/auth`, own cookie prefix `cp_admin`, 12 h absolute session, Google provider + `admin` plugin only) sharing the user/session tables; the SPA never calls `api.` directly: the admin Worker on `admin.critterpass.app` serves the SPA and reverse-proxies `/v1/admin/*` same-origin to the api, so the host-only `SameSite=Strict` cookie reaches it; Cloudflare Access (Zero Trust) sits on the `admin.` host (second factor) and the Worker forwards `Cf-Access-Jwt-Assertion`; the api rejects `/v1/admin/*` requests lacking a valid Access JWT (so direct calls to `api.` fail); impersonation disabled (privacy) | all |
| Roles | `owner` (all + role management), `ops` (moderation, flags, desk, partners, redrive), `content` (catalogue, content batches, POIs), `support` (users, sessions, entitlement grants, deletion status, feedback/ideas). Role claims in session; enforced server-side per command via `packages/domain/src/admin/policy.ts`; UI hides what the role cannot do | owner |
| Home | Counters per queue (moderation open, desk tasks due < 2 h, DLQ size, content batches in review, feedback new), each a link; SLO/uptime widget = link-out to Grafana/uptime monitor (no duplicate dashboards) | all |
| Catalogue editor (kit) | Schema-driven list + detail + edit for any registered catalogue kind: zod schema from `packages/domain`/`packages/content` → form; search, filters, pagination (keyset); diff preview before save; optimistic concurrency (`version` check, `CONFLICT` error surfaced); every save = command. First registrations: `guides` (name, colour locked to C5 canonical, voice_id, local words), `destinations`, `ops_config` keys, POIs (via `upsert_poi`, P14) with map pin preview (MapLibre, OSM style) | content |
| Flags & config | `ops_config` editor with typed keys (`guide.free_daily_limit`=30, `seat.cap_free`=6, fair-use caps, supplier flags, perk-list pointer); change = `set_feature_flag {key, value, audience}`; audience = all / cohort / uid list / app-version range; shows current `client_config` projection and who changed it; two-step confirm for keys marked `critical` | ops |
| Partner adapters | `ops.partner_adapters` table view: partner (agoda_demand/klook_activity/trip_com_at/viator_booking/gyg_api), enabled, `copy_mode` (link/booking), approved_at, notes; toggling updates the matching `supplier.*` flag in one command so app copy switches (D10) | ops |
| Moderation | Queue over `moderation_reports` (status open → actioned/dismissed); item preview via kind handler (image through media Worker HMAC URL, text inline); verdicts approve / hide / remove / ban-author (support+ops); keyboard shortcuts (j/k, a/h/r); `moderate_item` command emits `moderation.decided`; kind handlers registered by owning phases (avatar P22, photo/note P44, tip/rating P52, idea P47) | ops |
| Support | User lookup by uid / phone (E.164) / email / 6-char join code / ticket no; profile summary (no C3: no budget maxes, payout details, insurance, dietary profile, raw location); sessions list + revoke; ban/unban with reason + expiry; device list + revoke device action keys; entitlements (read P12 tables) + `grant_entitlement`/`revoke_entitlement` with reason and `until`; command trace: `cmd_log`/`cmd_results` by `op_id` or uid (payload redacted per privacy class) | support |
| Deletion status | Panel slot on user detail; P45 registers the `account_deletions` panel (requested, purge_at, restored, purged) | support |
| Concierge / ops desk | `ops.concierge_tasks` queue (kind vendor_message/clinic_handoff/partner_booking/review; status new → in_progress → waiting_user → done/cancelled), assign to self, due-at countdown, SLA colouring, notes; linked `ops.approvals` shown verbatim (text the user saw, time, op_id). Hard rule enforced in the command handler: no outbound vendor action unless an `ops.approvals` row exists for that subject. Vendor thread panel (WhatsApp Business) registered by P35 | ops |
| Jobs & DLQ | Panel slot; P11 registers pg-boss queues, `ops.dead_letters` view and redrive | ops |
| Feedback & ideas | Panel slots; P47 registers feedback triage (status, reply template, fixed-in version) and idea board curation (`set_idea_status`, `merge_ideas`) | support |
| Audit log | Read-only `ops.admin_audit` viewer: filter by admin, action, target, date; each row links to target; export CSV (owner only); rows are append-only (no UPDATE/DELETE grants) | owner, ops |
| States | loading skeleton, empty ("Nothing waiting"), error with retry + request id, stale-version conflict, forbidden (role), offline banner | all |
| a11y / i18n | English only for the console (internal); keyboard-first; WCAG AA contrast from tokens | – |

Applicable: D4 (admin plugin only; no extra Better Auth plugins beyond D4 list), D10 (approval gate, flags switch copy), C3/privacy classes (support never sees C3), code-standards security (no secrets in SPA; api holds all credentials).

## Architecture & contracts

| Item | Delta (canonical doc) |
|---|---|
| Migration `*_ops_console.sql` | creates `ops.concierge_tasks`, `ops.approvals`, `ops.partner_adapters`, `moderation_reports` (data-model §3.15/§3.16) + `version int` on `ops_config` for optimistic concurrency; `ops.admin_audit` stays P08. Doc delta: `ops.content_reviews` moves to P18 (FK to `content_releases`) and `ops.dead_letters` to P11 (needs `pgboss` schema) |
| DB roles | `admin_reader`: SELECT on `ops.*` + non-C3 `public` columns (column grants generated from privacy class map in `packages/domain/src/privacy.ts`); no INSERT/UPDATE/DELETE. Writes run in `withSystem` + `app.admin_uid` setting; trigger on `ops.admin_audit` denies UPDATE/DELETE for every role |
| RLS backstop | `moderation_reports`: reporter INSERT own (`reporter_id = app.uid()`), SELECT none for `app_user`; `ops.*` not exposed to `app_user`/`powersync_repl`, with one explicit carve-out: `app_user` gets `USAGE` on schema `ops` plus `INSERT` on `ops.approvals` only (no SELECT/UPDATE/DELETE, no other `ops` table), RLS `WITH CHECK (user_id = app.uid())` (user approves a draft from the app); permission test asserts the carve-out and denial on every other `ops` table |
| Sync streams | none (ops tables are never published) |
| Commands (§4.17) | `moderate_item`, `set_feature_flag`, `grant_entitlement`, `revoke_entitlement` (P17); new (doc delta): `report_content {kind, id, reason}` (any user, surface A/O), `upsert_catalogue_item {kind, id?, version, data}`, `set_partner_adapter {partner, enabled, copy_mode, notes}`, `create_concierge_task`, `update_concierge_task {id, status?, assignee?, note?}`, `revoke_session`, `ban_user`/`unban_user`, `revoke_device_key`, `set_admin_role` (owner) |
| Routes (§5.9) | `GET /v1/admin/me`, `/v1/admin/{catalogue/:kind, flags, partners, moderation, users, users/:uid, sessions, desk, audit}` reads (auth M); `POST /v1/admin/cmd/:name` writes; OpenAPI tagged `admin`, excluded from the public `/openapi.json` (served at `/v1/admin/openapi.json` behind auth) |
| Events / realtime | `flag.changed`, `catalogue.changed` → `rt_outbox` on `catalog` channel (clients refetch `client_config`); `moderation.decided` → domain event consumed by owning phase; no admin Centrifugo channel (console polls every 20 s with TanStack Query) |
| Module registry | `apps/admin/src/kit/registry.ts`: `defineAdminModule({id, nav, roles, routes, userPanels?, homeCounters?})`; server twin `services/api/src/admin/registry.ts`: `defineAdminArea({id, reads, commands})`. `defineQueue({kind, statuses, actions, preview})` and `defineCatalogue({kind, schema, list, upsertCommand})` helpers |
| Hosting | `infra/cloudflare/admin/wrangler.toml` (Workers static assets), CSP `default-src 'self'; connect-src api.critterpass.app`; env `.env.example` only |

Handoff — panels later phases add under their own `apps/admin/src/modules/<area>/` + `services/api/src/admin/<area>/`:

| Panel | Phase |
|---|---|
| jobs, DLQ redrive, `ops.dead_letters` | 11 |
| content batches review, critters/forms, spawn rules, legendary windows, phrases, help articles, emergency/facilities | 18 |
| avatar moderation handler | 22 |
| vendor threads (WhatsApp Business drafts/replies/send), webhook replay, partner health | 35 |
| photo/note moderation handler | 44 |
| deletion status, data exports | 45 |
| perk catalogue (`set_perk_catalogue`), RevenueCat event log | 46 |
| feedback triage, idea board | 47 |
| tip/rating/shared-plan moderation handler | 52 |

## Tasks

### T1 — Ops console schema, admin_reader grants, permission tests
- Goal: ops tables + moderation reports with a proven privacy boundary.
- Files: `packages/db/src/schema/ops-console.ts`, `packages/db/migrations/<ts>_ops_console.sql`, `packages/db/test/permissions/{admin-reader,ops-console,moderation-reports}.test.ts`.
- Steps: 1. Drizzle schema for `ops.concierge_tasks`, `ops.approvals`, `ops.partner_adapters`, `moderation_reports`; `ops_config.version`. 2. SQL: `admin_reader` column grants generated from the privacy map (script output checked in), audit append-only trigger, RLS for `moderation_reports` + `ops.approvals`. 3. Seed partner adapter rows (all `enabled=false`, `copy_mode='link'`; viator_booking `enabled=true`, `copy_mode='booking'`). 4. Extend permission matrix.
- Tests: `pnpm --fail-if-no-match --filter @cp/db test -- permissions/admin-reader permissions/ops-console permissions/moderation-reports`
- Done when: `admin_reader` SELECT on any C3 column fails; `app_user` cannot read `ops.*`; UPDATE/DELETE on `ops.admin_audit` fails for every role; reporter can insert own report only.
- Status: done — ba3f743

### T2 — Admin auth, role policy, audited admin command pipeline
- Goal: `/v1/admin/*` guarded, every mutation audited atomically.
- Files: `services/api/src/admin/{router,auth-guard,audit,registry,reads}.ts`, `packages/domain/src/admin/{roles,policy,commands}.ts`, `services/api/test/admin/{guard,audit}.test.ts`.
- Steps: 1. Separate admin Better Auth instance (basePath `/v1/admin/auth`, cookie prefix `cp_admin`, 12 h absolute) + `admin` plugin role config + `ADMIN_ALLOWLIST` check. 2. Guard: session role, Cloudflare Access JWT header verification (`CF_ACCESS_AUD`), rate limit per admin. 3. `runAdminCommand` = standard command pipeline (idempotent op_id, zod) + policy fn + `ops.admin_audit` insert in same tx + `actor.via='admin'`. 4. Read helper `withAdminReader`. 5. `/v1/admin/me`, admin OpenAPI doc.
- Tests: `pnpm --fail-if-no-match --filter @cp/api test -- admin/guard admin/audit` (Testcontainers Postgres)
- Done when: non-allow-listed or role-less user gets `FORBIDDEN`; missing Access header gets 401 in prod config; a failing command leaves no audit row; a successful one leaves exactly one with ip_hash.
- Status: done — 4edf5a9

### T3 — Admin SPA scaffold, kit, deploy
- Goal: signed-in shell with role-aware nav, module registry and deploy.
- Files: `apps/admin/{package.json,vite.config.ts,index.html,tsconfig.json}`, `apps/admin/src/{main.tsx,app/**,kit/**,lib/api.ts}`, `infra/cloudflare/admin/wrangler.toml`, `e2e/admin/{playwright.config.ts,auth.spec.ts}`.
- Steps: 1. Vite + React 19 + TanStack Router/Query; typed `hc` client against api admin routes. 2. Kit: table (keyset pagination), form-from-zod, diff view, confirm dialog, queue view, state components (loading/empty/error/conflict/forbidden/offline) styled from `packages/design-tokens` CSS. 3. Registry + nav + home counters. 4. Wrangler deploy: static assets + Worker reverse proxy `/v1/admin/*` → api (same-origin; forwards Access JWT, strips client-supplied `Cf-Access-*` on other paths) + CSP headers.
- Tests: `pnpm --fail-if-no-match --filter @cp/admin test && pnpm --fail-if-no-match --filter @cp/admin build && pnpm --fail-if-no-match --filter @cp/admin exec playwright test auth.spec.ts`
- Done when: Playwright signs in against local api (docker-compose) as `support` and sees only support nav; unauthenticated visit redirects to sign-in; `pnpm lint` passes boundaries (no `packages/db` import).
- Status: done — 034b04d

### T4 — Catalogue editor, flags, partner adapters
- Goal: content/ops editing of existing catalogue + config.
- Files: `apps/admin/src/modules/{catalogue,flags,partners}/**`, `services/api/src/admin/{catalogue,flags,partners}.ts`, tests beside each.
- Steps: 1. `defineCatalogue` registrations: guides (C5 colour read-only), destinations, POIs (calls P14 `upsert_poi`, MapLibre pin preview). 2. `upsert_catalogue_item` with version check → `CONFLICT`. 3. Flags editor with typed key registry (`packages/domain/src/admin/config-keys.ts`), audiences, critical two-step confirm, `flag.changed` via `rt_outbox`. 4. `set_partner_adapter` toggles adapter + `supplier.<partner>.*` flags in one tx.
- Tests: `pnpm --fail-if-no-match --filter @cp/api test -- admin/catalogue admin/flags admin/partners && pnpm --fail-if-no-match --filter @cp/admin exec playwright test catalogue.spec.ts flags.spec.ts`
- Done when: changing `guide.free_daily_limit` updates `client_config` and emits one `rt_outbox` row; concurrent edit returns `CONFLICT` and UI shows diff; enabling `klook_activity` flips its copy flag.
- Status: done — 9ad8ce5

### T5 — Moderation intake and queue
- Goal: users can report content; ops can act on it.
- Files: `services/api/src/admin/moderation.ts`, `services/api/src/commands/report-content.ts`, `packages/domain/src/admin/moderation-kinds.ts`, `apps/admin/src/modules/moderation/**`, tests.
- Steps: 1. `report_content` command (any user; per-user rate limit 20/day; duplicate report collapses). 2. Kind-handler registry `{kind, preview(id), apply(verdict)}`; P17 ships `user` kind (ban author) and handler contract. 3. Queue UI with shortcuts, image preview via HMAC media URL. 4. `moderate_item` → status + `moderation.decided` domain event.
- Tests: `pnpm --fail-if-no-match --filter @cp/api test -- admin/moderation commands/report-content && pnpm --fail-if-no-match --filter @cp/admin exec playwright test moderation.spec.ts`
- Done when: reported user item appears in queue, verdict writes audit + event, re-report of same target within 24 h increments count instead of new row.

### T6 — Support tools
- Goal: find a user and fix their account safely.
- Files: `apps/admin/src/modules/support/**`, `services/api/src/admin/support.ts`, tests.
- Steps: 1. Lookup (uid/phone/email/join code) via `admin_reader`. 2. Sessions list/revoke, ban/unban (Better Auth admin API), device action key revoke. 3. Entitlement panel over P12 tables + `grant_entitlement`/`revoke_entitlement` (reason required, `until` required). 4. Command trace by op_id with redaction. 5. `userPanels` slot for later phases.
- Tests: `pnpm --fail-if-no-match --filter @cp/api test -- admin/support && pnpm --fail-if-no-match --filter @cp/admin exec playwright test support.spec.ts`
- Done when: grant makes `packages/entitlements` resolve the perk for that uid; revoked session's next api call returns 401; no C3 value appears in any support response (snapshot test over seeded C3 data).

### T7 — Concierge / ops desk and approvals
- Goal: human ops queue with an enforced user-approval gate.
- Files: `apps/admin/src/modules/desk/**`, `services/api/src/admin/desk.ts`, `services/api/src/commands/approve-ops-action.ts`, `packages/domain/src/admin/desk.ts`, tests.
- Steps: 1. Task commands create/update/assign; status machine in `packages/domain`. 2. `approve_ops_action` user command writes `ops.approvals` with the exact text shown (doc delta). 3. `assertApproved(subject)` guard exported for P35/P38 outbound actions. 4. Queue UI with due-at SLA colours, notes, approval card.
- Tests: `pnpm --fail-if-no-match --filter @cp/api test -- admin/desk commands/approve-ops-action`
- Done when: `assertApproved` throws `APPROVAL_REQUIRED` without a row and passes with one; illegal status transition rejected; task list sorted by due_at.

### T8 — Audit viewer, hardening, e2e suite
- Goal: audit visibility and a security baseline for launch review.
- Files: `apps/admin/src/modules/audit/**`, `services/api/src/admin/audit-read.ts`, `e2e/admin/{audit,roles}.spec.ts`, `infra/cloudflare/admin/headers`, `apps/admin/scripts/cmd.ts` (emergency CLI).
- Steps: 1. Audit viewer filters + CSV export (owner). 2. Role matrix e2e: every command × role → allowed/forbidden. 3. Headers (CSP, HSTS, frame-ancestors none), dependency audit in CI. 4. Emergency CLI `pnpm admin:cmd <command> <json>`: runs `runAdminCommand` with an owner identity from a local short-lived token, audited like UI commands. 5. Runbook section appended to `docs/system-architecture.md` ops table only if absent (admin onboarding/offboarding).
- Tests: `pnpm --fail-if-no-match --filter @cp/admin exec playwright test`
- Done when: role matrix spec green for all P17 commands; audit viewer shows every action performed in the e2e run.

## Phase acceptance criteria

- [ ] `pnpm --fail-if-no-match --filter @cp/db test -- permissions` green incl. admin_reader C3 denial and audit immutability
- [ ] Every `/v1/admin/cmd/*` call writes exactly one `ops.admin_audit` row in the same tx (test)
- [ ] Role matrix Playwright spec green; `support` cannot change flags, `content` cannot ban
- [ ] `set_feature_flag guide.free_daily_limit` propagates to `client_config` and `catalog` realtime
- [ ] `assertApproved` exported and covered; no outbound-action path bypasses it (grep test)
- [ ] Module registry documented in code with one example module; handoff table matches `docs/api-contracts.md` §5.9 (doc delta applied by the doc owner)
- [ ] `apps/admin` builds, deploys via wrangler to staging, CSP header present
- [ ] No secrets in `apps/admin` bundle (build scan for `sk_`, `-----BEGIN`)

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Admin credential compromise | Cloudflare Access + allow-list + short sessions + audit; revoke via `set_admin_role` or allow-list env change (redeploy) |
| Support sees private data | column grants generated from privacy map + snapshot test; any new C3 column fails CI until classified |
| Registry over-engineering | only two helpers (`defineQueue`, `defineCatalogue`); later phases may write plain routes if helpers do not fit |
| Admin SPA outage | api-side commands callable via `pnpm admin:cmd` (`apps/admin/scripts/cmd.ts`, built in T8) for emergencies |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Cloudflare Access (Zero Trust) application for `admin.` | allow-list + role checks still enforced; staging only until configured |
| Google OAuth client for admin sign-in | fall back to phone OTP sign-in (Better Auth phoneNumber) for allow-listed numbers |
| Domain `critterpass.app` (D20) | deploy to `*.workers.dev` for staging |
| External security review (D4) covers admin surface | launch blocker tracked in phase 54 |

## Open questions

| Question | Default |
|---|---|
| Admin sign-in provider | Google social + allow-list + Cloudflare Access |
| Doc delta: move `ops.content_reviews` to P18 and `ops.dead_letters` to P11 in data-model-sync-and-privacy table→phase map | implement as stated here |
| Doc delta: new commands (`report_content`, `upsert_catalogue_item`, `set_partner_adapter`, desk + session commands, `approve_ops_action`) in api-contracts §4.17 | add with these names |
| P11 lists no dependency on P17 yet registers a panel | wave order guarantees P17 lands first; add 17 to P11 deps in plan.md |
| Impersonation for support | disabled; read-only support view instead |
