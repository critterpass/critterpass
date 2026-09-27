# Ops console designs: Jobs, Audit, Operators, Phone, States, and the canvas (design-to-plan inventory)

Date 2026-09-28. Sources: Claude Design project `1339f371-…` (read-only), `origin/main` at `a6ca0fa3` (the phase files, `apps/admin`, `services/api/src/admin`, `services/worker/src/boss`, `packages/domain/src/admin`, the `ops_console` migration and the docs). Nothing in the repo was edited.

## 0. Canvas inventory (`Ops Console.dc.html`)

The canvas legend has four tags: BUILT (on main, polished), P17 NEXT (T5–T8), LATER PHASE (panel), PROPOSED (not in the plan). Its code note says to add `work, billing, content, community, services, operators` to `ADMIN_AREAS`.

| Anchor | Label on canvas | File | Tag on canvas |
|---|---|---|---|
| s01 | Sign in | Ops - Sign In | BUILT |
| s02 | Home | Ops - Home | BUILT + PROPOSED |
| s03 | My work | Ops - My Work | PROPOSED |
| s04 | Moderation | Ops - Moderation | P17 T5 (kind handlers P22/P44/P47/P52/P56) |
| s05 | Concierge desk | Ops - Desk | P17 T7 + P35 thread |
| s06 | Feedback & ideas | Ops - Feedback | P47 |
| s07 | Support · user | Ops - Support | P17 T6 + P45 panel |
| s08 | Billing | Ops - Billing | P46 |
| s09 | Catalogue | Ops - Catalogue | BUILT |
| s10 | Content batches | Ops - Content Batches | P18 |
| s11 | Community & drivers | Ops - Community | P52 · P55 · P56 |
| s12 | Flags & config | Ops - Flags | BUILT |
| s13 | Partners | Ops - Partners | BUILT |
| s14 | Services & spend | Ops - Services | PROPOSED + P54 switches |
| s15 | Jobs & DLQ | Ops - Jobs | P11 |
| s16 | Audit log | Ops - Audit | P17 T8 |
| s17 | Operators & roles | Ops - Operators | PROPOSED |
| s18 | States, banners & confirms | Ops - States | BUILT KIT + BANNERS |
| s19–21 | Phone check-ins: 19 Home, 20 Moderation verdict, 21 Desk task | Ops - Phone (`screen=home/moderation/desk`) | PROPOSED |

- "21 screens" means s01–s18 plus the three phone variants. Nav is not a numbered screen. It is the shared component (`Ops - Nav.dc.html`, `active` and `role` props) that the 16 desktop area screens import. Sign In and States do not import it.
- Every screen on the canvas has its own file, and every `Ops - *` file is on the canvas (Nav as a component). **No screen is missing.**
- The canvas header says "POLISH PASS · 28 SEP 2026". The chat transcript loses its last 141 KB (see §7), so I could not see any later brief behind that pass.

## 1. Jobs & DLQ (`Ops - Jobs`, screen label "Jobs & DLQ", nav group PLATFORM)

**Purpose and layout.** Header "Jobs & DLQ", with "worker ×2 · refreshed 20 s ago". A queue table, then a two-column row: the selected queue's DLQ panel on the left; SCHEDULED crons and a RETRY POLICY card on the right.

| Element | Data shown | Source today | Status |
|---|---|---|---|
| Queue table | name, description, active, queued, done 24 h, failed, DLQ count, note (e.g. "APNs 503s since 14:02", "lag 0.4 s", "next bucket 18:50 SGT", "held automatically if opus nears its cap") | `QUEUES` catalogue in `services/worker/src/boss/queues.ts` plus `pgboss.job` state counts | NEW read. The api cannot import the worker's catalogue (import rules), so queue metadata must move to a shared package or be read from `pgboss.queue`/`pgboss.schedule`. Descriptions are NEW. Notes mix live signals (incident, rt lag, next cron fire, P54 cost-guard hold) with free text. |
| Worker count | "worker ×2" | nothing | NEW: a worker heartbeat (Redis key with a TTL per instance) or Railway replica count |
| DLQ panel | job id, failed at, last error, payload (redacted, device tokens masked to the last 4), tries 3/3; checkbox selection | `listDeadLetters()` in `services/worker/src/boss/dlq.ts` (pg-boss `findJobs` on `<queue>.dlq`) | Partial. Data-model §3.16 defines `ops.dead_letters` as a view over `pgboss` (C2, 30 d), but the view was never built: P17 moved it to P11, and P11 T1 only shipped `listDeadLetters`/`redrive`. The error text on the DLQ copy is unverified. If pg-boss 12 does not keep it there, the failure reporter must also write a `(queue, job_id, error, attempts)` row. Per-queue payload redaction is NEW (for example a `redact` on `defineJob`). |
| Redrive footer | "Redriven jobs keep their original singleton key…"; "Last redrive: Mai, 13:40, 12 jobs, all delivered" | `redrive()` creates fresh jobs (new id, retry 0) | Verify the singleton-key claim against pg-boss 12 `redrive`. "Last redrive" can come from the audit row (`redrive_jobs`). "All delivered" (the outcome of the redriven jobs) is NEW. |
| SCHEDULED | cron name, schedule, last result ("OK 15:42", "OK · 0 FIXES", "OK · 4.1 GB", "212 REMOVED") | `QUEUES[*].cron`; last result from the newest completed job's `output` | Partial. Handlers must return a summary output. `powersync.compact` is a Railway cron, not pg-boss, so it has no status source (NEW ping). `ops.ai_cost_guard` is P54 T9 and `billing.reconcile` is P46. |
| RETRY POLICY | "3 tries, backoff from 10 s; billing.apply 5; DLQ insert → Sentry + page in SGT hours" | `DEFAULT_QUEUE_SPEC`; P11 "DLQ ops alert" → P19 alert hook | Generate the text from the catalogue. The paging is P19 T9 / P54 T11. |

**Actions.**

| Action | Command | Status |
|---|---|---|
| REDRIVE N SELECTED / REDRIVE ALL | `redrive_jobs {queue, job_ids?}` (the name the audit design uses) | NEW admin command wrapping `redrive()` through the api's pg-boss producer (`services/api/src/jobs/producer.ts`). It is not in `ADMIN_COMMAND_ROLES`, so today it would default to owner-only; it needs `['ops']`. Not in api-contracts §4.17. |

**Ownership and coverage.** The panel is orphaned. P17's handoff table says P11 registers it; P11 (in progress, T1 done) says "admin UI phase 17" and has no task or owned files for it. `ADMIN_AREAS` already has `jobs: ['ops']`, but there is no `services/api/src/admin/jobs.ts` and no `apps/admin/src/modules/jobs/`. api-contracts §5.9 says "pg-boss dashboard mounted read-only at `/v1/admin/jobs`", which conflicts with the design's custom panel.

**Gaps.**

| # | Gap |
|---|---|
| 1 | No owner. Give it to a new P17 task: owns `services/api/src/admin/jobs.ts` and `apps/admin/src/modules/jobs/**`, plus a small `@cp/db` jobs read helper. |
| 2 | `push.send` has `deadLetter: false` (retryLimit 5), yet the design centres on `push.send.dlq`. Queues that do dead-letter today: `notify.route`, `quota.release`, `ai.batch.poll`, `guide_action.execute`, `ops.backup`. |
| 3 | `admin_reader` has no grant on `pgboss`. Either build the `ops.dead_letters` view (redacted, granted to `admin_reader`) or accept that the jobs area reads through the api's pg-boss connection as `app_system`, which is a documented exception to "every read via admin_reader". |
| 4 | The queue catalogue lives in the worker only. Move names, descriptions and cron metadata to `packages/domain` (or read `pgboss.queue`). |
| 5 | `redrive_jobs` is missing from contracts and the policy table. |
| 6 | Worker heartbeat, cron summaries and the "held" queue state (P54) are NEW. |

**Early vs blocked.** Everything is pure server/web and needs no mobile work: the reads, the redact rule, `redrive_jobs`, the `push.send` DLQ flag, cron summaries and the heartbeat. Rows for later queues (`billing.apply` P46, `feedback.forward`/`idea.embed` P47, `content.publish` P18) appear automatically once those phases add catalogue rows. Only the "held" note waits on P54 T9.

**Role gating.** Area and redrive are `ops`, with owner implied. The nav badge is the DLQ size in warning orange.

## 2. Audit log (`Ops - Audit`, "Audit log", GOVERNANCE)

**Purpose and layout.** Append-only viewer with EXPORT CSV · OWNER. Four filters: Operator, Command, Target (free text: user, task, key or op_id), When (last 7 days). The table has WHEN · SGT, OPERATOR (avatar and name), COMMAND, TARGET (a link), OP_ID and IP HASH. An expanded row shows WHAT CHANGED (field, before, after), REASON GIVEN, and "actor.via admin · role support · result applied · same transaction". The footer shows "2,418 rows in the last 7 days · newest first" with NEWER/OLDER.

| Data | Source | Status |
|---|---|---|
| when, operator, command, op_id, ip hash, reason | `ops.admin_audit` (at, admin_id, action, op_id, ip_hash, reason); names via `OperatorDirectory` | Exists. Indexes exist on `at` and `(admin_id, at)`. |
| target label and link ("Maya Chen · Pass+ 30 days", "la.crew_map.enabled · true → false") | `target_kind`/`target_id`/`detail` | Partial. There is no human label or route resolver. Keyed targets (config keys, partners) sit in `detail`. Need a consistent `detail.summary` written by each command's `audit()` plus a client `targetLink(kind, id)` registry. |
| WHAT CHANGED diff | `detail` | Partial. Standardise `detail.changes` as `[{field, before, after}]` and reuse `DiffView`. |
| role at the time, via (admin/cli) | none | NEW. Store `detail.roles` and `detail.via`. The emergency CLI row ("Emergency CLI · Quoc", ip "local") needs `via='cli'`. |
| row count, target search | none | NEW read work: a count query, an index on `op_id`, an `(action, at)` index, and an expression index on `detail->>'key'`. |

**Actions.**

| Action | Status |
|---|---|
| Filters and keyset paging | P17 T8 plus `encodeCursor` |
| EXPORT CSV (owner) | P17 T8. The area check alone lets ops through, so this needs a per-read role gate. Also decide whether the export itself is audited (reads are not today). |
| Emergency CLI (`pnpm admin:cmd`), shown on Operators and in audit rows | P17 T8, pending |

**Ownership and gaps.** Owned by P17 T8 (`apps/admin/src/modules/audit/**`, `services/api/src/admin/audit-read.ts`), which is pending. Gaps beyond T8: target labels and links, the standard shape of `detail`, stamping via and roles, per-read owner gating, and the indexes.

**Conflict.** Home's "recent admin activity" feed and My Work's "6 DONE TODAY" read audit rows, but the audit area is `owner`/`ops` only while Home is open to every role. Decide between a Home-scoped read (last N rows, summary only) and hiding the feed per role.

**Early vs blocked.** All of it can be built now as pure server/web work.

**Role gating.** Owner and ops can view. CSV export is owner-only.

## 3. Operators & roles (`Ops - Operators`, PROPOSED)

**Purpose and layout.** An operator table: avatar, name, email (with an "allow-listed" note for someone who has never signed in), role chips OWNER/OPS/CONTENT/SUPPORT ("click to change"), last sign-in, session count, and an action ("End sessions", "No sessions", "Give a role", "you"). A WHAT EACH ROLE OPENS matrix covers 16 areas × 4 roles with notes: "approve: owner" on Content batches, "tier downgrade: owner" on Services, "CSV export: owner" on Audit, "owner only" on Operators, and "new area" markers. Side cards: HOW SOMEONE GETS IN (allow-list the email in `ADMIN_ALLOWLIST` → Access plus Google sign-in → owner gives a role; "removing someone: clear roles, which ends their sessions at once, then remove them from the allow-list") and IF THE CONSOLE IS DOWN (`pnpm admin:cmd revoke_session '{…}'`).

| Data | Source | Status |
|---|---|---|
| operators with roles | `auth."user"` where `role IS NOT NULL`; `parseAdminRoles` | NEW read (`GET /v1/admin/operators`) |
| allow-listed accounts that never signed in | the `ADMIN_ALLOWLIST` env (`parseAdminAllowlist`) | NEW. The allow-list needs a `list()` method, and the read merges it with accounts. |
| last sign-in, session count | `auth.session` | NEW. Console and app sessions share `auth.session` and nothing tells them apart, so a console-session marker is needed (cookie prefix only today). |
| role matrix | `ADMIN_AREA_ROLES` and `ADMIN_COMMAND_ROLES` in `@cp/domain` | The client can render it from domain. Owner-only exceptions per command (approve batch, tier downgrade, CSV) need entries in the command table. |

**Actions.**

| Action | Command | Status |
|---|---|---|
| Toggle a role chip | `set_admin_role {uid, roles[]}` | In P17 contracts and in the policy (`['owner']`), but there is no handler. NEW handler. The contracts table doesn't list it; only the P17 Architecture row does. |
| End sessions | `revoke_admin_sessions {uid}` or reuse `revoke_session` | NEW or reuse. `revoke_session` is a support command for app users; ending console sessions should be owner-only. |
| Clear roles ends sessions | `set_admin_role` side effect | The guard re-reads the role on each request and throws `FORBIDDEN{no_role}`, which already locks the person out. Also delete their console sessions in the same transaction. |
| Guard against locking everyone out | none | NEW rule: refuse to remove the last owner. |
| "Give a role" to someone who has never signed in | none | They have no `auth.user` row until first sign-in. The allow-list `email:role` syntax seeds roles today. Either keep that or allow pre-provisioning. |

**Ownership and gaps.** No phase owns this screen. The PROPOSED screen fits P17: T2 already owns `set_admin_role`'s policy and `services/api/src/admin/*`. Add `operators` to `ADMIN_AREAS` with `['owner']`. An empty array would deny the owner too, because `holdsAny` checks the allowed list. Also note the design's nav map lists `operators: ''`, which means owner-only.

**Early vs blocked.** All of it can be built now as pure server/web work.

**Role gating.** Owner only.

## 4. Phone check-ins (`Ops - Phone`, PROPOSED, 390×844)

**What it is.** Not a native or Expo app. It is the same admin SPA at phone width ("quick check-ins from a phone", 44 pt+ targets), chosen in the brief as "Desktop + phone check-ins". It has a bottom tab bar with four tabs: HOME, MY WORK (badge 5), QUEUES (badge 16 = moderation 12 + desk 4), MORE.

| Variant | Content | Data sources |
|---|---|---|
| 19 Home | INCIDENT strip ("APNs degraded since 14:02 ›"); greeting "Afternoon, Quoc" with the gecko sticker and "3 things need a human."; 6 counters (MODERATION 12, DESK < 2 H 4, DLQ 7, CONTENT 2, FEEDBACK 9, IDEAS 5); ASSIGNED TO YOU (queue, title, due); "31/32 services OK" and "AI $184 / $400" | the same reads as desktop Home, My Work and Services |
| 20 Moderation verdict | "‹ MODERATION 1 of 12"; kind "PHOTO · ALBUM"; SLA "26 h · SLA passed"; blurred media with HOLD TO REVEAL; reason chips (NUDITY ×2, SPAM ×1); author card ("Rizky P. · Kuta Crew, 4 reports against, 1 removed"); APPROVE / HIDE / REMOVE / BAN AUTHOR | `moderation_reports` via T5; `moderate_item` |
| 21 Desk task | "‹ DESK" with a live DUE countdown; "VENDOR MESSAGE · IN PROGRESS · YOU"; the user-approved text with an APPROVED stamp; vendor reply bubble; "DRAFT · WAITING ON MAYA"; ASK MAYA TO APPROVE; MARK WAITING ON USER | `ops.concierge_tasks` and `ops.approvals` (T7); the vendor thread is P35 |

**Gaps.**

| # | Gap |
|---|---|
| 1 | The kit has no responsive shell yet; bottom tabs and one-item-at-a-time queue views are NEW. |
| 2 | Hold-to-reveal blurred media is NEW. It depends on the HMAC media URL and a blurred derivative (P44 `media.process`). |
| 3 | Moderation has no SLA or due-at today: `moderation_reports` has no `due_at` or `assignee`, so "26 h · SLA passed" needs an SLA rule (24 h, per My Work) computed from `created_at`. |
| 4 | "N reports against, N removed" per author is a NEW aggregate. The kind handler has to resolve the author. |
| 5 | "ASK MAYA TO APPROVE" needs a draft-for-approval command. It is implied by `approve_ops_action` (T7), but a console-side "request approval" command is not named: NEW, or it is P35's `send_vendor_message` flow. |
| 6 | The per-phone reason-chip counts need reasons grouped per target. `report_count` is one integer, and the chips need per-reason counts: NEW column or grouping. |

**Early vs blocked.** The shell, tabs, Home and My Work on phone, and the moderation verdict for the `user` kind can be built early. Blocked parts: the photo/album preview waits on the P44 kind handler and derivatives; the desk vendor thread and reply wait on P35; "AI $/cap" waits on P54 T9 (spend caps); the services summary waits on service-health aggregation (§6). None of it needs mobile-app work.

**Role gating.** The same per-area gating as desktop. The QUEUES tab shows only the areas the role may open.

## 5. States, banners & confirms (`Ops - States`) vs `apps/admin/src/kit/states.tsx` and `confirm.tsx`

| # | Design | Kit on main | Gap |
|---|---|---|---|
| 01 | Loading: skeleton rows (thumb, two lines, trailing cell) | `LoadingState` (plain bars) | Styling only |
| 02 | Empty: gecko sleeping sticker, "NOTHING WAITING", Caveat line "All quiet. Go get a kopi.", link "See what was handled today" | `EmptyState` (title and children) | Sticker asset on web, Caveat font, and a "handled today" target (a queue filter on actioned-today, or audit filtered by area) |
| 03 | Error: puffin sticker, "THAT DIDN'T LOAD", human cause ("The api took too long to answer."), "504 · request 01J9…", TRY AGAIN | `ErrorState` (message, request id, retry) | Map HTTP status to plain text. `ApiError` must carry the status. |
| 04 | Stale save: "Linh saved Tokek while you were editing", field diff, LOAD THE LATEST AND RE-APPLY MINE | `ConflictState` (diff and reload) | `CONFLICT` detail must include `updated_by` and `updated_at`. `ops_config.updated_by` exists; catalogue items need checking. |
| 05 | Not for your role: tanuki sticker, "Flags & config is for ops", "You are SUPPORT" chip | `ForbiddenState` (generic) | Pass the area name, its required roles and the current roles. Also missing: a "signed in, no role yet" variant (the guard returns `FORBIDDEN{no_role}`; Operators step 3). |
| 06 | Sign-in refused: STAFF PASS card, "NOT ON THE LIST", the email, TRY ANOTHER ACCOUNT | none (`sign-in.tsx` shows a raw error string) | NEW. The guard has `reason: not_allow_listed`. The OAuth callback path needs a distinct redirect or error code carrying the email. |
| 07 | Banners, newest first on every page: INCIDENT (text, author · time, Runbook, RESOLVE); MAINTENANCE (text, "Quoc · planned", EDIT; "the console stays read-only"); OFFLINE ("…what you see may be out of date") | only `OfflineBanner` | INCIDENT and MAINTENANCE are NEW (§6). The offline copy differs slightly. The maintenance read-only mode is NEW (the api refuses `/cmd` during the window). |
| 08 | Critical confirm: diff 30 → 40, "changes the live app… within seconds", type the key to confirm | `ConfirmDialog requireText` (children can hold the diff) | Covered |
| 09 | Destructive confirm: consequences list, Reason (required), Until (30 days), BAN FOR 30 DAYS | `ConfirmDialog tone='danger'` | Needs a "block until the form is valid" hook (today only `requireText` blocks). `ban_user` needs `{reason, until}` (T6). |
| 10 | Saved toast: drops from the top for 2.8 s; "Saved · Tokek v13", `upsert_catalogue_item · op 01J9…` | none | NEW toast component. The command outcome should echo `op_id`, the resulting `version` and a label. |

**Cross-cutting items from the States screen.**

- Designs now exist for the console. That supersedes the `docs/undesigned-states.md` row "Ops console (every screen)" and the P17 frontmatter `screens: []` / D11 "designed in code". Both need a doc delta.
- The kit uses system fonts because the console CSP serves no web fonts. The designs use Archivo, Geist, Geist Mono and Caveat, which must be self-hosted in `apps/admin` (`font-src 'self'`, no Google Fonts).
- The doodle stickers (gecko, puffin, tanuki, check) need web SVG assets. The design uses `doodles.js`; decide whether they come from `@cp/critter-art` or static SVGs.

**Owner, early vs blocked, gating.** P17 (T3's kit; the banners are NEW). All of it is pure web plus small api contract tweaks, so all of it can be built early. Visible to all roles. RESOLVE and EDIT are ops/owner actions (proposed).

## 6. New cross-cutting concepts (Home, Nav, My Work, Phone) and where each should live

| Concept | What the designs imply | Today | Proposed build | Best home |
|---|---|---|---|---|
| Incidents and maintenance | Banner on every page; audit row `post_incident`; resolve; maintenance window with "console read-only"; runbook link; job-queue notes cite "the open incident" | nothing (P54 T11 writes `docs/runbooks/incident.md` only) | `ops.incidents` {kind incident/maintenance, text, runbook_url, starts_at, ends_at, posted_by, resolved_by, resolved_at, read_only}; commands `post_incident`, `update_incident`, `resolve_incident` (ops); read `GET /v1/admin/banners` (all roles); optional P19 Grafana OnCall webhook that opens an incident automatically | **P17 new task**: migration, area, kit banner. The auto-open webhook fits P19 T9 or P54 T11. |
| On-call stamp (07–23 SGT) | Home stamp | P19 T9 alert routing 07:00–23:00 SGT via Grafana OnCall; founder phone is a non-code dependency | Display only: an `ops_config` key (`ops.on_call` {hours, tz, contact_label}), or read the Grafana OnCall schedule later | P17 (config key). The live schedule is P19. |
| Cross-queue assignment ("My work", "assigned to you", "up for grabs", TAKE, `u` hand back, "6 done today") | Items from desk, moderation, feedback, content and community, plus jobs DLQ growth as a grab item; sections for overdue / due < 2 h / later | Only `ops.concierge_tasks.assignee_admin_id` and `due_at` exist. `moderation_reports` has no assignee or due. P47 and P18 tables are not built. | Server registry extension: each area registers `workSource {mine(adminUid), grabs(roles), assign(id, uid?)}`; `GET /v1/admin/work`; one generic `assign_work {kind, id, assignee_uid?}` command (or per-queue assign commands); add `assignee_admin_id` and an SLA `due_at` to `moderation_reports`; "done today" = audit count for the admin since local midnight | **P17 new task** (registry, moderation and desk sources). P18, P47, P52 and P56 register their sources when they land. |
| Nav badge counts endpoint | Per-area badges with tone: urgent pink (past SLA or down), warn orange (close or degraded), plain; phone tab totals | `homeCounters` per module, each polling separately every 20 s | `GET /v1/admin/counts` returning `{area: {count, tone}}` for the areas the role may open, polled once and shared by Nav, Home and the phone tabs. Areas contribute `count()` through `defineAdminArea`. | P17 (registry change) |
| Service health aggregation | Home strip (Claude, APNs, FCM, Twilio, WhatsApp, RevenueCat, Mapbox, PowerSync, Centrifugo, Postgres), "31/32 services OK", Services screen (health, latency, error rate, quota, spend, switch) | P19 plans Grafana dashboards and synthetics; P17 says "link-out, no duplicate dashboards"; P54 T9 kill switches over `ops_config` | Worker cron `ops.service_health` writing `ops.service_health` snapshots (state, p95, error %, quota %) from outbound-client metrics (Redis counters) and provider status probes; read `GET /v1/admin/services`; switches reuse P54's registry | **New phase, or a P54 extension, for the Services screen.** The snapshot collector belongs next to the P19 metrics. Home consumes the summary. Needs a founder decision because it contradicts P17's "no duplicate dashboards". |
| Recent admin activity (Home) | Last N audit rows for every role | audit area is owner/ops | Home-scoped summary read (label only, no detail) | P17 T8 |
| AI spend vs cap | Home "AI $184 / $400" and guard status | `ai_usage` (P13); caps and guard are P54 T9 | Read over `ai_usage` today plus the cap from `ops_config` | Read in P17. Cap and guard in P54. |
| New areas | `work, billing, content, community, services, operators` | `ADMIN_AREAS` has 10 | Extend `ADMIN_AREAS`/`ADMIN_AREA_ROLES` per the design matrix: work = all; billing = support; content = content; community = ops+content; services = ops; operators = `['owner']` | P17 (domain policy file) |

## 7. Design chat (chat `26b8cd5c…`, "Admin dashboard design", 2026-09-27 18:17)

**Brief** (Khanh): "check the plan for admin features planned, @apps/admin for what have been implemented, and see what else we might want for the admin dashboard to design the polish version that match the overall design".

**Answers to the design question form:**

| Question | Answer |
|---|---|
| Format | Canvas |
| Areas | All 12 offered: sign-in and states, Home, Catalogue, Flags and partners, Moderation, Support and user detail, Concierge desk, Audit, Jobs and DLQ, Content batches, Billing and promo grants, Feedback/community/drivers |
| Extras kept | AI spend & kill switches (P54); Operators & roles screen ("set_admin_role has no UI"); Assigned-to-me across queues; Recent admin activity on Home; Incident / maintenance banner |
| Extras declined | ⌘K palette; staging/prod badge with 12 h session countdown; keyboard shortcut sheet |
| Personality | Balanced: stickers in states, stamp-style verdicts, halftone Home header |
| Variations | One direction |
| Device | Desktop + phone check-ins |
| Notes | "not only AI spend but other 3rd parties services and APIs monitoring" (this became Services & spend) |

**Designer's hand-off notes.**

- The console code was read from GitHub `critterpass/critterpass`, because the attached folder was stale.
- Add the six areas to `ADMIN_AREAS`.
- All names and numbers are sample data. Klook shown as "approved" is sample only; only Viator is live.
- The "previous vs new" colours in Content batches are faked with a tint.

**Transcript limit.** The tail (141 KB) is cut off by the transcript size cap, so any 28-Sep polish-pass instructions are not visible.

## 8. Recommended plan deltas (summary)

| # | Delta |
|---|---|
| 1 | P17 new task "Jobs & DLQ area". It takes the orphaned panel: jobs reads, the `ops.dead_letters` view or redacted read, `redrive_jobs` (ops), cron summaries, worker heartbeat, and enabling `push.send` dead-lettering (touches the P11-owned `queues.ts`, so coordinate). |
| 2 | P17 T8 extended: target labels and links, a standard `detail.{summary, changes, via, roles}`, owner-gated CSV, indexes, and the CLI writing `via='cli'`. |
| 3 | P17 new task "Operators": `set_admin_role` handler (last-owner guard, session purge), operators read (accounts merged with the allow-list), console-session marker, `operators` area. |
| 4 | P17 new task "Shell additions": `ops.incidents` and banners, maintenance read-only mode, the counts endpoint, work-source registry and `assign_work`, moderation assignee and SLA, toast, sign-in-refused and no-role states, self-hosted fonts and stickers, responsive phone shell. |
| 5 | Decide the Services & spend owner (new phase, or P54 plus P19) and whether a console health view overrides P17's "no duplicate dashboards" rule. This is a founder decision. |
| 6 | Doc deltas: api-contracts §4.17 (`redrive_jobs`, `set_admin_role`, incident commands, `assign_work`) and §5.9 (jobs is a custom panel, not the mounted pg-boss dashboard; new routes). Also data-model §3.16 (`ops.incidents`, the `moderation_reports` columns), P17 frontmatter `screens`, and the `undesigned-states.md` row. |

## Unresolved questions

1. Does pg-boss 12 `redrive` keep `singletonKey`, and does the DLQ copy keep the last error? Both need a spike against the running version.
2. Should jobs reads go through a granted `ops.dead_letters` view (keeps the `admin_reader` rule), or through the api's `app_system` pg-boss connection?
3. Should the Home activity feed and "done today" be visible to support and content roles, given that audit is owner/ops?
4. Services & spend: who owns it, and is it allowed to duplicate Grafana signals?
5. Should console sessions be tagged in `auth.session` (a Better Auth additional field) so Operators can count and end them separately from app sessions?
