---
phase: 30
title: Explore: destination guides, place detail, map, swipe
status: pending
depends_on: [14, 15, 16, 26, 29, 35]
wave: 17
features: [F-063, F-064, F-065, F-066, F-067, F-068]
screens: [3d-1, 3d-2, 3d-3, 3d-4, 3b-8, 3o-1, 3o-2, 4a-3]
tasks: 10
owns:
  - packages/db/src/schema/explore.ts
  - packages/db/migrations/*_swipe_sessions_and_place_tips.sql
  - packages/db/migrations/*_sponsored_placements.sql
  - packages/db/test/permissions/{swipe-sessions,swipe-votes,swipe-matches,place-tips,sponsored-placements,saved-items-lists}.test.ts
  - packages/domain/src/explore/**
  - services/api/src/commands/explore/**
  - services/api/src/explore/**
  - services/worker/src/jobs/ai/swipe-deck.ts
  - services/worker/src/jobs/explore/**
  - apps/mobile/src/features/explore/**
  - apps/mobile/src/app/explore/**
  - apps/mobile/src/app/(trip)/[tripId]/swipe/**
  - packages/i18n/locales/en/explore/**
  - e2e/explore/{destination,place,map,saved,swipe,sponsored}.yaml
  - infra/powersync/streams/explore.yaml
---
# Phase 30 — Explore: destination guides, place detail, map, swipe

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | §1 D6 (MapLibre, curated POI DB, BestTime, Travelpayouts, Frankfurter), D10 (supplier cards verbatim, uncached, never to LLM; commission-neutral ranking + disclosure), D7 (Pass+/Boost remove sponsored); §2 C5 (guide colours), C26, C30 (Explore under HOME and TRIPS); §3 `sponsored(u,t)`; §7 Q-23 (sponsored picks), Q-24 (swipe), Q-25 |
| `docs/system-architecture.md` | §4.2 reads, §4.9 supplier layer, §9 perf budgets |
| `docs/data-model.md` | §3.1 `saved_items`, §3.3 `swipe_sessions/votes/matches`, §3.13 `pois`, `place_tips`, `crowd_forecasts`, §3.14 `trip_entitlements.sponsored` |
| `docs/data-model-sync-and-privacy.md` | §4 streams `explore`, `trip_pack`, `me`; §7 row "30" |
| `docs/api-contracts.md` | §4.3 `save_place`/`unsave_place`; §4.6 `start_swipe_session`, `swipe_vote`; §5.5 `/v1/places/*`, `/v1/destinations/{id}`, `/v1/fares`, `/v1/suppliers/offers`; §7 supplier adapters |
| `docs/api-contracts-async.md` | §1 `swipe:{session_id}`; §2 `ai.swipe_deck` |
| `docs/design-system.md` | map/pin tokens, guide colours, motion presets (pin drop, bars grow, stamp, fling) |
| Reports | `design-analysis-260926-1143-next-trip-explore-report.md` §2 3d-1…3d-4, §4, §5, §7, §8; `researcher-260926-1649-travel-supplier-apis-report.md` (Viator/Klook/GYG cards, Travelpayouts, disclosure); `researcher-260926-1143-ai-guide-report.md` (deck notes, WHY THIS?); master §2 F-063…F-068, §6 platform, §8 vendors (photo licence) |
| Renders | `docs/design-renders/screens/3d-1_Destination_guide.png`, `3d-2_Swipe_together.png`, `3d-3_Place_detail.png`, `3d-4_Map.png`, `3b-8_Marrakech.png`, `3o-1_Crew_plans.png`, `4a-3_Gold_cover.png` |

## Overview

Goal: Explore as a first-class browse surface (under HOME and TRIPS, C30): destination pages re-priced for the crew's airports, place pages with hourly crowds, guide tips, crew context, add-to-day and verbatim supplier cards, a hand-drawn map with doodle pins, guide sprite and card carousel, saved places/lists, live group swiping that flies matches into the plan, and labelled sponsored picks for the free tier.

Done when: every Explore screen renders real data for all 6 live destinations (+ guest guide variant), works offline for saved destinations, adds to the plan through P29 ops/ChangeSets, swipe matches are server-arbitrated exactly once, sponsored slots appear only where `sponsored(u,t)` is true with a SPONSORED label, and Maestro + permission suites pass.

## Requirements

- Carried in from phase 14 (30 Sep): the region download UI (progress, storage size, delete) over `useRegionPack` and the airplane-mode offline search device flow (`e2e/explore/map-offline.yaml`, tapping through the map, never `openLink`); the hooks and local FTS are built and tested (phase 14 T7b, 0a12bcb).


### F-063 Destination guide (3d-1, 3b-8)

| Area | Behaviour |
|---|---|
| Hero | guide colour (C5), "← EXPLORE", "♡ SAVE" (flap "♥ SAVED" + toast), giant name, "YOUR GUIDE: {GUIDE}", tagline (content), chips flight time from home airport ("7H FROM SIN"), FX chip ("¥1,000 ≈ $6.70", Frankfurter), "BEST: APR · NOV"; ghosted guide sticker; guide walks in, sits, bobs 3000 ms |
| Month bars | 12 bars J–D, height = crowd index, colour: cheapest green, peak/highlight orange, normal purple; legend chips; bars grow once on intersection (scaleY 0→1, ~1.8 s, stagger 60 ms) |
| Re-price (undesigned month-selected state) | tap month → selected bar outline + panel "{Month}: ~$X each from your crew's airports (seen {time})" per member origin (Travelpayouts calendars via P15, viewer home currency, Q-25) + weather/crowd line; no home airport → prompt to set it (P22) |
| Picks | "{GUIDE}'S FIRST-TIMER PICKS" (content, taste-ranked for crew); "{n} CREW PLANS ›" → 3o-1 (P52) |
| CTAs | PITCH TO THE CREW → P26 pitch/board ("{Dest}'s on the board"); SOLO TRIP → `create_trip{solo:true}` → setup (undesigned solo path uses the same wizard, vote skipped) |
| Guest guide (3b-8) | Tokek guest variant with coverage chips; limited-coverage states per Q-22 |
| Motion | enter from 3b-1 shared element (guide hops out, cell grows) |
| States to build | price loading/unavailable, no home airport, offline cached, saved |

### F-064 Place detail (3d-3)

| Area | Behaviour |
|---|---|
| Layout | full-bleed photo (licensed editorial; Ken Burns 1.0→1.08 as sheet rises), back/share/save; tags "{GUIDE}'S PICK", "MUST-DO · {name}"; title; meta "{category} · {admission} · {open now/hours in dest tz} · {n} min from {stay}" (Valhalla) |
| Crowds | "CROWDS ON {date}" hourly bars (BestTime via `/v1/places/{id}/crowds`), best-window pill "GO BEFORE 7:30" (deterministic), now/selected marker pulse; bars draw L→R |
| Guide tip + crew | guide tip (content, `place_tips` editorial); crew row: who saved/picked; crew Q&A snippet = most recent crew-chat mention summarised by Haiku from THIS trip's crew chat only (no supplier text); stored keyed `(trip_id, poi_id)` under trip RLS; chat text passed inside a delimited untrusted-content block (instructions inside it ignored) |
| Add to day | "ADD TO DAY {n} · {time}" suggested by planner slot finder (crowd window, hours, day gaps) → P29 `apply_plan_ops` (organiser) or ChangeSet (member); button turns green, pop, card copy drops into day; "IN DAY {n}" state if present |
| Supplier cards | `GET /v1/suppliers/offers?poi_id&date&pax` → Viator (in-app booking via P35 when flag on), Klook, GYG links; content verbatim, attributed, uncached, with affiliate disclosure "We may earn a commission"; commission-neutral order (price/rating/relevance only) |
| Share / chat | share sheet + universal link (P21); chat button → guide chat scoped to place (metered 30/day) |
| States to build | no crowd data, closed on date, no trip context (no stay distance/slot), photo loading, offline (cached POI + tip; supplier cards hidden with "Offers need a connection") |

### F-065 Explore map (3d-4)

| Area | Behaviour |
|---|---|
| Map | P14 MapLibre hand-drawn style; search pill "Search {dest}" (offline via local `explore`/`trip_pack` POIs; semantic via `/v1/places/search` online); ≡ → list view (design in code) |
| Filters | SAVED {n}, CREW PICKS, FOOD, OPEN NOW (dest tz), category chips; pins re-drop (ty −26→0 + fade, 420 ms, stagger 70 ms, `cubic-bezier(.3,1.6,.5,1)`) |
| Pins | capsule with category icon, name, crew avatars (max 3 + "+n"), clusters "+9"; selected enlarged yellow |
| You + guide | you-dot ping 2000 ms, dotted line to selected pin, guide sprite hops beside (2200 ms) and faces compass heading (P20 location; When-In-Use); not in destination → you-dot hidden, "You're {distance} away" chip |
| Carousel | cards (photo, name, "{n} min by {mode} · open now", avatars, plan chip "DAY 2 · 06:00"); swipe → camera fly-to; tap → 3d-3 |
| Realtime | crew saves/picks update pins (sync) |
| States to build | location denied, offline region not downloaded (download CTA), no results, cluster expanded, list view |

### F-066 Saved places, saved plans & lists (3d-1, 3b-8, 3d-4, 3o-2)

| Area | Behaviour |
|---|---|
| Save | `save_place`/`unsave_place` (`saved_items` from P25) with optional `list_name`; heart flap + toast; SAVED filter count |
| Lists (design in code) | "Saved" hub under Explore: lists (default "Saved", user lists), move/rename/delete, per-destination grouping; saved plans section rendered via exported `SavedPlansSlot` that P52 fills (3o-2 `save_shared_plan`); empty-slot state = section hidden |
| Offline | saving a destination triggers region pack + POI prefetch offer ("Search works offline once {dest} is saved") |
| Crew picks | crew-visible derived counts (who saved) for pins/avatars only for places inside an active trip destination (C1 disclosed in 3n-3 copy) |

### F-067 Swipe together (3d-2)

| Area | Behaviour |
|---|---|
| Start | any participant (Q-24) → `start_swipe_session` → `ai.swipe_deck`: 30 candidates ranked by crew taste + plan gaps + distance from stay (code), per-card guide notes (Sonnet batch, persona voice, ids only); push "{name} started swiping {dest}" |
| Card | photo, YES stamp indicator, social pill "{A} + {B} SAID YES" (others' yes visible pre-vote), footer name + meta ("{category} · {n} min from the {stay} · {local price}"), guide note + sticker; idle sway (3000 ms) |
| Gestures | follow finger translate(dx, .3dy) rotate(dx/14°); release > 110 px flings (no: (−560,40) r−28°; yes: (60,−640) r10° scale .7; 400 ms), else snap back (.45 s `cubic-bezier(.3,1.5,.5,1)`); ✕ / ♥ / WHY THIS?; undo last swipe (design in code); threshold tick + heavy thud on match via feedback bus |
| Match | server-arbitrated in `swipe_vote` tx: match when yes count ≥ min(2, participants) (Q-24), unique per (session, card) → MATCH stamp (scale 2.4→.95→1, 360 ms, thud 330 ms) → card flies into plan; planner auto-slot proposes day/time → ChangeSet suggestion needing organiser approval (Q-24); toast "{place}'s in the plan for Day {n}" once applied / "suggested for Day {n}" while pending |
| WHY THIS? | template from signals (votes, distance, taste match) + note |
| Live | `swipe:` presence "● {n} LIVE", progress "{i}/30 · {m} matches", vote events (verdict hidden until match) |
| States to build | deck finished summary, solo async swiping, place already in plan (skipped from deck), no photo, offline (swipes queued; matches resolve on reconnect), session ended |

### F-068 Sponsored picks (undesigned; design in code)

| Area | Behaviour |
|---|---|
| Definition (Q-23) | affiliate-partner featured placement, labelled "SPONSORED", ≤ 1 per Explore list (picks row, map carousel, search results), contextual only (destination + category, no personal targeting), free tier only: `sponsored(u,t)` = ¬passPlus(u) ∧ ¬boostActive(t); none in trip context for Boost; never in plan, guide answers or drafts |
| Source | `sponsored_placements` (ops console P17 manages: partner, poi_id/offer ref, destinations, list kinds, active window, cap) (**doc delta**) |
| UI | card identical to picks with SPONSORED tag + "Why am I seeing this?" sheet (contextual, not personal; commission disclosure; Pass+ removes) |
| Compliance | Play Console "Contains ads" declaration; App Store privacy label (no tracking; no IDFA); impression/click analytics without personal targeting |
| Ranking | organic lists stay commission-neutral; sponsored slot position fixed (e.g., 3rd), never displaces must-dos |

## Architecture & contracts

| Kind | Delta |
|---|---|
| Tables | `swipe_sessions`, `swipe_votes`, `swipe_matches`, `place_tips` per data-model; add `sponsored_placements` (C0, admin-written) and `saved_lists(user_id, name, position)` (**doc delta**; or keep `saved_items.list_name` only — default: add table for rename/order) |
| RLS | swipe tables: participants in trip; votes visible to session members (verdict revealed to others only as yes-pills per design, i.e., yes votes visible, no votes hidden). PowerSync replicates tables, not views: `swipe_votes` is NOT in the publication; a trigger mirrors verdict='yes' into table `swipe_yes_votes(session_id, card_id, user_id)` (deleted when a vote flips/undoes) which is published (**doc delta**); `place_tips` author column revoked; sponsored readable by all, written by admin role |
| Sync | `trip` stream: swipe tables (yes-only view); `explore` stream: `pois`, `place_tips`; `me`: `saved_items`, `saved_lists` |
| Commands | `save_place`/`unsave_place` (+ `list_name`), `start_swipe_session`, `swipe_vote`, `undo_swipe`, `end_swipe_session`, `create_saved_list`/`rename_saved_list`/`delete_saved_list` (**doc delta**), `record_sponsored_event` (impression/click; analytics only) |
| Routes | `GET /v1/destinations/{id}?origins&month` (month stats + per-origin fares + FX + picks + sponsored slot), `GET /v1/places/{id}?trip_id` extended with `suggested_slot`, `crew_context` (**doc delta**), `GET /v1/places/{id}/crowds`, `GET /v1/suppliers/offers` (route owned by P35; this phase consumes) |
| Realtime | `swipe:{session_id}` events; `trip_plan:` `match.inserted` |
| Jobs | `ai.swipe_deck`; `explore.place_qna_summary` (Haiku, debounced on crew chat mentions of a POI; output table `place_qna_summaries(trip_id, poi_id, text, updated_at)` trip-scoped) (**doc delta**) |
| AI | swipe notes (Sonnet), Q&A snippet (Haiku); curated POI DB only; supplier content excluded |

## Tasks

### T1 — Explore schema, views, permission tests
- Goal: swipe, tips, sponsored, saved lists persistence.
- Files: `packages/db/src/schema/explore.ts`, `packages/db/migrations/<ts>_swipe_sessions_and_place_tips.sql`, `packages/db/migrations/<ts>_sponsored_placements.sql`, `packages/db/test/permissions/{swipe-sessions,swipe-votes,swipe-matches,place-tips,sponsored-placements,saved-items-lists}.test.ts`, `packages/domain/src/explore/*.ts`, `infra/powersync/streams/explore.yaml`
- Steps: 1. Tables + unique (session, card) match. 2. `swipe_yes_votes` mirror table + trigger; `swipe_votes` excluded from publication. 3. RLS, grants, streams. 4. zod contracts.
- Tests: `pnpm --filter @cp/db test -- permissions/swipe-votes permissions/sponsored-placements permissions/place-tips`
- Done when: "no" votes unreadable by other members and absent from rows replicated by `powersync_repl` (test inspects the replicated rows); `place_tips.author_id` unreadable; only admin can write sponsored rows.

### T2 — Destination & place read APIs
- Goal: server reads for 3d-1/3d-3.
- Files: `services/api/src/explore/{destination-route,place-context,slot-suggest,sponsored-slot}.ts`, `services/worker/src/jobs/explore/place-qna-summary.ts`, `packages/ai/evals/explore/place-qna.yaml`
- Steps: 1. Destination: month stats + per-origin fares (P15) + FX + picks ranking + sponsored slot per `sponsored(u,t)`. 2. Place context: stay distance, crowd best window, crew savers, Q&A snippet, suggested slot via planner. 3. Cache headers per api-contracts §5.5.
- Tests: `pnpm --filter @cp/api test -- explore`; `pnpm --filter @cp/ai eval -- explore/place-qna`
- Done when: Pass+ user and boosted trip responses contain no sponsored slot; fares labelled with `seen_at`; no supplier text in any cached payload; crew B never receives crew A's Q&A snippet for the same POI; injection cases in chat ("ignore instructions…") do not alter output format or leak other text.

### T3 — Destination guide screen
- Goal: 3d-1 + 3b-8 variants.
- Files: `apps/mobile/src/features/explore/{screens/destination-screen.tsx,components/{month-bars,month-panel,picks-row,dest-hero}.tsx,queries.ts,commands.ts}`, `apps/mobile/src/app/explore/[destination].tsx`, `packages/i18n/locales/en/explore/destination.po`, `e2e/explore/destination.yaml`
- Steps: 1. Hero + guide walk-in; shared-element enter. 2. Month bars grow on intersection; month-selected re-price panel. 3. Pitch/solo CTAs; save. 4. States.
- Tests: `pnpm --filter @cp/mobile test -- features/explore/destination`; `maestro test e2e/explore/destination.yaml`
- Done when: tapping a month shows per-origin prices for each crew member's airport in viewer currency; guest variant renders for a non-live destination.

### T4 — Place detail screen
- Goal: 3d-3.
- Files: `apps/mobile/src/features/explore/{screens/place-screen.tsx,components/{crowd-chart,add-to-day-button,supplier-card,crew-row}.tsx}`, `apps/mobile/src/app/explore/place/[placeId].tsx`, `packages/i18n/locales/en/explore/place.po`, `e2e/explore/place.yaml`
- Steps: 1. Photo push-in + sheet. 2. Crowd bars + best window. 3. Add-to-day via P29 hooks (ops/ChangeSet) with in-plan state. 4. Supplier cards verbatim + disclosure; share; chat entry.
- Tests: `pnpm --filter @cp/mobile test -- features/explore/place`; `maestro test e2e/explore/place.yaml`
- Done when: add-to-day appears in the plan on a second device; supplier card data is not written to any local table (test asserts no persistence).

### T5 — Explore map + list view
- Goal: 3d-4.
- Files: `apps/mobile/src/features/explore/{screens/explore-map-screen.tsx,screens/explore-list-screen.tsx,components/{doodle-pin,pin-cluster,place-carousel,guide-sprite,filter-chips}.tsx}`, `apps/mobile/src/app/explore/map.tsx`, `packages/i18n/locales/en/explore/map.po`, `e2e/explore/map.yaml`
- Steps: 1. Pins with avatars + clusters, filter re-drop. 2. Carousel ↔ camera fly-to sync. 3. Guide sprite heading + you-dot line; away state. 4. Offline search + list view.
- Tests: `pnpm --filter @cp/mobile test -- features/explore/map`; `maestro test e2e/explore/map.yaml`
- Done when: CI perf budget on the map pan Maestro run (500 POIs, dropped frames ≤ budget) passes (real-device 60 fps → P54); offline search returns results for a saved destination in airplane mode.

### T6 — Saved places & lists
- Goal: F-066.
- Files: `services/api/src/commands/explore/{save-place,unsave-place,saved-lists}.ts`, `apps/mobile/src/features/explore/{screens/saved-screen.tsx,components/save-button.tsx}`, `apps/mobile/src/app/explore/saved.tsx`, `packages/i18n/locales/en/explore/saved.po`, `e2e/explore/saved.yaml`
- Steps: 1. Commands with idempotency. 2. Saved hub with lists + `SavedPlansSlot` (empty state until P52). 3. Offline pack offer on destination save.
- Tests: `pnpm --filter @cp/api test -- commands/explore/save`; `maestro test e2e/explore/saved.yaml`
- Done when: save offline → synced after reconnect; SAVED filter count matches.

### T7 — Swipe server: deck job, votes, arbitrated matches
- Goal: F-067 backend.
- Files: `services/api/src/commands/explore/{start-swipe-session,swipe-vote,undo-swipe,end-swipe-session}.ts`, `services/worker/src/jobs/ai/swipe-deck.ts`, `services/api/src/explore/match-to-changeset.ts`
- Steps: 1. Deck ranking in code + Sonnet notes batch (ids only). 2. Vote tx with unique match insert; `swipe:` events via `rt_outbox`. 3. Match → planner auto-slot → ChangeSet (organiser approval). 4. Push on session start.
- Tests: `pnpm --filter @cp/api test -- commands/explore/swipe`; `pnpm --filter @cp/worker test -- jobs/ai/swipe-deck`
- Done when: 20 concurrent yes votes on one card yield exactly one match and one ChangeSet; 2-person crew matches at 2 yeses, solo at 1.

### T8 — Swipe UI
- Goal: 3d-2.
- Files: `apps/mobile/src/features/explore/{screens/swipe-screen.tsx,components/{swipe-card,match-stamp,swipe-controls,why-this-sheet,deck-summary}.tsx,hooks/use-swipe-session.ts}`, `apps/mobile/src/app/(trip)/[tripId]/swipe/[sessionId].tsx`, `packages/i18n/locales/en/explore/swipe.po`, `e2e/explore/swipe.yaml`
- Steps: 1. Card physics per spec with worklets. 2. Presence + social pills + progress. 3. Match stamp + fly-into-plan. 4. Undo, summary, offline states.
- Tests: `pnpm --filter @cp/mobile test -- features/explore/swipe`; `maestro test e2e/explore/swipe.yaml`
- Done when: two devices produce a match stamp on both; queued offline swipes resolve on reconnect.

### T9 — Sponsored picks
- Goal: F-068 end to end.
- Files: `apps/mobile/src/features/explore/components/{sponsored-card,why-sponsored-sheet}.tsx`, `services/api/src/commands/explore/record-sponsored-event.ts`, `packages/i18n/locales/en/explore/sponsored.po`, `e2e/explore/sponsored.yaml`
- Steps: 1. Slot rendering in picks, carousel, search with label. 2. Why-sheet + Pass+ link (P46). 3. Impression/click events (no personal targeting). 4. Store declarations checklist added to P54 inputs (**doc delta** note).
- Tests: `pnpm --filter @cp/mobile test -- features/explore/sponsored`; `maestro test e2e/explore/sponsored.yaml`
- Done when: free user sees ≤ 1 labelled slot per list; Pass+ and boosted-trip users see none (Maestro with two accounts).

### T10 — Explore entry points + offline pack integration
- Goal: wire Explore under HOME and TRIPS (C30) and offline readiness.
- Files: `apps/mobile/src/features/explore/{index.ts,screens/explore-home-screen.tsx}`, `apps/mobile/src/app/explore/index.tsx`, `packages/i18n/locales/en/explore/home.po`
- Steps: 1. Explore home (destinations grid by guide colour, search, saved entry). 2. Entry links from Home and trip hub (exported hooks). 3. Offline badge per destination.
- Tests: `pnpm --filter @cp/mobile test -- features/explore/home`
- Done when: no 6th tab added; Explore reachable from Home and Trips; offline badge accurate.

## Phase acceptance criteria

- [ ] T1–T10 done-when checks pass.
- [ ] Supplier content never cached, persisted or sent to the LLM (tests on API cache layer, local DB, prompt payloads).
- [ ] Affiliate disclosure on every card with an affiliate link.
- [ ] Swipe matches exactly-once under concurrency.
- [ ] Sponsored gating matches `sponsored(u,t)` for free, Pass+, boosted.
- [ ] Offline: saved destination map, search and place pages usable in airplane mode.
- [ ] Maestro explore suite green on iOS and Android.

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Photo licensing gaps | guide art cards without photos (master §8) |
| BestTime coverage gaps | "No crowd data" state; bars hidden |
| Ads policy/store review | flag `explore.sponsored` off hides all slots server-side |
| Swipe deck cost | deck notes batched per session; cache per (trip, deck hash) |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Destination photography licence | art cards |
| Sponsored partner deals | no rows → no slots (lists render organically) |
| Viator/Klook/GYG partner status | cards show available partners only |
| Play "Contains ads" declaration + privacy label | flag off until declared |

## Open questions

1. Swipe "no" visibility: default hidden from others (yes-only pills as designed).
2. Sponsored slot position: default 3rd card in picks/carousel, top-of-results never.
3. Doc delta: `sponsored_placements`, `saved_lists`, `swipe_yes_votes`, `place_qna_summaries`, place route extensions, `explore.place_qna_summary`, swipe undo/end commands.
4. Solo trip from destination: default creates a solo trip and opens setup (vote skipped).
5. plan.md delta: wave 14 → 15; depends_on adds 35 (owns `GET /v1/suppliers/offers`).
