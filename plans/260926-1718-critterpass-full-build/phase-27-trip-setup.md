---
phase: 27
title: Trip setup: dates, budgets, rooms, must-dos
status: done
depends_on: [10, 16, 20, 24, 25, 26]
wave: 13
features: [F-069, F-070, F-071, F-072, F-073]
screens: [3c-3, 3c-4, 3c-5, 3c-6, 3c-7, 3c-10, 3n-2]
tasks: 12
owns:
  - infra/powersync/streams/setup.yaml
  - packages/db/src/schema/setup.ts
  - packages/db/migrations/*_setup_availability_and_budgets.sql
  - packages/db/migrations/*_setup_rooms_must_dos_dietary.sql
  - packages/db/test/permissions/{calendar-sources,calendar-days,availability-asks,availability-summaries,date-window-options,budget-max-private,budget-defaults-private,trip-budget-aggregates,budget-plans,room-plans,room-assignments,must-dos,dietary}.test.ts
  - packages/domain/src/setup/**
  - packages/planner/src/setup/**
  - packages/planner/test/setup/**
  - packages/cost-engine/src/budget/**
  - packages/cost-engine/src/rooms/**
  - packages/cost-engine/test/{budget,rooms}/**
  - services/api/src/commands/setup/**
  - services/api/src/setup/**
  - services/api/src/calendar-oauth/**
  - services/worker/src/jobs/calendar/**
  - services/worker/src/jobs/ai/fit-check.ts
  - services/worker/src/jobs/setup/**
  - apps/mobile/modules/cp-calendar/**
  - apps/mobile/src/features/setup/**
  - apps/mobile/src/app/(trip)/[tripId]/setup/**
  - packages/i18n/locales/en/setup/**
  - e2e/setup/**
---
# Phase 27 — Trip setup: dates, budgets, rooms, must-dos

> **Status, 6 Oct 2026:** every task is done; the dates picker (#625) and the set-up fixes from the live tests (#680, #706) are on main.

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | §1 D1, D2, D10, D11, D12, D13; §2 C3 (privacy classes), C26 (seat cap/denominators), C36 (crew visibility), C41, C43, C44; §3 entitlement matrix (heatmap up to 16 when boosted); §5 supplier copy rows 3c-7, 3c-8; §7 defaults Q-31, Q-32, Q-33, Q-34 |
| `docs/system-architecture.md` | §4.1 commands, §4.3 realtime, §4.4 jobs, §5 authz, §7.c offline outbox |
| `docs/code-standards.md` | §4 feature module, §8 motion/feedback bus, §10 a11y, DB rules (RLS + permission tests), §17 testing |
| `docs/data-model.md` | §2 helpers `app.is_trip_participant`, `app.is_trip_organiser`, `app.budget_band`; §3.3 `trips.setup_step`, `date_window_options`, `availability_summaries`; §3.4 all tables |
| `docs/data-model-sync-and-privacy.md` | §1 split tables + derived C1 projections, §3.1 trip `setup_step` machine, §4 streams `trip`, `me`, §5 `trip_setup:` rules, §7 row "27 Trip setup" |
| `docs/api-contracts.md` | §3 errors (`K_ANON_UNAVAILABLE`), §4.5 setup commands, §5.5 `GET /v1/budget/{trip_id}/band`, `GET /v1/me/private/{kind}` |
| `docs/api-contracts-async.md` | §1 `trip_setup:{trip_id}` namespace; §2 queues `ai.fit_check`, cron `calendar.stale_nudge`; push N-05, N-45, N-46 |
| `docs/design-system.md` | heatmap/track/stepper components, motion presets (pop, shake, flap, odometer, draw-on stroke, card-deal) |
| Reports | `design-analysis-260926-1143-next-trip-explore-report.md` §2 3c-3…3c-7, 3c-10, §4, §5, §7, §8; master §2 rows F-069…F-073, §0.2, §6 platform row "Calendar", §8 vendor row "Calendar OAuth", R4 |
| Renders | `docs/design-renders/screens/3c-3_When.png`, `3c-4_No_week_fits.png`, `3c-5_Budget.png`, `3c-6_Rooms.png`, `3c-7_Must-dos.png`, `3c-10_Add_a_must-do.png`; `docs/design-renders/screens.json` entries for the same labels |

## Overview

Goal: the four-step setup wizard that turns a won destination into draft inputs — a date window everyone can make (device + OAuth calendars, date-level only), a group budget under every private max without revealing anyone's number, a room plan with live per-person price, and one must-do per member fit-checked as it lands — with every member's view live on `trip_setup:` and offline-safe via PowerSync commands.

Done when: organiser and members complete all four steps on iOS and Android against a real backend; no C3 value (raw calendar days, budget maxes, dietary detail) is readable by any other user, the organiser, `guide_reader` or the PowerSync publication (Testcontainers permission tests prove it); Maestro flows for the organiser path, member path, no-week-fits path and offline must-do entry pass.

## Requirements

### F-069 Setup wizard shell

| Area | Behaviour |
|---|---|
| Stepper | 4 chips WHEN · BUDGET · ROOMS · MUST-DOS; active yellow; done = check; header tag "{DEST} WON {a}–{b}" (tilted, from the closed destination poll) |
| Step machine | `trips.setup_step ∈ {when, budget, rooms, must_dos, ready}` (data-model-sync §3.1); organiser advances by locking a step; stepper jumps allowed to any completed step and to the next open one; edits to a locked step re-open it and mark downstream derived values stale (dates → budget estimates, rooms prices, must-do fits) |
| Member views (undesigned; design in code) | members see the same stepper read-only with per-step "your part": WHEN = connect calendar / mark days; BUDGET = set private max (write-only form); ROOMS = see own room + request swap; MUST-DOS = add own must-do. Organiser-only CTAs hidden; a "Winston is setting up" status line |
| Skippable | Rooms step skippable for solo trips and single-room stays (even split); budget skippable when crew < 2 |
| Realtime | `trip_setup:` events `step.status`, `calendar.sync_count`, `budget.band`, `rooms.changed`, `must_do.row`; presence via `trip_presence:` `here{screen:'setup', step}` |
| Motion | step transitions `fold`; chip `pop`; CTA label `flap` |
| Offline | all commands queue via PowerSync upload; step UI renders from local rows with "last synced" stamp |

### F-070 Availability & dates (3c-3, 3c-4)

| Area | Behaviour |
|---|---|
| Sources | Device calendars (iOS EventKit full access, Android `READ_CALENDAR` via `cp-calendar` module) → on-device reduction to date-level `free/maybe/busy` (never titles, attendees, times); Google freeBusy + Microsoft Graph `getSchedule` via server OAuth (tokens AES-GCM in `calendar_sources`); manual day marking fallback |
| Tentative | opt-in per member (Q-32): tentative events map to `maybe`, shown to others only as "maybe busy" |
| Freshness | `calendar_sources.last_sync_at`; device re-sync on foreground + background refresh (BGAppRefreshTask / WorkManager via P20 permission orchestrator); OAuth sync by `calendar.sync` job on connect, daily and on setup open; `calendar.stale_nudge` cron (09:00 local) nudges members with stale (>72 h) or missing data |
| Heatmap | month grid Mon-first, 40 px cells r10; "n/N" per cell; fill opacity steps .10/.20/.34/.50/.70/1.0 of `#ff9a4d` scaled to crew size (N up to 16 when boosted, C26); best window inset 2 px `#ffd84a`; month paging; multi-month span; "From {k} synced calendars. {name} hasn't connected yet." |
| Best window | deterministic sliding window (trip length adjustable, default from vote) over `availability_summaries` scored by free count → season score (destination months, event peaks from P15) → fare delta (P15 quotes per member origin); Pon reason line from template grounded in season dataset (LLM-free) |
| No week fits (3c-4) | when no window reaches N/N: up to 3 option cards from `date_window_options` — best partial ("FIVE OF SIX", names who miss which must-dos/skeleton highlights), full-crew alternative with price delta and seasonal trade-off, "ASK {name} FIRST" when the blocker has `maybe` days; guide pick badge; CTA label follows selection; "Pick a week anyway" → manual week picker (undesigned) |
| Private ask | `ask_availability` → guide DM to the target only (push N-05 with guide avatar, quick replies "Freed it" / "Can't move it"); reply by quick action or chat; intent parsed (Haiku via P13 gateway) when free text; organiser sees only resolution ("{name} freed Apr 2–4" or "not movable"); timeout 48 h → fall back to option 1 with notice. Consent: the organiser learns only that the member has a movable block, never the event |
| Lock | `lock_trip_dates` sets `trips.start_date/end_date`, recomputes boost window (C46) and downstream estimates |
| Motion | per-cell opacity steps animate as each member's sync lands; pen stroke draw-on around best window (scribble when none fits); options card-deal stagger; Pon slide-in |
| States to build | permission denied → manual entry; 0 of N synced; syncing skeleton; stale ("synced 3 d ago"); member never opened app; error/retry; ask pending (organiser waiting view); ask declined/timeout; 2+ blockers |

### F-071 Private budgets (3c-5, 3n-2)

| Area | Behaviour |
|---|---|
| Private max entry (undesigned member screen) | own-currency entry, prefilled from `budget_defaults_private` (3n-2 "Budget max · Never shown to anyone, guides included"); converted via FX snapshot to trip currency server-side; write-only: after save the app shows only "Set ✓ · change" (value kept in client `local_private` table via `GET /v1/me/private/budget_max` for the owner's own device only) |
| Aggregates | `app.recompute_budget_band` (SECURITY DEFINER) writes `trip_budget_aggregates`: band low/high, maxes_count, `under_all_ok`; dots only when k ≥ 4, bucketed (round to $50 buckets + deterministic per-trip jitter inside bucket, never equal to any exact max); band upper edge rounded down, never equal to the lowest max. **k < 4 maxes set (covers crews of 2–3)**: no band, no dots, no crew-level under-all check and no infeasible notice; organiser sees only "{k} of {N} set" (`K_ANON_UNAVAILABLE` from the band route); each member privately sees only their own fit for the organiser's current target ("fits your max" / "over your max") and may choose to tell the crew; locking never consults other maxes. This is stricter than P16's k ≥ 3 band — P27 renders nothing crew-level below k = 4 |
| Re-identification guard | recompute is debounced (≥ 2 submissions or 10 min) so a single change cannot be diffed; a member leaving recomputes with minimum-k re-check; maxes never enter LLM context (`llm.trip_context` has band only), logs (redaction test), analytics or exports |
| Sweet spot | knob over track (min feasible cost → max band high); breakdown bars FLIGHTS/STAYS/FOOD/FUN from P16 cost-engine estimates for locked dates and member origins; bars re-flow live (width + odometer); "✓ UNDER ALL N MAXES" flips to warning when knob > band high; haptic ticks at $10/$50 steps, warning haptic crossing band edge |
| Infeasible | only when k ≥ 4: lowest max < cheapest feasible plan → organiser sees anonymous "One budget is below the cheapest plan" + options (cheaper dates, shorter trip, hostel mix) (Q-31); k < 4 → members see it privately via their own fit line |
| Lock | k ≥ 4: `lock_budget_target` server-checks under all maxes on $50-step targets only; k < 4: no cross-member check; writes `budget_plans` (target, band, breakdown, stay mix). Rate limit 3 lock attempts per trip per hour and 10 per day (`RATE_LIMITED`), and a rejected lock returns only `over_band` (no distance), so repeated attempts cannot binary-search a max |
| States to build | waiting (k of N), estimates loading/failed, multi-currency, member never sets a max (excluded from "under all" with copy "{k} of {N} maxes counted"), knob above band |

### F-072 Rooms & stays (3c-6)

| Area | Behaviour |
|---|---|
| Stays | stay options from P16 (curated stay types + P16 `destination_cost_indices` cost bands shown as "~$X estimate"; no live hotel price or cancellation data exists pre-booking — Travelpayouts gives affiliate links only); no holds (D10): each stay card shows "BOOK HERE" affiliate link (P35 link builder when present; plain partner link otherwise) and, once a booking is imported (P34), "Free cancellation until {date}"; `set_stay_choice` |
| Grouping | deterministic trait clustering from taste chronotype + setup chips (early bird, light sleeper, snorer, couple; Q-33): couples share a bed; trait labels (LIGHT SLEEPERS, EARLY RISERS, NIGHT OWLS) from template; "don't care" preference honoured literally |
| Drag | long-press lift → drag avatar to a room → swap or move; others shuffle (spring); over capacity → reject shake + warning haptic; a11y: tap-select then tap-room; "same pairs" propagate to the second stay with per-stay override (undesigned toggle) |
| Price | per-room price split per room (unequal rooms → unequal shares) via `cost-engine/rooms`; per-person price odometer updates as avatars settle; synced to `cost_components` |
| Member view | read-only own room + "Ask to swap" (sends a request to organiser via `trip_setup:` + inbox item) |
| States to build | odd crew / capacity mismatch, unequal prices, stay unavailable, preferences missing, concurrent edit conflict (`base_version` → `PLAN_VERSION_CONFLICT`-style reject with rebase) |

### F-073 Must-dos (3c-7, 3c-10)

| Area | Behaviour |
|---|---|
| Prompt | push/inbox to each member "{guide}: {name}, what's the one thing {dest} isn't complete without?" deep-linking straight into the 3c-10 sheet |
| Sheet | search field with per-keystroke results (`/v1/places/search` biased to destination, offline fallback on local `trip_pack` POIs), each with fit pill FITS DAY n (post-draft only; pre-draft "FITS", C44) / TIGHT / CLASH / BOOK AHEAD; blurb = cached guide-voice line from content (P18) else POI summary; freeform row "“{text}” Keep it just as you typed it"; system keyboard with return key "Add" |
| Presence | typing presence on `trip_presence:` (`typing{scope:'must_dos'}`, throttled) → dashed "{name} is typing" row with dots (ty 0→−4→0, 1200 ms, 160 ms stagger) |
| Insert | row pops in; dashed → solid, check swaps in, scale .96→1.03→1 420 ms ease-out; clash → shake + warning haptic |
| Fit check | `set_must_dos` → `ai.fit_check` job: deterministic planner fit (hours on trip dates, travel time from stay, day capacity, booking lead time) → `must_dos.fit_status`; Haiku writes only the one-line note; results on `trip_setup:` `must_do.row` |
| External actions | lottery/ticket lead-time detection from POI editorial flags → `external_action`; copy per supplier table: "Entries close {date}. Each of you enters on the official site — I'll remind you." (`track_lottery` creates reminders N-45, never enters); book-ahead → "Book by {date}" with affiliate link when one exists |
| Rules | one primary per member plus optional extras (priority); edit/remove own; duplicates merge with both avatars; drafting may start before all are in (Q-34) — late must-dos before proposal send trigger a free fit-in redraft (P28) |
| States to build | no results, loading, offline (freeform only + queued), closed on trip dates (alternatives), already added by someone, member never answers (nudge at 24 h via `send_nudge`), lottery lost |
| Entitlement | fit checks and must-do suggestions are system AI: unmetered (do not count toward the 30/day) |

## Architecture & contracts

| Kind | Delta |
|---|---|
| Tables | create all §3.4 tables + `availability_summaries`, `date_window_options`, `dietary_profiles`, `participant_dietary_flags` exactly as data-model; add `calendar_sources.consent_tentative bool` and `trips.trip_length_days` (**doc delta**); `budget_max_private.amount_trip_minor` (converted) (**doc delta**) |
| RLS backstop | split tables owner-only (`X`); `budget_max_private`: INSERT/UPDATE own, no SELECT for `app_user`; owner read via SECURITY DEFINER `app.my_budget_max(trip)`; aggregates written only by `app_system` SECURITY DEFINER functions; none of the C3 tables in the PowerSync publication nor granted to `guide_reader` |
| Sync streams | `trip` stream gains `availability_summaries`, `date_window_options`, `trip_budget_aggregates`, `budget_plans`, `room_plans`, `room_assignments`, `must_dos`, `participant_dietary_flags` (own file `infra/powersync/streams/setup.yaml`, merged into `trip` by `build-config.ts`) |
| Commands | api-contracts §4.5 all rows; plus `set_budget_default`, `set_setup_step`, `request_room_swap`, `set_room_prefs` (**doc delta**) |
| Routes | `GET /v1/budget/{trip_id}/band`; `GET /v1/me/private/budget_max`; `GET /v1/calendar/oauth/{provider}/start` + callback (PKCE, state bound to session) (**doc delta**); `GET /v1/setup/{trip_id}/windows?length` (compute on demand) (**doc delta**) |
| Realtime | `trip_setup:{trip_id}` via `rt_outbox` only; never C3 payloads |
| Jobs | `ai.fit_check`, `calendar.sync` (per source, retries 3) (**doc delta**: add to async §2), `calendar.stale_nudge`, `setup.window_recompute` (debounced on `availability.updated`) (**doc delta**), `setup.budget_recompute` (debounced) (**doc delta**), `availability_ask.timeout` |
| Push | N-05 private ask, N-45 lottery reminder, N-46 ask answered, must-do prompt (**doc delta**: add N-id) |
| AI | Haiku via P13 gateway: private ask DM wording, ask-reply intent, fit notes; no C3 in context (budget band only) |
| Native | `apps/mobile/modules/cp-calendar`: Swift EventKit (`requestFullAccessToEvents`), Kotlin CalendarContract; API `readBusyDays(range, includeTentative) → [{date, state}]`; no event data crosses the bridge |

## Tasks

### T1 — Availability & budget schema, aggregators, permission tests
- Goal: tables + SECURITY DEFINER aggregators for calendars, availability, budgets.
- Files: `packages/db/src/schema/setup.ts`, `packages/db/migrations/<ts>_setup_availability_and_budgets.sql`, `packages/db/test/permissions/{calendar-sources,calendar-days,availability-asks,availability-summaries,date-window-options,budget-max-private,budget-defaults-private,trip-budget-aggregates,budget-plans}.test.ts`, `packages/domain/src/setup/{availability,budget}.ts`
- Steps: 1. Drizzle tables per data-model §3.4 + deltas. 2. Hand SQL: RLS ENABLE+FORCE, grants per role, `app.recompute_availability(trip)`, `app.recompute_budget_band(trip)` (k≥4, bucket+jitter, band edge rule), `app.my_budget_max(trip)`. 3. Exclude C3 tables from publication; revoke from `guide_reader`. 4. zod schemas in domain.
- Tests: `pnpm --filter @cp/db test -- permissions/budget-max-private permissions/calendar-days permissions/trip-budget-aggregates`
- Done when: owner cannot SELECT own `budget_max_private` as `app_user`; organiser/other member/`guide_reader`/`powersync_repl` read 0 rows of every C3 table; band never equals the lowest max across a property test of 1,000 random crews; band, dots, under-all and infeasible flag all absent when k < 4; inference property tests for k = 2 and k = 3 (organiser knows own max, observes every output of the aggregate, band route and lock responses) cannot bound the other maxes more tightly than "set / not set".
- Status: done — ec95597b

### T2 — Rooms, must-dos, dietary schema + sync streams
- Goal: remaining setup tables and stream entries.
- Files: `packages/db/src/schema/setup.ts`, `packages/db/migrations/<ts>_setup_rooms_must_dos_dietary.sql`, `packages/db/test/permissions/{room-plans,room-assignments,must-dos,dietary}.test.ts`, `infra/powersync/streams/setup.yaml`
- Steps: 1. `room_plans`, `room_assignments`, `must_dos`, `dietary_profiles` (X), `participant_dietary_flags` (derived with consent). 2. RLS: members read, organiser writes rooms, owner writes must-dos. 3. Append tables to `trip` stream. 4. PowerSync local replica test.
- Tests: `pnpm --filter @cp/db test -- permissions/must-dos permissions/room-assignments permissions/dietary`; `pnpm --filter @cp/db test:sync`
- Done when: non-participant reads 0 rows; member cannot write another member's must-do; dietary detail unreadable by peers, flags readable only with consent.
- Status: done — ddf2d255

### T3 — Date-window engine
- Goal: pure best-window + no-fit option generation.
- Files: `packages/planner/src/setup/{windows,no-fit-options}.ts`, `packages/planner/test/setup/windows.test.ts`
- Steps: 1. Sliding window over per-date counts (free/maybe/busy/unknown), variable length, horizon ≤ 6 months. 2. Score = full-crew > season score > fare delta; tie-break earliest. 3. No-fit: best partial (missing members + which must-dos/highlights they'd miss), best full-crew alternative with price delta + season note, ask-first candidate when blocker has only `maybe` days. 4. Output `date_window_options` rows.
- Tests: `pnpm --filter @cp/planner test -- setup/windows`
- Done when: fixtures reproduce 3c-3 (Apr 2–9 all 6) and 3c-4 (3 options, ask-Dev pick) outputs; 16-member, multi-month and empty-data cases covered.
- Status: done — 0b0d3cf3

### T4 — Budget band & room pricing math
- Goal: pure budget breakdown/knob validation and per-room split.
- Files: `packages/cost-engine/src/budget/{band,breakdown,feasibility}.ts`, `packages/cost-engine/src/rooms/{group,split}.ts`, `packages/cost-engine/test/{budget,rooms}/*.test.ts`
- Steps: 1. `breakdown(target, estimates)` → FLIGHTS/STAYS/FOOD/FUN summing exactly to target (largest-remainder). 2. `isUnderAll(target, band)`; feasibility vs cheapest plan. 3. Trait clustering (couples, chronotype, sleep) → room proposal. 4. Per-room split with unequal prices, nights per stay.
- Tests: `pnpm --filter @cp/cost-engine test -- budget rooms`
- Done when: bars always sum to target in minor units; 3c-6 fixture groups light sleepers/early risers/night owls; odd crew sizes produce a valid plan or a capacity error.
- Status: done — e8f6871e

### T5 — Availability & calendar commands, OAuth, sync jobs
- Goal: server side of F-070.
- Files: `services/api/src/commands/setup/{set-availability,connect-calendar,disconnect-calendar,ask-availability,answer-availability-ask,lock-trip-dates,set-setup-step}.ts`, `services/api/src/calendar-oauth/**`, `services/api/src/setup/windows-route.ts`, `services/worker/src/jobs/calendar/{sync,stale-nudge}.ts`, `services/worker/src/jobs/setup/{window-recompute,availability-ask-timeout}.ts`
- Steps: 1. Handlers with policy + idempotent op_id; `set_availability` writes `calendar_days` then enqueues debounced recompute. 2. Google/Microsoft OAuth (PKCE, encrypted tokens, revoke on disconnect) + freeBusy → date-level reduction. 3. Ask flow: guide DM via P13 gateway + N-05 push with quick actions; reply intent; timeout job. 4. `trip_setup:` events via `rt_outbox`.
- Tests: `pnpm --filter @cp/api test -- commands/setup/availability`; `pnpm --filter @cp/worker test -- jobs/calendar`
- Done when: integration test proves organiser receives only counts/resolution; OAuth tokens never logged (log redaction test); stale nudge fires once per member per stale period.
- Status: done — 3daea28f

### T6a — Budget commands, band route, private read
- Goal: server side of F-071.
- Files: `services/api/src/commands/setup/{submit-budget-max,set-budget-default,lock-budget-target}.ts`, `services/api/src/setup/{budget-band-route,private-read,own-fit}.ts`, `services/worker/src/jobs/setup/budget-recompute.ts`
- Steps: 1. Budget submit converts via FX snapshot, emits count-only event, debounced recompute. 2. `lock_budget_target`: k ≥ 4 rejects above band (`STATE_INVALID{over_band}`), k < 4 no cross-member check; rate limit 3/h, 10/day per trip. 3. Own-fit read (self only). 4. k < 4 → band route `K_ANON_UNAVAILABLE`.
- Tests: `pnpm --filter @cp/api test -- commands/setup/budget`
- Done when: no response body, event, log line or `rt_outbox` payload contains a max (grep-assert test on captured outputs); 4th lock attempt in an hour → `RATE_LIMITED`; k = 2 and k = 3 crews get no band, no infeasible notice, and own-fit only for the caller.
- Status: done — 62d38f9b

### T6b — Rooms, must-do commands + fit-check job
- Goal: server side of F-072–F-073.
- Files: `services/api/src/commands/setup/{set-room-assignment,request-room-swap,set-room-prefs,lock-rooms,set-stay-choice,set-must-dos,track-lottery}.ts`, `services/worker/src/jobs/ai/fit-check.ts`
- Steps: 1. Rooms with base_version check; prices from P16 cost bands into `cost_components`. 2. Must-dos + must-do prompt push. 3. `ai.fit_check`: planner fit + Haiku note; lottery → reminders only.
- Tests: `pnpm --filter @cp/api test -- commands/setup/rooms commands/setup/must-dos`; `pnpm --filter @cp/worker test -- jobs/ai/fit-check`
- Done when: fit status transitions visible on `trip_setup:`; must-do prompt push is sent to every participant once; concurrent room edit → rebase reject.
- Status: done — 58f51b34

### T7 — cp-calendar native module + calendar connect UI
- Goal: on-device date-level busy reduction and connection flows.
- Files: `apps/mobile/modules/cp-calendar/**` (Swift + Kotlin + TS), `apps/mobile/src/features/setup/{hooks/use-calendar-sync.ts,components/calendar-connect-sheet.tsx}`
- Steps: 1. EventKit full access / CalendarContract read; reduce to `{date,state}` natively. 2. Permission via P20 orchestrator with 3a-9 copy; denied → manual entry. 3. Foreground + background refresh re-upload. 4. OAuth connect via in-app browser to `/v1/calendar/oauth/*`; tentative opt-in toggle.
- Tests: `pnpm --filter @cp/mobile test -- setup/calendar`; `cd apps/mobile/modules/cp-calendar && xcodebuild test -scheme CpCalendarTests`; `./gradlew :cp-calendar:testDebugUnitTest`
- Done when: native unit tests prove no title/attendee/time leaves the module; manual fallback works with permission denied.
- Status: done — f786c240, 9a2f72a8

### T8 — Wizard shell + When + No-week-fits screens
- Goal: F-069 shell and 3c-3/3c-4 UI with member views.
- Files: `apps/mobile/src/features/setup/{screens/setup-shell.tsx,screens/when-screen.tsx,screens/no-week-fits-screen.tsx,components/{stepper,heatmap,window-options,week-picker}.tsx,queries.ts,commands.ts}`, `apps/mobile/src/app/(trip)/[tripId]/setup/**`, `packages/i18n/locales/en/setup/when.po`, `e2e/setup/when.yaml`, `e2e/setup/no-week-fits.yaml`
- Steps: 1. Step machine from `trips.setup_step`; organiser vs member rendering. 2. Heatmap (Skia or Reanimated cells) with animated opacity steps + draw-on stroke / scribble. 3. Options card-deal, CTA flap, ask flow waiting state, manual week picker. 4. All missing states listed in F-070.
- Tests: `pnpm --filter @cp/mobile test -- features/setup/when`; `maestro test e2e/setup/when.yaml e2e/setup/no-week-fits.yaml`
- Done when: RNTL layout snapshots committed and Maestro `takeScreenshot` artifacts produced for founder review against `3c-3_When.png` / `3c-4_No_week_fits.png`; member view shows no other member's day states; VoiceOver reads "{date}, {n} of {N} free".
- Status: done — 16f56d0c

### T9 — Budget screen + private max entry
- Goal: 3c-5 organiser screen and undesigned member max entry.
- Files: `apps/mobile/src/features/setup/{screens/budget-screen.tsx,screens/private-max-screen.tsx,components/{budget-track,breakdown-bars}.tsx}`, `packages/i18n/locales/en/setup/budget.po`, `e2e/setup/budget.yaml`
- Steps: 1. Track with bucketed dots drop-in stagger + band squeeze animation; knob gesture with haptic ticks via feedback bus. 2. Breakdown re-flow + odometer. 3. Member entry with FX preview, write-only confirmation, `local_private` cache. 4. k<4, infeasible, waiting, multi-currency states.
- Tests: `pnpm --filter @cp/mobile test -- features/setup/budget`; `maestro test e2e/setup/budget.yaml`
- Done when: after submit, no screen or query on another device shows the value; dots hidden for a 3-person crew; knob above band flips the check and blocks LOOKS GOOD.
- Status: done — d45ed76d

### T10 — Rooms screen
- Goal: 3c-6 drag assignment with live price.
- Files: `apps/mobile/src/features/setup/{screens/rooms-screen.tsx,components/{stay-card,room-row,draggable-avatar}.tsx}`, `packages/i18n/locales/en/setup/rooms.po`, `e2e/setup/rooms.yaml`
- Steps: 1. Gesture kit long-press drag, spring shuffle, reject shake. 2. Tap-select a11y path. 3. Per-person odometer from `cost-engine/rooms`. 4. Book-here link + free-cancel line when an imported booking exists; member read-only + swap request.
- Tests: `pnpm --filter @cp/mobile test -- features/setup/rooms`; `maestro test e2e/setup/rooms.yaml`
- Done when: swap updates both avatars and prices on a second device within 1 s via `trip_setup:`; over-capacity drop is rejected.
- Status: done — 21416849

### T11 — Must-dos list + add sheet with presence
- Goal: 3c-7 and 3c-10.
- Files: `apps/mobile/src/features/setup/{screens/must-dos-screen.tsx,screens/add-must-do-sheet.tsx,components/{must-do-row,typing-row,fit-pill}.tsx,hooks/use-setup-presence.ts}`, `packages/i18n/locales/en/setup/must-dos.po`, `e2e/setup/must-dos.yaml`, `e2e/setup/must-dos-offline.yaml`
- Steps: 1. Per-keystroke search (debounce 120 ms, local fallback). 2. Typing presence publish/subscribe; dashed → solid row animation. 3. Lottery/book-ahead pills with truthful copy + reminder. 4. DRAFT MY TRIP CTA (enabled with ≥1 must-do; routes to P28 start).
- Tests: `pnpm --filter @cp/mobile test -- features/setup/must-dos`; `maestro test e2e/setup/must-dos.yaml e2e/setup/must-dos-offline.yaml`
- Done when: offline add queues and appears after reconnect with fit status; push deep link opens the sheet directly; no copy claims the app entered a lottery.
- Status: done — 45de653c

## Phase acceptance criteria

- [ ] All T1–T11 done-when checks pass in CI.
- [ ] Permission suite: no C3 setup table readable by peers, organiser, `guide_reader`, `powersync_repl`.
- [ ] Captured-output test: budget maxes absent from API responses, events, logs, `rt_outbox`, LLM prompts.
- [ ] Heatmap denominators follow seat cap (6 / 16 boosted).
- [ ] Every missing state listed under F-069…F-073 has a rendered state reachable in dev menu fixtures.
- [ ] Maestro: organiser full path, member path, no-week-fits, offline must-do.
- [ ] Strings only in `packages/i18n/locales/en/setup/*`.

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Budget re-identification by elimination | k≥4 for any crew-level output (k<4: count + own fit only), bucketing + jitter, debounce, edge rule, lock rate limit with distance-free rejects; k=2/k=3 inference property tests; feature flag `setup.budget_dots` hides dots without release |
| Calendar OAuth verification (Google restricted scope review) delays | device calendars + manual work alone; OAuth connect row hidden by flag `calendar.oauth_{provider}` |
| Tentative metadata leakage | opt-in only; organiser sees resolution only |
| Drag perf on low-end Android | worklet-only layout; fall back to tap-select if frame budget exceeded |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Google OAuth verification for `calendar.freebusy` scope; Microsoft app registration (`Calendars.ReadBasic`) | flags off; device + manual only |
| iOS `NSCalendarsFullAccessUsageDescription`, Android `READ_CALENDAR` Play declaration | build fails review → manual entry only |
| Season/event datasets (P15), cost estimates (P16), guide-voice blurbs (P18) | template reason line without season note; POI summary as blurb |
| Counsel review of tentative-ask consent copy | ship opt-in default off |

## Open questions

1. Budget bucket size: default $50 buckets (or local-currency equivalent) with deterministic per-trip jitter.
2. Who may lock steps: default organiser only (Q-30 analogue); members contribute data.
3. Rooms visible to crew before proposal: default yes (C1), editable by organiser only.
4. Doc delta: `calendar.sync`, `setup.window_recompute`, `setup.budget_recompute` queues; OAuth routes; `trips.trip_length_days`; must-do prompt push id.
5. Ask timeout: default 48 h, then fall back to the best partial option with a notice to the organiser.
