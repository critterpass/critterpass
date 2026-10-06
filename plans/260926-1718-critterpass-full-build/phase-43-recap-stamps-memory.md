---
phase: 43
title: Recap pipeline, story, awards, stamps, anniversary
status: in-progress
depends_on: [26, 31, 33, 40]
wave: 19
features: [F-131, F-132, F-133, F-134, F-139]
screens: [3m-1, 3m-3, 3m-4, 3m-5, 3m-6, 3m-7, 3m-8, 3m-9, 3m-10, 3n-1]
tasks: 9
owns:
  - packages/domain/src/recap/**
  - packages/db/src/schema/recap.ts
  - packages/db/migrations/<ts>_recap_stamps_memories.sql
  - packages/db/test/permissions/{recaps,recap-awards,recap-views,stamp-signatures,anniversaries,memories}.test.ts
  - packages/ai/src/routes/recap/**
  - packages/ai/evals/recap/**
  - services/api/src/commands/recap/**
  - services/api/test/recap/**
  - services/worker/src/jobs/recap/** (except contributors/album.ts, owned by phase 44)
  - services/worker/src/jobs/anniversary/**
  - services/worker/test/recap/**
  - apps/mobile/src/app/(trip)/recap/** (except postcard route, owned by phase 44)
  - apps/mobile/src/app/memory/**
  - apps/mobile/src/features/recap/** (except cards/postcard-card.tsx, owned by phase 44)
  - apps/mobile/assets/recap/**
  - packages/i18n/locales/en/recap/**
  - e2e/recap/**
---
# Phase 43 — Recap pipeline, story, awards, stamps, anniversary

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D5 (Haiku/Sonnet; numbers from code), D13, C22, C25 (route from plan stops + ride legs, never GPS), C36, C38, C42 (album never gated) |
| `docs/data-model.md` | §3.10 `recaps`, `recap_awards`, `recap_views`, `stamps` (P22), `stamp_signatures`, `anniversaries`, `memories`, `memory_reactions`; §3.9 `collection_entries`, `encounters`, `visits`; §3.8 ledger (P33) |
| `docs/data-model-sync-and-privacy.md` | trip `in_trip → post_trip` (recap job); retention (visits TTL; outcomes kept as award results) |
| `docs/api-contracts.md` | §4.14 `record_recap_view`, `cast_mvp_vote`, `react_memory`, `start_reunion`; §4 `create_poll` (P26) |
| `docs/api-contracts-async.md` | `recap:{recap_id}` (`signature`, `mvp.vote`, `mvp.result`), `memory:{memory_id}` (`reaction`); `recap.build`, `anniversary.scan`; N-32, N-35; notification category `cp.memory` REACT (registered by P49) |
| Phases | P5 share templates (recap cards, receipt, memory with signatures), P6 music per guide + SFX (printer buzz, slap, thud), P14 Valhalla distances, P26 polls (MVP vote, reunion vote), P31 `ui/story-player`, P33 ledger/balances, P35 ride legs, P40 critters + reminders conditions, P44 album contributor + postcard card, P45 profile stamps, P47 rating prompt arbiter |
| Reports | `design-analysis-260926-1143-critters-after-report.md` §2 3m-1, 3m-3…3m-10, §4 Recap, §7 risk 17, §8 Q21; `researcher-260926-1143-ai-guide-report.md` recap copy; master §2 F-131…F-134, F-139, AI-34 |
| Renders | `docs/design-renders/screens/{3m-1_Recap,3m-3_Recap_the_cover,3m-4_Recap_the_route,3m-5_Recap_crew_awards,3m-6_Recap_the_receipt,3m-7_Recap_the_one_that_got_away,3m-8_Recap_the_stamp,3m-9_Recap_the_postcard,3m-10_A_year_later}.png`, `3n-1_*.png` |

## Overview

Goal: when the trip ends, a durable job builds a deterministic recap (stats, route legs from plan + rides, receipt from the ledger, awards evidence, the one that got away, the stamp) and the guide writes only the copy; members watch an 8-card narrated story with music and choreography that settles into a persistent recap page; opening it signs the crew's passport stamp live; a year later a quiet memory invites a reunion vote.
Done when: a seeded completed trip produces a `ready` recap whose every number matches fixtures, the story plays all 8 cards on iOS and Android, signatures appear live on a second device, the MVP vote persists and closes, the reunion creates a P26 poll, and late expenses trigger a versioned re-run.

## Requirements

### F-131 Recap pipeline
| Item | Behaviour |
|---|---|
| Trigger | trip `in_trip → post_trip` (destination-tz midnight after last day or return landing) → `recap.build`; re-run debounced 10 min on late `expense.*`, `booking.*`, `photo.added`, `critter.befriended` for 14 d → new `version`, cards re-render, no second N-32 |
| Aggregates (code) | days, km (Valhalla legs between plan stops + ride legs, top driver from rides; C25, never GPS), superlative POIs (e.g. volcano climbed before sunrise from plan item category + visit), photo count + top uploader (album contributor from P44), balances outstanding + settled lead time, forms found this trip + new critters, receipt (categories, totals vs planned, each, priciest, cheapest day, settled days, currency via P12 FX), got-away form (legendary/epic in trip window not found; sightings count; wandered-off encounters), award evidence per member |
| Contributors | registry `services/worker/src/jobs/recap/contributors/*.ts` (plan, rides, ledger, critters, visits, album) so phases add data without editing the builder |
| Progress | `agent_jobs(kind=recap)` steps → `user:` channel; states: queued/building/ready/failed |
| Viewers | every participant incl. dropouts who were `in` at any point (3f-7), solo trips, trips cut short |
| Retention | kept forever (free, C42 spirit); `visits` TTL does not erase award outcomes (stored in `recap_awards`) |

### F-132 Recap summary + story (3m-1, 3m-3…3m-9)
| Card | Content + motion |
|---|---|
| Chrome | 8 progress segments (3 px, gap 4), current fills linear 6000 ms (route 9000 ms), header guide mini sticker + "{GUIDE} PRESENTS" + "{Place}, the recap · ♪ {theme}" + ✕; tap next, hold pause, swipe down close (P31 StoryPlayer); guide narration text + pre-rendered guide voice audio when voice is on (`recap.narrate`, ElevenLabs Flash in the guide's owned voice, D5; never on-device TTS; P6 audio session; music ducks; text-only if audio missing) |
| 1 Cover 3m-3 | stickers slap in (back ease 540 ms, staggered delays), place name slams centre, page shakes |
| 2 Critters (undesigned, design in code) | forms found this trip tumble into a pile; "{n} new locals" |
| 3 Route 3m-4 | trail draws stop by stop with guide riding along, km counter rolls, stops pop, early-start stop glows orange with time |
| 4 Awards 3m-5 | F-133 |
| 5 Receipt 3m-6 | prints line by line with printer buzz, PAID IN FULL stamp when settled; swipe up shows own split; save as image (Photos add-only) |
| 6 The one that got away 3m-7 | lights dim to warm glow, gold silhouette drifts, line about the member types last; REMIND ME → reminder condition `crew_planning_again` (P40) near next window |
| 7 Stamp 3m-8 | F-134 |
| 8 Postcard 3m-9 | slot rendered by P44 `cards/postcard-card.tsx`; this phase supplies card data (note from AI-34) |
| Summary 3m-1 | after first play; stats stamp in one by one (s1.4 → 1, 120–150 ms stagger + thud), new critters tumble, 4 tilted stat tiles, forms card, got-away line → 3l-9, award chips, SHARE RECAP, WHERE NEXT? → Home destination vote (P26) |
| States (design in code) | generating ("{Guide} is writing your recap"), partial (no photos / expenses / km — tiles swap), failed + retry, offline cached, regenerated badge "Updated with late expenses", Reduce Motion (static cards, 6 s timer kept, narration text) |
| Hand-offs | story end (last card finished or skipped past) → emits `recap.story_completed` once per session and mounts `RecapEndSlot` (empty host; no rating/toast UI here); P47 T7 fills the slot with `RecapEndArbiter` (priority 4c-2 (P46) > 3o-3 (P52) > store review); photos tile → P44 album |

### F-133 Crew awards + MVP vote (3m-5)
- One award per member chosen by code from evidence (check-ins, photos, expenses, plan edits, early starts, finds); AI-34 writes title + evidence line from given numbers; tone rules: no body, money-shaming, drinking, health or lateness-as-insult lines (eval-enforced); `opt_out_award` per member (doc delta) hides theirs for everyone.
- Cards deal from top (ty −30 → 0, 450 ms back ease, 160 ms stagger), resting angle ±1–3° seeded per member (same on every device).
- VOTE FOR THE MVP → `cast_mvp_vote` (one per member, change allowed until close, closes 72 h or when all voted); tie → shared; winner card gets gold edge on everyone's recap via `recap:{id}` `mvp.result`.

### F-134 Passport stamp + live signatures (3m-8, 3n-1)
- Trip stamp (`stamps kind=trip`, created `upcoming` at trip create by P22/P25 data) turns `stamped` on recap ready: page turns, stamp slams in guide/place ink colour beside faded older ones.
- Signatures: first recap open asks the member to draw their signature once (undesigned sheet; stroke vector stored as media `purpose=signature`, doc delta: `user_settings.signature_media_key`); each member's `record_recap_view{open}` writes `stamp_signatures` on every crew member's copy and publishes `recap:{id}` `signature`; signatures write themselves in member colour live.
- Profile (P45) dashed stamp fills in the same colour (reads `stamps.status`).

### F-139 Anniversary memory + reunion vote (3m-10)
- `anniversaries.fire_at` = trip best-day date + 365 d (best day = day with most photos/visits/awards evidence, not trip start); `anniversary.scan` daily per tz bucket → `memories` row with AI-34 line (callback to a real trip detail from recap evidence) + highlight photo (P44 provider; fallback illustration) → N-35 passive interruption.
- Screen: Ken Burns photo (1.08 → 1 over 8 s), "ONE YEAR AGO TODAY", guide bob, reactions pop in live (`memory:{id}`), reaction composer (undesigned: emoji chips + short text ≤ 40 chars), PLAN A REUNION → `start_reunion` → P26 destination poll with the place pre-pitched, Share memory image with crew signatures (P5 template).
- States: crew disbanded / member deleted ("former member"), member left crew (still sees own), notifications off (inbox card), multiple anniversaries same day (stacked).

## Architecture & contracts

| Area | Delta |
|---|---|
| Tables | create `recaps`, `recap_awards`, `recap_views`, `stamp_signatures`, `anniversaries`; doc delta: create `memories` + `memory_reactions` here (data-model lists P44; needed by F-139); add `recap_mvp_votes(recap_id, voter_id, award_id)` uk (recap_id, voter_id) (doc delta); `user_settings.signature_media_key` (doc delta) |
| RLS backstop | recaps/awards/signatures/memories readable by trip participants; `recap_views` self; votes insert self once; `anniversaries` system only; `guide_reader` reads aggregates, not `recap_views` |
| Sync | `trip`: recaps, recap_awards, recap_mvp_votes (tallies), stamp_signatures, memories, memory_reactions; `me`: recap_views |
| Commands | `record_recap_view`, `cast_mvp_vote`, `react_memory`, `start_reunion` (§4.14); doc deltas: `opt_out_award{award_id}`, `save_signature{media_id}`, `retry_recap{trip_id}` (participant, when failed) |
| Jobs | `recap.build` (+ debounced re-run), `recap.narrate` (after copy; per card × locale → R2 `recap-audio/{recap_id}/v{version}/{locale}/{card}.mp3`, cached per recap version, cost bound = 8 cards × crew locales per version, skipped on re-run if card copy unchanged), `anniversary.scan`, `recap.share_render` via P5 `renderShareCardNode()` |
| Realtime | `recap:{recap_id}` signature / mvp.vote / mvp.result; `memory:{memory_id}` reaction |
| Push | N-32 recap ready (once per recap), N-35 anniversary (passive/quiet) |
| AI | AI-34 route `packages/ai/src/routes/recap/`: input = deterministic aggregates JSON only; output per-card copy JSON; Haiku for lines, Sonnet for the full card set; validator rejects any number not present in input |

## Tasks

### T1 — Schema + permission tests
- Goal: recap, stamp signature, memory tables.
- Files: `packages/db/src/schema/recap.ts`, `packages/db/migrations/<ts>_recap_stamps_memories.sql`, `packages/db/test/permissions/{recaps,recap-awards,recap-views,stamp-signatures,anniversaries,memories}.test.ts`
- Steps: 1. Tables incl. deltas. 2. RLS, grants, publication. 3. Fixtures for a 6-member trip.
- Tests: `pnpm --filter @cp/db test -- permissions/recaps permissions/recap-awards permissions/recap-views permissions/stamp-signatures permissions/anniversaries permissions/memories`
- Done when: non-participants read nothing; one MVP vote per member enforced by constraint.
- Status: done — 134d9014b

### T2 — Deterministic recap builder
- Goal: aggregates + contributors + versioning.
- Files: `packages/domain/src/recap/{schema.ts,awards.ts,got-away.ts,best-day.ts}`, `services/worker/src/jobs/recap/{build.ts,rerun.ts,contributors/{plan,rides,ledger,critters,visits}.ts}`, `services/worker/test/recap/build.test.ts`
- Steps: 1. Recap zod schema. 2. Contributors + registry. 3. Award evidence scoring (one per member, deterministic tie-break). 4. Got-away selection. 5. Versioned re-run with debounce; stamps → `stamped`.
- Tests: `pnpm --filter @cp/worker test -- recap/build`
- Done when: fixture trip numbers match expected JSON exactly; no GPS table is read; late expense produces version 2.
- Status: done — abad76458

### T3 — AI-34 recap copy + evals
- Goal: guide-written copy with number guard and tone rules.
- Files: `packages/ai/src/routes/recap/{prompt.ts,schema.ts,number-guard.ts,index.ts}`, `packages/ai/evals/recap/{promptfooconfig.yaml,cases/*.yaml}`, `services/worker/src/jobs/recap/{copy,narrate}.ts`, `services/worker/test/recap/narrate.test.ts`
- Steps: 1. Persona-voiced copy per card, award lines, got-away line, postcard note, memory line. 2. Number guard. 3. Tone evals (no shaming). 4. Fallback template copy on failure. 5. `recap.narrate`: ElevenLabs Flash (P6 guide voice id) per card × member locale → R2, keyed by recap version + copy hash; failure leaves text-only narration.
- Tests: `pnpm --filter @cp/ai eval -- recap`; `pnpm --filter @cp/worker test -- recap/copy recap/narrate`
- Done when: number guard rejects invented numbers in tests; eval tone pass rate ≥ 98 %; narrate re-run with unchanged copy makes zero TTS calls; TTS failure yields text-only recap, still `ready`.
- Status: done — cf77f6b55 (server: copy, evals, narration; app playback is the app lane's)

### T4 — Commands, realtime, push
- Goal: views, signatures, votes, opt-out, retry.
- Files: `services/api/src/commands/recap/{record-recap-view,save-signature,cast-mvp-vote,opt-out-award,retry-recap}.ts`, `services/api/test/recap/commands.test.ts`, `services/worker/src/jobs/recap/notify.ts`
- Steps: 1. Handlers + policies. 2. Signature fan-out to all copies + `recap:` publish. 3. MVP close + result. 4. N-32 once.
- Tests: `pnpm --filter @cp/api test -- recap`
- Done when: offline replays idempotent; opt-out hides award for every member.
- Status: done — 1c52f0a2d

### T5 — Recap summary page
- Goal: 3m-1 + states.
- Files: `apps/mobile/src/app/(trip)/recap/[tripId]/index.tsx`, `apps/mobile/src/features/recap/summary/**`, `packages/i18n/locales/en/recap/summary.po`
- Steps: 1. Tiles, forms card, got-away, award chips, share, WHERE NEXT. 2. Generating/partial/failed/offline/updated states.
- Tests: `pnpm --filter @cp/mobile test -- features/recap/summary`
- Done when: RNTL covers all states; WHERE NEXT navigates to Home vote.
- Status: done — 67c4b676c

### T6 — Story cards 1–4 + music/narration
- Goal: cover, critters, route, awards + MVP vote.
- Files: `apps/mobile/src/app/(trip)/recap/[tripId]/story.tsx`, `apps/mobile/src/features/recap/cards/{cover,critters,route,awards}-card.tsx`, `apps/mobile/src/features/recap/story/**`, `apps/mobile/assets/recap/**`
- Steps: 1. Card registry on P31 StoryPlayer with per-card durations. 2. Choreographies (Reanimated/Skia route draw). 3. Music theme + narration playback of `recap.narrate` audio (voice toggle respects sound settings; text fallback). 4. MVP vote sheet + gold edge. 5. Story end → emit `recap.story_completed` + mount `apps/mobile/src/features/recap/story/RecapEndSlot.tsx` (P47 fills).
- Tests: `pnpm --filter @cp/mobile test -- features/recap/cards features/recap/story`
- Done when: pause/resume keeps all timelines in sync (unit test on shared clock); Reduce Motion variant renders; `recap.story_completed` fires once at story end (not on first open) and no rating UI exists in this phase.
- Status: done — 39d485db3

### T7 — Story cards 5–7 + signature sheet
- Goal: receipt, got-away, stamp.
- Files: `apps/mobile/src/features/recap/cards/{receipt,got-away,stamp}-card.tsx`, `apps/mobile/src/features/recap/signature/**`, `packages/i18n/locales/en/recap/story.po`
- Steps: 1. Receipt print + own split + save image. 2. Got-away + remind me. 3. Stamp slam + live signature writing from `recap:` events. 4. Signature capture sheet (Skia path → vector JSON upload).
- Tests: `pnpm --filter @cp/mobile test -- features/recap/cards features/recap/signature`
- Done when: signature from device A appears on device B's stamp card via mocked channel in tests.
- Status: done — 39d485db3

### T8 — Anniversary memory + reunion
- Goal: F-139 end to end.
- Files: `services/worker/src/jobs/anniversary/{scan,build-memory}.ts`, `services/api/src/commands/recap/{react-memory,start-reunion}.ts`, `apps/mobile/src/app/memory/[memoryId].tsx`, `apps/mobile/src/features/recap/memory/**`, `services/worker/test/recap/anniversary.test.ts`
- Steps: 1. Schedule at recap ready; scan per tz bucket; build memory (photo provider interface + fallback). 2. N-35 passive. 3. Screen + reactions composer + share. 4. Reunion → P26 poll with place pitched.
- Tests: `pnpm --filter @cp/worker test -- recap/anniversary`; `pnpm --filter @cp/mobile test -- features/recap/memory`
- Done when: time-travel test fires exactly once at best-day + 365 d in each member tz; reunion creates a destination poll.
- Status: done — c84b3a444 (server), d0b6cecfb (memory screen, reactions, reunion, share image)

### T9 — Share renders + end-to-end
- Goal: share images and Maestro coverage.
- Files: `services/worker/src/jobs/recap/share-render.ts`, `e2e/recap/{recap-story,mvp-vote,signatures,late-expense-rerun,anniversary}.yaml`
- Steps: 1. Recap cards 9:16, receipt, memory-with-signatures via P5 templates. 2. Maestro flows with seeded post-trip fixture.
- Tests: `pnpm --filter @cp/worker test -- recap/share-render`; `maestro test e2e/recap`
- Done when: flows pass on iOS and Android; share images byte-stable for fixtures.
- Status: done in part — d0b6cecfb (share images are drawn on the phone: recap card 67c4b676c, memory card d0b6cecfb, so there is no worker render job; lab-scene flows for the page, story and memory are in `e2e/recap`). Not built: seeded two-device Maestro flows for the MVP vote, signatures and the late-expense re-run (the api and worker database tests cover that behaviour)

## Phase acceptance criteria
- [ ] Every recap number comes from code (number guard test passes); route legs from plan + rides only
- [ ] Recap re-runs on late data with a new version and no duplicate push
- [ ] 8-card story plays with music, pause/resume and Reduce Motion parity
- [ ] Awards: one per member, opt-out honoured, MVP vote real and closes
- [ ] Signatures appear live across devices; profile stamp becomes stamped
- [ ] Anniversary fires once per member tz; reunion creates a P26 poll
- [ ] Permission, worker, api, AI eval and Maestro suites pass

## Risks & rollback
| Risk | Mitigation |
|---|---|
| Award tone offends | evidence-only titles, tone evals, per-member opt-out, fallback neutral titles |
| Story perf on low-end Android | motion budget per card, low-tier flag drops confetti/particles |
| Music licensing | commissioned per-guide themes (P6 assets); story plays silent if missing |
| Late data churn | 14 d re-run window, debounce |

## Non-code dependencies
| Dependency | If not ready |
|---|---|
| Per-guide music themes and ElevenLabs guide voices (P6) | silent story + text narration |
| Award tone review by founder | neutral fallback titles only |

## Open questions
1. Moving `memories`/`memory_reactions` to this phase, `recap_mvp_votes`, `opt_out_award`, `save_signature`, `retry_recap`, `user_settings.signature_media_key` — doc deltas; default: add in T1/T4 and update docs.
2. Card 2 content is undesigned — default: "new locals found" critters card.
3. MVP close — default 72 h or all voted.
4. Re-run window — default 14 d after trip end.
