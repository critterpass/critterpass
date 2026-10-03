---
phase: 47
title: "Help centre, feedback, idea board, rating prompt"
status: pending
depends_on: [17, 25, 43, 46, 58]
wave: 20
features: [F-153, F-154, F-155, F-156]
screens: [3p-1, 3p-2, 3p-3, 3p-4, 3p-5, 3p-6, 3n-6]
tasks: 8
owns:
  - packages/domain/src/help/
  - packages/db/src/schema/help-feedback.ts
  - packages/db/migrations/*_feedback_ideas_rating_prompts.sql
  - packages/db/test/permissions/{feedback-tickets,ideas,idea-votes,rating-prompts}.test.ts
  - packages/content/help/
  - packages/ai/src/routes/feedback-triage/
  - packages/ai/evals/feedback-triage/
  - services/api/src/commands/help/
  - services/api/src/routes/{help-articles,ideas}.ts
  - services/api/src/routes/webhooks/tracker.ts
  - services/api/src/admin/help/
  - services/api/test/help/
  - services/worker/src/jobs/help/
  - services/worker/test/help/
  - apps/admin/src/modules/help/
  - apps/mobile/modules/cp-shake/
  - apps/mobile/src/features/help/
  - apps/mobile/src/app/help/
  - packages/i18n/locales/en/help/
  - e2e/help/
  - apps/mobile/src/features/recap/story/RecapEndSlot.tsx   # edit grant (owner phase 43): render RecapEndArbiter in the empty slot
  - apps/mobile/src/features/money/**                       # edit grant (owner phase 33): wrap amounts in PrivateContent only
  - apps/mobile/src/features/crew/chat/**                   # edit grant (owner phase 24): wrap message bodies in PrivateContent only
  - apps/mobile/src/features/onboarding/**                  # edit grant (owner phase 22): wrap passport fields in PrivateContent only
---
# Phase 47 — Help centre, feedback, idea board, rating prompt

## Context links
| Source | Section |
|---|---|
| `docs/product-decisions.md` | D5 (Haiku for parsing/triage), D11, D17 (Resend, Lingui/Tolgee), C31 (idea-board rows are board content, not scope); §3 governor rule "rating prompt never follows a paywall"; §7 Q-82 (10 votes/user/month; anonymous may vote device-bound), Q-85 |
| `docs/data-model.md` | §3.15 (`feedback_tickets`, `ideas`, `idea_votes`, `moderation_reports`); §3.13 `help_articles` (vector 1024); §3.14 `rating_prompts`, `paywall_impressions` |
| `docs/data-model-sync-and-privacy.md` | §4 streams `me` (`idea_votes`, `feedback_tickets`, `rating_prompts`), `help` (`help_articles`, `ideas`); table → phase (47) |
| `docs/api-contracts.md` | §4.16 `submit_feedback`, `submit_idea`, `vote_idea`, `unvote_idea`, `record_rating_prompt`; §4.17 `set_idea_status`, `merge_ideas`, `moderate_item`; §5.4 presign `purpose=feedback`; §5.5 `GET /v1/ideas?tab`, `POST /v1/ideas/similar`, `GET /v1/help/articles?q&locale&context`; §5.8 `/webhooks/tracker` |
| `docs/api-contracts-async.md` | §2.2 `feedback.forward`, `idea.shipped_fanout`; §3 N-38 (ROUNDUP Inbox card) |
| Reports | `design-analysis-260926-1143-you-community-help-report.md` §2 3n-6, 3p-1…3p-6, §5, §7, §8; master §2 F-153…F-156, §8 AI-37, AI-38, §6.2 helpdesk/tracker/email rows; fact-check native report claim 31 (review prompt ≤3/365 d, 5.6.1 no custom prompts), omission 3 (age rating / UGC) |
| Phase inputs | P17 admin shell + moderation queue + feedback/ideas panel slots; P25 inbox cards (`inbox_items`) + Tokek notes; P43 recap story end event (3p-6 host); P46 `paywall_impressions` (rating suppression); P18 `help_articles` table + content release pipeline; P14 embedding client (voyage-4-lite, 1024-d); P11 notification registration; P10 command outbox + media upload queue |
| Renders | `docs/design-renders/screens/3p-1_Help_and_feedback.png`, `3p-2_Send_feedback.png`, `3p-3_Feedback_sent.png`, `3p-4_Idea_board.png`, `3p-5_Suggest_an_idea.png`, `3p-6_Rate_the_app.png`, `3n-6_Settings_more.png` |

## Overview
Goal: one help hub with searchable, localised MDX articles; feedback and bug reports (shake-to-report, auto screenshot, device info) that reach a human tracker and close the loop with a "fixed" note; a public idea board with vote budget, statuses, crewmate faces and semantic duplicate detection; and a rating-prompt arbiter that asks only after a good trip and never after a paywall or error.
Done when: articles render offline from the `help` stream and search returns ranked results; a shake on any screen opens a prefilled problem report whose screenshot masks private content; feedback sent offline posts on reconnect and lands in Linear with AI triage; a shipped idea notifies voters via an Inbox card once their installed version ≥ fixed version; the arbiter's property tests pass; Maestro `e2e/help/*` pass on iOS and Android.

## Requirements
### F-153 Help centre (3p-1 + undesigned reader, search results)
- Hub per render: ← SETTINGS, Tokek pointing with typed Caveat line, 2×2 tiles (REPORT A PROBLEM → 3p-2 in problem mode; SEND FEEDBACK → 3p-2; SUGGEST A FEATURE "Vote on {n} ideas" → 3p-4; RATE THE APP → store write-review URL), HELP CENTRE search + contextual article rows (context = entry screen / trip phase), footer "A human replies by email within two days." (phone-only accounts: "…replies in your Inbox").
- Articles: MDX in `packages/content/help/<locale>/<slug>.mdx` (frontmatter: title, category, contexts[], updated); published through P18 content release into `help_articles` (with embeddings); web help pages rendered by P51 from the same source (store "support URL").
- Reader (design in code): paper page, title, body (MDX components: callout, steps, deep-link button into app screens via P21 router, guide aside), "Was this helpful? yes/no" (analytics event only), "Still stuck? Ask a human" → 3p-2 prefilled with article slug.
- Search (design in code): hybrid FTS + trigram + vector (query embedded server-side) via `GET /v1/help/articles?q`; offline fallback = local FTS over synced `help_articles`; results highlight; no results → "Ask a human" CTA. No AI-generated answers (not designed).
- 16 locales: fallback to English with "Shown in English" chip when a translation is missing.
- Motion: Tokek line types (`tg-type`), tiles lift on press (ty −2 + shadow).

### F-154 Feedback + shake-to-report (3p-2, 3p-3)
- 3p-2: mood critters GRR/MEH/OKAY/GOOD/LOVE IT (selected hops 2000 ms, others grey silhouettes); ABOUT chips PLANNING/MONEY/GUIDE CHAT/CRITTERS/OTHER (problem mode adds BUG preselected); textarea with placeholder (no demo typing); attachments: auto screenshot thumb (× peels like a sticker), + adds from photo picker (≤3, ≤5 MB each); "Include device info" toggle ON by default showing real `OS · app version (build)`; SEND IT with periodic light sweep; validation: text ≥ 3 chars or mood + category; send → note folds and flies off.
- Shake: global listener (`cp-shake`: iOS `motionEnded(.motionShake)` via root view controller, ignored while a text field is first responder to avoid Shake-to-Undo; Android accelerometer threshold detector, foreground only) → capture current screen via `react-native-view-shot` **before** presenting, with privacy masking: route-group default mask at capture time — whole content area masked (chrome kept) when the current route is in wallet `(tabs)/wallet/**`, chat `crew/[crewId]/chat/**`, pass `(tabs)/pass/**` + `onboarding/**` passport, map `(trip)/map/**`; user may unmask per screenshot before send; plus element-level masking of views flagged `privateContent` (money amounts, chat bodies, passport numbers, maps with live positions) elsewhere → 3p-2 problem mode. Settings toggle "Shake to report" (device pref, default on).
- Context attached: last screen id, trip id, app version/build, OS, device model, locale, tz, network state, last 50 breadcrumb events (no PII; from P19 Sentry breadcrumbs), Sentry event id if recent error.
- Offline: `submit_feedback` queued in the command outbox; media upload retries; 3p-3 queued variant "Pinned. It posts when you're back."
- 3p-3: paper page "POST · COURRIER / #CP-{ticket_no}", pinned note with category · mood + condensed note (first 140 chars, ellipsis — no LLM on-device), RECEIVED stamp slam once (s2.2→.94→1.04→1, ~990 ms) + thud + confetti 50, Tokek hop; "Thanks, {name}. A human reads every one…"; BACK TO SETTINGS; "See what others asked for ›" → 3p-4.
- Backend: `feedback.forward` → triage (AI-38: category + severity as a Jev decision route through P13 `decide()` with Haiku twin; summary and duplicate hints stay Haiku) → Linear issue (team per category) with attachments via signed media URLs; replies by support go out by email (Resend) or Inbox for phone-only; tracker webhook "done + fixed_in_version" → N-38 Inbox card from Tokek when the reporter's installed version ≥ fixed version ("Fixed in 1.2: the forecast check you asked for").

### F-155 Idea board + duplicate detection (3p-4, 3p-5)
- 3p-4: pill "{n} VOTES LEFT" (budget 10 per calendar month, Q-82); segmented TOP / NEW / SHIPPED; rows: vote box (mine = yellow fill + stamp slam 300 ms + odometer +1), title caps, status chip (LOOKING AT IT / PLANNED / BUILDING / SHIPPED; DECLINED and MERGED shown in detail only), crewmate faces "Maya and Jordan too" (only users sharing an active crew, via `crew_people`), team note in guide voice (human-authored in admin); sticky "+ SUGGEST AN IDEA".
- Out of votes: tap → shake + "You've used this month's 10 votes. Take one back to move it." Unvote returns budget.
- Idea detail (design in code): description, status history, team note, merged-from list, voters count, my vote.
- Anonymous users vote (device-bound through their anonymous uid; merge on upgrade keeps votes).
- Shipped: admin sets SHIPPED with version → row slides to SHIPPED with confetti on next open; voters get N-38 Inbox card when installed version ≥ fixed.
- 3p-5 sheet: title field ("IN A FEW WORDS"), debounce 300 ms → `POST /v1/ideas/similar` (embedding + HNSW cosine, top 3, threshold from `ops_config ideas.dup_threshold`, <300 ms p95); board behind filters with FLIP collapse; match card slides in with Tokek (420 ms back-ease) "Sounds like this one…" + VOTE ▲ (uses budget; closes sheet, stamps row, toast "Voted for {title}. That makes {n}."); multiple matches → stacked list; "MINE'S DIFFERENT, POST IT" → `submit_idea` (min 8 chars, profanity + PII check; status `pending_review` visible to author as "Under review", public after moderation via P17 queue) toast "Posted under NEW. Tokek will tell you if it moves." Multilingual matching via the multilingual embedding model.
- Settings 3n-6 row "Suggest a feature · {open} ideas to vote on · {mine} of yours".

### F-156 Rating prompt rules (3p-6)
- Arbiter `packages/domain/src/help/rating-arbiter.ts` (pure, shared): eligible only when a trip ended well (recap viewed to the end, no unresolved disruption on that trip, user mood not GRR/MEH in feedback within 30 d), not during any active trip, not within 10 min of an error, not in the same session as a paywall impression (P46), not after 4c-2 or 3o-3 surfaced in the same recap session, max 1 request per 120 d app-side (system cap 3/365 d on iOS; Play quota opaque).
- One-prompt-per-screen rule: the recap end hosts at most one interstitial in priority order: 4c-2 (P46, if FTF ending) > 3o-3 rate-the-trip toast (P52) > rating prompt.
- Trigger: after the recap story finishes (P43 emits `recap.story_completed`); call `StoreReview.requestReview()` (iOS `AppStore.requestReview(in:)`, Android Play In-App Review); Tokek hop animation tied to the recap end, not to the prompt (no callback exists); no post-rating toast.
- `record_rating_prompt` logs attempts; Settings "Rate Critterpass" and hub tile open the write-review URL directly (`itms-apps://…?action=write-review`, Play listing) — no quota.

## Architecture & contracts
| Area | Delta |
|---|---|
| Migration `<ts>_feedback_ideas_rating_prompts.sql` | `feedback_tickets` (+ `ticket_no` sequence, `tracker_issue_id`, `fixed_in_version`, `reply_channel`), `ideas` (+ `author_id`, `description`, `team_note`, `fixed_in_version`, `merged_into_id`, `status` adds `pending_review/declined/merged`, `embedding vector(1024)` HNSW, `locale`), `idea_votes` (+ `month_key`), `rating_prompts` — **doc delta** for added columns |
| RLS | `feedback_tickets` O (self create/read); `ideas` R for public statuses, author reads own pending; `idea_votes` O; `rating_prompts` O; embedding column not published |
| Vote budget | SQL fn `app.vote_idea(idea_id)` counts `idea_votes` for (uid, month_key) in txn; over → `STATE_INVALID{over_budget}`; `votes_count` maintained by trigger |
| Streams | `help` (param locale): `help_articles` (without embedding), `ideas` public columns; `me`: `idea_votes`, `feedback_tickets`, `rating_prompts` |
| Commands | §4.16 set; **doc delta**: `submit_feedback` adds `mood`, `category`, `include_device_info`; `submit_idea` payload `{title, description?, locale}` |
| Routes | `GET /v1/help/articles?q&locale&context`, `GET /v1/ideas?tab&cursor`, `GET /v1/ideas/{id}`, `POST /v1/ideas/similar {text, locale}` |
| Webhook | `/webhooks/tracker` (Linear-Signature HMAC) → `idea.status_changed` / ticket fixed |
| Jobs | `feedback.forward` (3 retries, DLQ), `idea.shipped_fanout`, `idea.embed` (on submit/edit), `help.embed` hook in P18 release pipeline (this phase supplies the embedder fn) |
| AI | `packages/ai/src/routes/feedback-triage/` Haiku structured output `{category, severity, summary, likely_duplicate_of?}`; promptfoo suite (no PII echoed, schema-valid) |
| Push/Inbox | N-38 via P11 registration + P25 inbox card kind `fix_shipped` |
| Admin | `apps/admin/src/modules/help/`: feedback triage (status, reply templates, fixed-in version), idea curation (`set_idea_status`, `merge_ideas`, team note), pending-idea moderation |
| Native | `cp-shake` (Swift root-VC motion hook + Kotlin SensorManager), JS event `onShake` |

## Ops console design

Build this phase's console panel to its render (`design/Ops - Feedback.dc.html`, `docs/design-renders/pages/Ops-Feedback.png`); field → table → command map in `plans/reports/researcher-260928-0214-ops-designs-queues-people-inventory-report.md`. Register the panel's `count`/`work` sources with the phase 58 registry. Sample data in the render is not a spec; AI labels follow D22 routing.

| Gap in the plan | Add in this phase |
|---|---|
| SEND REPLY with templates, "tell her when it ships in 1.0.4" | `reply_feedback {ticket_id, body, template_key?, notify_on_version?}` (support); templates as `ops_config` entries |
| MERGE INTO #10411 | `merge_feedback_tickets {ticket_id, into_ticket_id}` (support) |
| Ticket status NEW / REPLIED / IN LINEAR / CLOSED | `feedback_tickets.status` enum `new\|replied\|in_tracker\|closed` |
| Triage result (category, severity, summary, likely duplicate + score) | persist triage on the ticket: `severity`, `triage_summary`, `duplicate_of`, `duplicate_score`; model label from routing (DeepSeek), not "haiku" |
| Reply due in 2 days | `reply_due_at` = received + `feedback.reply_hours` (phase 58 key) |
| "sent from a shake report"; "1 ticket linked" on an idea | `feedback_tickets.source shake\|settings`; `feedback_tickets.idea_id` |
| Team note EDIT/ADD | `set_idea_status` gains `team_note?` |
| Pending ideas PUBLISH / DECLINE | decided in this panel via `set_idea_status` (not the moderation queue); idea *reports* still go to moderation |
| Reads | `GET /v1/admin/feedback`, `/feedback/:id`, `/ideas?status` |
| My work / badges | register `work` (tickets by reply due) + `count` (new tickets, pending ideas) |

## Tasks
### T1 — Schema, vote budget fn, commands, permission tests
- Goal: data + writes for feedback, ideas, votes, rating prompts.
- Files: `packages/db/src/schema/help-feedback.ts`, `packages/db/migrations/<ts>_feedback_ideas_rating_prompts.sql`, `packages/db/test/permissions/{feedback-tickets,ideas,idea-votes,rating-prompts}.test.ts`, `packages/domain/src/help/{schemas,ideas}.ts`, `services/api/src/commands/help/{submit-feedback,submit-idea,vote-idea,unvote-idea,record-rating-prompt}.ts`, `services/api/test/help/commands.test.ts`.
- Steps: 1. Tables + trigger + vote fn. 2. RLS + grants + publication entries. 3. Handlers (idempotent, sync-door rejects as `cmd_results`).
- Tests: `pnpm --filter @cp/db test -- permissions/ideas permissions/idea-votes permissions/feedback-tickets`; `pnpm --filter @cp/api test -- help/commands`.
- Done when: 11th vote in a month rejected; concurrent votes never exceed budget; pending ideas invisible to other users.
- Status: done — ae5f7c0f9

### T2 — Help content, embeddings, articles API, hub 3p-1, reader, search
- Goal: searchable localised help.
- Content: no separate MDX source. The articles are the content factory's `help` release (`tools/content-factory`, kind `help`, Markdown bodies), published into `help_articles` and synced by the `help` stream per locale; the launch-set gaps (notifications, SOS and Help limits, one Pass+ billing and restore article) and translations go through a factory batch the founder approves.
- Embeddings: pending the vendor decision. The vector branch is written against `EmbeddingVendor` and stays off; ranking stands on full text plus trigram with context boosting, tested on that alone.
- Files: `services/api/src/routes/help-articles.ts`, `packages/domain/src/help/contexts.ts`, `apps/mobile/src/app/help-centre/{_layout,index,article/[slug]}.tsx` (`/help` is the trip's Help and SOS screen), `apps/mobile/src/features/help/{data,hub,reader,dev}/*` (search runs in place on the hub), `apps/mobile/src/app/(dev)/help-{lab,scene}.tsx`, tests, `e2e/help/screens.yaml`.
- Steps: 1. Hybrid ranking endpoint + context boosting + English fallback. 2. Hub + reader + search in place, offline search over the synced articles. 3. Translation hand-off keys to Tolgee.
- Tests: `pnpm --filter @cp/api test -- help-articles`; `pnpm --filter @cp/mobile test -- help/hub help/reader help/search`; `maestro test e2e/help/hub-search.yaml`.
- Done when: "refund" query ranks the billing article first; airplane-mode search returns local results; missing translation shows English chip.
- Status: done — 9757148a5

### T3 — `cp-shake` + screenshot capture with privacy masking
- Goal: shake anywhere → problem report with safe screenshot.
- Files: `apps/mobile/modules/cp-shake/{ios/*.swift,android/src/**/*.kt,index.ts,expo-module.config.json}`, `apps/mobile/src/features/help/shake/{ShakeListener,capture,mask}.tsx`, `apps/mobile/src/features/help/index.ts` (exports `PrivateContent` wrapper), tests.
- Steps: 1. Native shake hooks (text-field guard iOS; foreground-only Android). 2. Route-group default mask (wallet, chat, pass, map) applied at capture from the current expo-router pathname. 3. `PrivateContent` wrapper sets a masking flag; capture renders masked overlay before snapshot. 4. Device pref toggle. 5. Adopt wrapper in P33 money, P24 chat and P22 passport components (edit grants in owns; wrapper-only changes).
- Tests: XCTest/JUnit for detector; `pnpm --filter @cp/mobile test -- help/shake`.
- Done when: snapshot of a Balances screen shows masked amounts; capture on wallet/chat/pass/map routes is masked by default with no wrapper present (test per route group); shaking inside a text field does not open the report on iOS.

### T4 — Send feedback 3p-2, sent 3p-3, offline outbox
- Goal: designed feedback flow.
- Files: `apps/mobile/src/app/help/{feedback,feedback-sent}.tsx`, `apps/mobile/src/features/help/feedback/*`, tests, `e2e/help/feedback-offline.yaml`.
- Steps: 1. Mood/category/text/attachments/device info. 2. Upload via presign `purpose=feedback` + retry queue. 3. Queue command offline; queued 3p-3 variant. 4. Motion (hop, peel, sweep, fold-fly, stamp slam, confetti).
- Tests: `pnpm --filter @cp/mobile test -- help/feedback`; `maestro test e2e/help/feedback-offline.yaml`.
- Done when: offline send shows queued state and the ticket number appears after reconnect; screenshot removal works.
- Status: done — 9757148a5

### T5 — Feedback triage → tracker, replies, fix-shipped loop
- Goal: closed loop to humans and back.
- Files: `packages/ai/src/routes/feedback-triage/*`, `packages/ai/evals/feedback-triage/*`, `services/worker/src/jobs/help/{feedback-forward,shipped-fanout}.ts`, `services/api/src/routes/webhooks/tracker.ts`, `services/worker/test/help/*.test.ts`, `services/api/.env.example` (Linear section only).
- Steps: 1. Haiku triage with schema + redaction. 2. Linear API create issue with signed attachment URLs (120 s cap, retries). 3. Webhook HMAC verify → ticket/idea status + fixed version. 4. Fan-out N-38 gated by installed version (`devices.app_version`). 5. Reply delivery (Resend email or Inbox).
- Tests: `pnpm --filter @cp/worker test -- help`; `pnpm --filter @cp/api test -- webhooks/tracker`; `pnpm --filter @cp/ai eval feedback-triage`.
- Done when: recorded Linear webhook fixture produces an Inbox card only for devices on ≥ fixed version; eval passes.

### T6 — Idea board 3p-4, detail, suggest sheet 3p-5 with duplicate detection
- Goal: vote and suggest with semantic de-dupe.
- Files: `services/api/src/routes/ideas.ts`, `services/worker/src/jobs/help/idea-embed.ts`, `apps/mobile/src/app/help/ideas/{index,[id],suggest}.tsx`, `apps/mobile/src/features/help/ideas/*`, tests, `e2e/help/ideas.yaml`.
- Steps: 1. List/detail endpoints with crewmate faces join (crew graph only). 2. Similar endpoint (embed, HNSW, threshold). 3. Board UI + budget states + FLIP filter. 4. Suggest sheet with match card, multiple matches, post + under review. 5. Shipped slide + confetti.
- Tests: `pnpm --filter @cp/api test -- ideas`; `pnpm --filter @cp/mobile test -- help/ideas`; `maestro test e2e/help/ideas.yaml`.
- Done when: typing "shared packing list" surfaces "Packing lists per crew" within 300 ms p95 on the local stack; faces never include non-crewmates (test).

### T7 — Rating prompt arbiter + recap hook + settings rows
- Goal: compliant rating requests.
- Files: `packages/domain/src/help/rating-arbiter.ts`, `packages/domain/src/help/rating-arbiter.test.ts`, `apps/mobile/src/features/help/rating/{use-rating-prompt,RecapEndArbiter}.tsx` (fills P43's `RecapEndSlot`; renders P46 `FtfEndingCard` (4c-2) > P52 3o-3 toast (slot registration, absent until P52) > store review), `apps/mobile/src/features/help/settings-rows.tsx` (Rate, Send feedback, Suggest, Help centre rows for P45 registry), tests.
- Steps: 1. Pure rules + fast-check properties. 2. `expo-store-review` call; write-review URLs. 3. Recap-end single-interstitial arbiter with priority order, triggered by P43's `recap.story_completed`; mount it in `RecapEndSlot.tsx` (edit grant). 4. `record_rating_prompt`.
- Tests: `pnpm --filter @cp/domain test -- rating-arbiter`; `pnpm --filter @cp/mobile test -- help/rating`.
- Done when: properties hold (never after paywall same session, never in-trip, ≤1/120 d, one interstitial per recap end); RTL test on P43 story end shows 4c-2 for an FTF-ending trip and no store review in that session.

### T8 — Admin help module + e2e sweep
- Goal: support tooling and phase verification.
- Files: `apps/admin/src/modules/help/*`, `services/api/src/admin/help/*`, `services/api/test/help/admin.test.ts`, `e2e/help/{full-journey,a11y}.yaml`.
- Steps: 1. Feedback triage list + reply templates. 2. Idea curation, merge (moves votes, refunds duplicates' budget), team note, pending moderation. 3. Full journey Maestro on iOS + Android incl. AX3 + Reduce Motion.
- Tests: `pnpm --filter @cp/api test -- help/admin`; `maestro test e2e/help/`.
- Done when: merge keeps total unique voters and never double-counts a user; all `e2e/help` flows green.

## Phase acceptance criteria
- [ ] Permission tests for 4 tables pass; pending ideas and embeddings not exposed
- [ ] Help search works online (hybrid) and offline (local FTS); reader deep links resolve
- [ ] Shake opens problem report with masked screenshot; iOS text-field shake ignored
- [ ] Feedback offline queue → ticket; Linear issue created with triage; fix-shipped Inbox card version-gated
- [ ] Vote budget 10/month enforced atomically; duplicate detection < 300 ms p95
- [ ] Rating arbiter properties pass; no custom rating UI; settings row opens write-review URL
- [ ] Maestro `e2e/help/*` pass on iOS + Android

## Risks & rollback
| Risk | Mitigation |
|---|---|
| Screenshot leaks private data | masking by wrapper + default mask for maps/chat/money components; user can remove screenshot before send |
| UGC idea board triggers age-rating "social media" category | ideas moderated before public; counsel item |
| Linear outage | job retries + DLQ; tickets remain in DB and admin |
| Embedding vendor outage | similar endpoint degrades to trigram match |
| Rollback | flags `help.shake`, `ideas.enabled` hide surfaces without release |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| Linear workspace + API key + webhook secret | tickets stay in admin queue (`status=open`), forwarded when configured |
| Resend domain for support replies | Inbox replies only |
| Help article translations (Tolgee) | English fallback chip |
| Store support URL on web (P51) | web help ships with P51 from the same MDX |

## Open questions
1. Vote budget: design shows "3 VOTES LEFT" — default: 10 per month (Q-82).
2. "Pinned to the board" on 3p-3 — default: metaphorical; feedback never becomes public.
3. Doc delta: new `ideas`/`feedback_tickets` columns and `GET /v1/ideas/{id}`, `idea.embed` job.
4. `PrivateContent` adoption — resolved: route-group default masking + wrapper adoption in P22/P24/P33 components done in T3 under explicit edit grants (nothing deferred to phase 54).
5. AI answers in help search — default: none (not designed).
