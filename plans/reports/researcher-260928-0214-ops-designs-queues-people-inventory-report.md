# Ops console designs → plan inventory: queues & people

Date 2026-09-28 · Scope: Claude Design project `1339f371…` screens Sign In, My Work, Moderation, Desk, Feedback, Support, Billing (+ `Ops - Nav` for gating). Code read from `origin/main` (433aad20) and local branch `feat/back-office-tools` (3586ba13, P17 T5 moderation, unmerged).

Legend: ✓ covered by a phase file · ◐ partly covered · ✗ GAP (in design, in no phase file) · EARLY = pure server/admin work, no mobile dependency.

## 0. Baseline facts

| Fact | Source |
|---|---|
| P17 T1–T4 on main: `ops.concierge_tasks` (assignee_admin_id, due_at, notes jsonb, version), `ops.approvals`, `ops.partner_adapters`, `moderation_reports`, admin auth (Google + allow-list + CF Access + 12 h), kit, registry, catalogue/flags/partners | `packages/db/src/schema/ops-console.ts`, `services/api/src/admin/*`, `apps/admin/src/*` |
| P17 T5 on branch: `report_content`, `moderate_item {kind,id,verdict: approve\|hide\|remove\|ban_author, note?}` (roles ops+support), kind-handler registry with `preview()`, `author()`, `apply()`; `ops.moderation_filings`; `moderation_reports.source` (user/compliance); ships `user` kind only; `accounts.ts` (lookup, sessions, revoke, ban/unban via app Better Auth) | `feat/back-office-tools` |
| Roles in code: `owner, ops, content, support` | `packages/domain/src/admin/roles.ts` |
| §4.17 on main lacks the P17 doc-delta commands (desk, session, ban, device key, approve_ops_action); branch adds only `report_content` + new `moderate_item` row | `docs/api-contracts.md` §4.17 |
| No entitlement grant table or source loader exists yet; `code_grant` source kind exists in `packages/entitlements/src/sources.ts` but its backing tables (`codes`, `code_redemptions`) are P46 | P12 done, P46 pending |
| `join_codes` exists (P21 migration on main); `feedback_tickets`, `ideas` (P47), `subscriptions`/`billing_events`/`ftf_grants`/`codes` (P46), `ops.vendor_threads/messages` (P35) do not | `packages/db/migrations/` |

## 1. Ops - Sign In

| Item | Detail |
|---|---|
| Purpose / layout | Staff-pass card: "Continue with Google", copy "allow-listed work account, Cloudflare Access checks you first, session lasts 12 hours", footer "admin.critterpass.app · every action is audited"; decorative MRZ lists roles OWNER/OPS/CONTENT/SUPPORT, pass "NO. 0001" |
| Data | none (static); MRZ/number decorative |
| Actions | CONTINUE WITH GOOGLE → admin Better Auth `/v1/admin/auth` social sign-in ✓ (P17 T2/T3, done) |
| Owner / coverage | P17 T3 done — ✓ full. Only diff: design is the first *designed* console screen; P17 says "none designed; design in code" (D11) → restyle `apps/admin/src/app/sign-in.tsx` to design |
| Gaps | ✗ (cosmetic) staff pass number — no operator sequence; derive from admin creation order or drop. ✗ Not-allow-listed / Access-failed error state not drawn (log in `docs/undesigned-states.md`) |
| Early vs blocked | All EARLY (restyle only) |
| Role gating | Pre-auth; post-auth lands on Home |

## 2. Ops - My Work (NEW screen, nav "all")

| Item | Detail |
|---|---|
| Purpose / layout | "Everything assigned to you across queues, soonest due first". Header filter chips ALL/DESK/MODERATION/FEEDBACK/CONTENT with counts. Main: sections OVERDUE / DUE IN THE NEXT 2 HOURS / LATER; rows = queue tag, title, meta, context line, status (NEW/IN PROGRESS/WAITING USER/OWNER REVIEW), due (live countdown or fixed time + SLA note), OPEN. Keys j/k move, enter open, u hand back. Aside: "UP FOR GRABS · YOUR AREAS" (unassigned items in the viewer's role areas) with TAKE; "6 DONE TODAY" stat |

Data

| Field | Source |
|---|---|
| Desk rows (assignee, status, due_at, kind, task id, approval context) | `ops.concierge_tasks` ✓ (P17 T1) |
| Moderation rows (assigned to me, "24 h SLA", "2 h late") | `moderation_reports` — ✗ no assignee, no SLA/due column |
| Feedback rows ("reply due" 2 days of receipt, "#CP-10482", severity, platform/app build) | `feedback_tickets` (P47) — ✗ no assignee, no reply-due |
| Content rows ("batch … gate G2", "Only an owner can approve", OWNER REVIEW) | P18 content batches — ✗ no assignee |
| Grabs: COMMUNITY (driver listing flag), JOBS (`push.send.dlq grew by 5`), DESK, MODERATION | P56 listing reports, P11 `ops.dead_letters`, desk, moderation — ✗ no "claimable" notion for DLQ groups/listings |
| "N done today" | ✗ NEW read: count of `ops.admin_audit` rows by admin today (terminal actions only) |

Actions

| Action | Command |
|---|---|
| OPEN | route to owning queue item (client) |
| TAKE | desk: `update_concierge_task {id, assignee}` ✓; others ✗ NEW `claim_work_item {queue, item_id}` |
| u hand back | desk: `update_concierge_task {assignee: null}` ✓; others ✗ NEW `release_work_item {queue, item_id}` |
| Read | ✗ NEW `GET /v1/admin/work` (mine, grouped by due) + `GET /v1/admin/work/available` (unassigned in my role areas) |

| Coverage | Detail |
|---|---|
| Owning phase | none. Closest: P17 Home counters ("desk tasks due < 2 h") + `defineQueue` helper |
| GAPS | ✗ whole screen; ✗ cross-queue assignment model; ✗ per-queue SLA (moderation 24 h, feedback reply 2 d, desk `due_at`); ✗ `work` nav item; ✗ "done today" |
| Proposal (pick one) | A) generic `ops.work_claims (queue, item_id, admin_id, claimed_at, due_at)` pk (queue,item_id) + `defineQueue({kind, sla, list, due})` extension so each phase registers its source; My Work = union over registered sources. B) add `assignee_admin_id` + `due_at` to each queue table (moderation_reports now; feedback_tickets P47; content batches P18). A keeps later phases to a registration line; B needs every owning phase to add columns. Recommend A |
| EARLY | Claim table + `/v1/admin/work` + claim/release + registrations for desk and moderation (P17 area, server + admin only) |
| Blocked | Feedback source → P47 (table); Content source → P18; Community/listing source → P52/P56; JOBS grab → P11 admin DLQ panel (P11 T1 DLQ done, admin panel not built) |
| Role gating | all; "Up for grabs" filtered by the viewer's roles (same map as Nav) |

## 3. Ops - Moderation (nav ops + support)

| Item | Detail |
|---|---|
| Purpose / layout | "Reports from the app. Each verdict is audited and handed back to the feature that owns the content." Tabs OPEN(12)/ACTIONED/DISMISSED; kind chips with counts ALL/PHOTOS/AVATARS/NOTES/TIPS/IDEAS/LISTINGS/USERS; 3 columns: queue list (kind · context, title, reason, ×count, age coloured) with the just-decided item sliding off stamped HIDDEN; detail (kind, subject title, report id, "handler: photos (P44)", blurred image + REVEAL PHOTO "signed media URL, expires in 120 s", caption, per-filing rows reason+note+age, optional audit note, 4 verdict buttons a/h/r/b); aside AUTHOR card (name, uid, joined, crew + size, "seen by 5 crew members", "4 against, 1 removed", past verdict stamps REMOVED 12 SEP / DISMISSED 3 SEP) + "What each verdict does" legend |

Data

| Field | Source |
|---|---|
| Status tabs, count, age, report_count, verdict | `moderation_reports` ✓ (branch) |
| Kind filter + per-kind counts | ✗ queue read filters by status only (`moderationQueueQuerySchema`) — add `kind` filter + counts-by-kind read |
| Preview image / text / user | kind handler `preview()` ✓ (branch); HMAC media URL ✓ |
| Reporter note per filing ("not ok in a shared album") | ✗ `report_content` payload has reason enum only; `ops.moderation_filings.reason` holds the enum. Needs optional `note` (≤280, C2, compliance-screened) |
| Reason labels NUDITY / OFFENSIVE / FAKE RATINGS / "Phone number, held by filter" / "Needs review before public" | enum `spam, harassment, hate, sexual, violence, impersonation, personal_info, other` + `source=compliance` ✓; "fake ratings / anomaly flag" is a system-filed source (P56) ✗ not in enum/sources |
| Author card (identity, joined, crew, audience "seen by N") | handler `author()` ✓ returns uid only; ✗ NEW `GET /v1/admin/moderation/authors/:uid` (users + crew membership) and ✗ handler `audience()` for "seen by" |
| Author history (reports against, prior removals, stamps) | ✗ `moderation_reports` has no `author_id`; history needs author resolved at filing time → add `author_id` column (set by handler at intake) |
| Handler owner label | kind registry ✓ |

Actions

| Action | Command |
|---|---|
| APPROVE / HIDE / REMOVE (a/h/r) | `moderate_item` ✓ (branch) |
| BAN AUTHOR (b) "opens ban_user with a reason and expiry" | `moderate_item verdict=ban_author` ✓ but ◐ no ban reason/expiry fields (only `note`) → extend payload `ban?: {reason, expires_at?}` or chain `ban_user` (P17 T6) |
| REVEAL PHOTO | client-side blur; URL from preview ✓ |
| Audit note | `moderate_item.note` ✓ |
| j/k navigation | ✓ P17 spec (b shortcut NEW, trivial) |

| Coverage | Detail |
|---|---|
| Owning phase | P17 T5 (branch) + kind handlers: avatar P22, photo/note P44, tip P52, idea P47, listing P56, user P17 |
| GAPS | ✗ kind filter/counts; ✗ reporter note; ✗ `author_id` + author history read; ✗ audience count; ✗ ban reason/expiry on ban_author; ✗ moderation SLA (feeds My Work); ✗ "anomaly flag" system source for listings; ✗ assignment (see §2) |
| EARLY | All of the above server items (P17 area): kind filter, `author_id` intake + history, `note` on `report_content` (server side; the app report sheet is later), ban fields, SLA key in `ops_config`, assignment |
| Blocked | Real kinds: PHOTOS/NOTES → P44 (album tables); AVATARS → P22; TIPS → P52; IDEAS → P47; LISTINGS → P56. Until then only `user` + `public_text` (compliance) kinds render |
| Role gating | nav ops+support; `moderate_item` roles ops, support ✓ (branch doc) — P17 table row said ops only; branch already aligned to design |

## 4. Ops - Desk / Concierge desk (nav ops)

| Item | Detail |
|---|---|
| Purpose / layout | "Human tasks for crews. Nothing goes to a vendor until the user has approved the exact text." Header pill DESK OPEN · 07:00–23:00 SGT, + NEW TASK. Left: tasks BY DUE TIME (kind, due w/ SLA colour, title, status, assignee). Detail: kind, title, task/crew/trip/people meta, status stepper NEW→IN PROGRESS→WAITING USER→DONE, DUE IN countdown, assignee "You · hand back"; "WHAT MAYA APPROVED" read-only approved text + who/when + op id + sha + APPROVED stamp; NOTES with add-note; vendor thread (vendor name, phone, WhatsApp Business, REPLIED; sent/read ticks; vendor reply; ops draft "DRAFT · WAITING ON MAYA"; LOCKED composer; ASK MAYA TO APPROVE, EDIT); footer MARK WAITING ON USER, MARK DONE, CANCEL TASK |

Data

| Field | Source |
|---|---|
| Task list, kind, status, assignee, due_at, notes | `ops.concierge_tasks` ✓ (P17 T1) |
| Crew name, trip name/dates, headcount | `trips`, `crews`, `trip_participants` ✓ via admin_reader |
| Approved text, approver, time, op_id | `ops.approvals` ✓ (text_shown, approved_at, op_id) |
| sha of approved text | P35 `ops.vendor_messages.approved_text_sha256` ✓ (P35); for non-vendor approvals ✗ derive in read |
| Vendor contact, channel, thread messages, read receipts, reply status | `ops.vendor_threads`, `ops.vendor_messages` (P35) ✓ planned |
| Desk hours | P35 "phone-hours note" ◐ — no config key → ✗ `ops_config desk.hours` |
| System/WhatsApp auto-notes ("Made replied…", "Sent the approved text…") | ◐ P35 events; ✗ not specified to append to task notes |

Actions

| Action | Command |
|---|---|
| + NEW TASK | `create_concierge_task` ✓ (P17 doc delta, not yet in §4.17) |
| hand back / assign / status buttons / add note / cancel | `update_concierge_task {id, status?, assignee?, note?}` ✓ (P17) |
| Send approved text | `send_vendor_message {draft_id}` ✓ (P35 §4.11), gated by `assertApproved` ✓ (P17 T7) |
| ASK MAYA TO APPROVE (ops-drafted follow-up) | ◐ P35 has user-drafted `request_vendor_message` and "follow-up correction draft (needs approval)" as a GuideAction inverse, but no ops-initiated draft command → ✗ NEW `propose_vendor_reply {task_id, thread_id, draft_text}` → user approval card → `approve_vendor_message` |
| EDIT draft | ✗ part of the same NEW command (re-propose invalidates prior approval) |

| Coverage | Detail |
|---|---|
| Owning phase | P17 T7 (task queue, approvals, `approve_ops_action`, `assertApproved`) + P35 vendor-desk module (thread panel, send, replies, hours) |
| GAPS | ✗ ops-initiated draft/approval request; ✗ desk-hours config; ✗ auto-notes from vendor events; ◐ §4.17 doc delta for desk commands not applied |
| EARLY | P17 T7 entire (server + admin, no mobile): task commands, status machine, `approve_ops_action` handler, `assertApproved`, queue UI, hours config. P35 server pieces too (vendor tables, `/webhooks/whatsapp` verify, send via Cloud API) — pure server, needs WhatsApp Business account (non-code) |
| Blocked | User-side approval card / "Sent 10:45, waiting" card → P35 mobile (3e-2, 3k-5/9/10); clinic hand-off consent → P34/P38 |
| Role gating | ops (owner implied) ✓ P17 |

## 5. Ops - Feedback & ideas (nav support)

| Item | Detail |
|---|---|
| Purpose / layout | "A human replies to every report within two days. Ideas go public only after review." Tabs FEEDBACK(9)/IDEA BOARD(14)/PENDING IDEAS(5). Left: tickets (#no, age, title, category, severity, status NEW/REPLIED/IN LINEAR/CLOSED). Centre: paper ticket (#no, category PROBLEM, mood, body, reporter · crew · "sent from a shake report", masked screenshot, device/os/app/locale/reply channel/sent time, RECEIVED stamp). Right: TRIAGE (model label, BUG/SEVERE, summary, likely duplicate #CP-10411 0.88, Linear CP-812 link); REPLY TO MAYA · BY EMAIL (templates KNOWN ISSUE / NEED MORE INFO / FIXED IN…, editable text, "Tell her when it ships in [1.0.4]", SEND REPLY, MERGE INTO 10411). Bottom: IDEA BOARD · CURATION table (votes, idea + meta "38 crews", "1 ticket linked", "0.91 like …", status, team note in guide voice, actions PUBLISH/DECLINE/MERGE/EDIT NOTE/ADD NOTE/STATUS) |

Data

| Field | Source |
|---|---|
| ticket_no, mood, category, body, device_info, screenshot_key, status | `feedback_tickets` ✓ (data-model §3.15 + P47 delta `ticket_no`, `tracker_issue_id`, `fixed_in_version`, `reply_channel`) |
| Severity, triage summary, likely duplicate + score | P47 AI triage output ✓ `{category, severity, summary, likely_duplicate_of?}` — ✗ not persisted on the ticket (no columns) and ✗ no confidence score |
| Ticket statuses NEW/REPLIED/IN LINEAR/CLOSED | ✗ `status` enum undefined in P47 |
| "sent from a shake report", crew name | ✗ `source` (shake/settings) not a column; crew via user ✓ |
| Reply-due (2 days) | ✗ no SLA in P47 (copy exists only in design) |
| Linear issue link | `tracker_issue_id` ✓ |
| Ideas: votes, status, team note, fixed_in_version, merged_into, pending_review, embedding similarity | `ideas` + P47 delta ✓ |
| Idea "N crews" / "1 ticket linked" | ✗ crews-count aggregate (read, derivable from votes × crew_members); ✗ ticket↔idea link (no column/table) |
| "haiku-4-5" model label | ✗ stale copy: AI provider is DeepSeek (memory 2026-09-28); show route/model from `ai_usage` instead |

Actions

| Action | Command |
|---|---|
| SEND REPLY (+ template, email vs Inbox) | ◐ P47 "replies by support go out by email (Resend) or Inbox" — ✗ no command → NEW `reply_feedback {ticket_id, body, template_key?, notify_on_version?}` |
| "Tell her when it ships in 1.0.4" | ◐ P47 fix loop is tracker-webhook-driven → ✗ NEW per-ticket `notify_on_version` (or set `fixed_in_version` via the reply command) |
| MERGE INTO 10411 (ticket merge) | ✗ only `merge_ideas` exists → NEW `merge_feedback_tickets {ticket_id, into_ticket_id}` |
| Idea PUBLISH / DECLINE (pending) | ◐ P47 "pending-idea moderation" via P17 queue — covered as `moderate_item kind=idea` or `set_idea_status {status: open\|declined}` (pick one; design shows it in both screens) |
| Idea MERGE | `merge_ideas` ✓ (§4.17, P47) |
| STATUS | `set_idea_status {idea_id, status, fixed_in_version?}` ✓ |
| EDIT/ADD NOTE (team note) | ◐ `team_note` column ✓ but no command field → extend `set_idea_status` with `team_note?` or NEW `set_idea_note` |
| Ticket list/detail read | ✗ route not listed (§5.9 says "feedback/ideas" generically) → NEW `GET /v1/admin/feedback`, `/feedback/:id`, `/ideas?status` |

| Coverage | Detail |
|---|---|
| Owning phase | P47 T5 (triage→Linear, replies, fix loop) + T8 (admin help module) |
| GAPS | ✗ reply command + templates store; ✗ ticket merge; ✗ ticket status enum; ✗ triage persistence (severity/summary/dup/score); ✗ reply SLA; ✗ ticket↔idea link; ✗ team-note command field; ✗ source (shake) column |
| EARLY | Server half of P47 is mobile-free: migration (`feedback_tickets` deltas, `ideas`, `idea_votes`), `submit_feedback`/`submit_idea` handlers (callable by API), triage route, Linear forwarding, `/webhooks/tracker`, reply via Resend, admin help module + all the NEW commands above. Needs Linear + Resend accounts |
| Blocked | Real inbound volume + screenshots/device info → P47 mobile 3p-2/3p-3 + native `cp-shake`; Inbox reply for phone-only users + N-38 fix card → P25 inbox cards; idea board public app 3p-4 → P47 mobile |
| Role gating | support ✓ (P17 roles, P47) |

## 6. Ops - Support (nav support)

| Item | Detail |
|---|---|
| Purpose / layout | FIND bar (uid / +E.164 / email / 6-char join code / ticket no; type detection chip "LOOKS LIKE AN EMAIL"; match count). User header: avatar, name, badges ACTIVE / PASS+ / PHONE VERIFIED, facts UID, JOINED ("anon → phone"), PHONE masked, EMAIL, LOCALE·TZ, CREWS, TRIPS, TICKETS; REVOKE ALL SESSIONS, BAN…; banner "NOT SHOWN HERE … C3 … no impersonation; read-only". Left: ENTITLEMENTS (perk, source, window, action Billing › / Crew grant / Revoke) + GRANT; ACCOUNT DELETION panel ("panel from P45": NONE→REQUESTED→RESTORE 30 D→PURGED, last export, force-purge note). Right: SESSIONS (device + app build, created + city, last seen, REVOKE); DEVICE ACTION KEYS (device, key prefix, rotated, scopes, REVOKE KEY); COMMAND TRACE (filter op_id/command; time, command, op + device, APPLIED/DUPLICATE/REJECTED; selected row shows error code + redacted payload) |

Data

| Field | Source |
|---|---|
| Lookup uid/phone/email/join code | `auth.user`, `user_private.phone_hash`, `join_codes` ✓ (P17 T6; branch `accounts.ts` has email/phone) |
| Lookup by ticket no | `feedback_tickets.ticket_no` → P47 |
| Status, verified phone, masked phone/email, locale/tz | `users`, `auth.user` ✓ (masking helpers ✓ branch) |
| "anon → phone" upgrade history | ✗ no identity-history read; derivable from `auth.account` + `domain_events auth.merged` — NEW read field |
| Crews, trips, open tickets | `crew_members`, `trips` ✓; tickets P47 |
| PASS+ badge + entitlements list with sources and windows | `user_entitlements.sources` ✓ (P12) + source rows (P46 subscriptions / ftf_grants / codes) |
| Deletion state, export | `account_deletions`, `data_exports` ✓ (P09 table; P45 panel) |
| Sessions: device, build, created, last seen, city | `auth.session` (user_agent, ip) ✓; ✗ "city" — branch rule "IP never shown"; city would need coarse geo stored at session create (C2) or drop it |
| Device action keys (key prefix, rotated, scopes) | `device_action_keys` ✓ (P09, C3 secret — only non-secret columns; confirm admin_reader column grant) |
| Command trace incl. device + redacted payload | `cmd_log`/`cmd_results` ◐ — ✗ `cmd_log` stores `payload_hash` only (no payload), no `device_id`; redacted payload + device need new columns (`payload_redacted jsonb`, `device_id`) written by the P10 pipeline; retention 30 d/14 d |

Actions

| Action | Command |
|---|---|
| LOOK UP | ✗ route name: P17 lists `GET /v1/admin/users?q` ◐ (reads listed, not named) |
| REVOKE (one session) | `revoke_session` ✓ (P17; branch `accounts.revokeSession`) |
| REVOKE ALL SESSIONS | ✗ NEW `revoke_all_sessions {uid, reason}` (or loop) |
| BAN… | `ban_user {uid, reason, expires_at?}` / `unban_user` ✓ (P17; branch `accounts.ban`) |
| REVOKE KEY | `revoke_device_key {key_id}` ✓ (P17) |
| + GRANT / Revoke grant | `grant_entitlement` / `revoke_entitlement {uid, perk, until, reason}` ✓ named; ◐ no backing store (see §7) |
| Force-purge (legal) | ◐ P45 "force-purge for legal requests with reason" — command unnamed → NEW `force_purge_account {uid, reason}` |
| Command trace filter | ✗ NEW `GET /v1/admin/users/:uid/commands?op_id&cmd` |

| Coverage | Detail |
|---|---|
| Owning phase | P17 T6 (support tools) + P45 T9b (deletion panel via `userPanels`) + P46 (entitlement sources) + P47 (ticket lookup) |
| GAPS | ✗ revoke-all; ✗ identity-upgrade history; ✗ session city (privacy call); ✗ command trace payload/device storage; ✗ trace route; ✗ force-purge command name; ◐ grant storage (see §7) |
| EARLY | All of P17 T6 (branch already has accounts core); revoke-all; trace route + `cmd_log` columns (touches shared P10 pipeline, still server-only); deletion panel read over `account_deletions` (P45 panel is server/admin; purge job itself grows with every data phase) |
| Blocked | Ticket lookup/badge → P47 table; store/FTF entitlement rows → P46 server tables (EARLY-able, see §7); action-key rows only appear once the app issues keys (P48/P49) |
| Role gating | support; banner states read-only, no impersonation ✓ (P17) |

## 7. Ops - Billing (nav support)

| Item | Detail |
|---|---|
| Purpose / layout | "Store purchases arrive through RevenueCat, but our api decides who gets what." Tabs USER TIMELINE / WEBHOOKS / OFFER CODES / FTF REVIEW(2). Metric tiles WEBHOOK LAG P95, RECONCILE DRIFT (nightly 05:00 SGT), FAILED WEBHOOKS 24 H. User timeline (ADMIN/FTF/STORE/API events with meta, op/txn ids, notes) + "Open in Support". GRANT PROMO TIME: perk PASS+ / BOOST A TRIP, 7/30/90 days, stacking explanation (starts after store period ends, after earlier grant), reason required, GRANT button ("Runs grant_entitlement and logs your name"); Extend App Store renewal ("service failures only, ≤90 days, twice a year, 0 of 2 used", EXTEND…). Bottom: RevenueCat webhooks (type, uid, time, status APPLIED/FAILED/DUPLICATE, REPLAY on failed); Offer code batches (name, store, size, redeemed bar, recorded by, + Record); FTF review (crew, reason e.g. same verified phone / attestation failed, ALLOW / REVOKE GRANT) |

Data

| Field | Source |
|---|---|
| Timeline: store purchases, FTF grants, admin grants, entitlement recomputes, account created | `store_transactions`, `billing_events`, `ftf_grants`, `subscriptions` (P46), `ops.admin_audit` ✓, `domain_events` ✓ — P46 T12 "user billing timeline" ✓ |
| Webhook lag p95, reconcile drift | P46 T12 step 5 ✓ (metrics exported to Grafana); ✗ console read of the numbers (P17 says link-out, design shows tiles) |
| Failed webhooks 24 h + list | `billing_events.processed_at` ✓ + ✗ failure/error column not in data-model (`billing.apply` DLQ holds the error — join `ops.dead_letters`) |
| Offer code batches (name, store, size, redeemed, recorded by) | P46 T12 "partner Offer Code batch registry" ◐ — ✗ no table in data-model (`codes` is for server codes) → NEW `offer_code_batches (name, platform, size, recorded_by, notes)`; redeemed count from RC `offer_code` on transactions ✗ not a `store_transactions` column |
| FTF review items + reason | `ftf_grants.abuse_decision`, `member_overlap_hash` ✓ (P46); "attestation failed for 2 of 3" from `device_attestations` ✓ (P09) |
| Extension quota "0 of 2 used" | ✗ needs record of extensions (audit rows by action, or a column) |

Actions

| Action | Command |
|---|---|
| GRANT n DAYS OF PASS+ | `grant_entitlement {uid, perk, until, reason}` ✓ named (P17) — ◐ storage: P46 says promo time is `code_grant`; P17 T6 done-when requires resolution before P46 exists. ✗ decision: (a) pull P46 `codes`/`code_redemptions` + `code_grant` loader into P17, or (b) small `entitlement_grants` table + loader in P17 that P46 later reads. Stacking after store period needs `subscriptions` (P46) |
| BOOST A TRIP grant | ✗ `grant_entitlement` payload has no `trip_id`; boost grant = `trip_boosts(source=promo)` (P46) |
| Revoke grant | `revoke_entitlement` ✓ |
| EXTEND… (App Store Extend Renewal Date / Play defer) | P46 T11/T12 ✓ behaviour; ✗ command unnamed → NEW `extend_store_renewal {uid, days≤90, reason}` |
| REPLAY webhook | ◐ §5.9 "webhooks replay"; P17 handoff gives replay to P35, P46 says "(P17 hook)" — ownership ambiguous, no command → NEW `replay_webhook {provider, event_id}` (generic over `webhook_events`/`billing_events`, P17 area) |
| + Record (offer batch) | ✗ NEW `record_offer_code_batch {name, platform, size, notes}` |
| FTF ALLOW / REVOKE GRANT | P46 T12 "FTF abuse review list" ◐ — ✗ command unnamed → NEW `review_ftf_grant {crew_id, decision: allow\|revoke, reason}` |

| Coverage | Detail |
|---|---|
| Owning phase | P46 T12 (admin billing module) on top of P46 T1/T2 (schema, webhook, `billing.apply`, reconcile, loaders); P17 owns `grant_entitlement` |
| GAPS | ✗ grant storage decision + boost grant payload; ✗ offer-code batch table + redemption attribution; ✗ command names (extend, replay, record batch, FTF review); ✗ replay ownership (P17 vs P35 vs P46); ✗ extension quota record; ✗ metric tiles read |
| EARLY | P46 T1 (billing schema + RLS + permission tests) and T2 (RevenueCat webhook, `billing.apply`, reconcile, entitlement loaders — tested from recorded fixtures) and T12 (admin billing) are server/admin only. Also the generic webhook-replay command. Needs RevenueCat project + App Store Server API key for extend-renewal (non-code) |
| Blocked | Real purchases → P46 mobile T5–T11 (paywall, RevenueCat SDK); FTF grants are created on `trip.setup_started` (server job, but real trips need P27 app flow); gift/redeem codes → P46 T11 |
| Role gating | support ✓ (P46 T12 done-when "support role can grant 30 d"); extend-renewal "support-only" ✓ |

## 8. Role gating summary (design `Ops - Nav` map vs plan)

| Screen | Design roles (+owner) | Plan | Match |
|---|---|---|---|
| Sign In | pre-auth | P17 | ✓ |
| My work | all | — | ✗ NEW |
| Moderation | ops, support | P17 table says ops; branch §4.17 ops+support | ✓ (branch) |
| Desk | ops | P17 ops | ✓ |
| Feedback & ideas | support | P17/P47 support | ✓ |
| Support | support | P17 support | ✓ |
| Billing | support | P46 support | ✓ |
| Nav badges | counts per queue | P17 `homeCounters` | ✓ reuse for nav badges ◐ (registry has home counters, not nav badges) |

## 9. EARLY build candidates (no mobile dependency), ordered

| # | Item | Phase home | Unblocks |
|---|---|---|---|
| 1 | Merge P17 T5 branch; apply §4.17 doc delta for all P17 commands | 17 | everything below |
| 2 | P17 T6 support (lookup incl. join code, sessions, revoke-all, ban, device keys, command trace route) + `cmd_log.payload_redacted`/`device_id` | 17 (+10 contract) | Support screen |
| 3 | P17 T7 desk + `desk.hours` config + ops-drafted approval request contract | 17 (+35 contract) | Desk screen |
| 4 | Work-claim model + `/v1/admin/work` + claim/release + desk/moderation sources + SLA keys | 17 | My Work |
| 5 | Moderation extras: kind filter/counts, `author_id` + author history, reporter note, ban reason/expiry | 17 | Moderation aside/detail |
| 6 | Grant storage decision + `grant_entitlement` loader (or pull P46 T1 schema early) | 17/46 | Support + Billing grants |
| 7 | P46 T1 + T2 + T12 (schema, RC webhook, billing.apply, reconcile, admin billing, NEW billing commands, generic `replay_webhook`) | 46 | Billing screen |
| 8 | P47 server: migration, `submit_feedback`/`submit_idea` handlers, triage + Linear + tracker webhook, Resend replies, admin help module, NEW feedback commands | 47 | Feedback screen |
| 9 | P35 server: vendor thread tables, WhatsApp webhook + send | 35 | Desk thread panel |
| 10 | P45 deletion panel read + `force_purge_account` | 45 | Support deletion panel |

Blocked on app phases: moderation kinds photo/note (P44), avatar (P22), tip (P52), idea (P47), listing (P56); desk user approval cards (P35 mobile); feedback inbound + screenshots (P47 mobile/native); Inbox replies + N-38 (P25); real purchases/FTF data (P46 mobile, P27); action-key rows (P48/P49); content batches in My Work (P18).

## Unresolved questions

1. My Work assignment model: generic `ops.work_claims` (A) vs per-table assignee columns (B)?
2. Admin grant storage before P46: pull `codes`/`code_redemptions` early or add `entitlement_grants`?
3. Webhook replay owner: P17 generic command, P35, or P46?
4. Session "city" on Support: store coarse geo (C2) at session create, or drop from the design?
5. Pending ideas: decide in Moderation (`moderate_item kind=idea`) or Feedback (`set_idea_status`) — design shows both.
6. Command trace payload: accept storing a redacted payload in `cmd_log` (30 d) — privacy review needed.
7. Triage panel model label: design says Haiku; provider is DeepSeek-only since 2026-09-28 — show the route name instead?
