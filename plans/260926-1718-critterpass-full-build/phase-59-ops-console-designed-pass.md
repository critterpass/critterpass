---
phase: 59
title: Ops console designed pass
status: pending
depends_on: [18, 19, 35, 44, 45, 46, 47, 52, 55, 56, 58]
wave: 23
features: [F-025]
screens: [Ops-Sign-In, Ops-Nav, Ops-Home, Ops-My-Work, Ops-Moderation, Ops-Desk, Ops-Support, Ops-Catalogue, Ops-Flags, Ops-Partners, Ops-Services, Ops-Jobs, Ops-Audit, Ops-Operators, Ops-States, Ops-Phone]
tasks: 9
priority: low (after the app phases; not a launch gate)
owns:
  - apps/admin/src/{app,kit}/**   # taken over from phase 17
  - apps/admin/src/assets/{fonts,stickers}/**
  - apps/admin/src/modules/{home,work,moderation,desk,support,catalogue,flags,partners,audit,jobs,operators,services,incidents}/**
  - apps/admin/src/phone/**
  - packages/domain/src/admin/{incidents,services-registry}.ts
  - packages/db/src/schema/ops-services.ts
  - packages/db/migrations/*_ops_incidents_services.sql
  - packages/db/test/permissions/ops-incidents-services.test.ts
  - services/api/src/admin/{incidents,services,home,audit-read,catalogue,partners}.ts
  - services/api/test/admin/{incidents,services,home}.test.ts
  - services/worker/src/jobs/ops/{service-health,vendor-usage}.ts
  - infra/cloudflare/admin/headers
  - e2e/admin/
  - e2e/admin/screens/
mount_points:
  - apps/admin/src/modules/{content,vendor-desk,account,billing,help,community,drivers,driver-directory}/ (nav group and badge wiring only; each owner built its panel to the design)
---
# Phase 59 — Ops console designed pass

## Context links

| Source | Section |
|---|---|
| Designs | `design/Ops Console.dc.html` (canvas: s01–s18 + phone 19–21), `design/Ops - *.dc.html`; renders `docs/design-renders/pages/Ops-*.png`, text `docs/design-renders/pages-text/Ops-*.txt` |
| Inventory | `plans/reports/researcher-260928-0214-ops-designs-{queues-people,content-platform,governance-shell}-inventory-report.md` (field → table → command maps per screen) |
| `docs/design-system.md` | tokens; the console's dark surfaces |
| `docs/product-decisions.md` | D11 (undesigned → code; superseded for the console by these designs), D21 (never read groups), D22 (DeepSeek tiers) |
| Phase files | 17 (foundation), 58 (capture + contracts this phase reads), panel owners 18/35/45/46/47/52/55/56 (each builds its own panel to the design) |

## Overview

The console shipped in phase 17 was built without designs, from tokens and system fonts. The founder then designed it (brief 2026-09-27: "polish version that match the overall design", keep AI spend, Operators, assigned-to-me, admin activity and incident banner; decline ⌘K palette, env badge and shortcut sheet; desktop + phone check-ins; monitor every third-party service, not only AI).

This phase restyles the phase-17 screens to the renders and builds the proposed screens: My work, Services & spend, Operators, the incident/maintenance banners and phone check-ins. Panels owned by later phases (content batches, vendor thread, deletion panel, billing, feedback, community and drivers) are built to their renders **by those phases**. Here they only get their nav group and badge.

It is low priority: it runs after the app phases, next to or after launch hardening, and does not gate launch.

Design data is sample data. Two things in the designs are out of date and must not be built as drawn:
- **AI tiers and vendors.** The designs show Claude haiku/sonnet/opus and "via Batch API". Use the DeepSeek fast/pro tiers + `jev` from routing (D22), and add DeepSeek, TypeSafe (Jev) and the web search tool to the service list.
- **Partner states.** Klook shown as "approved" is sample only.

Done when: every Ops render has a matching screen (screenshot beside the render in the report) for each role; the role matrix e2e passes across all 16 areas; the incident banner and maintenance read-only mode work end to end; Services & spend shows live AI/SMS spend and health snapshots; the console is usable at 390 px for the three phone check-ins.

## Requirements

| Screen | Behaviour (render is the spec; this lists what isn't obvious from it) | Role |
|---|---|---|
| Shell, Nav | Grouped nav (—, QUEUES, PEOPLE, CONTENT, PLATFORM, GOVERNANCE) filtered by role; badges from `/v1/admin/counts` with tones (urgent pink, warn orange, plain); operator chip + sign out. Fonts Archivo, Geist, Geist Mono and Caveat are self-hosted (`font-src 'self'`); stickers (gecko, puffin, tanuki, check) are static SVGs exported from `@cp/critter-art` doodles | all |
| Sign in | Staff-pass card; states: refused ("NOT ON THE LIST" + email, from the guard's `not_allow_listed` reason via a distinct callback error), signed in with no role yet | – |
| States kit | Skeleton rows; empty with sticker and "see what was handled today" (queue filter on actioned today); error mapping HTTP status → plain cause + request id; stale save naming who saved and when (`VERSION_CONFLICT` detail gains `updated_by`, `updated_at`); forbidden naming the area and its roles; destructive confirm blocked until its form is valid; saved toast (label, version, op_id, 2.8 s) | all |
| Incidents & maintenance | `ops.incidents {kind incident\|maintenance, text, runbook_url, starts_at, ends_at, posted_by, resolved_by, resolved_at, read_only}`; `post_incident`, `update_incident`, `resolve_incident` (ops); `GET /v1/admin/banners` (all roles); banners newest first on every page; during a `read_only` maintenance window the api refuses `/v1/admin/cmd/*` except `resolve_incident`/`update_incident`, and the emergency CLI still works. On-call stamp from `ops.on_call` config | ops (write), all (read) |
| Home | Greeting + "N things need a human before {time}" from `/work` due items; 6 counters from `/counts`; assigned to you (top 5 of `/work`); recent admin activity (Home-scoped summary read open to all roles); services strip + AI spend today vs cap + guard status; Grafana / uptime link-outs | all |
| My work | Render s03: overdue / due in 2 h / later; filter chips by queue; up for grabs in my areas with TAKE; j/k/enter/u keys; done today | all |
| Moderation | Render s04 over phase 58 intake data: kind chips with counts; list slides the decided item off with its stamp; detail with blurred media + reveal (media URL expires 120 s), filings with notes, audit note, verdict keys a/h/r/b; author card with history and audience size (kind handler `audience()`, provided by the owning phases) | ops, support |
| Desk | Render s05: stepper, due countdown, approved text with sha + stamp, notes; the vendor thread panel is phase 35's (built to this render) | ops |
| Support | Render s07: lookup with type detection (uid, +E.164, email, join code, ticket no); header facts; entitlements; sessions (no city: IP and location are never shown); device keys; command trace; revoke all sessions (`revoke_all_sessions {uid, reason}`). Deletion panel is phase 45's | support |
| Catalogue | Tab counts; guide rows with critter art + city · species; voice · persona column; version number + last editor from audit; per-key diff for local words | content |
| Flags | Groups with notes; badges CRITICAL / SERVER ONLY / ON PARTNERS; stepper for numbers; history list (phase 58 read); reason field; services-group keys live on Services, not here | ops |
| Partners | Ticket cards; state LIVE / APPROVED · OFF / OFF (`set_partner_adapter` + explicit `approved_at`); booking copy only after `certified_at` is set; copy HIDDEN derived when the partner has no link builder; health line from phase 35's partner health read; "what a crew will see" uses a fixed sample offer, never cached supplier content (D10) | ops |
| Services & spend | Tiles (month spend vs `spend.month_budget_usd`, AI today vs cap, services healthy, OTP/SMS today from the phase-09 Redis spend counters + blocked count); AI by tier with DOWNGRADE (owner); 14-day AI spend chart; AI feature kill switches with volume and spend per `ai_usage.route`; product switches with reason; third-party services table grouped by domain (status, p95 · errors, quota use, month spend, switch key) | ops; downgrade and caps owner |
| Jobs & DLQ | Render s15 over the phase 58 read; select + redrive; crons with last result; retry policy text generated from the catalogue | ops |
| Audit | Filters (operator, command, target text, when); rows with target label + link (client `targetLink(kind, id)` registry), op_id, ip hash; expanded diff from `detail.changes`, reason, via, role; keyset paging with count; CSV export owner-only (its own check) | owner, ops |
| Operators | Table over phase 58 read; role chips (owner only); end console sessions; role matrix rendered from `ADMIN_AREA_ROLES` + `ADMIN_COMMAND_ROLES`; how-to cards | owner |
| Phone check-ins | Same SPA at ≤ 480 px: bottom tabs HOME / MY WORK / QUEUES / MORE with badges; one-item-at-a-time moderation verdict with hold-to-reveal; desk task view; 44 pt targets | all |

## Architecture & contracts

| Item | Delta (canonical doc) |
|---|---|
| Migration `*_ops_incidents_services.sql` | `ops.incidents`; `ops.service_health (service, at, state ok\|degraded\|down\|unknown, p95_ms, error_rate, quota_used_pct)` (C0, 30 d); `ops.vendor_spend_daily (service, day, amount_micros, currency, source api\|manual\|computed, note)` (C2); `admin_reader` SELECT; permission test |
| Service registry | `packages/domain/src/admin/services-registry.ts`: static list `{key, name, group, purpose, switch_key?, health: probe\|metrics\|none, usage_api?}`. It is not a table (KISS); adding a vendor = one entry |
| Health collector | Worker cron `ops.service_health` every 60 s. It reads outbound-client stats (each vendor client increments Redis latency/error counters; phase 19's OTel metrics use the same hook) and provider status probes, then writes snapshots. Thresholds: degraded when error rate > 2 % or p95 > 2× baseline over 10 min. `ops.vendor_usage` cron hourly for vendors with a usage API |
| Spend | Computed: AI from `ai_usage`, SMS/OTP from counters. API: vendor billing APIs where they exist. Manual: `set_vendor_cost {service, month, amount_minor, currency, note}` (owner) for fixed plans |
| Commands (§4.17) | New: `post_incident`, `update_incident`, `resolve_incident`, `revoke_all_sessions`, `set_vendor_cost`. Changed: `set_partner_adapter` (+`approved_at?`, `certified_at?`) |
| Routes (§5.9) | `GET /v1/admin/{banners, home, services, audit (count + export), catalogue/counts}` |
| Grafana rule | Phase 17 said "link-out, no duplicate dashboards". The founder asked for in-console monitoring of all third-party services (brief 2026-09-27), so the console shows current state and spend. Grafana stays the place for history, alerting and drill-down (link-outs kept) |
| Docs | `docs/undesigned-states.md` ops console row → designed; P17 frontmatter `screens` points here |

## Tasks

### T1 — Design assets, shell and nav
- Files: `apps/admin/src/assets/{fonts,stickers}/**`, `apps/admin/src/app/{shell,sign-in,styles,theme}.*`, `infra/cloudflare/admin/headers`.
- Steps: self-host fonts + CSP; export stickers; grouped nav with `/counts` badges; sign-in card + refused + no-role states.
- Tests: `pnpm --filter @cp/admin test && pnpm --filter @cp/admin exec playwright test auth.spec.ts`
- Done when: screenshots of Nav (4 roles) and Sign In match `Ops-Nav.png` / `Ops-Sign-In.png`; no request leaves `admin.` for fonts.

### T2 — States kit, toast, incidents and maintenance
- Files: `apps/admin/src/kit/**`, `apps/admin/src/modules/incidents/**`, `packages/domain/src/admin/incidents.ts`, `services/api/src/admin/incidents.ts`, migration (incidents), tests.
- Tests: `pnpm --filter @cp/api test -- admin/incidents && pnpm --filter @cp/admin exec playwright test states.spec.ts`
- Done when: every panel of `Ops-States.png` has a kit story + screenshot; a read-only maintenance window refuses a flag change with `STATE_INVALID {reason: 'maintenance'}` and the CLI still works.

### T3 — Home and My work
- Files: `apps/admin/src/modules/{home,work}/**`, `services/api/src/admin/home.ts`, tests.
- Tests: `pnpm --filter @cp/api test -- admin/home && pnpm --filter @cp/admin exec playwright test work.spec.ts`
- Done when: seeded items from desk, moderation, feedback, content and listings appear in the right sections; TAKE moves an item from grabs to mine; support sees the activity summary without audit detail.

### T4 — Moderation, Desk, Support to design
- Files: `apps/admin/src/modules/{moderation,desk,support}/**`, tests.
- Tests: `pnpm --filter @cp/admin exec playwright test moderation.spec.ts desk.spec.ts support.spec.ts`
- Done when: screenshots match s04/s05/s07 with seeded data for each kind the owning phases registered; `revoke_all_sessions` ends app sessions only.

### T5 — Catalogue, Flags, Partners deltas
- Files: `apps/admin/src/modules/{catalogue,flags,partners}/**`, `services/api/src/admin/{catalogue,partners}.ts`, migration (`ops.partner_adapters.certified_at`), tests.
- Tests: `pnpm --filter @cp/api test -- admin/catalogue admin/partners && pnpm --filter @cp/admin exec playwright test catalogue.spec.ts flags.spec.ts`
- Done when: booking copy can't be set before `certified_at`; flag history shows old → new; tab counts match rows.

### T6 — Audit, Jobs & DLQ, Operators screens
- Files: `apps/admin/src/modules/{audit,jobs,operators}/**`, `services/api/src/admin/audit-read.ts`, tests.
- Tests: `pnpm --filter @cp/admin exec playwright test audit.spec.ts jobs.spec.ts operators.spec.ts`
- Done when: ops gets `FORBIDDEN` on CSV export; a redrive from the UI writes one audit row that links back to the queue; Operators is absent for non-owners.

### T7 — Services & spend
- Files: `packages/domain/src/admin/services-registry.ts`, `packages/db/src/schema/ops-services.ts`, migration (health + spend), `services/worker/src/jobs/ops/{service-health,vendor-usage}.ts`, `services/api/src/admin/services.ts`, `apps/admin/src/modules/services/**`, tests.
- Tests: `pnpm --filter @cp/db test:db -- permissions/ops-incidents-services && pnpm --filter @cp/worker test -- service-health && pnpm --filter @cp/api test -- admin/services`
- Done when: a vendor client error burst flips its row to DEGRADED within two ticks and back when healthy; AI tier and route spend match `ai_usage` sums; a vendor without data shows `unknown`, never a made-up value.

### T8 — Phone check-ins
- Files: `apps/admin/src/phone/**`, responsive rules in `apps/admin/src/app/styles.css`, tests.
- Tests: `pnpm --filter @cp/admin exec playwright test phone.spec.ts` (390×844 viewport)
- Done when: the three phone renders (Home in `Ops-Phone.png`; moderation verdict and desk task are only in the canvas render `Ops-Console.png`, screens 20–21) are matched; no horizontal scroll at 390 px on any area.

### T9 — Role matrix, screenshot pass, doc cleanup
- Files: `e2e/admin/{roles,screens}.spec.ts`, `e2e/admin/screens/`, `docs/undesigned-states.md` (ops row), P17 frontmatter note.
- Tests: `pnpm --filter @cp/admin exec playwright test`
- Done when: every area × role is allowed/forbidden as in the Operators matrix; the report has each screen beside its render for every panel, including those built by 18/35/45/46/47/52/55/56.

## Phase acceptance criteria

- [ ] Each Ops render has a screenshot match in the report (desktop + 3 phone)
- [ ] Role matrix spec green for 16 areas × 4 roles
- [ ] Maintenance read-only mode enforced server-side; CLI bypass audited `via='cli'`
- [ ] Services health never shows a value without a source (`unknown` instead)
- [ ] No web font or asset loaded from outside `admin.`; CSP unchanged except `font-src 'self'`

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Duplicating Grafana | Console shows current state only; history and alerting stay in Grafana |
| Health probes cost money or hit rate limits | Probes only where free (status endpoints); others derive from our own call counters |
| Restyle breaks working ops flows | Same commands and reads; e2e from phase 17 kept green throughout |

## Open questions

| Question | Default |
|---|---|
| Session city on Support | Not shown (IP and location are never shown to support) |
| Partner copy HIDDEN | Derived: no link builder and not booking → hidden; no new enum value |
| Vendor spend for fixed plans | Monthly manual entry by the owner; API pollers only where the vendor has a billing API |
| Phone check-ins as a native app | No; the same SPA at phone width |
