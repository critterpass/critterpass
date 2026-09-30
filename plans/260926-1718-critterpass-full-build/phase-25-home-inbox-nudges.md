---
phase: 25
title: Home, inbox, nudges, countdown, tips
status: in_progress
depends_on: [11, 13, 15, 23, 24]
wave: 11
features: [F-053, F-054, F-055, F-056, F-057]
screens: [3b-1, 3b-2, 3b-4, 3b-5, 3b-6, 3a-13, 3f-6, 3k-1, 5c-2]
tasks: 9
owns:
  - packages/db/src/schema/home.ts
  - packages/db/migrations/<ts>_home_inbox_nudges_tips.sql
  - packages/db/test/permissions/home-inbox-nudges.test.ts
  - packages/domain/src/home/
  - packages/domain/src/inbox/
  - packages/domain/src/nudges/
  - services/api/src/commands/home/
  - services/api/src/commands/inbox/
  - services/api/src/commands/nudges/
  - services/api/test/home/
  - services/worker/src/jobs/inbox/
  - services/worker/src/jobs/nudges/
  - services/worker/src/jobs/tips/
  - services/worker/src/jobs/countdown/
  - services/worker/test/home/
  - packages/ai/src/prompts/tips/
  - packages/ai/evals/tips/
  - apps/mobile/src/app/(tabs)/index.tsx
  - apps/mobile/src/app/inbox/
  - apps/mobile/src/features/home/
  - packages/i18n/locales/en/home/
  - e2e/home/
---
# Phase 25 — Home, inbox, nudges, countdown, tips

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | C14 countdown, Q-07 (Home crew-scoped, Inbox global, TRIPS root), Q-19 (non-installed invitees: share-sheet relay only; installed users always get an inbox item), Q-85 ALWAYS classes, Q-89 (nudge target, 24 h cooldown per pair, "from {sender}"), D5 (numbers from code), D8 |
| `docs/system-architecture.md` | §4 commands, reads, jobs, push, AI |
| `docs/data-model.md` | §3.3 `trips.plan_progress`, `trip_participants.countdown_target_at`; §3.11 `inbox_items`, `scheduled_deliveries`, `notification_prefs.guide_tips`; `saved_items`, `reminders` |
| `docs/data-model-sync-and-privacy.md` | §3.1 trip state machine (mode inputs), §4 streams `me`, `crews`, `trip`; table→phase map row 25 |
| `docs/api-contracts.md` | §4.3 `act_inbox_item`, `mark_inbox_read`, `send_nudge`, `dismiss_tip` (`create_trip` moved to P26); error `NUDGE_TOO_SOON`; `undo_guide_action` (implemented by P13) |
| `docs/api-contracts-async.md` | `user:#uid` (`inbox.*`, `badge.counts`), `crew:` (`home.badges`, `trip.summary`); queues `inbox.fanout`, `nudge.dispatch`; N-12; widget `NudgeIntent` |
| Reports | `design-analysis-260926-1143-onboarding-home-report.md` §2 3b-1, 3b-2, 3b-4, 3b-5, 3b-6, §5, §8; master §2 F-053…F-057, §7 N-12, §6.2 invitee channel row |
| Renders | `docs/design-renders/screens/3b-1_Home_first_run.png`, `3b-2_Home.png`, `3b-4_Inbox.png`, `3b-5_All_caught_up.png`, `3b-6_Home_final_vote.png`, `3a-13_You_re_in.png`, `3f-6_Who_s_in.png`, `3k-1_Trip_hub.png`, `5c-2_Home_screen_on_the_trip.png` |

## Overview

Goal: Home as a crew-scoped mode machine with a timezone-correct live countdown, a global inbox whose inline actions share the same idempotent commands as notifications/widgets (with undo), guide-voiced nudges under strict caps (share-sheet relay for non-installed invitees), and a data-backed proactive tip strip.

Done when: every Home mode renders from synced local data offline; the countdown equals C14 for any viewer timezone; inbox actions resolve items once regardless of surface and slide off with the designed motion down to the sleeping-Tokek empty state; `send_nudge` enforces 1/pair/24 h and schedules at the target's engagement hour; tips only show numbers present in stored facts.

## Requirements

### F-053 Home mode machine (3b-1, 3b-2, 3b-6 + undesigned)

| Mode | Trigger (pure fn over synced data) | Rendering |
|---|---|---|
| `first_run` | no crew and no trip | 3b-1: "WELCOME, {NAME}", JOIN WITH A CODE (→ 3a-11, P23), "WHERE TO FIRST?", 6 guide cells idling + SOMEWHERE ELSE (→ 3b-7, P26); tapping a guide hops out of its cell and grows into its destination page (route owned by P30; shared-element grow) |
| `everyday` | upcoming trip and/or open destination poll at stage board | 3b-2: header, next-up card, WHERE NEXT? vote slot (board rendered by P26), tip strip |
| `final_vote` | destination poll stage `final` | 3b-6: vote slot shows split card (P26) |
| `no_trip` (undesigned) | crew, no upcoming trip, no open poll | empty next-up area with guide line + "PITCH A PLACE" CTA and last trip stamp |
| `in_trip` (undesigned) | active trip `in_trip` | next-up card becomes "TODAY · DAY n" card (next stop + leave-by from P36 data when present) linking to trip hub 3k-1 |
| `post_trip` (undesigned) | trip `post_trip` < 14 d | "{PLACE} RECAP" card (P43 target) + settle-up nudge row when balances open |
| Header (all) | avatar "HEY {NAME} ›" → You; crew switcher "{CREW} ▾" (→ 3g-3 sheet, P23); crew pill (member stack + chat icon + unread from P24 `useUnreadCount`) → chat; bell with needs-you badge → Inbox |
| Motion | bell rings once on new needs-you (swing ±15° damped ≈600 ms + light haptic), badge pop 360 ms; Tokek bob 2800 ms on next-up card; crew switch cross-fade; mode change cross-fade (board→final fold is P26) |
| Offline | Home renders from PowerSync; countdown ticks locally; no spinner when cached |
| Loading | skeleton only on first sync with no local data |

Vote slot contract: `packages/domain/src/home/home-state.ts` exposes `HomeState.vote: {pollId, stage, candidates, votersIn, memberCount, closesAt} | null`; P26 supplies the query + `VoteSlot` component via `apps/mobile/src/features/home/slots.ts` registration.

### F-054 Countdown (3b-2, 3k-1; C14)

- Target = viewer's first outbound departure (flight segment departing from home side; P34 data) else trip start 00:00 destination tz; stored per participant in `trip_participants.countdown_target_at`; one source for Home, hub, widget, LA.
- Recompute job on `trip.dates_changed`, `trip.destination_set`, `booking.flight_added/changed/removed`, `user.tz_changed`.
- Display "NEXT UP · {date in destination tz}", chip `dd D hh:mm:ss` (1 s tick, tabular numerals); < 24 h → `hh:mm:ss`; past → "TODAY"/"DAY n"; "PLAN {n}%" from `trips.plan_progress`.

### F-055 Inbox (3b-4, 3b-5)

| Aspect | Behaviour |
|---|---|
| Filters | ALL / NEEDS YOU · n / CREW / GUIDES; default NEEDS YOU when n > 0 |
| Cards | needs-you action cards on top (icon tile colour per kind, title, live body, inline buttons); EARLIER quiet list (actor avatar, line, relative time, optional UNDO) |
| Fan-out | `inbox.fanout` consumes domain events; kind registry maps event → recipients, `needs_you`, actions, deep link, `expires_at`, `undo_until`; later phases register their kinds (poll vote P26, approvals P29, RSVP follow-up P31, payments P33 …). This phase registers: `crew.member_joined`, `invite.opened`, `nudge.received`, `guide_action.executed` (UNDO), `tip.price_drop` |
| Live values | body placeholders resolved client-side from synced rows by kind renderer (e.g. "Penida leads 4–2") |
| Actions | `act_inbox_item{item_id, action}` dispatches the target command in the same `op_id` namespace; optimistic slide-off, rollback on reject with toast; item resolved from another surface (notification/widget) disappears live |
| Mark all read | read ≠ resolved; toast "Marked read. The {n} on top still need you." |
| Undo | UNDO rows call `undo_guide_action` (P13) until `undo_until`; toast from result |
| Empty 3b-5 | "ALL CAUGHT UP"; sleeping Tokek (bob 3400 ms, z doodle); copy names the watched item (latest open poll the user voted in) else generic line; tap → opens one eye (wave + jump 16 px 420 ms, toast, back to sleep 2.2 s); new item drops in and wakes it |
| Motion | handled card pop 360 ms → slide off right 360 ms rotate 4° → height collapse 320 ms; count ticks down; last one → fade to empty state after 380 ms |
| Badges | `badge.counts` on `user:#uid`; app icon badge = needs-you count |
| Undesigned | loading, first-ever empty (no EARLIER), expired-while-viewing ("Vote closed — {result}"), action failure, CREW and GUIDES filter views, pagination (> 50 earlier) |

### F-056 Nudges (3b-4, 3f-6, 3k-1, 5c-2, 3a-13)

- `send_nudge{target_uid, reason, context}`: member only, ≤1 per (sender, target) per 24 h (`NUDGE_TOO_SOON` + `next_at`), ≤2 received nudges per target per day, never in quiet hours.
- Send time = target's engagement hour (most frequent app-open local hour, last 14 d, fallback 19:00 target tz) → `scheduled_deliveries(kind=nudge)` → `nudge.dispatch` → N-12 BUDGET, guide-voiced template of the active trip's guide, "from {sender}". Toast: "{Guide} will nudge {name} at {hh:mm}, when {they} open things."
- Branch on installed (target has an account with any registered app installation), not on push token: installed → `nudge.received` inbox item always + N-12 push only when a token exists (push denied → inbox only, response `{outcome: 'inbox'}`); not installed (invitee who never opened the app) → no server send (Q-19), response `{relay: 'share_sheet', text, url}` → client opens OS share sheet with guide-voiced text + invite link.
- Reasons: `vote`, `rsvp`, `readiness`, `payment` (P33 uses `nudge_payment`), `invite_open`. Callers: inbox, 3f-6 (P31), briefing (P36), widget `NudgeIntent` (P49).

### F-057 Proactive tip strip (3b-2)

- Daily `tips.generate` per crew (and on fare/season updates): deterministic detectors over board candidates × crew home airports: fare drop ≥ 15 % vs 30-d median (P15 fare calendars), "book by" deadline from calendar trend, season peak window (P15 season data), crowd dip (BestTime). Output facts `{kind, place_id, value_minor, currency, date, origin}`.
- Haiku phrases one line ≤120 chars in guide voice from facts; validator rejects any number/date not in facts; fallback deterministic template.
- One tip at a time on Home (guide avatar, Caveat), tap → destination page (P30 route), swipe/dismiss → `dismiss_tip`; respects `notification_prefs.guide_tips`; hidden when none; sponsored content never shown.

### Trip creation

`create_trip` (crew → `voting` + destination poll in one transaction; solo → `setup`; FTF check) is owned by P26, which owns the poll it must create. Home only renders trips.

## Architecture & contracts

| Area | Delta |
|---|---|
| Tables | `saved_items`, `reminders` per data-model. **doc delta** new: `home_tips(id, crew_id, guide_id, kind, text, facts jsonb, place_id, valid_until, status active/dismissed/expired, created_at)`; `nudges(id, sender_id, target_id, crew_id, reason, context jsonb, channel push/share_sheet, scheduled_delivery_id, sent_at, created_at)` uk-ish index (sender_id, target_id, created_at); `app_open_hours(user_id, hour_local smallint, opens int, updated_at)` pk (user_id, hour_local) |
| RLS | `home_tips` read `app.is_crew_member`; `nudges` read sender or target, write via handler; `app_open_hours` self only, excluded from sync and `guide_reader` |
| Sync streams | `crews` + `home_tips`; `me` + `nudges` (own sent/received), `saved_items`, `reminders` |
| Commands | §4.3 set implemented here except `undo_guide_action` (P13), `save_place` and `create_trip` (P26); **doc delta** `record_app_open{hour_local}` (fire-and-forget, 1/h) |
| Events | `inbox.item_created/resolved`, `badge.counts`, `nudge.sent`, `tip.created/dismissed`, `trip.created` |
| Jobs | `inbox.fanout` (key `(event_id, uid)`), `nudge.dispatch`, `tips.generate` (cron 06:00 SGT + on `fare.updated`), `countdown.recompute` (**doc delta** queue); flights reach `countdown.recompute` through a typed `FlightSegmentsSource` port (`packages/domain/src/home/countdown.ts`); P34 registers the bookings-backed source (wiring task in P34); with no registered source the C14 rule already falls back to trip start 00:00 destination tz |
| Privacy | `nudges` and `app_open_hours` appended to the P8 class map `packages/domain/src/privacy.ts` (append-only) so P45 export/deletion and the purge test cover them |
| Push | N-12 nudge (BUDGET); inbox items do not push by themselves (source events own their N-ids) |
| AI | route `tips.phrase` (Haiku), prompt in `packages/ai/src/prompts/tips/`, eval `packages/ai/evals/tips/` (number-grounding grader) |

## Tasks

### T1 — Schema, RLS, streams for home/inbox/nudges/tips
- Goal: tables above + permission tests.
- Files: `packages/db/src/schema/home.ts`, `packages/db/migrations/<ts>_home_inbox_nudges_tips.sql`, `packages/db/test/permissions/home-inbox-nudges.test.ts`, `packages/domain/src/privacy.ts` (append-only entries).
- Steps: 1. Drizzle + SQL for `saved_items`, `reminders`, `home_tips`, `nudges`, `app_open_hours`. 2. Policies, grants, publication (exclude `app_open_hours`). 3. Stream entries. 4. Privacy class-map entries for `nudges`, `app_open_hours`, `saved_items`, `reminders`. 5. Tests: crew tip visibility, nudge visible to sender+target only, open hours private, guide_reader denied.
- Tests: `pnpm --filter @cp/db test -- home-inbox-nudges`
- Done when: all cases pass.
- Status: done — 9d77b85c

### T2 — Home mode machine and countdown target
- Goal: pure, exhaustively tested domain logic.
- Files: `packages/domain/src/home/{home-state,mode-machine,countdown}.ts`, `packages/domain/test/home/*.test.ts`.
- Steps: 1. `deriveHomeMode(input)` for 6 modes with precedence in_trip > final_vote > everyday > post_trip > no_trip > first_run. 2. `countdownTarget(participant, flights, trip)` per C14 using Temporal/tz db. 3. `formatCountdown(now, target)`.
- Tests: `pnpm --filter @cp/domain test -- home`
- Done when: table tests cover each mode, DST edges, viewer tz ≠ destination tz, flight vs no-flight.
- Status: done — 9d77b85c

### T3 — Inbox fan-out and inbox commands
- Goal: kind registry, fan-out job, actions, badges.
- Files: `packages/domain/src/inbox/{kinds,registry}.ts`, `services/worker/src/jobs/inbox/fanout.ts`, `services/api/src/commands/inbox/{act-inbox-item,mark-inbox-read}.ts`, `services/api/test/home/inbox.test.ts`, `services/worker/test/home/fanout.test.ts`.
- Steps: 1. Registry API `registerInboxKind`. 2. Fan-out idempotent per `(event_id, uid)`; resolves items when underlying state resolves (e.g. ballot cast elsewhere). 3. `act_inbox_item` dispatch table → target command via P10 framework, same `op_id`. 4. `badge.counts` recompute + rt_outbox. 5. Register this phase's kinds.
- Tests: `pnpm --filter @cp/api test -- inbox`; `pnpm --filter @cp/worker test -- fanout`
- Done when: resolving from a notification action resolves the inbox item; duplicate action returns `duplicate`; badge counts correct.
- Status: done — 9d77b85c

### T4 — Nudges: command, send-time model, dispatch, share relay
- Goal: F-056 server side.
- Files: `packages/domain/src/nudges/{rules,templates,send-time}.ts`, `services/api/src/commands/nudges/{send-nudge,record-app-open}.ts`, `services/worker/src/jobs/nudges/dispatch.ts`, tests in `services/api/test/home/nudges.test.ts`.
- Steps: 1. Rate rules + quiet hours. 2. Engagement hour from `app_open_hours`. 3. Schedule → dispatch → inbox item + `notify.route` N-12 with guide persona template (localised in `packages/i18n/locales/en/home/`). 4. Installed-without-token → inbox only; not installed → relay payload.
- Tests: `pnpm --filter @cp/api test -- nudges`
- Done when: second nudge within 24 h → `NUDGE_TOO_SOON` with `next_at`; schedule time equals modal hour in target tz; installed target with push denied gets an inbox item and no relay; non-installed target gets relay and no server send.
- Status: done — 9d77b85c

### T5 — Countdown recompute, tip generation, create_trip
- Goal: background jobs + trip creation.
- Files: `services/worker/src/jobs/countdown/recompute.ts`, `services/worker/src/jobs/tips/{detect,generate}.ts`, `packages/ai/src/prompts/tips/phrase.md`, `packages/ai/evals/tips/promptfooconfig.yaml`, `services/api/src/commands/home/dismiss-tip.ts`, `services/worker/test/home/{countdown,tips}.test.ts`.
- Steps: 1. Recompute on listed events through the `FlightSegmentsSource` port. 2. Detectors over P15 fare/season tables (Testcontainers fixtures seeded from recorded real API responses). 3. Haiku phrase + number validator + template fallback.
- Tests: `pnpm --filter @cp/worker test -- home`; `pnpm --filter @cp/ai eval tips`
- Done when: tip with unsupported number is rejected and replaced by template; contract test: a `booking.flight_added` event with a fixture `FlightSegmentsSource` moves `countdown_target_at` to the outbound departure, and with no source registered the target is trip start 00:00 destination tz.
- Status: done — 9d77b85c

### T6 — Home screen (all modes)
- Goal: 3b-1, 3b-2, 3b-6 shell + undesigned modes.
- Files: `apps/mobile/src/app/(tabs)/index.tsx`, `apps/mobile/src/features/home/{home-screen,home-header,crew-pill,bell-button,next-up-card,countdown-chip,first-run-grid,no-trip-card,in-trip-card,post-trip-card,tip-strip,slots}.tsx`, `apps/mobile/src/features/home/data/use-home-state.ts`, tests alongside.
- Steps: 1. `useHomeState` from PowerSync + mode machine. 2. Components per mode, vote slot registration point. 3. Motion: bell ring, badge pop, Tokek bob, guide cell hop-and-grow, cross-fades; reduced motion. 4. a11y labels for countdown ("17 days 5 hours to Bali").
- Tests: `pnpm --filter @cp/mobile test -- features/home`; `maestro test e2e/home/modes-screens.yaml` (`takeScreenshot` per mode → CI artifacts for founder review against `3b-1`/`3b-2`/`3b-6`)
- Done when: RNTL layout snapshot per mode; route contract tests: guide cell and tip tap push the typed destination route helper (`routes.destination(placeId)`; screen built by P30), SOMEWHERE ELSE pushes `routes.placeSearch()` (P26), crew switcher opens the P23 sheet.
- Status: done — 111b5c01

### T7 — Inbox screen and all-caught-up
- Goal: 3b-4, 3b-5.
- Files: `apps/mobile/src/app/inbox/index.tsx`, `apps/mobile/src/features/home/inbox/{inbox-screen,filter-tabs,action-card,earlier-row,all-caught-up,kind-renderers}.tsx`, tests alongside.
- Steps: 1. Filters + lists from `inbox_items`. 2. Inline actions → `act_inbox_item`, optimistic slide-off + rollback. 3. Undo rows. 4. Empty state motion (sleep, one-eye wake, drop-in wake). 5. App icon badge sync.
- Tests: `pnpm --filter @cp/mobile test -- features/home/inbox`
- Done when: tests cover resolve, rollback on reject, resolved-elsewhere removal, empty transition.
- Status: done — c9b7a12d

### T8 — Nudge UX and share-sheet relay
- Goal: shared `useNudge` hook + UI feedback.
- Files: `apps/mobile/src/features/home/nudge/{use-nudge,nudge-toast,share-relay}.ts(x)`, tests alongside.
- Steps: 1. Hook calls `send_nudge`, shows scheduled-time toast or cooldown message. 2. Relay → `Share.share` with guide text + link. 3. `record_app_open` on foreground (throttled).
- Tests: `pnpm --filter @cp/mobile test -- features/home/nudge`
- Done when: hook returns typed outcomes (scheduled/inbox/relay/too_soon) used by inbox NUDGE button.
- Status: done — e8311c52

### T9 — End-to-end Home and Inbox flows
- Goal: Maestro coverage both platforms.
- Files: `e2e/home/{first-run,everyday-countdown,inbox-actions,all-caught-up,nudge}.yaml`.
- Steps: 1. Seed via `packages/db` seed scripts (real commands, not fixtures in app). 2. Flows incl. offline Home.
- Tests: `maestro test e2e/home`
- Done when: green on iOS and Android.
- Status: blocked — Android green on the e2e-test build 11 APK: first-run, first-run-vi, everyday-countdown and inbox-actions (https://github.com/critterpass/critterpass/actions/runs/36651330885), all-caught-up (https://github.com/critterpass/critterpass/actions/runs/36654124089) and nudge (https://github.com/critterpass/critterpass/actions/runs/36655282364), all seeded through the staging demo seed. iOS: inbox-actions, everyday-countdown and nudge passed (https://github.com/critterpass/critterpass/actions/runs/36622347680); first-run, first-run-vi and all-caught-up still need an iOS run after the Home polish in #170 and the Android step fixes here (macOS runners are scarce, so these wait for a free slot)

## Phase acceptance criteria

- [ ] Mode machine tests cover 6 modes; Home renders each from local data offline.
- [ ] Countdown matches C14 for viewer tz ≠ destination tz and with/without flights.
- [ ] Inbox action from app, notification or widget resolves the item exactly once.
- [ ] Sleeping-Tokek empty state and slide-off motion implemented with reduced-motion variant.
- [ ] `send_nudge` enforces caps; installed targets always get an inbox item; only non-installed targets get the share-sheet relay; no SMS/WhatsApp sent.
- [ ] `nudges`, `app_open_hours` registered in the privacy class map (export/deletion coverage).
- [ ] Tip strip shows only validated numbers; dismiss persists across devices.
- [ ] Permission tests pass; Maestro `e2e/home` green.

## Risks & rollback

| Risk | Mitigation |
|---|---|
| Home depends on later-phase data (polls, flights, trip-day) | typed slots + mode inputs optional; modes degrade to `everyday`/`no_trip` until data exists |
| Nudges feel spammy | caps + budget router; server config to lower caps |
| Tip detector noise | minimum thresholds in `ops_config`; kill switch flag `home.tips` |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Fare/season data (P15 keys: Travelpayouts, BestTime) | tip strip hidden (no tips generated) |
| Persona nudge templates reviewed by founder | ship default templates from design copy |

## Open questions

1. `in_trip` Home vs trip hub — default: Home shows TODAY card linking to hub (Q-07).
2. Engagement-hour fallback — default 19:00 target tz.
3. Tip frequency — default max 1 new tip/crew/day.
4. doc delta: `home_tips`, `nudges`, `app_open_hours`, `record_app_open`, `countdown.recompute`; `create_trip` owned by P26 (api-contracts phase column 25→26).
5. Cross-phase wiring owed elsewhere: P34 registers `FlightSegmentsSource`; P30 builds the `routes.destination` screen.
