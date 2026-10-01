---
phase: 41
title: Crew quests, XP, special stickers
status: done
depends_on: [13, 33, 40]
wave: 19
features: [F-129, F-130]
screens: [3l-7, 3k-1, 3l-2]  # 3i-5 Settled Tokek grant/reveal built by P33; shelf only here
tasks: 7
owns:
  - packages/domain/src/quests/**
  - packages/db/src/schema/quests.ts
  - packages/db/migrations/<ts>_quests_xp.sql
  - packages/db/test/permissions/{quests,quest-signups,quest-progress,xp-ledger}.test.ts
  - packages/ai/src/routes/quests/**
  - packages/ai/evals/quests/**
  - services/api/src/commands/quests/**
  - services/api/test/quests/**
  - services/worker/src/jobs/quests/** (except templates/phrase-practice.ts from P42 and templates/photos.ts from P44)
  - services/worker/src/jobs/rewards/handlers/{xp,crew-level,settle-xp}.ts
  - services/worker/test/quests/**
  - apps/mobile/src/app/(trip)/quests/**
  - apps/mobile/src/features/critters/{quests,stickers}/**
  - packages/i18n/locales/en/quests/**
  - e2e/critters/quests*.yaml
---
# Phase 41 — Crew quests, XP, special stickers

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D5 (Haiku for quests; guide never writes directly), D8, C38 (sticker shelf outside dex, never bought; Settled Tokek + crew-level stickers at launch), C25 (visits = POI check-ins, TTL) |
| `docs/data-model.md` | §3.9 `quests`, `quest_signups`, `quest_progress`, `xp_ledger`, `stickers` (P40), `visits` (P20); §3.8 ledger (P33) |
| `docs/api-contracts.md` | §4.13 `signup_quest`, `grant_quest_reward`; §4.8 `record_phrase_practice` (P42 emits `phrase.practised`); AI tool rules §6 |
| `docs/api-contracts-async.md` | `trip_quests:{trip_id}`; queues `quest.evaluate`, `quests.generate` (~04:00 local), `reward.fanout` (P40 registry); N-17, N-31 |
| Phases | P13 LLM gateway/tool runner/Langfuse/promptfoo; P20 visits; P33 expenses + settle events; P36 trip hub tiles; P40 stickers table, reward registry, befriend events; P42 phrase practice |
| Reports | `design-analysis-260926-1143-critters-after-report.md` §2 3l-7, §4 Quest/XP; `researcher-260926-1143-ai-guide-report.md` quest generation; master §2 F-129/F-130, AI-32, C38, §11 row 24 |
| Renders | `docs/design-renders/screens/3l-7_Crew_quests.png`, `3k-1_*.png` (QUESTS tile), `3i-5_Settle_up.png`, `3l-2_Your_pass.png` |

## Overview

Goal: each trip morning the guide writes crew quests from the actual plan, but only from verifiable templates (POI visits, expenses, photos, phrases, co-presence, critters) so progress is counted by code, never by the model. Completing a quest grants XP to the crew; levels unlock crew stickers; rewards reveal on every phone at the same moment. Special stickers (Settled Tokek, crew-level) live on a shelf outside the dex.
Done when: a seeded trip day generates validated quests at 04:00 local, events advance pips live across two devices, completion writes one `xp_ledger` row per grant and reveals simultaneously, and the Settled Tokek appears for every member when the crew settles up.

## Requirements

### F-129 Crew quests + XP/level (3l-7, 3k-1)
| Item | Behaviour |
|---|---|
| Generation | `quests.generate` per `in_trip` trip at ~04:00 destination-local: AI-32 (Haiku 4.5) receives day plan, balances band, phrase progress, visit history (consented), template catalogue; returns `[{template_id, params, title, desc, reward}]`; code validator checks params resolve (POI in plan, category exists, target within template bounds, reward within XP table); invalid items dropped, fallback deterministic quests fill to 3; publish + N-31 |
| Templates (verifiable) | Template registry (`registerQuestTemplate({id, schema, bounds, consumes: event[], match})`). This phase registers and tests only templates whose events exist by wave 16: `visit_poi`, `visit_any_of`, `log_expenses{category?, n}`, `befriend{n, set?}`, `copresence{poi, by_time}`, `settle_by{time}`, `early_start{plan_item}` (visit before time). Later phases register their own: `phrase_practice{n, language}` by P42 (`phrase.practised`), `photos{n, place?}` by P44 (`photo.added`); the generator's template enum = registry contents at run time |
| Signup | optional per quest (`signup_quest`); crew quests default all `in` participants |
| Progress | `quest.evaluate` consumes the events declared by registered templates (here: `visit.recorded`, `expense.created`, `critter.befriended`, P33 `reward.granted{kind: settled}`, `copresence.completed`; P42/P44 add theirs); `quest_progress.source_event_ids` for audit; pips fill with spring |
| Completion | `grant_quest_reward{quest_id, uids[]}` S → `xp_ledger` (crew + member rows), `quest.completed`, `xp.granted`; N-17 |
| Simultaneous reveal | `trip_quests` event `reward{reveal_at}` with `reveal_at = server_now + 1.5 s`; clients sync to server clock offset (P10) and spin reward sticker at `reveal_at`; late openers see static state |
| XP / level | crew XP = sum crew rows; level curve table in `packages/domain/src/quests/levels.ts` (eyebrow "CREW LVL 7", bar "640 / 1000 XP", "Level 8 unlocks a crew sticker"); XP sources: quests, first-time forms (`critter.befriended` → form `xp`), visits, settle |
| Trip hub tile | QUESTS tile (P36 hub hides until quests exist): today's quests count + crew level |
| States (design in code) | generating, no plan for the day (deterministic quests only), offline (progress shown from local sync, reward reveal on reconnect), expired/failed quest, solo traveller, visit consent off (visit templates excluded), quest for dropped participant |
| AI rules | the guide proposes quests; code validates and publishes; numbers/targets from validator; Langfuse trace per run; promptfoo eval suite |

### F-130 Special stickers (3i-5, 3l-7, 3l-2)
- Kinds: `settled` (Settled Tokek: granted by P33 `confirm_paid` in the all-zero transaction with one `granted_at`, reveal on P33's `SettledTokekReveal`; this phase only shows it on the shelf and writes settle XP rows from P33's `reward.granted{kind: settled}` event), `crew_level` (one per level threshold per crew), `special` (content-defined, e.g. first trip together).
- Shelf on PASS tab outside the dex grid (C38): not counted in dex, not forms, not avatar/app-icon selectable, never purchasable; detail sheet shows how earned + date + trip.
- Grant is idempotent per (kind, crew/user, trip, level); reveal uses the same simultaneous mechanism.

## Architecture & contracts

| Area | Delta |
|---|---|
| Tables | create `quests`, `quest_signups`, `quest_progress`, `xp_ledger` (data-model §3.9); table `crew_xp(crew_id, xp, level, updated_at)` updated by the `xp` reward handler in the same tx as each `xp_ledger` insert **(doc delta: table, not a view — PowerSync cannot replicate views)** |
| RLS backstop | trip members read quests/progress; `quest_signups` insert self; `xp_ledger` append-only by `app_system`; crew rows readable by crew members; `guide_reader` reads quests/templates only |
| Sync | `trip`: quests, quest_signups, quest_progress; `me`/`crews`: xp_ledger, `crew_xp` (table), stickers |
| Commands | `signup_quest` A,O; `grant_quest_reward` S; doc delta: `generate_quests` S internal (job-only) |
| Events consumed | listed above; emitted `quest.published`, `quest.progress`, `quest.completed`, `xp.granted`, `sticker.granted` |
| Jobs | `quests.generate` (cron per tz bucket), `quest.evaluate` (dedupe `(quest_id, event_id)`), reward handlers registered in P40 `reward.fanout` registry: `xp`, `crew-level`, `settle-xp` (consumes P33 `reward.granted{kind: settled}`; no sticker grant — P33 does it) |
| Realtime | `trip_quests:{trip_id}` `quest.progress`, `quest.completed`, `reward` |
| Push | N-31 quests ready (roundup-governed), N-17 reward |
| AI | AI-32 route in `packages/ai/src/routes/quests/`: structured output only, no tools that write; template catalogue injected as enum |

## Tasks

### T1 — Domain: templates, validator, levels
- Goal: code-owned quest semantics.
- Files: `packages/domain/src/quests/{templates.ts,validator.ts,levels.ts,fallback.ts,index.ts}`, `services/worker/src/jobs/quests/templates/registry.ts`, `packages/domain/test/quests/*.test.ts`
- Steps: 1. Template registry + zod schema per built-in template with bounds (not `photos`/`phrase_practice`). 2. `validateQuest(quest, dayContext)`. 3. Level curve + sticker thresholds. 4. Deterministic fallback quests from plan.
- Tests: `pnpm --filter @cp/domain test -- quests`
- Done when: invalid params (POI not in plan, target out of bounds) are rejected; fallback always yields ≥ 1 quest for a non-empty day.
- Status: done — b6221dee4

### T2 — Schema + permission tests
- Goal: quest and XP tables.
- Files: `packages/db/src/schema/quests.ts`, `packages/db/migrations/<ts>_quests_xp.sql`, `packages/db/test/permissions/{quests,quest-signups,quest-progress,xp-ledger}.test.ts`
- Steps: 1. Tables incl. `crew_xp` table. 2. RLS + grants + publication (`crew_xp` in `crews` stream; no views published). 3. Append-only trigger on `xp_ledger`.
- Tests: `pnpm --filter @cp/db test -- permissions/quests permissions/quest-signups permissions/quest-progress permissions/xp-ledger`
- Done when: non-members read nothing; `app_user` cannot update/delete `xp_ledger` or write `crew_xp`; publication check lists no views.
- Status: done — 8f92459a3

### T3 — Quest generation job + AI-32 + evals
- Goal: daily quests from the plan.
- Files: `packages/ai/src/routes/quests/{prompt.ts,schema.ts,index.ts}`, `packages/ai/evals/quests/{promptfooconfig.yaml,cases/*.yaml}`, `services/worker/src/jobs/quests/generate.ts`, `services/worker/test/quests/generate.test.ts`
- Steps: 1. Build context via LLM views (no C3). 2. Haiku structured output. 3. Validate + fallback + publish rows + `quest.published` + N-31. 4. Evals: validity rate, tone, no invented POIs.
- Tests: `pnpm --filter @cp/worker test -- quests/generate`; `pnpm --filter @cp/ai eval -- quests`
- Done when: eval ≥ 95 % valid quests on the case set; job idempotent per (trip, local date).
- Status: done — 1083c4448

### T4 — Evaluation, rewards, stickers
- Goal: progress and grants.
- Files: `services/worker/src/jobs/quests/evaluate.ts`, `services/api/src/commands/quests/{signup-quest,grant-quest-reward}.ts`, `services/worker/src/jobs/rewards/handlers/{xp,crew-level,settle-xp}.ts`, `services/worker/test/quests/{evaluate,rewards}.test.ts`, `services/api/test/quests/commands.test.ts`
- Steps: 1. Event → registered-template matcher → progress upsert (dedupe). 2. Completion → `grant_quest_reward` → XP rows + `crew_xp` update + `reward{reveal_at}`. 3. XP from befriend/visit/settle (`settle-xp` on P33 `reward.granted{kind: settled}`; backfill XP for trips settled before this phase). 4. Level-up → `stickers(kind=crew_level)`.
- Tests: `pnpm --filter @cp/worker test -- quests`; `pnpm --filter @cp/api test -- quests`
- Done when: duplicate events never double-count; one level-up yields exactly one sticker per crew; settle fixture writes settle XP once and creates no second `settled` sticker (P33's grant stays the only one); tests use only events that exist by wave 16.
- Status: done — 050492b87

### T5 — Crew quests screen + hub tile
- Goal: 3l-7 UI.
- Files: `apps/mobile/src/app/(trip)/quests/index.tsx`, `apps/mobile/src/features/critters/quests/**` (incl. `QuestsTile.tsx` registered in the P36 hub tile list), `packages/i18n/locales/en/quests/quests.po`
- Steps: 1. Header (crew level, XP bar, next-level sticker), quest cards in quest colour with pips/reward/icon. 2. Signup, states listed above. 3. Simultaneous reveal using server clock offset. 4. Hub tile.
- Tests: `pnpm --filter @cp/mobile test -- features/critters/quests`
- Done when: reveal fires within ±100 ms of `reveal_at` in a clock-offset unit test; Reduce Motion variant shows static grant with haptic.
- Status: done — 5a1d19013

### T6 — Sticker shelf
- Goal: C38 shelf on PASS + sticker detail (3i-5 grant moment stays in P33).
- Files: `apps/mobile/src/features/critters/stickers/{StickerShelf.tsx,StickerDetailSheet.tsx,use-stickers.ts}`, `packages/i18n/locales/en/quests/stickers.po`
- Steps: 1. Shelf component exported for P40 PASS screen slot. 2. Detail sheet (shows P33-granted Settled Tokek with trip + date). No edit to P33 files: P33 already owns `SettledTokekReveal`.
- Tests: `pnpm --filter @cp/mobile test -- features/critters/stickers`
- Done when: stickers never appear in dex counts, avatar picker or app-icon picker (test asserts selectors exclude them).
- Status: done — 1d3eadf38

### T7 — End-to-end
- Goal: two-device quest flow.
- Files: `e2e/critters/{quests-progress,quests-reward,settled-sticker}.yaml`, `services/worker/test/quests/e2e.test.ts`
- Steps: 1. Seed trip day, run generator with recorded LLM fixture from eval cassette. 2. Emit visit/expense events; assert pips + reward on two sessions.
- Tests: `maestro test e2e/critters/quests-progress.yaml e2e/critters/quests-reward.yaml e2e/critters/settled-sticker.yaml`; `pnpm --filter @cp/worker test -- quests/e2e`
- Done when: flows pass on iOS and Android.
- Status: done — c6c291d93

## Phase acceptance criteria
- [ ] Every published quest passes the code validator; the model never sets progress, targets or XP amounts outside the template table
- [ ] Progress is idempotent per `(quest_id, event_id)`
- [ ] Rewards reveal at a shared `reveal_at` across devices
- [ ] Settled Tokek and crew-level stickers granted once, shown only on the shelf (C38)
- [ ] Permission tests pass; `xp_ledger` append-only
- [ ] promptfoo quest suite ≥ 95 % valid; Langfuse traces present

## Risks & rollback
| Risk | Mitigation |
|---|---|
| Quests feel generic | eval cases from real plans; fallback copy reviewed by founder |
| Visit consent off → fewer templates | expense/photo/phrase/critter templates still available |
| Clock skew breaks simultaneity | server offset from P10; reveal tolerates late clients |
| LLM cost | Haiku, one call per trip-day, cached by (trip, date, plan version) |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| Crew-level sticker art (P18 content factory) | levels grant stickers using placeholder-free approved set only; launch blocked on approval |
| P33 settle event | confirmed in phase-33 F/T4: `confirm_paid` all-zero tx grants `stickers(kind=settled)` and emits `reward.granted{kind: settled, server_ts}` — consumed as is |

## Open questions
1. `generate_quests` internal command and `crew_xp` view are doc deltas — default: add to api-contracts §4.13 and data-model §3.9.
2. Level curve — default: 1000 XP per level, +10 % per level, sticker every 2 levels.
3. Quest signup model — default: crew quests auto-include all landed `in` participants; signup only for optional personal quests.
4. Reveal delay — default 1.5 s.
5. Cross-phase delta: P42 registers `phrase_practice` (added to phase-42 T9); P44 must register `photos` on `photo.added` via `registerQuestTemplate` (phase-44 file not edited here — orchestrator to add). Doc delta: `crew_xp` table.
