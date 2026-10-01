---
phase: 31
title: Proposal, personalised versions, RSVP, dropout re-split
status: in_progress
depends_on: [11, 16, 28, 29, 34, 35, 46]
wave: 17
features: [F-084, F-085, F-086, F-087, F-088, F-089, F-090, F-091]
screens: [3f-1, 3f-2, 3f-3, 3f-4, 3f-5, 3f-6, 3f-7, 4f-1]
tasks: 10
owns:
  - infra/powersync/streams/proposal.yaml
  - packages/domain/src/proposal/**
  - packages/db/src/schema/proposals.ts
  - packages/db/migrations/*_proposals_rsvp_engagement.sql
  - packages/db/test/permissions/{proposals,proposal-versions,engagement-events,private-guide-threads,anonymous-suggestions}.test.ts
  - packages/planner/src/dropout/**
  - packages/ai/src/routes/proposal/**
  - packages/ai/evals/proposal/**
  - services/api/src/commands/proposal/**
  - services/api/src/routes/proposals.ts
  - services/worker/src/jobs/proposal/**
  - apps/mobile/src/app/(trip)/proposal/**
  - apps/mobile/src/features/proposal/**
  - apps/mobile/src/ui/story-player/**
  - packages/i18n/locales/en/proposal/**
  - e2e/proposal/**
---
# Phase 31 — Proposal, personalised versions, RSVP, dropout re-split

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D1, D7 (seat cap/Boost), D10 (no stay holds; Viator holds only), C9, C13, C26 (seat cap), C28 (private objections), C41 (approval authority), C43 (reply-by / free-cancel), C44 (draft privacy), supplier copy table |
| `docs/system-architecture.md` | §4 commands, jobs, AI, realtime; §5 authz; §7 sequences (draft → proposal) |
| `docs/data-model.md` | §3.4 `share_calcs`, `cost_components`; §3.5 proposals/RSVP/waitlist; §3.6 `private_guide_threads`, `anonymous_suggestions`; §3.7 `bookings.free_cancel_until`; `trip_participants` |
| `docs/data-model-sync-and-privacy.md` | §1 private fields, §3 state machines (`draft_review` → `proposed`, RSVP), §4 `trip` stream, table→phase row 31 |
| `docs/api-contracts.md` | §4.7 proposal/RSVP commands, §5.3 `POST /v1/proposals/{id}/private/reason` |
| `docs/api-contracts-async.md` | §1 `proposal:{id}` channel, `user:#uid` `engagement.summary`; §2 queues `ai.proposal_versions`, `ai.rsvp_intent`, `trip.dropout`; cron `proposal.reply_by`, `followup.deliver`; N-07, N-08, N-09 |
| `docs/design-system.md` | story/trailer motion presets, confetti, odometer, stamp, guide colours (C5) |
| Reports | `design-analysis-260926-1143-plan-proposal-crew-report.md` (3f-*); master §2 rows F-084…F-091, §8 AI-15…AI-18, §10.4 visibility matrix, §13 R4; `researcher-260926-1649-travel-supplier-apis-report.md` (Viator holds/cancel) |
| Renders | `docs/design-renders/screens/3f-1_Build_the_proposal.png`, `3f-2_Proposal_trailer.png`, `3f-3_Your_version.png`, `3f-4_Not_sure_yet.png`, `3f-5_Slide_to_board.png`, `3f-6_Who_s_in.png`, `3f-7_Dev_s_out.png`, `4f-1_*.png` |

## Overview

Goal: the organiser turns an approved plan into a proposal (trailer/poster/postcard), the guide writes a private version per recipient, recipients watch a story, see "their" version, object privately or slide to board, and the organiser tracks replies with guide suggestions; a dropout produces a re-split ChangeSet and a waitlist seat offer.

Done when: a 6-person crew on a local stack can build → send → receive 5 personalised versions (real Sonnet calls, costs from cost engine) → react live → object privately (organiser sees only "maybe") → board with egg grant → organiser sees tracker + suggestions → one member declines → re-split ChangeSet applied or sent to vote → freed seat offered to waitlist; all permission tests prove C28 (no per-person passive signals reach peers/organiser).

## Requirements

### F-084 Proposal builder (3f-1)
| Item | Behaviour |
|---|---|
| Format | TRAILER / POSTER / POSTCARD segmented; switching morphs preview (shared-element morph, `motion.morph` preset) |
| Toggles | "Show cost per person" (hides price on all versions + trailer when off); "Personal versions" (off = one shared version) |
| Reply by | date picker; default = min(earliest `bookings.free_cancel_until` of booked stays − 1 d, trip start − 14 d); validation rejects reply_by after earliest free-cancel deadline with explanation (C43). Viator holds are NOT inputs: `validUntil` lasts minutes–hours, so it would put reply-by in the past |
| Hold row (D10 rewrite) | "Hold the rooms for · 5 days" REMOVED. Replaced by read-only rows: per booked stay "Free cancellation until {date}" (from the user's own confirmation) + per planned Viator activity "{n} seats · book when the crew agrees" (no hold is placed at proposal time; the Viator hold is taken after RSVP by the P35 booking flow); no stay booked → row "Stays not booked yet · book here" (affiliate link-out, disclosure) |
| Preview as | PREVIEW AS {name} chips per recipient, open that recipient's version read-only (organiser sees all versions; data-model: org sees all) |
| Send | SEND TO {n} FRIENDS → `send_proposal`; per-recipient avatar stamps as each `proposal_versions` job finishes (job progress on `user:#uid`); partial failure: failed recipients retry 3×, then fall back to shared version with a "Pon wrote the group version for {name}" note |
| States (design in code) | generating, partial failure, offline (queued command, send disabled with reason), plan changed after build (rebuild prompt), no recipients |

### F-085 Personalised versions (AI-15)
- Worker fan-out `ai.proposal_versions` one child per recipient; Sonnet 5 structured output `{slides[], poster, postcard, highlights[{item_id, reason_tag}], savings[{option_id}], lead_item_id}`.
- Inputs via `guide_reader` only: final plan version, recipient's public taste tags + own must-dos, share from `share_calcs` (own row). NEVER: others' budgets, private threads, engagement, dietary detail (flags only with consent).
- All numbers (share, savings deltas) injected by cost engine; LLM references `option_id` only; validator rejects any digit string not in the injected set.
- Poster/postcard images rendered server-side from critter atlas + template (P05 share-image renderer), stored in R2 private keys.
- Unmetered. Eval suite in `packages/ai/evals/proposal/` (persona voice, no leakage, reason-tag accuracy).

### F-086 Story player (3f-2; reused by recap 3m-3…9)
- `apps/mobile/src/ui/story-player/`: 5–6 s slides, progress segments, Ken Burns push-in (Reanimated, `e=lin`), headline words stamp in one at a time, tap = next, hold = pause, swipe down = close, reduced-motion = cross-fade with no push-in.
- Live reactions float up the side from `proposal:{id}` channel (`reaction` events); quick replies (OKAY WOW/6AM??/I'M IN) → `react_proposal`; bottom I'M IN / MAYBE.
- Photo source: licensed destination photography or guide art card fallback (non-code dep).
- API: `<StoryPlayer slides onEvent renderSlide />` headless enough for recap cards; no proposal imports inside `ui/story-player`.

### F-087 Your version (3f-3)
- Picks slide in one by one, reason tags stamp; tap a pick → why sheet (reason_tag + source).
- Share donut + "Skip the Nara day and save $64" toggles re-compute share locally via `packages/cost-engine` (odometer), persisted as `chosen_options` on `set_rsvp`.
- CREW HYPE bar: `hype_aggregates.hype_pct` + public reactions only (replies/reactions the reactor chose to post). Design copy "Maya watched the trailer twice" is a passive signal → REPLACED by public-only copy ("Jordan replied '6AM??' · 3 of 5 reacted") (C28).
- Top chip "ROOMS HELD" → "FREE CANCEL TILL {date}"; timer ticks to the earliest free-cancel deadline or reply-by (never a Viator hold, see F-084).
- I'M IN → 3f-5; ASK PON → 3f-4.

### F-088 Private objection sheet (3f-4; AI-16)
- Sheet rises over dimmed, still-playing trailer. Header "JUST YOU AND PON"; "{organiser} only sees 'maybe'".
- Reasons: THE COST / THE DATES / THE PLAN / SOMETHING ELSE (free text). `submit_private_reason` → SSE route streams persona line then options; options are deterministic (cost engine: shared room, skip day, cheaper stay tier; planner: date shift feasibility), LLM ranks and words them only.
- Toggles re-count share (odometer), button price follows ("I'M IN AT $1,170"). "Rooms held until Sep 30" → "Free cancellation until Sep 30".
- "Still thinking. Ask me on Sunday" → `schedule_proposal_followup` (N-08 at recipient local time).
- Privacy: row in `private_guide_threads` (C3, organiser excluded, not synced, not in `guide_reader` views of others). If crew ≥ 4 the system may write `anonymous_suggestions` ("Someone asked about cost") — never names, never under 4 (C28). Selecting an option that changes shared structure (room share) becomes an unattributed ChangeSet ONLY when crew ≥ 4, via the same SECURITY DEFINER crew-size check as `anonymous_suggestions` (`app.write_anonymous_suggestion`); crews < 4 get personal-overlay options only (F-081), since timing would identify the objector (C28).
- Unmetered.

### F-089 Slide to board (3f-5)
- Scrubbed 6 s single timeline (one shared value 0→1 driving knob, ticket thump, stub tear along perforation, confetti, egg drop into gap, crew rail join, counter flip 4/6→5/6). Knob drag scrubs; release past 85 % completes; below springs back.
- A11y: `accessibilityActions` "Board" performs the same command; reduced motion = static ticket + haptic success.
- Commit: `set_rsvp{in}` (seat cap check C26: 6, 16 while boosted); on `SEAT_CAP_REACHED` show seat sheet (P23/P46 contract) with Boost CTA showing charged price or JOIN WAITLIST.
- Egg grant: event `rsvp.changed{in}` → egg granted (P40 consumes `participant.boarded`; `trip_participants.egg_id` set by P40 handler; this phase emits the event and renders the egg with "{GUIDE}'S EGG HATCHES WHEN YOU LAND").
- Offline: optimistic board animation with pending badge; server reject (cap) reverses with explanation.

### F-090 RSVP tracker + guide suggestions (3f-6; AI-17)
- Segment bar IN / MAYBE / NO REPLY / OUT fills with thump on change (statuses only).
- Rows show only public status lines: sent date, replied text, boarded time, status chip Replied / Boarded / No reply yet. Design lines "Watched the trailer twice"/"Opened it 3 times" REPLACED; no per-person opened/not-opened state anywhere (C28 — opens are passive). Opens exist only as crew-level aggregates (`engagement.summary` counts).
- PON SUGGESTS cards (worker, AI-17 wording over deterministic rules): resend at recipient's local evening hour with a chosen lead item (RESEND → `execute_rsvp_suggestion` schedules resend at `at_local`); anonymised offer ("Someone asked about cost. Offer everyone the cheaper room option?" → `publish_offer`, only crew ≥ 4); suggestion disappears when handled/dismissed.
- Reply-by: N-09 at reply_by − 24 h to unanswered and organiser; at reply_by, proposal locks (`locked_at`), unanswered stay MAYBE, organiser prompted.

### F-091 Dropout re-split & waitlist (3f-7, 4f-1; AI-18)
- Reply intent: free-text replies to proposal notifications/chat classified (Haiku) `{in|maybe|out|question}`; `out` intent shows the sender a confirm card ("Sounds like you're out — tell the crew?") and only its confirm (= `decline_trip`) enqueues `trip.dropout`; only `decline_trip` triggers the job directly.
- Job: room re-optimise (`packages/planner/src/dropout/`), re-split shared costs (cost engine), lottery entries = reminder count changes only (D10), Viator activity seats → ChangeSet op `cancel_supplier_item` executed by the supplier layer's executor (P35) when applied; affiliate stays → "change the booking on {supplier}" link item (we never modify third-party stays).
- 3f-7 UI: avatar slides out of crew row; each change deals in with old value struck; share rolls $1,310→$1,334; "Keep Dev in the chat" toggle (`set_keep_in_chat`); APPLY CHANGES (organiser; C41 default majority-of-affected when money changes → "Ask the crew first" creates Poll(kind=changeset_approval)).
- Waitlist (4f-1): freed seat → `seat_waitlist_offers` to next waitlisted member (never auto-join, C26); offer expires (default 24 h) then moves on; hold copy on 4f-1 rewritten to free-cancel/booking truth.
- Nothing moves until applied.

### Undesigned states to design in code
Empty tracker (just sent), all IN celebration, all OUT → trip back to planning, proposal expired, organiser drops out (ownership transfer prompt → P23 contract), recipient opens outdated version (plan changed banner), web preview hand-off (F-092 is P51), failed version fallback, offline story (cached slides only).

## Architecture & contracts

| Kind | Delta |
|---|---|
| Migration `*_proposals_rsvp_engagement.sql` | tables per data-model §3.5 + `private_guide_threads`, `anonymous_suggestions`; add `rsvp_suggestions(id, proposal_id, kind resend\|offer\|nudge, target_uid?, payload jsonb, status, created_at)` **(doc delta: not in data-model)**; RLS: `proposal_versions` recipient own + organiser all; `engagement_events` no grant to `app_user` select (writes via SECURITY DEFINER `app.record_engagement`); `private_guide_threads` owner only, no `guide_reader`, not in publication; `anonymous_suggestions.source_thread_id` column revoked |
| Publication | add `proposals`, `proposal_versions`, `proposal_reactions`, `hype_aggregates`, `seat_waitlist_offers`, `anonymous_suggestions`, `rsvp_suggestions` to `trip` stream (organiser-only filter for `rsvp_suggestions`) |
| Commands | api-contracts §4.7 all; handlers in `services/api/src/commands/proposal/` |
| HTTP | `POST /v1/proposals/{id}/private/reason` (SSE) |
| Realtime | `proposal:{id}`: `reaction`, `hype_pct`, `rsvp.status`, `offer.published`; organiser `user:#uid` `engagement.summary` = counts only |
| Jobs | `ai.proposal_versions`, `ai.rsvp_intent`, `trip.dropout`, `proposal.suggestions` (**doc delta**: recompute on engagement change, debounce 10 min), cron `proposal.reply_by`, `followup.deliver` |
| Push | N-07 (per recipient, guide voice), N-08, N-09 (ALWAYS) |
| AI routes | `proposal.version` (Sonnet), `proposal.objection` (Haiku, options injected), `proposal.suggestion_copy` (Haiku), `rsvp.intent` (Haiku) |
| ChangeSet ops | `release_room_bed`, `resplit_component`, `withdraw_reminder_entry`, `cancel_supplier_item` (executor P35), `remove_participant_from_item` — in `packages/domain/src/proposal/ops.ts`, registered into planner ChangeSet op registry |

## Tasks

### T1 — Schema, RLS backstop, permission tests
- Goal: proposal tables with C28/C3 enforced in DB.
- Files: `packages/db/src/schema/proposals.ts`, `packages/db/migrations/<ts>_proposals_rsvp_engagement.sql`, `packages/db/test/permissions/{proposals,proposal-versions,engagement-events,private-guide-threads,anonymous-suggestions}.test.ts`
- Steps: 1. Drizzle schema + SQL (roles, RLS, SECURITY DEFINER writers `app.record_engagement`, `app.write_anonymous_suggestion` with crew ≥ 4 check). 2. Publication entries + `infra/powersync/streams/proposal.yaml`. 3. Testcontainers tests per role (`app_user` peer, organiser, recipient, `guide_reader`, `powersync_repl`).
- Tests: `pnpm --filter @cp/db test -- permissions/proposal`
- Done when: organiser cannot select `engagement_events` rows or another's `private_guide_threads`; peer cannot read another's `proposal_versions`; `guide_reader` has no access to private threads; anonymous suggestion insert AND unattributed objection ChangeSet fail for crew of 3.
- Status: done — dc6a2f55

### T2 — Domain contracts + proposal/RSVP command handlers
- Goal: all §4.7 commands with policy, idempotency, seat cap.
- Files: `packages/domain/src/proposal/{schemas,events,ops,reply-by}.ts`, `services/api/src/commands/proposal/*.ts`
- Steps: 1. zod payloads + events. 2. `reply-by.ts` default + validation (C43). 3. Handlers: create/send/set_rsvp (seat cap via entitlements, waitlist on cap)/react/record_open (via definer fn)/schedule_followup/execute/dismiss suggestion/publish_offer/decline_trip/set_keep_in_chat. 4. rt_outbox rows for `proposal:{id}`.
- Tests: `pnpm --filter @cp/api test -- commands/proposal`
- Done when: tests cover replay of same op_id (no dupes), 7th `in` on unboosted trip returns `SEAT_CAP_REACHED` and waitlists, reply_by after free-cancel deadline rejected, reply-by default unaffected by a 20-min Viator hold fixture (never in the past), `record_proposal_open` never publishes per-user payload.
- Status: done — 857e3e10 (IN past the cap is kept as a waitlist place with result code `SEAT_CAP_REACHED`; `choose_private_option` and `resolve_dropout` added as doc deltas)

### T3 — Personalised version fan-out (AI-15) + poster/postcard render
- Goal: real per-recipient versions via worker.
- Files: `packages/ai/src/routes/proposal/{version.prompt.ts,version.schema.ts,validate.ts}`, `packages/ai/evals/proposal/version.yaml`, `services/worker/src/jobs/proposal/versions.ts`
- Steps: 1. Context from `llm.*` views + injected cost numbers. 2. Structured output + number/id validator. 3. Poster/postcard via P05 share renderer → R2. 4. Progress to `user:#uid`; retry 3× then shared fallback.
- Tests: `pnpm --filter @cp/ai eval -- proposal`; `pnpm --filter @cp/worker test -- proposal/versions`
- Done when: eval passes leakage cases (another member's budget/objection in DB never appears), invented numbers rejected, fallback path tested.
- Status: done — 6f462b4d (poster/postcard drawn in the worker with `@cp/critter-art` node renderer; fonts shipped in the worker image)

### T4 — Builder screen (3f-1)
- Goal: builder with format morph, toggles, reply-by, truthful stay/activity rows, preview-as, send progress.
- Files: `apps/mobile/src/app/(trip)/proposal/build.tsx`, `apps/mobile/src/features/proposal/builder/**`, `packages/i18n/locales/en/proposal/builder.po`, `e2e/proposal/build-and-send.yaml`
- Steps: 1. Queries over synced rows (bookings, Viator cart). 2. Format morph. 3. Reply-by picker with validation. 4. Send with avatar stamp per job step.
- Tests: `pnpm --filter @cp/mobile test -- features/proposal/builder`; `maestro test e2e/proposal/build-and-send.yaml`
- Done when: no "hold the rooms" copy anywhere (grep test on catalog), send shows per-recipient progress, offline send queues.
- Status: done — 57cbe8e72

### T5 — Story player + trailer (3f-2)
- Goal: reusable story player; proposal trailer with live reactions.
- Files: `apps/mobile/src/ui/story-player/**`, `apps/mobile/src/app/(trip)/proposal/[id]/trailer.tsx`, `apps/mobile/src/features/proposal/trailer/**`
- Steps: 1. Headless timeline (Reanimated shared values), tap/hold/swipe. 2. Word-stamp headline, Ken Burns. 3. Centrifugo subscription + floating reactions. 4. `record_proposal_open` on view; reduced motion.
- Tests: `pnpm --filter @cp/mobile test -- ui/story-player features/proposal/trailer`
- Done when: RNTL tests for pause/advance/reduced-motion; player has no import from `features/`.
- Status: done — 1f2d5a0b5 (the headline arrives as one block rather than word by word, the backdrop is the guide's art card until destination photos exist, and reactions arrive through sync; logged in undesigned-states)

### T6 — Your version (3f-3) + private objection sheet (3f-4)
- Goal: personalised page, local share recompute, private objection flow.
- Files: `apps/mobile/src/app/(trip)/proposal/[id]/index.tsx`, `apps/mobile/src/features/proposal/{your-version,objection}/**`, `services/api/src/routes/proposals.ts`, `packages/ai/src/routes/proposal/objection.*.ts`, `services/api/src/commands/proposal/submit-private-reason.ts` (extend), `e2e/proposal/objection-private.yaml`
- Steps: 1. Picks/why sheet/donut/odometer toggles. 2. Hype bar public-only. 3. SSE objection route: deterministic options (cost engine/planner) + Haiku wording. 4. Follow-up scheduling.
- Tests: `pnpm --filter @cp/api test -- routes/proposals`; `maestro test e2e/proposal/objection-private.yaml`
- Done when: organiser device in Maestro run sees only MAYBE; objection option totals equal cost-engine output; no per-person passive copy in catalog.
- Status: done — 857e3e10 (server), 57cbe8e72 (app: your version, private objection sheet, proposal card in crew chat)

### T7 — Slide to board (3f-5)
- Goal: scrubbed 6 s choreography committing RSVP.
- Files: `apps/mobile/src/features/proposal/board/**`, `apps/mobile/src/app/(trip)/proposal/[id]/board.tsx`, `e2e/proposal/board.yaml`
- Steps: 1. Single progress value timeline. 2. Gesture Handler scrub + completion threshold. 3. a11y action; haptics via feedback bus. 4. Cap error → seat sheet; offline pending.
- Tests: `pnpm --filter @cp/mobile test -- features/proposal/board`; `maestro test e2e/proposal/board.yaml`
- Done when: a11y action boards without gesture; cap rejection reverses UI with message; CI perf budget (Reanimated frame-drop count on the Maestro run ≤ budget) passes; real-device 60 fps check moves to P54 launch checks.
- Status: done — 57cbe8e72 (the stub tear and confetti are simplified to a thump and the egg drop; logged in undesigned-states)

### T8 — RSVP tracker + suggestions (3f-6, AI-17) + reply-by cron
- Goal: organiser tracker and handled suggestions.
- Files: `apps/mobile/src/features/proposal/tracker/**`, `apps/mobile/src/app/(trip)/proposal/[id]/tracker.tsx`, `services/worker/src/jobs/proposal/{suggestions,reply-by,followup}.ts`, `packages/ai/src/routes/proposal/suggestion.*.ts`
- Steps: 1. Rules: resend hour, lead item, anonymised offer (crew ≥ 4). 2. Haiku wording. 3. N-08/N-09 via notify router. 4. Lock at reply_by.
- Tests: `pnpm --filter @cp/worker test -- proposal`
- Done when: suggestion copy never contains a member name tied to a private reason; tracker catalog grep for "opened"/"not opened" = 0; reply-by cron idempotent per proposal.
- Status: done — 244ae5c7 (server), 57cbe8e72 (tracker, suggestions and the organiser's `lock_proposal`, which confirms the trip)

### T9 — Dropout re-split engine + intent (AI-18)
- Goal: deterministic ChangeSet on dropout.
- Files: `packages/planner/src/dropout/{rooms,resplit,index}.ts`, `services/worker/src/jobs/proposal/{dropout,rsvp-intent}.ts`, `packages/ai/src/routes/proposal/intent.*.ts`
- Steps: 1. Room re-optimiser (beds, prior pairings). 2. Re-split via cost engine. 3. Ops incl. `cancel_supplier_item`. 4. RSVP intent as a Jev Choice decision route through P13 `decide()` (Haiku twin; low confidence → confirm card) + narrative (Haiku).
- Tests: `pnpm --filter @cp/planner test -- dropout`; `pnpm --filter @cp/worker test -- proposal/dropout`
- Done when: property test: sum of shares = total after dropout; job idempotent on `(trip_id, uid)`; an `out` intent alone never enqueues `trip.dropout` (confirm card required).
- Status: done — ec1ce2d3 (the re-split is kept on `trip_dropouts` for the organiser to resolve with `resolve_dropout`, not as a `change_sets` row: its cost/booking ops cannot be replayed by `apply_changeset`)

### T10 — Dropout screen (3f-7) + waitlist offer (4f-1)
- Goal: apply/ask-crew UI and seat offer.
- Files: `apps/mobile/src/features/proposal/dropout/**`, `apps/mobile/src/app/(trip)/proposal/[id]/dropout.tsx`, `services/worker/src/jobs/proposal/waitlist.ts`, `e2e/proposal/dropout-waitlist.yaml`
- Steps: 1. Struck-through change list, rolling share, keep-in-chat toggle. 2. APPLY / Ask the crew first (C41 poll). 3. Waitlist offer lifecycle + expiry.
- Tests: `maestro test e2e/proposal/dropout-waitlist.yaml`; `pnpm --filter @cp/worker test -- proposal/waitlist`
- Done when: freed seat creates exactly one active offer; expired offer moves to next; nothing changes before APPLY.
- Status: done — 0c3df1b0 (`proposal.waitlist` job), 1f2d5a0b5 (app: the dropout change list with APPLY CHANGES, and the crowd sheet from the tracker; "Ask the crew first" and Boost are logged in undesigned-states)

## Phase acceptance criteria
- [ ] All T1–T10 done-when checks pass in CI.
- [ ] Permission tests prove C28: organiser/peers cannot read engagement, private threads, or per-person opens; tracker shows no per-person opened state.
- [ ] No stay-hold copy in `packages/i18n/locales/en/proposal/**` (grep "hold the rooms", "rooms held" = 0).
- [ ] Every number on 3f-1/3f-3/3f-4/3f-7 comes from cost engine (validator tests).
- [ ] Maestro flows `e2e/proposal/*.yaml` pass on iOS and Android.
- [ ] promptfoo proposal suite green in `ai-evals` workflow.

## Risks & rollback
| Risk | Mitigation / rollback |
|---|---|
| Fan-out cost/latency for 16 recipients | parallel children, Sonnet with cached prefix; fallback to shared version |
| Privacy leak via LLM context | `guide_reader` views + eval leakage cases; server flag `proposal.personal_versions` disables personal mode |
| Seat race on concurrent boarding | seat cap enforced in `set_rsvp` transaction with row lock; waitlist fallback |
| Choreography jank on low-end Android | reduced-complexity variant (no confetti particles) under perf flag |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| Destination photo licence (trailer) | guide art cards (P05) as slide backgrounds |
| Viator approval (P35) | activity rows show affiliate link-out; stays show free-cancel rows only |
| Counsel review of anonymised-offer copy | ship with "Someone asked…" wording, crew ≥ 4 threshold |

## Open questions
1. Resend-hour suggestion uses the recipient's passive open hours — acceptable under C28 if copy never states behaviour? Default: yes, copy "Resend at 21:00 their time?" without mentioning opens.
2. Waitlist offer expiry length? Default 24 h (server config `waitlist.offer_ttl_h`).
3. doc delta: `rsvp_suggestions` table and `proposal.suggestions` queue missing from data-model / api-contracts-async.
4. Anonymous-suggestion threshold crew ≥ 4 still founder-pending (data-model-sync §open 4). Default 4.
5. plan.md delta: wave 14 → 15; depends_on adds 34 (`bookings.free_cancel_until`), 35 (Viator cart, `cancel_supplier_item` executor), 46 (Boost CTA on seat sheet).
