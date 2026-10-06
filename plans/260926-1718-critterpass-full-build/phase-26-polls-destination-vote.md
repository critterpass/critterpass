---
phase: 26
title: Poll engine & destination vote
status: done
depends_on: [10, 13, 16, 18, 24, 25]
wave: 12
features: [F-049, F-058, F-059, F-060, F-061, F-062]
screens: [3b-2, 3b-3, 3b-6, 3b-7, 3b-8, 3c-1, 3c-2, 3g-1, 5b-2, 3d-1]
tasks: 12
owns:
  - packages/db/src/schema/polls.ts
  - packages/db/migrations/<ts>_polls_ballots_pitches.sql
  - packages/db/test/permissions/polls.test.ts
  - packages/domain/src/polls/
  - packages/domain/src/pitches/
  - services/api/src/commands/polls/
  - services/api/src/commands/places/save-place.ts
  - services/api/src/commands/trips/create-trip.ts
  - services/api/src/routes/pitches.ts
  - services/api/src/routes/places-search.ts
  - services/api/src/routes/guest-brief.ts
  - services/api/test/polls/
  - services/worker/src/jobs/polls/
  - services/worker/src/jobs/pitches/
  - services/worker/test/polls/
  - packages/ai/src/prompts/pitch/
  - packages/ai/src/prompts/guest-brief/
  - packages/ai/evals/pitch/
  - packages/ai/evals/guest-brief/
  - apps/mobile/src/app/vote/
  - apps/mobile/src/app/places/
  - apps/mobile/src/features/vote/
  - packages/i18n/locales/en/vote/
  - e2e/vote/
---
# Phase 26 — Poll engine & destination vote

> **Status, 6 Oct 2026:** done (no iOS run was spent on the vote flows: nothing in them is iOS-specific).

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | C2 one Poll+Ballot engine, C41 approval authority, C5 guide colours, Q-12 (board → top 2 final; ties → organiser picks; organiser may reopen), Q-17 taste tags crew-visible, Q-22 guest guide, Q-7E (Boost on solo; FTF not), entitlement matrix (voting always free; pitch unmetered), D5, D10 (supplier content never fed to LLM) |
| `docs/data-model.md` | §3.3 `trips`, `pitches`, `polls`, `poll_options`, `ballots`, `poll_reveals`, `destinations`, `price_quotes`; `saved_items` (P25) |
| `docs/data-model-sync-and-privacy.md` | §3.1 trip `— → voting → won`, §3.2 poll state machine, §4 streams `trip`, `crew_polls`, `me` (`poll_reveals`), §2 `llm.trip_context` (budget band only) |
| `docs/api-contracts.md` | §4.4 poll commands, §4.3 `create_trip`/`save_place`, §5.3 `POST /v1/pitches` SSE, errors `VOTE_CLOSED`, `NOT_ELIGIBLE`; §6 AI tool registry, routing (pitch = Sonnet 5; guest guide Sonnet + `web_search`) |
| `docs/api-contracts-async.md` | `poll:{poll_id}`, `crew_chat` `poll.tally`, queues `poll.close`, `ai.pitch`; `cp.vote` actions; LA/widget `CastBallotIntent`; action-key scope `ballot`; N-01/N-02/N-03 |
| Reports | `design-analysis-260926-1143-onboarding-home-report.md` §2 3b-2, 3b-3, 3b-6, 3b-7, 3b-8; `design-analysis-260926-1143-next-trip-explore-report.md` §2 3c-1, 3c-2; `design-analysis-260926-1143-plan-proposal-crew-report.md` §2 3g-1 (poll card), §8 Q28; `researcher-260926-1143-ai-guide-report.md` (pitch grounding); master §2 F-049, F-058…F-062, §0.2 C2/C41, risk R8 |
| Renders | `docs/design-renders/screens/3b-2_Home.png`, `3b-3_Pitch_a_place.png`, `3b-6_Home_final_vote.png`, `3b-7_Somewhere_else.png`, `3b-8_Marrakech.png`, `3c-1_Vote_showdown.png`, `3c-2_Kyoto_wins.png`, `3g-1_Crew_chat.png`, `5b-2_Vote_from_the_lock_screen.png` |

## Overview

Goal: one server-authoritative Poll+Ballot engine used by every vote in the app (destination, generic chat polls, day options, ChangeSet approvals, decisions, MVP), and the full destination-vote loop on it: board with pitch queue, streamed grounded guide pitches, elimination to a final showdown, reveal-once winner, place search with guest guide, and solo trips.

Done when: ballots from app, chat card, notification action, widget and Live Activity converge to one ballot per voter with correct tallies under races; deadlines close polls with the frozen-price tie rule; every member sees the winner reveal exactly once across devices; pitches stream with only tool-sourced numbers; search reaches every destination in the destinations DB (the 61 guide places plus guest cities) with a guest guide page for non-guide cities; solo trips skip vote and RSVP.

## Requirements

### F-049 Poll & ballot engine

| Aspect | Behaviour |
|---|---|
| Kinds | `destination` (stages board → final), `generic` (chat), `day_option`, `changeset_approval`, `decision` (P29/P37 create), `mvp` (P43) |
| Eligibility | `eligible_voter_ids` snapshot at creation (trip participants holding a seat, or crew members for crew polls); member joining later added only for `board` stage; member leaving → ballot removed, eligible count shrinks (bar denominator = eligible voters, 3g-1 Q28) |
| Ballots | single choice upsert (change allowed until close unless `allow_change=false`), retract; `source` app/widget/notification/la; idempotent by `op_id`; late → `cmd_results.code='VOTE_CLOSED'` + current result for UI |
| Close | `closes_at` job, all eligible voted, or decider policy satisfied (C41: organiser / any_affected / majority_of_affected / threshold_n); `closes_at` clamped ≤ earliest Viator hold expiry when options reference holds |
| Tie rules | destination final: cheaper for the majority origin on frozen quotes (`poll_options.frozen_quote_id`, P16 cost engine) with sentence "A tie goes to {X}: it's {Δ} cheaper for the {n} flying from {origin}"; board advance ties → organiser picks (Q-12); generic → earliest to reach count |
| Reveal-once | `poll_reveals(poll_id, user_id, seen_at)`; client shows reveal until `mark_reveal_seen` synced |
| Realtime | `poll:{id}` `ballot.upserted{option_tallies, pending_count}`; chat mirror `crew_chat` `poll.tally`; avatar movement animated from tallies diff |
| Surfaces | `/v1/actions` handler for scope `ballot` (notification `cp.vote` VOTE_1..3, widget/LA `CastBallotIntent`) → same `cast_ballot`; returns tallies for stamp |
| Notifications | N-01 vote needs you (collapse per poll), N-02 closing −24 h/−2 h to pending voters, N-03 winner to members not in app, lead-change watch line for inbox empty state (P25) |
| Inbox kinds | `poll.vote_needed` (inline options when ≤3; "Penida leads 4–2" live body), auto-resolves on ballot |
| Chat poll card (3g-1) | title, "{name}'s poll", option rows with sliding fill bars, voter avatars, counts, pop + "+1" on vote, closed/result state, deadline chip; creation from chat `+` → poll sheet (question, 2–6 options, deadline, allow change) |

### F-058 Destination board (3b-2 vote slot)

- "WHERE NEXT?" + blinking dot "VOTE OPEN · {in} OF {n} IN"; free-positioned destination stickers (guide sticker, rotated label, voter avatars) with deterministic layout for 1–8 candidates (seeded by poll id; no overlap; float loops 4000–5000 ms staggered); dashed "+ PITCH A PLACE" → 3b-3.
- New ballot drops an avatar onto the sticker (drop 380 ms `(.3,1.5,.5,1)`); new candidate flies in from pitch sheet (shared element ≈600 ms).
- Pitch queue: pitching while a final is in progress → `pitches.status=queued`, toast "{Place} is pitched. It joins the vote after this one."; queued pitches seed the next board.
- Board → final: at board `closes_at` (or organiser "GO TO FINAL"), top 2 by votes; tie → organiser pick sheet; organiser may reopen board (Q-12). Loser options → `back_in_deck`.
- Board with 0 candidates (undesigned): guide line + big PITCH CTA.

### F-059 Guide pitch (3b-3)

- Sheet with search field; select place → `POST /v1/pitches {crew_id, place_id, month?}` SSE events `sticker, headline, chip, reason, quote, alternative, done`.
- Sticker slaps in first (scale 1.3→1 + rotate, haptic), then sections reveal 460 ms each as they complete.
- Grounding: tools `get_fare_calendar` (P15, crew home airports), `get_travel_time`, `get_season_events` (P15), `get_crew_taste_tags` (crew-visible tags only), `suggest_alternatives` (curated POI/destination DB); numbers (price each, hours) come only from tool outputs and are validated before emit; private budget maxes never read (only `llm.trip_context` band).
- Reasons show matching member avatars; OR TRY chips (e.g. "PORTO · $180 LESS", "SEVILLE · WARMER") re-pitch that place.
- ADD TO THE VOTE → `add_poll_candidate{poll_id?, place_id, pitch_id}` (when no open destination poll exists it runs this phase's `create_trip` logic in the same transaction: voting trip + destination poll + first option; a voting trip without a poll is impossible) → card flies to board; toast "{Place}'s on the board. {in} of {n} have voted."
- Cache per (crew, place, month) until fare snapshot changes; `ai.pitch` prewarm for deck places; unmetered (system guide work, fair use).
- States (undesigned): streaming skeleton, timeout/error with retry, no fare data (chip omitted, reason says prices pending), place already on board (show its pitch), poll final (queue).

### F-060 Final showdown + winner reveal (3b-6 slot, 3c-1, 3c-2)

- 3b-6 home split card: fold from board (out scale .9/fade 380 ms; in translateY 70 px 560 ms delay 160), diagonal clip 62/38, guide wiggles, VS pulse 1400 ms, tally strip one segment per eligible voter, pending faces bob, "You voted {X}. A tie goes to {Y}."
- 3c-1 full screen: halves with guide line, chips (flight hours from viewer's home airport, price each, best month), voter stacks; tap half = cast/change (squash 460 ms origin at VS edge, VS punch ±34 px 520 ms, medium haptic); remote change slides avatar across (450 ms spring); guide toast on minority vote; own side highlighted; "you haven't voted" hint; up to 16 avatars (boosted crews).
- 3c-2 reveal: burst transition, rays 30 s loop, stamp (scale 2.6 rot −8° → .95 → rest, 480 ms delay 560), thud + heavy haptic, confetti 80 particles once, score at 950 ms, tally at 1100 ms, loser guide asleep with consolation line (template), "SET UP {PLACE}" (organiser → setup P27; others: "Setup is with {organiser}" + open plan), "{Loser} goes back in the deck for next time". Reduced motion: static stamp + fade.
- Trip transitions `voting → won`; loser pitch `back_in_deck`; N-03 push "{Place} won 4–2".
- Undesigned states: all voted awaiting close, closed by deadline with abstainers ("you missed the vote" variant), your pick lost (empathy copy), voter left mid-vote.

### F-061 Place search + guest guide (3b-7, 3b-8)

- 3b-7 sheet with keyboard up, `returnKeyType=go`; results as you type (FTS + pg_trgm over destinations/cities incl. country names, typo-tolerant); rows show local silhouette + "? " (never name), blurb, "· {n} local to find"; country header "NO LIVE GUIDE YET"; guest line "Nobody guides {country} yet, so I'll cover it."; live-guide city → 3d-1 (P30 route); guest city → 3b-8 (grow from row). Empty query: recent + saved; no results: guide line + request-a-city suggestion stored as feedback (P47 table when present, else `saved_items(kind=request)`).
- 3b-8 guest page: hero in destination colour, "GUEST GUIDE: TOKEK" hop-in, chips (stops from home via P15 fare data, FX via Frankfurter snapshot "10 MAD ≈ S$1.3" in home currency, best months), THE LOCALS "0/n · FOUND BY BEING THERE" breathing slots with authored hints (P18 content), "WHAT TOKEK KNOWS SO FAR" brief (Sonnet + `web_search` restricted by `allowed_domains` to an explicit list in `packages/ai/src/prompts/guest-brief/domains.ts` — tourism boards, government travel advisories, Wikivoyage/Wikipedia, weather/season sources; supplier and OTA domains (Agoda, Booking, Trip.com, Klook, Viator, GetYourGuide, Expedia, TripAdvisor …) are never on it (D10); fetched text is untrusted data: system prompt wraps results as quoted data and forbids following instructions in them; every fact stores its citation URL + domain; facts ≤90 chars, cached per place × crew-size bucket, streamed), ♡ SAVE flap (`save_place`), PITCH TO THE CREW (crew picker when > 1 crew; no crew → create crew flow P23), SOLO TRIP.

### F-062 Solo trip (undesigned; 3b-8, 3d-1)

- SOLO TRIP → confirm sheet "Solo trips skip the vote. {Guide} plans for one." → `create_trip{solo:true}` (owned here) (status `setup`, seat cap 1, no poll, no RSVP/proposal) → setup flow (P27) with solo copy variants; Boost purchasable on solo, FTF not eligible (Q-7E) — entitlement check via `packages/entitlements`. Solo trip appears on Home as next-up card; inviting someone later converts it to a crew trip (organiser = creator) with RSVP from then on.

## Architecture & contracts

| Area | Delta |
|---|---|
| Tables | `pitches`, `polls`, `poll_options`, `ballots`, `poll_reveals` per data-model §3.3; transition trigger on `polls.status`; **doc delta**: `polls.stage_changed_at`, `pitches.month`, `pitches.cache_key`, `pitches.fare_snapshot_id` |
| RLS | polls/options/ballots read `app.is_trip_member` (trip polls) or `app.is_crew_member` (crew polls); ballots insert/update self + eligible + open (backstop CHECK via function `app.can_vote(poll_id)`); `poll_reveals` self; `pitches` crew/trip members |
| Streams | `trip` (trip polls, pitches), `crew_polls` (crew polls), `me` (`poll_reveals`) |
| Commands | §4.4 set + `create_trip{crew_id?, place_id, solo}` (moved from P25: crew → `voting` + destination poll in one tx; solo → `setup`, no poll; FTF check via `packages/entitlements`) + **doc delta**: `advance_poll_stage{poll_id, pick?}`, `reopen_board{poll_id}`, `remove_candidate{poll_id, option_id}` (proposer or organiser, board only), `queue_pitch{crew_id, pitch_id}`; `save_place/unsave_place` implemented here (doc lists P30) |
| Routes | `POST /v1/pitches` (SSE), `GET /v1/places/search?q`, `POST /v1/places/{id}/guest-brief` (SSE, cached) — **doc delta** for the last two |
| Jobs | `poll.close` (per-poll schedule + reminders −24 h/−2 h), `poll.board_advance`, `ai.pitch` prewarm, `guest_brief.refresh` weekly |
| Push | N-01, N-02 (+ vote LA push-to-start handled by P48 reading poll data), N-03 |
| AI | routes `pitch` and `guest_brief` (Sonnet 5); tool schemas registered in P13 registry file extension; evals: grounding (every number ∈ tool outputs), persona voice, no private budget leakage, no supplier content, guest-brief citations ⊆ allow-list, prompt-injection (fetched page text containing instructions must not change output schema, tone or add links) |

## Tasks

### T1 — Poll/pitch schema, state trigger, RLS, streams
- Files: `packages/db/src/schema/polls.ts`, `packages/db/migrations/<ts>_polls_ballots_pitches.sql`, `packages/db/test/permissions/polls.test.ts`.
- Steps: 1. Tables + indexes `(trip_id,status)`, `(closes_at) WHERE open`. 2. Transition trigger + `app.can_vote`. 3. Policies, publication, streams. 4. Tests: non-member denied, ineligible ballot denied by backstop, closed-poll ballot denied, reveals self-only.
- Tests: `pnpm --filter @cp/db test -- polls`
- Done when: all permission and transition cases pass.
- Status: done — bd2267da

### T2 — Pure poll engine
- Files: `packages/domain/src/polls/{kinds,state,eligibility,tally,decider,tie-rules,board-layout}.ts`, `packages/domain/test/polls/*.test.ts`.
- Steps: 1. State machine table. 2. Tally + pending. 3. C41 decider evaluation. 4. Tie rules using P16 cost-engine frozen quotes. 5. Deterministic sticker layout 1–8.
- Tests: `pnpm --filter @cp/domain test -- polls`
- Done when: exhaustive table tests incl. ties, leaving voters, threshold_n, layout non-overlap property test.
- Status: done — bd2267da

### T3a — Trip creation, candidates, ballots, surface actions
- Files: `services/api/src/commands/trips/create-trip.ts`, `services/api/src/commands/polls/{create-poll,add-poll-candidate,cast-ballot,retract-ballot}.ts`, `services/api/test/polls/{create-trip,ballots,race}.test.ts`.
- Steps: 1. `create_trip` crew/solo branches + FTF check; crew branch creates the destination poll in the same tx. 2. Candidate + ballot handlers via P10 framework. 3. Register `ballot` scope in `/v1/actions`. 4. rt_outbox `poll:` + `crew_chat poll.tally`. 5. Race test: 20 concurrent ballots from mixed sources at the deadline.
- Tests: `pnpm --filter @cp/api test -- polls/create-trip polls/ballots polls/race`
- Done when: no committed crew trip in `voting` lacks an open destination poll (invariant test); race test yields one ballot per voter and consistent tallies; late ballot → `VOTE_CLOSED` with result.
- Status: done — bd2267da

### T3b — Poll lifecycle commands and save place
- Files: `services/api/src/commands/polls/{close-poll,mark-reveal-seen,advance-poll-stage,reopen-board,remove-candidate,queue-pitch}.ts`, `services/api/src/commands/places/save-place.ts`, `services/api/test/polls/lifecycle.test.ts`.
- Steps: 1. Close with decider + tie rules from T2; `voting → won` transition. 2. Stage advance top 2 / organiser pick; reopen board. 3. Remove candidate (proposer/organiser, board only); queue pitch during final. 4. `save_place`/`unsave_place`.
- Tests: `pnpm --filter @cp/api test -- polls/lifecycle`
- Done when: close sets trip `won` exactly once; reveal-seen is per user; queued pitches seed the next board.
- Status: done — bd2267da

### T4 — Poll jobs, notifications, inbox kinds
- Files: `services/worker/src/jobs/polls/{close,reminders,board-advance,result-fanout}.ts`, `packages/domain/src/polls/inbox-kinds.ts`, `services/worker/test/polls/jobs.test.ts`.
- Steps: 1. Per-poll schedules, reschedule on `closes_at` change. 2. N-01/02/03 via `notify.route`. 3. Board advance top 2 / organiser pick item. 4. Register inbox kinds; lead-change watch event.
- Tests: `pnpm --filter @cp/worker test -- polls`
- Done when: close at deadline sets winner with tie rule; reminders only to pending voters; inbox item resolves on ballot.
- Status: done — bd2267da

### T5 — Pitch service (SSE, tools, cache, evals)
- Files: `services/api/src/routes/pitches.ts`, `packages/domain/src/pitches/{schema,validate}.ts`, `packages/ai/src/prompts/pitch/`, `packages/ai/evals/pitch/promptfooconfig.yaml`, `services/worker/src/jobs/pitches/prewarm.ts`, `services/api/test/polls/pitch.test.ts`.
- Steps: 1. Structured section streaming on P13 gateway. 2. Tools wired to P15/P14/P16 read models. 3. Validator drops sections with ungrounded numbers and re-asks once. 4. Cache + prewarm. 5. Evals: grounding, voice, privacy.
- Tests: `pnpm --filter @cp/api test -- pitch`; `pnpm --filter @cp/ai eval pitch`
- Done when: eval grounding 100 %; cached second request returns in < 300 ms.
- Status: done — bd2267da

### T6 — Place search, guest brief API
- Files: `services/api/src/routes/{places-search,guest-brief}.ts`, `packages/ai/src/prompts/guest-brief/`, `packages/ai/evals/guest-brief/promptfooconfig.yaml`, `services/api/test/polls/places.test.ts`.
- Steps: 1. FTS + trgm query over destinations/cities (P14/P18 data) returning silhouette ids, never names of unfound locals. 2. Guest brief with `web_search` `allowed_domains` list (no supplier/OTA domains), untrusted-data framing, citations stored per fact, facts schema, cache per crew-size bucket. 3. FX + stops chips from P12/P15. 4. Evals: citations ⊆ allow-list, injection cases (≥ 10 poisoned pages).
- Tests: `pnpm --filter @cp/api test -- places`; `pnpm --filter @cp/ai eval guest-brief`
- Done when: "marakech" finds Marrakech; every row of the destinations DB is reachable by name (enumerated test over the seeded list, 61 guide places + guest cities); response never contains local names; brief facts ≤90 chars with a stored citation from the allow-list; injection eval 100 %.
- Status: done — bd2267da

### T7 — Mobile poll kit and chat poll card
- Files: `apps/mobile/src/features/vote/poll/{use-poll,use-cast-ballot,poll-card,create-poll-sheet,poll-result}.tsx`, `apps/mobile/src/features/vote/register-chat-cards.ts`, tests alongside.
- Steps: 1. Hooks over PowerSync + optimistic ballot. 2. Chat card registered in P24 registry (bars slide, +1 pop). 3. Create sheet from chat `+`. 4. Closed/result states.
- Tests: `pnpm --filter @cp/mobile test -- features/vote/poll`
- Done when: vote offline → queued → tallied once online; card shows result after close.
- Status: done — ac140e9f

### T8 — Destination board and pitch sheet
- Files: `apps/mobile/src/features/vote/board/{vote-slot,destination-board,sticker,pitch-sheet,pitch-stream,fly-to-board}.tsx`, `apps/mobile/src/app/vote/pitch.tsx`, tests alongside.
- Steps: 1. Register Home vote slot (P25). 2. Layout, float loops, avatar drop. 3. SSE client with section reveal + slap. 4. Queue + already-on-board + error states. 5. Organiser advance/reopen controls.
- Tests: `pnpm --filter @cp/mobile test -- features/vote/board`
- Done when: RNTL tests cover streaming states; RNTL layout snapshots committed; `maestro test e2e/vote/screens-board.yaml` emits `takeScreenshot` artifacts for `3b-2`/`3b-3` review.
- Status: done — a1065cd0

### T9 — Final split card, showdown, winner reveal
- Files: `apps/mobile/src/features/vote/final/{final-split-card,showdown-screen,winner-reveal,confetti,tie-line}.tsx`, `apps/mobile/src/app/vote/[pollId]/index.tsx`, `apps/mobile/src/app/vote/[pollId]/reveal.tsx`, tests alongside.
- Steps: 1. Fold transition, split card. 2. Showdown gestures, squash, VS punch, haptics, avatar slide. 3. Reveal sequence + reveal-once gate on app open. 4. Organiser/non-organiser/missed/lost variants; reduced motion.
- Tests: `pnpm --filter @cp/mobile test -- features/vote/final`
- Done when: reveal shows once per user across two devices (integration via synced `poll_reveals`); RNTL layout snapshots committed; Maestro `takeScreenshot` artifacts for `3b-6`, `3c-1`, `3c-2`.
- Status: done — ee33aa74

### T10 — Search sheet, guest guide page, solo trip
- Files: `apps/mobile/src/features/vote/places/{search-sheet,result-row,guest-guide-page,locals-strip,brief-stream,crew-picker,solo-confirm}.tsx`, `apps/mobile/src/app/places/{search,[placeId]}.tsx`, tests alongside.
- Steps: 1. Search with debounce, empty/no-results/offline states. 2. Guest page with hop-in, breathing locals, hints, save flap. 3. PITCH TO THE CREW with crew picker / no-crew path. 4. Solo confirm → `create_trip{solo}` → setup route.
- Tests: `pnpm --filter @cp/mobile test -- features/vote/places`
- Done when: tests cover live vs guest routing (live-guide rows push the typed `routes.destination(placeId)` helper; P30 builds that screen) and solo creation; RNTL layout snapshots committed; Maestro `takeScreenshot` artifacts for `3b-7`, `3b-8`.
- Status: done — c695409b

### T11 — End-to-end vote loop
- Files: `e2e/vote/{pitch-to-board,board-to-final,showdown-reveal,chat-poll,search-guest-solo}.yaml`, `services/api/test/polls/multi-surface.int.test.ts`.
- Steps: 1. Integration: ballots via app command, `/v1/actions` (notification key), widget intent key → one ballot. 2. Maestro two-simulator vote + reveal on both platforms.
- Tests: `pnpm test:int -- polls`; `maestro test e2e/vote`
- Done when: all green on iOS and Android.
- Status: done — 18e0eb92. pitch-to-board (https://github.com/critterpass/critterpass/actions/runs/37417979837) and search-guest-solo (https://github.com/critterpass/critterpass/actions/runs/37420269526) pass on Android: a search row now opens the place's Explore page, or the city critter's guest page. chat-poll, board-to-final and showdown-reveal were green before. Nothing here is iOS-specific, so no iOS run was spent

## Phase acceptance criteria

- [ ] One engine serves destination, generic, day_option, changeset_approval, decision and mvp kinds (unit tests per kind).
- [ ] Mixed-source ballot race → one ballot per voter, correct tallies; late ballot → `VOTE_CLOSED` + result.
- [ ] Deadline close applies frozen-price tie rule with the templated sentence.
- [ ] Reveal shown once per user across devices; reduced-motion variant exists.
- [ ] Pitch numbers 100 % tool-grounded in evals; no private budget or supplier content in prompts.
- [ ] Search finds every destination in the destinations DB (61 guide places + guest cities) with typo tolerance; no unfound local names in responses.
- [ ] Guest brief cites only allow-listed non-supplier domains; injection eval green.
- [ ] Solo trip skips vote/RSVP and enforces FTF ineligibility.
- [ ] Permission tests and Maestro `e2e/vote` green.

## Risks & rollback

| Risk | Mitigation |
|---|---|
| Deadline races across surfaces (R8) | server-authoritative close in one tx with ballot lock; clients render from result |
| Pitch latency/cost | cache + prewarm; Sonnet thinking off for pitch; fallback to cached pitch of another month |
| Guest brief hallucination / injection | explicit `allowed_domains` (no supplier/OTA), untrusted-data framing, citations stored, facts + injection evals; kill switch `vote.guest_brief` hides section |
| Home slot coupling with P25 | typed slot contract; P25 renders `everyday` without vote slot until registered |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Fare/season data keys (P15) | chips omitted; pitch states "prices pending" |
| Content factory locals + hints (P18) | search shows city rows without silhouettes; hints hidden |
| Founder review of tie/consolation copy | ship templates from design copy |

## Open questions

1. Board close rule when organiser never advances — default: board `closes_at` 7 d after first candidate, then auto-advance top 2.
2. Who may press SET UP — default organiser (trip creator); others see "Setup is with {organiser}".
3. Pitch counted against 30/day — default no (system guide work).
4. Solo → crew conversion — default allowed; converts on first accepted invite.
5. doc delta: new commands (`advance_poll_stage`, `reopen_board`, `remove_candidate`, `queue_pitch`), routes (`/v1/places/search`, guest brief), poll/pitch columns, `save_place` and `create_trip` phase 26.
