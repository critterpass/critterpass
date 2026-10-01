---
phase: 37
title: Disruptions — flight delay, storm, weather replan, running late
status: in_progress
depends_on: [15, 29, 35, 36]
wave: 18
features: [F-115, F-116, F-082, F-118]
screens: [3k-5, 3k-7, 3k-8, 3k-9, 3e-2, 3e-3, 3b-4]
tasks: 11
owns:
  - infra/powersync/streams/disruptions.yaml
  - packages/domain/src/disruptions/**
  - packages/planner/src/disruption/**
  - packages/db/src/schema/disruptions.ts
  - packages/db/migrations/*_disruptions_watch_items.sql
  - packages/db/test/permissions/{disruptions,watch-items,journey-checks}.test.ts
  - packages/ai/src/routes/{disruption,watch,replan,late}/**
  - packages/ai/evals/{disruption,watch,replan,late}/**
  - services/api/src/commands/disruptions/**
  - services/api/src/routes/journey.ts
  - services/api/test/disruptions/**
  - services/worker/src/jobs/disruptions/**
  - apps/mobile/src/app/(trip)/{disruption,forecast,storm,late}/**
  - apps/mobile/src/features/trip/disruptions/**
  - apps/mobile/src/features/plan/weather-suggestion/**
  - packages/i18n/locales/en/trip/disruptions.po
  - e2e/trip/disruptions/**
---
# Phase 37 — Disruptions: flight delay, storm, weather replan, running late

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D5 (guide never writes; numbers from code), D6 (Open-Meteo, AeroDataBox/AeroAPI, Valhalla + Mapbox, BestTime), D10 (no merchant; vendor messages only after approval; flights: user rebooks via airline link; Viator hold/cancel), C2 (Poll kind=decision), C3 (ChangeSet vs GuideAction), C13 (weather replans free), C37 (flight tracking free), C41 (decider policy), C43; Q-78 (all free), Q-85 (always gets through); supplier copy rows 3k-5/3k-9 |
| `docs/system-architecture.md` | §4.4 jobs, §4.6 AI, §4.9 supplier layer, §7.b redraft diff |
| `docs/data-model.md` | §3.3 polls/change_sets, §3.7 bookings/flight_segments, §3.12 `disruptions`, `watch_items`, `weather_snapshots`, `crowd_forecasts`; §3.16 ops vendor threads |
| `docs/data-model-sync-and-privacy.md` | §3.2 poll machine, §4 `trip` stream, §7 row 37 |
| `docs/api-contracts.md` | §4.4 polls/decisions, §4.6 ChangeSets, §4.11 suppliers/vendor desk, §4.12 `decide_disruption_action`, `undo_disruption_action`, `announce_disruption`, `report_running_late`; §6 tools `weather`, `marine`, `route_eta`, `flight_status`, `propose_plan_changes`, `propose_vendor_message`, `ride_quote`, `web_search`, `cost_quote` |
| `docs/api-contracts-async.md` | §1.2 `disruption:`, `trip_watch:`, `trip_plan:`; §2.2 `flight.event`, `ai.disruption`, `ai.replan`, `vendor.reply_parse`; §2.3 `weather.watch`, `eta.running_late`; §3.4 `cp.disruption`; N-14, N-26, N-27, N-28 |
| Phase files | 13 (autonomy policy, guide-actions executor, ChangeSets), 15 (weather/marine/hazards/crowds), 29 (plan editing, ChangeSet review 3e-3, day grid), 34 (flights), 35 (Viator cancel/hold, vendor desk, Grab), 36 (leave-by, briefing insert) |
| Reports | `design-analysis-260926-1143-during-trip-report.md` §3 3k-5, 3k-7, 3k-8, 3k-9, §4 F8–F10, F13–F15, §8 risks 1,5,6; `design-analysis-260926-1143-plan-proposal-crew-report.md` 3e-2, 3e-3; `researcher-260926-1649-travel-supplier-apis-report.md` (Viator cancel/amend, Grab); master §2 F-082, F-115, F-116, F-118, §8 AI-14, AI-28, AI-29 |
| Renders | `docs/design-renders/screens/3k-5_Flight_delayed.png`, `3k-7_Forecast.png`, `3k-8_Storm_warning.png`, `3k-9_Running_late.png`, `3e-2_Day_planning.png` |

## Overview

Goal: the guide notices what threatens the plan (flight changes, weather/marine/volcano/crowds/closures, running late), works out the impact with deterministic code, does only reversible zero-cost own-plan fixes by itself, and asks for a yes on anything that costs money, affects others or reaches a vendor; the crew decides storm swaps together; everything is undoable and free.

Done when: a seeded AeroAPI delay webhook produces a disruption with auto-done rows driven by real executor completions, a vendor-message row needing a yes, crew-scoped approval and full undo; a seeded rough-seas forecast escalates a watch item to PLAN B, creates a decision poll with priced options and applying SWAP moves the day cards, creates a Viator hold on the new date that the booker confirms and pays in the Viator payment form, and cancels the old booking only after the new one is confirmed; a simulated drive past a slot start raises RUNNING LATE with options, messages the waiting subgroup on selection and applies the chosen option.

## Requirements

### F-115 Flight-delay agent (3k-5, 3b-4 mirror)
| Item | Behaviour |
|---|---|
| Trigger | `flight.event` (phase 34) delay ≥ 30 min, cancellation, diversion, missed connection; re-trigger on further change (new disruption version, old actions re-evaluated) |
| Impact (code) | `packages/planner/src/disruption/flight-impact.ts`: travellers on flight, new arrival, affected items (pickups, check-in, first-day items, leave-bys), unaffected members ("Rin still lands at 22:40, nothing changes for her") |
| Autonomy (phase-13 policy) | ALREADY DONE (autonomous): retime items only the delayed travellers attend, recompute leave-bys/alarms, update Flight LA data, insert briefing item, tell unaffected members nothing changed. NEEDS A YES: anything affecting others, costing money or contacting a vendor — driver/villa/restaurant messages are drafts sent via the phase-35 ops desk over WhatsApp after approval ("Ask Made to pick you up at 13:50?"); a vendor reply (AI-31 parse) then flips the row ("Made confirmed 13:50") |
| Truthful copy | "Made rebooked" only after vendor confirmation; before: "Pickup message ready for Made"; cancellation/missed connection: "Rebook on {airline}" link + fare context, never "rebooked" by us (D10) |
| Decision | DINNER 19:30 → 21:00 row: APPROVE / KEEP; decider per C41 (money/others → majority of affected, organiser breaks ties; time-critical in-trip → any affected + UNDO + notice); avatars + "3 AFFECTED"; decided by other member → row shows "Maya approved"; expiring vendor window shown |
| Motion | hero drop thud (560 ms, 380 ms delay, haptic); ticks tick-in on real completion events from `disruption:{id}`; pending card outline glow pulse 2000 ms (design choice over 7 % scale); gecko wiggle 1800 ms; approve: pop, slide off 160 ms, new ALREADY DONE row fade-in |
| TELL THE CREW | `announce_disruption` posts summary card into crew chat ("Three of you land at 13:50."); visible to organiser and affected members |
| Undo everything | `undo_disruption_action` for each reversible action in reverse order; sent vendor messages cannot be unsent → compensation message draft ("Tell Made: back to 11:40?"); toast "Undid Tokek's changes. Pickup is back at 11:40." |
| Landed | landed event toast with OPEN → egg hatch (phase 40 consumes `flight.event{landed}` from phase 34; no separate landed event) |
| States | fixes in progress (dashed row), fix failed (vendor no reply 30 min → "No answer from Made — call?" tel link), multiple decisions, delay changes again, cancellation, diversion, other member's view, post-undo, offline (cached disruption, decisions queued) |
| Push | N-14 flight change + N-28 done/needs a yes (ALWAYS), `cp.disruption` APPROVE action |

### F-116 Forecast watch list + storm decisions (3k-7, 3k-8)
- `weather.watch` every 3 h per in/pre-trip (≤ 16 days out), hourly within 48 h, 15 min for marine/volcano alerts: sources Open-Meteo weather + marine (phase 15), hazard alerts (volcano/ceremony calendars from phase 15 `season_and_hazards`), BestTime crowds, Mapbox traffic for airport runs, closures/ceremonies via curated calendar + Anthropic `web_search` with domain allow-list (cited, labelled "reported by {source}").
- Deterministic impact scoring (outdoor/boat/summit items × thresholds: waves ≥ 2 m, wind ≥ 30 km/h, precip ≥ 60 % during item, volcano level ≥ 3) → status GO / WATCHING / PLAN B / SET; AI-29 (Haiku) writes titles/details only.
- 3k-7 UI: "← BALI / CHECKED 07:30", guide line, day strip (today highlighted, theme label, icon, temp in user unit 3n-8, precip bar fill-from-bottom stagger, %), watch list sorted by impact with FLIP reorder, new warning slides in with one soft buzz; row taps → detail/storm/leave-by; day column tap → hourly sheet (design in code).
- Notify only when status escalates into plan-changing (N-26 ALWAYS; else roundup line); storm LA start hands off to phase 48 via `push.la` event `storm.escalated`.
- 3k-8 Storm: metric chips (WAVES 2.5M, WIND 35 KM/H, HARBOUR MIGHT CLOSE), guide line, option cards (SWAP FRIDAY AND SATURDAY + TOKEK PICKS, KEEP FRIDAY, SKIP THE BOAT) generated by planner (swap feasibility, seat availability via Viator availability for held/booked activities, fees from cancel-quote, alternatives from POI DB) with per-person deltas from cost engine; selection re-prices for the crew (live `poll:` tally), CTA label flaps; Poll(kind=decision, decider_policy per C41, `closes_at` ≤ earliest hold expiry / vendor cutoff).
- Commit: ChangeSet (swap days) applied by phase-29 apply path; supplier effects via phase-35 executor. Viator booked item (Viator is merchant of record; a new booking needs a new payment by the original booker — the crew poll cannot pay): 1. create availability hold on the new date → 2. booking row state `awaiting_booker_payment`; booker gets N-28 + in-app card "Confirm & pay" opening the Viator payment form/iframe (3DS) → 3. only on Viator booking confirmation cancel the old booking within free-cancel (fee shown if any). Copy per state: others see "New seats held for Saturday · waiting on {booker} to confirm"; booker sees "Confirm & pay {price} for Saturday — your Friday booking is cancelled free after"; confirmed → "Boat moved to Saturday. Old booking cancelled free."; hold expired or payment failed → "Seats for Saturday weren't confirmed — Friday booking kept" + retry/keep options, old booking untouched; affiliate/Klook bookings → "Change it on Klook" link item; refunds recorded as ledger entries only when the supplier confirms. Day cards swap with card-trick flip (rotateY + exchange 550 ms).
- States: checking, source failure/stale > 3 h, offline cached, all clear, > 6 days scroll, beyond horizon, guest guide / low data ("limited coverage", Q-22), resolved/expired items, voting in progress, non-organiser, decided by someone else, vendor can't move seats, waiting on booker payment, hold expired / payment failed (old booking kept), forecast improves (auto-withdraw poll with notice), harbour closed, refund pending/failed, deadline passed (keeps current plan, C41).

### F-082 Weather replan suggestions (3e-2 ghost, 3e-3 review)
- Material forecast change for a day with outdoor items → `ai.replan` (AI-14, Sonnet): planner solver proposes moves (e.g. RIDGE WALK 14:00 → 17:00 golden hour) validated for hours, travel time, bookings, must-do locks; model writes headline ("Rain till three. Move the walk?") + reasons only; ChangeSet trigger=weather (free, C13).
- 3e-2 layer (`features/plan/weather-suggestion/`, mounted by phase-29 day grid overlay slot): dotted blue rain band with "RAIN" label (idle drift 6000 ms, animates to new window on update via `trip_plan: forecast.band`), original block dashed/struck, ghost block pulsing 1600 ms rotated 2° in parallel lane, bottom banner (thinking gecko, Caveat line, "Drag it, or tap to accept", MOVE IT). Accept → block springs to ghost (560 ms `cubic-bezier(.3,1.3,.5,1)`), ghost fades 300 ms, toast, → 3e-3 review after 1.3 s (phase 29 screen).
- States: no suggestion, forecast unavailable, suggestion stale (plan changed → withdrawn), declined (suppressed for that item/day).

### F-118 Running-late rerouting (3k-9)
- Journey tracking: during an active leave-by journey or transfer (phase 36 `progress_mode=location`), the device calls `POST /v1/trips/{id}/journey-check {item_id, lat, lng, mode}` every 60 s (fix used for routing only, not stored; D13); server routes (Mapbox traffic incl. closures, else Valhalla) and returns ETA; ETA > start + 10 min → disruption running_late + N-27 to traveller and waiting subgroup. `eta.running_late` cron marks journeys stale when checks stop (> 3 min) — **doc delta**: async doc says server-driven cadence.
- Closures: Mapbox incidents on route + curated/web-cited closures ("A temple procession closed Jalan Raya until 15:00" only when sourced, else "Traffic is heavy on Jalan Raya").
- Options (planner): PUSH THE SLOT (subgroup split: members on time start, late ones slot in — per-person attendance on plan item, phase 29 model), WALK THE LAST BIT (drop point + walking minutes via Valhalla pedestrian; after choosing, walking directions on map), SKIP IT (refund per booking policy / Viator cancel quote; "ask for more" = vendor message draft), CALL A CAR when no ride (Grab Farefeed quote + deep link). Vendor status chip truthful: "KARSA SAID YES" only after a vendor reply via approved WhatsApp thread; else "ASK KARSA" (draft needs a yes).
- On selection: in-app message to whoever's waiting (crew chat thread or direct to subgroup: "Wes and Jordan are 25 min late — start without them") sent immediately (product-decisions supplier copy row 3k-9); vendor message = "Draft ready — send?"; changing selection sends a correction.
- UI: map (CpMap dark style) with pills "← TODAY" + pink "ETA 14:25", closure callout + pulsing pink segment, destination pin, own position marker bob 1600 ms (no driver feed: our own device), solid travelled + dashed detour with stroke-dash redraw; bottom sheet "KARSA SPA · 14:00", "+25 MIN", "RUNNING 25 MIN LATE", reason, radio options with CTA flap; toasts per design.
- States: vendor pending/declined, no longer late (auto-resolve), no transfer (walking/scooter), walking directions after WALK, refund status, waiting crew's view ("Wes and Jordan are 25 min late · spa starts 14:00 for you"), map offline (list-only), multiple late parties.
- Manual trigger: `report_running_late` (phase 36 command) from LA/notification `LATE_10` also creates the disruption.

### Entitlements
All free (Q-78, entitlement matrix); guide work unmetered (system guide work).

## Architecture & contracts

| Kind | Delta |
|---|---|
| Migration `*_disruptions_watch_items.sql` | `disruptions` + `watch_items` per data-model §3.12; add `disruptions.version int`, `disruptions.decision_poll_id?`, `watch_items.day`, `title`, `detail`, `sources jsonb`, `checked_at`, `resolved_at`; `guide_actions.disruption_id` FK column (table from phase 13); `journey_checks(trip_id, item_id, user_id, eta_at, late_min, checked_at)` latest-only upsert, no coordinates, TTL 1 d **(doc delta for all additions)** |
| RLS | `disruptions`, `watch_items`: T; `journey_checks`: owner + co-participants of item read; guide_reader reads disruptions/watch_items via `llm` views |
| Streams | `trip`: `disruptions`, `watch_items` |
| Commands | §4.12 `decide_disruption_action`, `undo_disruption_action`, `announce_disruption`; new `choose_late_option{disruption_id, option_id}`, `dismiss_weather_suggestion{changeset_id}` **(doc delta)**; storm decision uses §4.4 poll ballot + `apply_changeset` (phase 29) |
| HTTP | `POST /v1/trips/{id}/journey-check` (S, rate 1/30 s/user) **(doc delta)** |
| Realtime | `disruption:{id}` (`step`, `needs_yes`), `trip_watch:{trip}`, `trip_plan:{trip}` `forecast.band`, `poll:{id}` |
| Jobs | `ai.disruption` (AI-28 Sonnet, progress per action), `weather.watch` (+ AI-29 Haiku copy), `ai.replan` (AI-14 Sonnet), `eta.running_late`, consumers of `vendor.reply_parse` results to flip rows |
| Suppliers | phase-35 adapters: Viator availability/hold/cancel-quote/cancel, Grab Farefeed, WhatsApp via ops desk; airline links from `flight_segments.carrier` |
| AI tools | `flight_status`, `weather`, `marine`, `route_eta`, `crowd_forecast`, `web_search` (R caller, allow-list), `propose_plan_changes`, `propose_vendor_message`, `cost_quote`, `ride_quote` |

## Tasks

### T1 — Disruption schema, streams, permission tests
- Files: `packages/db/src/schema/disruptions.ts`, `packages/db/migrations/<ts>_disruptions_watch_items.sql`, `packages/db/test/permissions/{disruptions,watch-items,journey-checks}.test.ts`, `infra/powersync/streams/disruptions.yaml`.
- Steps: 1. Tables/columns above, FORCE RLS, grants, `llm` view entries. 2. Matrix tests (participant, crew non-participant, outsider, guide_reader, powersync_repl).
- Tests: `pnpm --filter @cp/db test -- permissions/disruptions permissions/watch-items permissions/journey-checks`
- Done when: outsiders read nothing; guide_reader sees disruptions without C3 fields.
- Status: done — 5c90bc02

### T2 — Flight impact analysis and autonomy classification
- Files: `packages/planner/src/disruption/{flight-impact,classify-actions,compensation,index}.ts` + tests, `packages/domain/src/disruptions/{types,action-kinds,status}.ts`.
- Steps: 1. Impact over plan version, bookings, flight travellers, leave-bys. 2. Candidate actions with `{kind, reversible, needs_approval, cost_delta, affected, compensation}` using phase-13 policy. 3. Re-trigger diff vs previous version.
- Tests: `pnpm --filter @cp/planner test -- disruption`
- Done when: 12 fixtures (delay, cancellation, diversion, missed connection, split crew) classify as expected; no vendor action is ever autonomous.
- Status: done — 6ac953e3

### T3 — Disruption agent job, executor wiring, commands
- Files: `services/worker/src/jobs/disruptions/{flight-disruption,apply-vendor-reply,retrigger}.ts`, `packages/ai/src/routes/disruption/{prompt,schema,validate}.ts`, `packages/ai/evals/disruption/**`, `services/api/src/commands/disruptions/{decide-disruption-action,undo-disruption-action,announce-disruption}.ts`, `services/api/test/disruptions/flight.test.ts`.
- Steps: 1. `ai.disruption`: build impact → AI-28 words summary/rows (ids only from T2) → persist → execute autonomous via phase-13 executor, publish steps. 2. Vendor drafts via `propose_vendor_message` → phase-35 desk. 3. Decisions with C41 policy; undo with compensation drafts. 4. announce → chat card. 5. N-14/N-28, briefing insert.
- Tests: `pnpm --filter @cp/worker test -- disruptions/flight`; `pnpm --filter @cp/api test -- disruptions`; `pnpm --filter @cp/ai eval -- disruption`
- Done when: webhook fixture → disruption with done + needs-yes rows; approval by non-affected member rejected; undo restores plan version.
- Status: done — bb6f3322 (server; the AI copy route is `disruption.plan_b`; realtime steps ride `trip_watch:{trip}` as `disruption.step` because the `disruption:` namespace has no ACL resolver)

### T4 — Flight delayed screen (3k-5)
- Files: `apps/mobile/src/app/(trip)/disruption/[id].tsx`, `apps/mobile/src/features/trip/disruptions/flight/{screen,hero,done-list,needs-yes-card,tell-crew,undo-link,states/*}.tsx`, `packages/i18n/locales/en/trip/disruptions.po`.
- Steps: 1. Subscribe `disruption:`; rows tick on real steps. 2. Decision cards with decider state. 3. TELL THE CREW, undo, landed toast. 4. All states incl. offline.
- Tests: `pnpm --filter @cp/mobile test -- features/trip/disruptions/flight`
- Done when: RNTL covers every listed state; this task creates `e2e/trip/disruptions/flight-delay.yaml` and it is green.

### T5 — Forecast watcher and impact scoring
- Files: `services/worker/src/jobs/disruptions/{weather-watch,watch-score,watch-notify}.ts`, `packages/planner/src/disruption/watch-rules.ts` + tests, `packages/ai/src/routes/watch/**`, `packages/ai/evals/watch/**`.
- Steps: 1. Cadence scheduling per trip. 2. Source fetch via phase-15 services; closures via curated + `web_search` with citations. 3. Rules → status; diff vs last snapshot; escalation → N-26 / roundup line, `storm.escalated` event. 4. Haiku copy with fallback templates.
- Tests: `pnpm --filter @cp/planner test -- watch-rules`; `pnpm --filter @cp/worker test -- disruptions/weather-watch`; `pnpm --filter @cp/ai eval -- watch`
- Done when: rough-seas fixture escalates to PLAN B exactly once; unchanged forecast sends nothing.
- Status: done — 8e631999 (weather, sea, volcano and crowds scored; curated/web-cited closures and airport traffic are not wired)

### T6 — Forecast screen (3k-7)
- Files: `apps/mobile/src/app/(trip)/forecast/[tripId].tsx`, `apps/mobile/src/features/trip/disruptions/forecast/{screen,day-strip,precip-bar,watch-list,watch-row,hourly-sheet,states/*}.tsx`.
- Steps: 1. Synced `watch_items` + `weather_snapshots`; FLIP reorder; slide-in + buzz. 2. Units per settings. 3. States.
- Tests: `pnpm --filter @cp/mobile test -- features/trip/disruptions/forecast`
- Done when: RNTL covers states; reorder animation respects reduced motion.

### T7 — Storm options, decision poll and truthful commit
- Files: `packages/planner/src/disruption/{storm-options,swap-days}.ts` + tests, `services/worker/src/jobs/disruptions/{storm-decision,storm-commit}.ts`, `services/api/test/disruptions/storm.test.ts`.
- Steps: 1. Options with feasibility (availability, fees via Viator cancel-quote), deltas from cost engine, recommendation rule. 2. Create Poll(kind=decision) with C41 policy + closes_at. 3. On result: apply ChangeSet; Viator new hold → `awaiting_booker_payment` + booker prompt (phase-35 payment form) → on confirmation cancel old via phase-35 executor; hold expiry/payment failure → revert to old booking (ChangeSet day swap stays only if the crew chose it without the boat; else offer keep/skip); affiliate link items; ledger only on confirmation. 4. Auto-withdraw on improvement.
- Tests: `pnpm --filter @cp/planner test -- storm`; `pnpm --filter @cp/worker test -- disruptions/storm`
- Done when: Viator sandbox swap with booker payment yields new booking + cancelled old (cancel issued strictly after confirmation); payment failure and hold expiry fixtures leave the old booking active and uncancelled; poll expiry keeps current plan.
- Status: done — 4d045373 (server; the live Viator sandbox check is blocked until Viator Full + Booking access is approved; tested with the published-contract fixtures. The booker holds the new date from the card with `hold_storm_seats`, so seats are held when the booker confirms, not at the vote)

### T8 — Storm screen (3k-8)
- Files: `apps/mobile/src/app/(trip)/storm/[pollId].tsx`, `apps/mobile/src/features/trip/disruptions/storm/{screen,metric-chips,option-card,consensus-row,booker-pay-card,states/*}.tsx`, `e2e/trip/disruptions/storm-swap.yaml`.
- Steps: 1. Storm UI with live re-pricing, CTA flap, card-trick flip on apply. 2. Booker "Confirm & pay" card (opens phase-35 Viator payment form) + waiting-on-booker / hold-expired states. 3. All F-116 states.
- Tests: `pnpm --filter @cp/mobile test -- features/trip/disruptions/storm`
- Done when: RNTL covers states incl. waiting-on-booker and payment-failed; this task creates `storm-swap.yaml` and it is green.

### T9 — Weather replan job and 3e-2 overlay
- Files: `apps/mobile/src/features/plan/weather-suggestion/{rain-band,ghost-block,suggestion-banner,use-weather-suggestion}.tsx|ts`, `packages/ai/src/routes/replan/**`, `packages/ai/evals/replan/**`, `services/worker/src/jobs/disruptions/weather-replan.ts`, `services/api/src/commands/disruptions/dismiss-weather-suggestion.ts`, `services/worker/test/disruptions/replan.test.ts`, `e2e/trip/disruptions/weather-ghost.yaml`.
- Steps: 1. `ai.replan` job (solver + AI-14 copy, ChangeSet trigger=weather). 2. 3e-2 overlay components exported for the phase-29 grid slot. 3. Accept → 3e-3 navigation; dismiss command.
- Tests: `pnpm --filter @cp/mobile test -- features/plan/weather-suggestion`; `pnpm --filter @cp/worker test -- disruptions/replan`; `pnpm --filter @cp/ai eval -- replan`
- Done when: RNTL + evals pass; stale suggestion withdrawn on plan change; this task creates `weather-ghost.yaml` and it is green.
- Status: in progress — 1a9bf3d2 (server done: `ai.replan` job, `dismiss_weather_suggestion`, `replan.weather` route and evals; the 3e-2 overlay and `weather-ghost.yaml` belong to the app lane)

### T10 — Journey check, running-late detection and options
- Files: `services/api/src/routes/journey.ts`, `services/worker/src/jobs/disruptions/{running-late,late-options,journey-stale}.ts`, `packages/planner/src/disruption/late-options.ts` + tests, `packages/ai/src/routes/late/**`, `packages/ai/evals/late/**`, `services/api/src/commands/disruptions/choose-late-option.ts`, `services/api/test/disruptions/late.test.ts`.
- Steps: 1. Route + threshold + disruption creation (fix not stored). 2. Options (push/split, walk, skip, call a car) with vendor status. 3. Selection → waiting-crew message immediately, vendor draft, apply on confirm. 4. Auto-resolve when on time.
- Tests: `pnpm --filter @cp/api test -- disruptions/late`; `pnpm --filter @cp/planner test -- late-options`
- Done when: a replayed GPX drive fixture creates exactly one disruption; `journey_checks` never contains coordinates (schema test).
- Status: done — 97e6a255 (server; the phone drives the checks and `eta.running_late` only does upkeep; a car is quoted by the app from the phone's own position; sourced closures are not wired, so the reason is only ever heavy traffic; a booked item is never retimed or removed, only its vendor draft)

### T11 — Running-late screen and e2e suite
- Files: `apps/mobile/src/app/(trip)/late/[id].tsx`, `apps/mobile/src/features/trip/disruptions/late/{screen,route-map,closure-callout,late-sheet,option-list,waiting-view,use-journey-check,states/*}.tsx`, `e2e/trip/disruptions/running-late.yaml`.
- Steps: 1. Map with stroke-dash detour redraw, closure pulse, ETA pill live. 2. Journey check hook in location engine subscription `leaveby`. 3. Waiting-crew view. 4. Create `running-late.yaml`; run the full Maestro suite (flows from T4, T8, T9, T11) with seeded webhooks and simulated location.
- Tests: `pnpm --filter @cp/mobile test -- features/trip/disruptions/late`; `maestro test e2e/trip/disruptions/`
- Done when: all 4 flows green on iOS 26 + Android 36.

## Phase acceptance criteria
- [ ] No vendor contact, spend or other-member change happens without an explicit yes (policy tests)
- [ ] Every number/time on 3k-5/3k-8/3k-9 comes from planner/cost engine/supplier responses (validator tests)
- [ ] Undo restores plan version and drafts compensation for sent messages
- [ ] Watch list pings only on escalation to plan-changing; storm decision uses C41 poll; SWAP moves Viator seats truthfully (booker pays new booking; old cancelled only after confirmation)
- [ ] Weather ghost suggestion shown on 3e-2 and reviewable in 3e-3
- [ ] Running-late detection without storing coordinates; waiting crew messaged on selection
- [ ] Permission tests green; evals ≥ 95 %; Maestro suite green both platforms

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Vendor replies slow/absent | rows stay pending with call fallback; decisions never blocked on vendor |
| Closure data unreliable | only cite sourced closures; otherwise generic traffic wording |
| Alert churn from ETA flapping | hysteresis (late ≥ 10 min for 2 checks; resolve when ≤ 3 min for 2 checks) |
| LLM cost of watch runs | Haiku copy only on changed items; rules do scoring |
| Viator cannot rebook date | option card shows "can't move seats" with fee/refund and keep/skip only |

## Non-code dependencies
- Viator Full + Booking approval (phase 35) — absent: booked-activity moves show "Change it on {supplier}" link.
- WhatsApp Business templates approved (phase 35) — absent: vendor drafts become "Copy message / open WhatsApp" for the user to send.
- Mapbox traffic account — absent: Valhalla ETA without traffic, labelled.
- AeroAPI alerts subscription (phase 34).

## Open questions
1. Doc deltas: `journey_checks`, `POST /journey-check`, `choose_late_option`, `dismiss_weather_suggestion`, disruption/watch columns, `guide_actions.disruption_id` — default add.
2. Phase-29 day grid overlay slot for the weather layer — default: phase 29 exposes `DayGridOverlaySlot`; if absent, doc delta and a one-line mount edit in the phase-29 grid.
3. Late threshold — default 10 min (server config).
4. Who may choose a late option — default any member in the late party; affects others' times → C41 time-critical rule (any affected + UNDO + notice).
5. plan.md delta: wave 16 (follows phase 36 moving to wave 15); tasks 11 (T8 split).
