---
phase: 8
title: Place detail and crew can't agree
status: done
depends_on: [1, 3, 4, 5, 6]
wave: 3
screens: [7e-1, 7e-2, 7e-3]
replaces: [3d-3]
tasks: 9
gate: the ENTRY, WEAR and KNOW BEFORE YOU GO data follow the founder decision "Place facts" (tiles hidden until filled); T4 follows "The two-option vote on a split"; stances follow the C28 confirmation (plan.md contradiction 4)
owns:
  - services/api/src/explore/{place-context,plan-read}.ts
  - services/api/src/planning/split/**
  - services/api/src/commands/stances/**
  - services/api/test/{explore/place-context,commands/stances,planning/split}/**
  - apps/mobile/src/features/explore/screens/place-screen.tsx
  - apps/mobile/src/features/explore/components/{place-view,place-live-details,crowd-chart,add-to-day-button,crew-row,supplier-card,generic-photo-label}.tsx
  - apps/mobile/src/features/explore/hooks/use-add-to-day.ts
  - apps/mobile/src/features/explore/{place-detail,split}/**
  - apps/mobile/src/app/explore/place/**
  - apps/mobile/src/app/(trip)/[tripId]/split/**
  - packages/i18n/locales/{en,vi}/explore/{place,split}.*
  - e2e/explore/{place,place-vi,place-live,crew-split}.yaml
  - e2e/explore/subflows/place-scenes.yaml
  - tools/content-factory/src/kinds/places/facts.ts
mount_points:
  - tools/content-factory/src/kinds/registry.ts (facts kind)
  - packages/domain/src/places/editorial.ts (optional `entry_short`, `dress_short`, `know_before[]`)
  - services/api/src/planning/register.ts, apps/mobile/src/features/planning-register.ts (one line each)
  - docs/api-contracts-planning.md, docs/undesigned-states.md
---
# Phase 8 — Place detail and crew can't agree

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D10 (supplier cards verbatim, uncached, never to the LLM; affiliate disclosure), D24 (Foursquare live details never stored, "Powered by Foursquare", popularity never shown), D23 (web facts cite-only), C2 (Poll kind=decision over ChangeSets), C28 (private objections), C41, Q-30 |
| `docs/api-contracts-explore.md` | `GET /v1/places/{id}/context` row (`suggested_slot`, `saved_by`, `qna`, `in_plan`, `add_mode`) |
| Code | `services/api/src/explore/place-context.ts:115,128` (stay distance is a straight-line walking estimate today), `plan-read.ts:29,58`; `apps/mobile/src/features/explore/screens/place-screen.tsx` (3d-3: `usePoi`, `usePlaceTip`, `/context`, `/live`, `/crowds`), `components/{place-view,crowd-chart,crew-row,supplier-card,place-live-details}.tsx`, `hooks/use-add-to-day.ts:26,59-103`; `packages/domain/src/places/editorial.ts` (tips, photos, why_go, best_time, time_needed_min, crowd_hint, etiquette); `place_tips` (approved guide tips); `packages/ai/src/routes/recap/number-guard.ts` (numbers in words must come from facts); `packages/ai/src/context/wrap-untrusted.ts` (`crew_message` kind) |
| Renders | `7e-1_Place_detail.png`, `7e-2_Place_detail_further_down.png`, `7e-3_Crew_can_t_agree.png`; old `3d-3_Place_detail.png` |
| Captions | 7e-1 "The card from the map grows into this page … WHEN IT FITS is worked out from opening hours, crowds and your days; the bars draw left to right with 08:00 lit. The button always says where it would go, so adding is one tap." · 7e-2 "NEXT, NEARBY is ordered by the drive from here … + on any card adds it right after this stop. IF YOU LIKE THIS is the same idea somewhere else." · 7e-3 "Opens from any place the crew has split on. The bar fills from both ends as people say where they stand, and each line is what they actually wrote. Tokek's options are ways for both halves to get something; picking one posts it to the crew chat as a two-option vote." |

## Overview

Goal: the place page answers "when does this fit us" in one tap, then what to know, what's next door by drive and what's similar; and when the crew splits on a place, everyone says where they stand in their own words and Tokek offers two ways nobody loses, posted as a two-option vote.

Done when: 7e-1/7e-2 render real data for curated and open-data places inside a trip (and a no-trip variant), the ADD button opens 7f-1 at the slot it names, stances from two devices produce the split screen, and a suggested option arrives in crew chat as a decision vote; device sheets match 7e-1, 7e-2, 7e-3.

## Requirements

### 7e-1 Place detail

| Area | Behaviour |
|---|---|
| Header | Photo carousel (editorial photos, then Foursquare live photos with "Powered by Foursquare"), ←, share ↗, ♡ (in a trip: `save_idea`, toast "Saved. It's in Ideas."; outside: `save_place`) |
| Tags | Category chip in its colour; "SAVED BY ALEX + RIN" from crew savers; "CREW SPLIT 2–2" chip when split (opens 7e-3) |
| Meta | Area · "{n} min from the {stay}" (phase 3 stay + planning travel) · editorial extra when present |
| Fact tiles | OPEN (that day's spans), ENTRY (`editorial.entry_short`), TAKES (`time_needed_min`), WEAR (`editorial.dress_short`); a tile without data is omitted, never invented |
| When it fits | Guide avatar, "SAT 17 AT 08:00", "Other days ›" (opens 7f-1 on the day picker), a two-clause sentence from the best and second-best day reasons ("Your free day, and the tour buses get there around 10. Thursday after the springs works too."), `HourBars` over the open span with the best slot lit, drawn left to right |
| Crew | Saver avatars + "Alex and Rin saved it." + the trip's Q&A line (existing `qna`) |
| CTA | "ADD TO {DAY} · {time}" → 7f-1 preset; in the plan already → "IN DAY {n} · {time}" opens that stop; chat button → the guide, scoped to the place |
| Motion | The map card grows into the page (existing grow-into-page transition), photo pushes in as the sheet rises |

### 7e-2 Further down

| Area | Behaviour |
|---|---|
| Header | Scrolling collapses the photo into a slim header with the name and ♡ |
| Tip | Guide tip (approved `place_tips` or `editorial.tips[0]`) in the guide's voice |
| Know before you go | `editorial.know_before[]` `{title, detail?}`; missing → section hidden |
| Next, nearby | Phase 4 nearby route, ordered by drive minutes ("10 MIN ON"); + opens 7f-1 preset right after this stop |
| If you like this | Same category and overlapping tags elsewhere in the destination, at least 20 min away, with + → 7f-1 |
| Crew quote | A published crew plan's line about this place with crew name, month and rating (community plans data; section hidden while none exists) |
| Kept from 3d-3 | Foursquare live details (rating, phone, website) and supplier offer cards with the affiliate disclosure, below "If you like this" (undesigned placement, logged) |

### 7e-3 Crew can't agree

| Area | Behaviour |
|---|---|
| Opening | Route `(trip)/[tripId]/split/[placeId]`, registered `7e-3`; from SPLIT rows (7c-3, 7f-2), NEEDS YOU (7h-7) and the split chip on 7e-1 |
| Stand | `StanceBar`: WANT IT avatars left, RATHER NOT right, fills from both ends; "Rin and you haven't said"; the viewer picks a side with an optional line (≤ 140 chars) — the composer says the crew sees it (undesigned control) |
| Lines | Each person's own note, verbatim |
| Options | "Two ways nobody loses:" two `OptionRadioCard`s from `GET …/split` with chips (cost each or for the car, going count) |
| Actions | "SUGGEST THE {FIRST/SECOND} ONE" → `post_place_decision{mode: suggest}` (vote between the chosen way and leaving the place out); "Put it to a vote instead" → `{mode: vote}` (vote between Tokek's two ways). Both land in crew chat as a decision vote with the poll's closing time |
| Privacy | Stances are explicit and public; nothing here reads swipe "no" votes or hidden places (C28 passive signals) |

Reuse / extend / new: reuse the place screen's photo, live details, crew row, Q&A, supplier cards, share, chat entry, the grow transition, `create_poll`/decision polls and the chat card; extend place context (fit, facts, nearby, similar, split), editorial overlay (three optional fields), `use-add-to-day` (opens 7f-1 instead of adding directly); new When-it-fits card, sections, stances, compromise route, split screen.

## Architecture & contracts

| Kind | Delta (`api-contracts-planning.md`) |
|---|---|
| Route delta | `GET /v1/places/{id}/context?trip_id&date` adds `when_it_fits{best, other_best?, days[], bars{from, to, hourly[], lit{from, to}}}`, `facts{open_spans[], entry?, takes_min?, dress?}`, `tip?`, `know[]`, `nearby[]`, `similar[]`, `quote?`, `split{want, rather_not, silent_user_ids[]}?`; `suggested_slot` stays (computed by the fit engine) for app builds already installed · no-store |
| Route | `GET /v1/trips/{id}/places/{poiId}/split` → `{stances[{user_id, stance, note?}], silent_user_ids[], options[2]{option_id, kind: split_group\|alternative\|reschedule, title, body, attendee_ids[], day_id, starts_at, poi_id, cost{minor, currency, per: person\|car}?, going_count}}` · participants · no-store; options cached per (trip, place, stances hash, plan version) for 1 h in Redis |
| Commands | `set_place_stance` `{trip_id, poi_id, stance: want\|rather_not, note?}` → `{stance}` · participant · `place.stance_set`. `clear_place_stance` `{trip_id, poi_id}` · `place.stance_cleared`. `post_place_decision` `{trip_id, poi_id, option_ids[1..2], mode: suggest\|vote}` → `{poll_id}`: one change set per option (status `voting`), Poll(kind=decision) over them with the C41 default policy, chat card + push · participant |
| AI route | `places.compromise` (built in phase 6; this phase builds the candidates and calls it): up to 6 code-built candidates (split group early with the day's driver or a ride estimate, a similar place everyone can do, a quiet time for all) → two candidate ids with title and body. Failure or refusal → template wording of the two best-scored candidates. Fair use `place_compromise` per user per day is checked here; system work, not the 30/day meter |
| Contract | editorial overlay adds optional `entry_short`, `dress_short`, `know_before[{title, detail?}]` (filled by the content factory per the founder decision on place facts) |

## Tasks

### T1 — Place context, version two
- Goal: one call gives the page its facts and fit.
- Files: `services/api/src/explore/{place-context,plan-read}.ts`, `packages/domain/src/places/editorial.ts`, `services/api/test/explore/place-context/**`
- Steps: 1. Fit service for `when_it_fits` + bars. 2. Facts from spans/editorial. 3. Nearby (phase 4), similar (category + tags, ≥ 20 min). 4. Split summary. 5. Keep `suggested_slot` for installed builds.
- Tests: `pnpm test:remote @cp/api -- explore/place-context.db` (participant vs outsider; no Foursquare attribute or supplier text in the payload; tiles omitted when data is missing)
- Done when: Tirta Empul in the Bali fixture returns SAT 17 08:00 with bars lit 08–09.
- Status: done — 1690e96dc (+ 81be66d09)

### T2 — Stances
- Goal: where each person stands, in their words.
- Files: `services/api/src/commands/stances/{set-place-stance,clear-place-stance}.ts`, `services/api/test/commands/stances/**`, `services/api/src/planning/register.ts` (one line)
- Steps: 1. Handlers (one row per person per place per trip; note trimmed and length-checked). 2. Split rule (≥ 1 each side) shared from `packages/domain/src/planning/stances.ts`. 3. Events for the plan check (crew_split reason).
- Tests: `pnpm test:remote @cp/api -- commands/stances` (happy + outsider deny + replay)
- Done when: two devices' stances show on each other within 1 s.
- Status: done — 9f5eaddd2 (+ b77cf847a)

### T3 — Two ways nobody loses
- Goal: compromise options from code-built candidates, worded by the guide.
- Files: `services/api/src/planning/split/{candidates,route,cache,templates}.ts`, `services/api/test/planning/split/**`
- Steps: 1. Candidate builder (fit for subsets, similar places, quiet slots; costs from cost-engine and the ride tariff estimate). 2. Call `places.compromise` (phase 6) with the candidates; template fallback. 3. Redis cache per stances hash and plan version. 4. Fair-use check.
- Tests: `pnpm test:remote @cp/api -- planning/split.db` (candidates feasible for their attendees; fallback when the model declines; cache key changes with a new stance)
- Done when: Pura Lempuyang in the Bali fixture yields "keen ones go early" and "Tirta Gangga instead" with car cost and going counts.
- Status: done — fdb12a8a8 (+ a8c4c1ca4)

### T4 — Post a two-option vote
- Goal: the chosen way goes to the crew as a decision.
- Files: `services/api/src/commands/stances/post-place-decision.ts`, `services/api/test/commands/stances/post-place-decision.test.ts`
- Steps: 1. Change sets per option (trigger `split`). 2. Poll(kind=decision) through the poll engine with the C41 default policy and `closes_at`. 3. Chat card + push through the existing poll paths.
- Tests: `pnpm test:remote @cp/api -- commands/stances/post-place-decision` (suggest vs vote option sets; winner applies through `apply_changeset`)
- Done when: the winning option applies to the plan when the poll closes.
- Status: done — 45ed445e6 (+ ab930eadb, deadline close in the worker)

### T5 — Place detail (7e-1)
- Goal: the top of the page.
- Files: `apps/mobile/src/features/explore/{screens/place-screen.tsx,place-detail/**,components/{place-view,crew-row,crowd-chart,add-to-day-button}.tsx}`, `apps/mobile/src/features/explore/hooks/use-add-to-day.ts`, `apps/mobile/src/app/explore/place/[placeId].tsx`, `packages/i18n/locales/{en,vi}/explore/place.*`
- Steps: 1. Tags, meta, fact tiles, When-it-fits card + bars, crew row. 2. CTA → 7f-1 via `useScreenHref('7f-1')` (until phase 7 registers it, the existing add path stays). 3. ♡ in trip → `save_idea`. 4. `place-detail/register.ts` registers `7e-1` and re-registers `3d-3` as a function route reading `planning.redesign` (the old `explore/routes.ts` entry stays until phase 14).
- Tests: `pnpm --filter @cp/mobile test -- features/explore/place` (CTA label from fit; in-plan variant)
- Done when: the page matches the render on device in EN and VI.
- Status: done — e4135f3fa

### T6 — Further down (7e-2)
- Goal: what to know, what's next door, what's similar, and the kept 3d-3 parts.
- Files: `apps/mobile/src/features/explore/place-detail/{collapsing-header,know-before,next-nearby,if-you-like,crew-quote}.tsx`
- Steps: 1. Collapsing header. 2. Sections hidden when empty. 3. + on nearby → 7f-1 `after` preset. 4. Live details + supplier cards below with disclosure.
- Tests: none beyond typecheck (layout; device sheets are the check)
- Done when: scroll matches 7e-2; supplier data never written locally (existing test kept).
- Status: done — e4135f3fa (one commit with the page top)

### T7 — Crew can't agree (7e-3)
- Goal: the split screen end to end.
- Files: `apps/mobile/src/features/explore/split/**`, `apps/mobile/src/app/(trip)/[tripId]/split/[placeId].tsx`, `packages/i18n/locales/{en,vi}/explore/split.*`
- Steps: 1. Stance bar, silent line, notes. 2. Stance picker + note composer. 3. Options + CTAs → `post_place_decision` → crew chat. 4. Register `7e-3`.
- Tests: `pnpm --filter @cp/mobile test -- features/explore/split` (option selection drives the CTA and the posted mode)
- Done when: a suggestion appears in crew chat on a second device as a vote.
- Status: done — c803e9af2

### T8 — Device flows and undesigned states
- Files: `e2e/explore/{place,place-vi,place-live,crew-split}.yaml`, `e2e/explore/subflows/place-scenes.yaml`, `docs/undesigned-states.md`
- Steps: 1. Rename shots to `7e-1-*`/`7e-2-*`; add `crew-split.yaml` (two accounts). 2. Log states below.
- Tests: `gh workflow run device.yml --ref <branch> -f platform=android -f build_url=<e2e-test APK> -f flows="e2e/explore/place.yaml,e2e/explore/crew-split.yaml" -f mode=compare -f pr=<n> -f shards=1`
- Done when: sheets reviewed; `ui-reviewed` applied.
- Status: done — 6d2db2568 (sheets on #620; `ui-reviewed` pending)

### T9 — Place facts producer (after the founder decision "Place facts")
- Goal: the fact tiles and KNOW BEFORE YOU GO filled for curated places, never invented.
- Files: `tools/content-factory/src/kinds/places/facts.ts`, `tools/content-factory/src/kinds/registry.ts`
- Steps: 1. Kind mirrors `kinds/places/hours.ts`: with web research (phase 6 T6) or from open data only (OSM `fee`/`charge`, existing editorial) per the decision. 2. Proposals into `ops.content_reviews`; approval writes the editorial overlay fields. 3. No `da-nang` writes before 2026-10-05 00:00 +07.
- Tests: `pnpm --filter @cp/content-factory test -- places/facts` (validator cases: no value without a source, short labels ≤ 12 characters)
- Done when: Bali's curated places show approved ENTRY/WEAR/KNOW tiles on staging; unapproved values never reach the API.
- Status: done — 11cca714a (approval on staging waits for the merge and the founder)

## Device flows

| Flow | Platform | Covers |
|---|---|---|
| `e2e/explore/place.yaml` (+ `-vi`) | Android | 7e-1, 7e-2 in a trip; no-trip variant |
| `e2e/explore/place-live.yaml` | Android | Foursquare live block kept, attribution shown |
| `e2e/explore/crew-split.yaml` | Android | two accounts: stances, options, suggest, chat vote |

## Phase acceptance criteria

- [ ] T1–T9 done-when checks pass (T9 per the decision).
- [ ] No supplier content or Foursquare attribute stored or sent to a model (existing tests + compromise prompt test).
- [ ] Split never derives from swipe "no" votes or hidden places (test on the split rule's inputs).

## Risks & rollback

| Risk | Likelihood × impact | Mitigation / rollback |
|---|---|---|
| Fit says SAT 08:00 while Foursquare live hours say closed | M × M | fit uses only our hours; when live says closed and ours says open, show live hours with attribution and a "hours differ" note (logged); hours research corrects ours |
| Compromise options feel generic | M × M | code-built candidates, template fallback, eval set from real Bali/Đà Nẵng splits |
| Members object to named "rather not" | M × M | founder decision on C28 wording; the composer says the crew sees it; clearing a stance is one tap |
| Old app builds break on the context payload | L × H | additive fields only; `suggested_slot` kept |

## Migration (existing users' data and screens)

No data migration. The place route keeps its path (`/explore/place/[placeId]`), so deep links, share links and push targets keep working; `3d-3` resolves to the new page when `planning.redesign` is on.

## Undesigned states to log

No trip context (no When-it-fits; editorial best time + "Plan a trip here"); place already in the plan; hours unknown (OPEN tile hidden, fit says "hours not known"); no crowd data (bars show the open span without heights); live hours disagree; crowd quote absent; supplier and live details placement; stance picker and note composer; split with no options (only "Put it to a vote"); a crew of two (no split screen: one person each side is shown as a disagreement on the place page only).

## Open questions

1. "SUGGEST THE FIRST ONE": default = a vote between the chosen way and leaving the place out; "Put it to a vote" = Tokek's two ways (plan.md decision list).
2. Show the split chip on 7e-1 (not in the render)? Default yes, it is the only way in from the place itself.
