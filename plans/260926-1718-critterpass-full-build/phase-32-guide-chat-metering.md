---
phase: 32
title: Guide chat, guide in crew chat, metering, phrase cards
status: pending
depends_on: [12, 13, 24, 29]
wave: 16
features: [F-093, F-094, F-097, F-098, F-099, F-160]
screens: [3j-1, 3g-1, 4c-1, 4b-1, 3h-3, 3k-6, 3c-8, 3i-3]
tasks: 10
owns:
  - packages/domain/src/guide/**
  - packages/db/src/schema/guide-chat.ts
  - packages/db/migrations/*_guide_threads_and_queued_questions.sql
  - packages/db/test/permissions/{guide-threads,guide-messages,queued-guide-questions,phrase-progress}.test.ts
  - packages/ai/src/routes/guide/**
  - packages/ai/evals/guide/**
  - services/api/src/commands/guide/**
  - services/api/src/routes/guide.ts
  - services/worker/src/jobs/guide/**
  - apps/mobile/src/app/(modal)/guide/**
  - apps/mobile/src/features/guide/{chat,crew-mention,meter,phrases,dietary,queued}/**
  - packages/i18n/locales/en/guide/**
  - e2e/guide/**
---
# Phase 32 — Guide chat, guide in crew chat, metering, phrase cards

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D5 (tiers, guide never writes), D8 (30/day, 00:00 device tz), D10 (supplier content never to LLM; CALL A CAR = Grab deep link), C3, C8 (Boost unlimited, "UNLIMITED PON"), C12, C27 (context guide), C41, C47 (queued question), C48 |
| `docs/system-architecture.md` | §4.6 AI, §5 authz, §10 observability |
| `docs/data-model.md` | §3.6 chat + guide threads, `phrase_cards`; §3.14 `usage_counters`, `fair_use_counters`; `dietary_profiles`, `participant_dietary_flags`, `consents` |
| `docs/data-model-sync-and-privacy.md` | §1 C3 split tables, §2 `llm.user_prefs`, §4 `guide_chat` stream, `local_private` |
| `docs/api-contracts.md` | §4.4 chat `send_message`, §4.8 guide, §5.3 guide turns/mentions routes, §6 tool registry (`phrase_card`, `crew_profiles`, `create_changeset`, `create_vote_from_guide`) |
| `docs/api-contracts-async.md` | `guide_thread:{id}`, `crew_chat:{crew_id}` `guide.token`, `user:#uid` `usage.changed`; queues `ai.guide_mention`, `ai.queued_answer`; N-36 |
| Phases | P12 quota fn `app.consume_quota`, P13 gateway/meter/SSE, P24 crew chat, P29 plan cards/ChangeSets |
| Reports | `design-analysis-260926-1143-bookings-money-guide-report.md` (3j-*, 4b-1); `researcher-260926-1143-ai-guide-report.md` §4.1–4.4, §4.9; master §2 F-093…F-099, F-160; §8 AI-19, AI-20, AI-40; §13 R13 |
| Renders | `docs/design-renders/screens/3j-1_Guide_chat.png`, `3g-1_Crew_chat.png`, `4b-1_Out_of_questions.png`, `3h-3_Getting_around.png`, `3k-6_*.png`, `3c-8_*.png` |

## Overview

Goal: the guide sheet (group and private threads) streams persona replies with plan cards the user can PROPOSE TO GROUP or apply JUST ME; the guide answers @mentions and posts proactive offers in crew chat; phrase cards play pre-rendered audio offline; dietary/accessibility profiles are captured with consent; free users get 30 answers/day with the 4b-1 limit card and a queued question answered at reset.

Done when: on a local stack a free user asks 30 questions (31st shows 4b-1, queue it, reset job answers it at simulated 00:00 device tz with a passive push), a Pass+ crewmate makes crew-chat mentions unmetered, a guide plan card becomes a crew vote, a phrase card plays offline in airplane mode, and dietary flags reach the guide only after consent.

## Requirements

### F-093 Guide chat (3j-1)
| Item | Behaviour |
|---|---|
| Sheet | rises over current screen with spring; header guide name + mode line; GROUP / JUST ME segmented. GROUP = crew-visible thread (`guide_thread:{id}`, all trip members see it), JUST ME = private `guide_threads` row (owner only) |
| Context guide | C27: in-trip trip > next confirmed > proposal/draft; one guide per trip thread; no trip → home guide |
| Streaming | persona text types in (`tg-type`); plan card deals swaps one at a time (from `proposal{changeset_id}` SSE); times/prices from tools only |
| Plan card actions | PROPOSE TO GROUP → `create_vote_from_guide` (Poll kind=changeset_approval, C41) shown in crew chat; JUST ME → applies personal-only ChangeSet ops (own day) via `apply_changeset` with UNDO |
| Holds on cards | "4 seats held for 20 min" only for real Viator holds (D10); otherwise "{n} seats open · book in the plan" |
| Quick actions | server flags `guide.quick_actions.{call_car,translate_menu,pharmacy}` (default hidden); CALL A CAR → Grab Farefeed quote + deep link (P35 enables); TRANSLATE A MENU → camera (P42 enables); PHARMACY → Help hub (P38 enables). Hidden state = chip absent, row reflows |
| Composer | "+" attach (photo, place, booking), "Ask, or hold to talk" (hold → voice, P42) |
| Meter chip | `usage{used, limit, reset_at}`; hidden when unmetered; "UNLIMITED PON" chip on boosted trips (C8) |
| Rating | long-press answer → `rate_guide_answer` (Langfuse score) |
| States (design in code) | empty thread (guide greeting + 3 suggested prompts), thinking, streaming error + retry (quota released), offline (queued text, "I'll answer when you're back online", not metered until sent), refusal, tool timeout filler line, moderation block, message actions (copy, rate, report) |

### F-094 Guide in crew chat (3g-1, 4c-1)
- `@{guide}` mention in `send_message` → `ai.guide_mention` → streamed reply fan-out `guide.token` on `crew_chat:{crew_id}`; typing dots are the only bouncing element.
- Untrusted input: crew-chat text, mentions and vendor replies (P35) enter prompts inside delimited untrusted blocks; a mention turn may call only read and propose-only tools (`create_changeset`, `create_vote_from_guide`, `phrase_card`), each authorised as the asker (never another member or `app_system`).
- Metering: asker's meter unless any member has Pass+ or trip boosted (then unmetered, silent fair-use cap); limit reached → inline hint "Maya has Pass+. Ask in the crew chat" per 4b-1 rule.
- Proactive posts (AI-20): offer cards (GuideOffer, C3) e.g. "Karsa Spa has three slots at 14:00. Tap in and I'll book it and split it" — availability facts (slot count, time, price) are filled by a deterministic template from `bookable_activity` ids/numbers; Viator/supplier text never enters the prompt (D10); I'M IN is explicit confirm per member; bookings only via Viator real availability or link-out; splits via P33 `add_expense` confirm. Rate: ≤ N proactive posts/day/crew (config), respects `set_chat_mode`.
- Proactive posts unmetered (system work).

### F-097 Phrase cards + TTS (3h-3, 3k-6)
- Card: local phrase, gloss, play button; tap play reads it aloud (pre-rendered audio in guide voice / ElevenLabs v3 for languages Flash lacks, e.g. Icelandic); SHOW mode = full-screen, large type, landscape-friendly, brightness boost, for showing to driver/staff.
- Sources: curated `phrase_cards` (P18 content) first; custom card (`request_phrase_card` with address) → worker TTS job → R2 → offline cache.
- Offline: trip offline bundle includes phrase audio; player falls back to on-device TTS if audio missing (labelled).
- Used by Help (P38) and Getting around (P36, P35 T9) as `<PhraseCard>` exported from `features/guide/phrases`; P32 also registers it into the `PhraseCardSlot` registry that P35 T9 renders.

### F-098 Dietary & accessibility profiles (undesigned capture UI)
- Design in code: capture screen (diet, allergies chips + free text, avoid list, spice level, accessibility notes), consent sheet "Share flags with your crew and guide?" (`consents.purpose=dietary_visibility`), visibility toggle; entry points: 3c-8 setup, guide sheet "+", You settings (link only; P45 owns settings list).
- Detail is C3 (owner only, `local_private` offline); only derived flags (`participant_dietary_flags`) reach crew/guide after consent; revoke deletes flags.
- Command `set_dietary_profile` (P22) carries `avoid[]`, `spice`, `accessibility_notes`, `visibility` — the fields are defined in P22's schema (plan.md delta to P22); P32 does not edit P22 files and builds UI only (**doc delta**).

### F-099 Queued question at reset (4b-1, C47)
- ASK AT MIDNIGHT → `queue_guide_question` (only when `QUOTA_EXHAUSTED`); stored per `answer_after` = next 00:00 device tz.
- Cron job at reset answers (AI-40, counts toward the new day), inserts guide message, N-36 passive push (no sound), resurfaced in morning briefing if unread (P36 reads `queued_guide_questions.status`).
- User can cancel before reset; one queued question per user per day.

### F-160 Guide metering + limit card (4b-1)
- Atomic counter: P13 `meter.reserve/commit/release` over P12 `app.consume_quota`; free limit `ops_config guide.free_daily_limit` = 30; period key = device tz date at event time (tz from request header; server clamps to max(previous period key), so going back never grants extra; the stored tz may change at most once per 24 h per user — later changes use the stored tz — bounding a forward jump to UTC+14 to one early reset per day of travel, accepted).
- Exemptions: trip planning jobs, votes, proposals, system/proactive posts, settings samples (C12); Pass+ and boosted-trip contexts unmetered with silent fair-use cap.
- 4b-1 card: meter fills as last answer types, 30th segment flicks yellow, guide trails off mid-sentence, card slides up: "30 OF 30 TODAY · RESETS 00:00", GET PASS+ (P46 paywall entry `guide_limit`), ASK AT MIDNIGHT, crewmate-with-Pass+ hint row (from `crew_pass_holders[]`, respects badge opt-out), footer "Pon is back in 7h 12m" countdown. Nothing blocked outside this chat.
- Voice and camera count as questions (C12) — P42 uses the same meter.

## Architecture & contracts

| Kind | Delta |
|---|---|
| Migration `*_guide_threads_and_queued_questions.sql` | `guide_threads`, `guide_messages`, `queued_guide_questions`, `phrase_progress` (used by P42) per data-model §3.6; add `guide_threads.mode (private\|group)` + `crew_id` for group threads (**doc delta**: data-model lists mode private only); RLS: private = owner; group = trip members; `guide_reader` reads own thread only via `llm` view |
| Publication | `guide_chat` stream (own threads, 90 d messages), group threads via `trip` stream |
| Commands | `queue_guide_question`, `rate_guide_answer`, `request_phrase_card`, `cancel_queued_question` (**doc delta**) |
| HTTP | `POST /v1/guide/threads/{id}/turns` (SSE), `POST /v1/guide/crew/{crew_id}/mentions` (SSE + fan-out), `GET /v1/me/private/dietary` |
| Realtime | `guide_thread:{id}` (group), `crew_chat:{crew_id}` `guide.token`, `user:#uid` `usage.changed` |
| Jobs | `ai.guide_mention`, `ai.queued_answer` (cron per tz bucket every 15 min), `phrase.tts` (**doc delta**), `guide.proactive` (**doc delta**; triggered by plan/weather/availability events, rate-limited) |
| Push | N-36 passive |
| AI routes | `guide.chat` (Haiku; Sonnet escalation on tool-heavy turns per P13 routing), `guide.mention`, `guide.proactive`, `guide.queued`; every user turn is screened by P13 `checkCompliance` surface `guide_input` inside `runTurn` (never blocks a question); proactive posts gate on `guide.chime_in_classifier` (Jev decision route) before spending the chattiness budget |

## Tasks

### T1 — Guide thread schema + permission tests
- Goal: threads/messages/queue tables with RLS.
- Files: `packages/db/src/schema/guide-chat.ts`, `packages/db/migrations/<ts>_guide_threads_and_queued_questions.sql`, `packages/db/test/permissions/{guide-threads,guide-messages,queued-guide-questions,phrase-progress}.test.ts`
- Steps: 1. Tables + group mode. 2. RLS + publication. 3. Testcontainers tests.
- Tests: `pnpm --filter @cp/db test -- permissions/guide`
- Done when: non-owner cannot read private thread; non-member cannot read group thread; `guide_reader` sees only the calling user's thread.

### T2 — Guide turn route + meter integration + tools wiring
- Goal: SSE turn endpoint with quota reserve/commit/release and ChangeSet output.
- Files: `services/api/src/routes/guide.ts`, `packages/ai/src/routes/guide/{chat.prompt.ts,chat.tools.ts}`, `packages/domain/src/guide/{schemas,meter-rules}.ts`, `packages/ai/evals/guide/chat.yaml`
- Steps: 1. Route validation + context guide (C27). 2. meter exemptions + tz clamp. 3. Tool set per api-contracts §6 caller C. 4. `usage` event + `QUOTA_EXHAUSTED` error.
- Tests: `pnpm --filter @cp/api test -- routes/guide`; `pnpm --filter @cp/ai eval -- guide`
- Done when: 31 concurrent requests on 30-limit produce exactly 30 answers; failed turn releases quota; tz change test cannot exceed 30 in a day; a second tz change within 24 h is ignored.

### T3 — Guide sheet UI (3j-1)
- Goal: sheet, modes, streaming, plan cards, quick actions, states.
- Files: `apps/mobile/src/app/(modal)/guide/[threadId].tsx`, `apps/mobile/src/features/guide/chat/**`, `packages/i18n/locales/en/guide/chat.po`
- Steps: 1. SSE client + token renderer. 2. Plan card with dealt swaps, PROPOSE TO GROUP / JUST ME + UNDO. 3. Quick actions behind supplier/feature flags. 4. States list above.
- Tests: `pnpm --filter @cp/mobile test -- features/guide/chat`; `maestro test e2e/guide/chat-propose-to-group.yaml`
- Done when: PROPOSE TO GROUP produces a poll visible in crew chat on second device; offline question queues and sends on reconnect.

### T4 — Guide in crew chat (mentions + proactive)
- Goal: @mention replies and offer cards.
- Files: `services/worker/src/jobs/guide/{mention,proactive}.ts`, `packages/ai/src/routes/guide/{mention,proactive}.*.ts`, `apps/mobile/src/features/guide/crew-mention/**`
- Steps: 1. Mention job streaming fan-out. 2. Metering rule (any Pass+/boost → unmetered). 3. Proactive trigger + rate limit + chat mode respect. 4. Offer card explicit confirm per member.
- Tests: `pnpm --filter @cp/worker test -- guide`; `maestro test e2e/guide/crew-mention.yaml`
- Done when: mention by free user with Pass+ crewmate does not increment usage; proactive cap enforced; offer never books without confirm; mention turn tool list is propose-only (test); prompt-assembly test shows no supplier text and availability numbers come from the template.

### T5 — Meter chip + 4b-1 limit card
- Goal: limit UX exactly as designed.
- Files: `apps/mobile/src/features/guide/meter/**`, `packages/i18n/locales/en/guide/meter.po`
- Steps: 1. Segmented meter from synced `usage_counters`. 2. 30th segment flick + trail-off + card slide. 3. Crewmate hint list, countdown from `reset_at`, GET PASS+ entry.
- Tests: `pnpm --filter @cp/mobile test -- features/guide/meter`
- Done when: RNTL snapshot covers free/at-limit/unlimited/boosted; countdown derived from `reset_at` only.

### T6 — Queued question at reset (F-099)
- Goal: queue, answer at reset, passive push.
- Files: `services/api/src/commands/guide/{queue-guide-question,cancel-queued-question}.ts`, `services/worker/src/jobs/guide/queued-answer.ts`, `apps/mobile/src/features/guide/queued/**`
- Steps: 1. Commands with guard. 2. Cron per tz bucket. 3. AI-40 answer counted to new day. 4. N-36 passive; status for briefing.
- Tests: `pnpm --filter @cp/worker test -- guide/queued-answer`
- Done when: fake-clock test answers at 00:00 in Asia/Saigon and not at 00:00 UTC; second queue same day rejected.

### T7 — Phrase cards + TTS pipeline
- Goal: playable, showable, offline phrase cards.
- Files: `apps/mobile/src/features/guide/phrases/**`, `services/api/src/commands/guide/request-phrase-card.ts`, `services/worker/src/jobs/guide/phrase-tts.ts`
- Steps: 1. `<PhraseCard>` with play/show mode. 2. TTS job (ElevenLabs Flash/v3 by language, per-guide voice) → R2. 3. Offline bundle inclusion + on-device TTS fallback.
- Tests: `pnpm --filter @cp/worker test -- guide/phrase-tts`; `maestro test e2e/guide/phrase-offline.yaml`
- Done when: airplane-mode Maestro flow plays cached audio; custom address card produced within job.

### T8 — Dietary & accessibility capture + consent
- Goal: undesigned capture flow built with design system.
- Files: `apps/mobile/src/features/guide/dietary/**`, `apps/mobile/src/app/(modal)/guide/dietary.tsx`, `packages/i18n/locales/en/guide/dietary.po`
- Steps: 1. Form + chips + free text. 2. Consent sheet + revoke. 3. Local-private storage; flags derivation check.
- Tests: `pnpm --filter @cp/mobile test -- features/guide/dietary`; `pnpm --filter @cp/db test -- permissions/dietary` (reuse P27 tests, add consent revoke case)
- Done when: without consent `crew_profiles` tool returns no flags; revoke removes flags row.

### T9 — Guide chat evals + cost dashboard wiring
- Goal: regression gate for chat/mention/queued prompts.
- Files: `packages/ai/evals/guide/{chat,mention,proactive,queued}.yaml`
- Steps: 1. Cases: numbers only from tools, no supplier text, persona, refusal, dietary privacy, prompt injection in mentions / proactive triggers / vendor replies (no out-of-policy tool call, no leak). 2. Langfuse cost per trip tags.
- Tests: `pnpm --filter @cp/ai eval -- guide`
- Done when: suite green and wired into `ai-evals` workflow.

### T10 — Web search in guide answers
- Goal: the guide answers fresh questions (what's on this week, holiday hours, ferry or metro strikes) with cited web results (D23).
- Files: guide chat routing and tool wiring (owned guide chat files), eval cases under the chat suite, tests.
- Steps: 1. Enable the gateway's `web_search` tool (phase 13 T13) on guide chat routes; answers attribute each web fact to its source link, rendered as source chips. 2. Searches count toward the 30/day meter (D8) and the fair-use caps. 3. In crew chat the guide searches only when @mentioned, never in proactive posts. 4. Web numbers are cite-only: never in plan changes or costs (D5). 5. Queries pass the privacy screen from phase 13 T13.
- Tests: chat eval cases for fresh-fact questions (EN and VI) with recorded search fixtures; a crew-chat test proves no search without an @mention; a meter test.
- Done when: fresh-fact questions get answers citing their sources, crew chat searches only on @mention, and searches are metered.

## Phase acceptance criteria
- [ ] Concurrency test: exactly 30 metered answers/day on free tier.
- [ ] Mention unmetered when a crewmate has Pass+ or trip boosted; fair-use cap row increments.
- [ ] PROPOSE TO GROUP → vote in crew chat (Maestro, 2 devices).
- [ ] Queued question answered at device-tz midnight with passive push.
- [ ] Phrase card plays offline.
- [ ] Dietary detail never leaves owner; flags only after consent (permission tests).
- [ ] Guide evals green.

## Risks & rollback
| Risk | Mitigation |
|---|---|
| Cost overrun (R13) | Haiku default, caching, fair-use caps, `guide.free_daily_limit` server-configurable |
| Proactive spam | per-crew cap + chat mode + kill switch flag `guide.proactive` |
| Stream drops on mobile networks | resume via `guide_messages` sync; quota released on failure |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| Owned guide voices (ElevenLabs) | pre-rendered with stock voice per guide, flagged for replacement |
| Grab Farefeed (P35) | CALL A CAR hidden via supplier flag |
| Curated phrase content (P18) | custom TTS cards only |

## Open questions
1. Group guide thread visibility: all trip members or crew? Default trip participants (RSVP ≠ out).
2. Proactive cap per crew per day? Default 3.
3. doc delta: `guide_threads.mode group`, `cancel_queued_question`, `phrase.tts` and `guide.proactive` queues, `set_dietary_profile` extra fields.
