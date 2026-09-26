---
phase: 29
title: Plan views, editing, change review, live collaboration
status: pending
depends_on: [24, 26, 28]
wave: 15
features: [F-077, F-078, F-079, F-080, F-081, F-083, F-050]
screens: [3e-1, 3e-2, 3e-3, 3g-2, 3k-2, 3c-12, 3j-1, 3k-5, 3f-7]
tasks: 12
owns:
  - packages/db/src/schema/collab.ts
  - packages/db/migrations/*_plan_comments_and_personal_overlay.sql
  - packages/db/test/permissions/{comments,comment-plus-ones,personal-plan-ops}.test.ts
  - packages/domain/src/plan/**
  - infra/powersync/streams/plan.yaml
  - packages/planner/src/ops/rebase.ts
  - packages/planner/src/overlay/**
  - packages/planner/test/{rebase,overlay}/**
  - services/api/src/commands/plan/**
  - services/api/src/commands/changesets/**
  - services/api/src/commands/comments/**
  - services/api/src/plan/**
  - services/worker/src/jobs/plan/**
  - apps/mobile/src/features/plan/{overview,day,timeline,review,overlay,views,collab}/**
  - apps/mobile/src/features/plan/index.ts
  - apps/mobile/src/app/(trip)/[tripId]/{plan,day,review,decide}/**
  - packages/i18n/locales/en/plan/**
  - e2e/plan/{overview,day-edit,timeline,review,overlay,views,collab}.yaml
---
# Phase 29 — Plan views, editing, change review, live collaboration

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | §1 D5 (guide never writes directly), D10, D12 (offline local-first); §2 C3, C41 (decider policies), C43 (vote closes before hold expiry), C13 (in-trip swaps/replans free); §7 Q-30 (who edits), Q-35 (personal overlay), Q-44 |
| `docs/system-architecture.md` | §4.1 commands, §4.3 realtime (publish proxy), §7.b apply + `PLAN_VERSION_CONFLICT`, §7.c offline outbox |
| `docs/code-standards.md` | §8 motion + feedback bus, §9 gestures, §10 a11y (drag alternatives), §17 testing |
| `docs/data-model.md` | §3.3 `plan_items`, `change_sets`, `polls` (`decider_policy`), `comments`, `comment_plus_ones`, `guide_actions`, `activity_events` |
| `docs/data-model-sync-and-privacy.md` | §3.2 poll machine; §4 `trip`, `trip_draft` streams; §5 presence rules; §7 row "29" |
| `docs/api-contracts.md` | §3 `PLAN_VERSION_CONFLICT`, `VOTE_CLOSED`; §4.2 `add_comment`/`plusone_comment`; §4.3 `undo_guide_action`; §4.6 `apply_plan_ops`, changeset commands; §5.7 publish proxy |
| `docs/api-contracts-async.md` | §1 `trip_plan:`, `trip_presence:`; push payloads for changeset approval (actionable Approve/Reject) |
| `docs/design-system.md` | day tiles, chips, timeline block tokens, motion presets (spring re-sort, pulse 1600, sweep, flap 340, odometer 700, card-deal) |
| Reports | `design-analysis-260926-1143-plan-proposal-crew-report.md` §0 motion vocabulary, §2 3e-1, 3e-2, 3e-3, 3g-2, §4–§8; master §2 F-050, F-077…F-081, F-083, C41 row, R20 |
| Renders | `docs/design-renders/screens/3e-1_Trip_plan.png`, `3e-2_Day_planning.png`, `3e-3_Review_changes.png`, `3g-2_Live_collab.png`, `3k-2_Day-of.png`, `3j-1_Guide_chat.png` |

## Overview

Goal: the shared trip plan every participant lives in — overview with drag reorder, day view with item detail, a 15-minute timeline editor with lanes, rain band and guide ghost suggestions, a reusable ChangeSet review/approval flow with C41 decider policies, a personal "just me" overlay, map/calendar views with calendar export, and live collaboration (presence, anchored cursors, comments, +1, typing) over Centrifugo — all local-first via PowerSync with server-arbitrated versions.

Done when: two devices edit the same plan concurrently with ops, cursors and comments visible on both within 1 s; stale ChangeSets and version conflicts are detected and rebased or marked stale; approval polls resolve per decider policy and auto-apply; offline edits reconcile; Maestro + Testcontainers suites pass.

## Requirements

### F-077 Trip plan overview (3e-1)

| Area | Behaviour |
|---|---|
| Layout | "← TRIPS", presence avatar stack, SHARE pill (exported `PlanShareSlot`; hidden until P52 fills it with the 3o-4 read-only link), 46 px condensed title "{DEST}, DAY BY DAY", segmented LIST / MAP / CALENDAR, day cards 64 px r20: coloured tile (number + weekday), title, one-line summary, trailing chip BOOKED / "{n} VOTE" / weather doodle |
| Chips | derived: any booking → BOOKED; open polls → VOTE (pulse 1600 ms); else forecast icon (P15) |
| Reorder | long-press → drag day → spring re-sort; `apply_plan_ops{reorder_days}` (organiser/co-organiser, Q-30) or ChangeSet for members; remote reorders animate; booked fixed-date day cannot move (shake + reason) |
| Guide-touched | one-off gradient sweep (600–800 ms) per unseen guide-authored change (`activity_events` + per-user seen marker in local store) |
| Navigation | day → 3e-2 (or 3g-2 when an open decision poll exists; 3k-2 when today during trip) ; centre button → guide chat |
| States to build | no draft yet (empty CTA to setup), loading skeleton, offline "last synced", reorder conflict, read-only viewer, in-trip (past days collapsed), draft-mode (organiser pre-proposal: reads `trip_draft` version) |
| Haptics | lift, slot crossing ticks, drop — via feedback bus |

### F-078 Day view + simple edit (3e-2, 3k-2; item detail undesigned)

| Area | Behaviour |
|---|---|
| Day view | non-planning mode list of items (time, title, meta, attendees, booking state), "PLANNING MODE" toggle enters timeline (F-079) |
| Item detail (design in code) | sheet: title, place card (P30 place detail link), time range with time picker (15-min), attendees (who's going), cost (per-person/group from cost-engine), booking link/voucher (P34), notes, comments thread (F-050), actions: move to day, remove, "just me" toggle (F-081), open in maps |
| Add item | from search (curated POIs), from saved places, freeform; planner fit check shows conflicts before commit |
| Rules | organiser/co-organiser ops apply directly; members' edits become a ChangeSet (auto-created, sent with default policy) (Q-30); locked items (booked, must-do) need confirmation |
| States to build | empty day "Free day", overnight items (axis extends), booked item edit warnings, offline queued badge, deleted-by-other |

### F-079 Timeline drag editor (3e-2)

| Area | Behaviour |
|---|---|
| Grid | time axis 07–19 default, auto-extends for items outside (e.g., 03:30 pickup), 34 px/h, 15-min snap (8.5 px), hairlines every 2 h, Geist Mono labels |
| Blocks | r16, category colour, uppercase title + meta; lanes for parallel items (attendee subsets); narrow lane blocks |
| Drag/resize | long-press lift; vertical snap with selection haptic per slot; cross-lane move; resize handles top/bottom; collisions push others (spring reflow) within the day; travel-time violations shown as warnings (planner check) ; drop impact haptic; commit on drop as one op (preview positions throttled on presence channel) |
| Rain band | dotted blue overlay for precip windows (P15 hourly), idle drift ty 0→8→0 6000 ms; animates to new window on forecast update |
| Guide ghost | suggestion block (yellow, rotated 2°, pulse 1600 ms) in parallel lane from any pending ChangeSet with `trigger=weather` (produced by P37; P29 tests use a seeded fixture, P37 adds the integration test); banner "Rain till three. Move the walk?" "Drag it, or tap to accept" MOVE IT; accept → original springs to ghost (560 ms `cubic-bezier(.3,1.3,.5,1)`), ghost fades 300 ms, toast, then 3e-3 review after 1.3 s |
| Remote cursors | arrow + name label, interpolated glide between presence updates (≤ 5 Hz publish) |
| A11y | VoiceOver/TalkBack adjustable actions "move 15 min earlier/later", "move to lane", "extend/shorten 15 min" |
| States to build | no suggestion, forecast unavailable, drop onto booked/fixed (reject + shake), concurrent conflict (rebase + toast "Maya moved this too"), read-only, offline queued |

### F-080 ChangeSet review & approval (3e-3, 3c-12, 3j-1, 3k-5, 3f-7)

| Area | Behaviour |
|---|---|
| Review screen | trigger tag (RAIN FORECAST, DROPOUT, CHAT…), guide headline + summary (LLM), change cards (✓/✕ toggle flap 340 ms; rejected 60% opacity; old struck; new bold; reason; affected avatars); summary chips cost Δ "+$22 EACH", "1 BOOKING MOVED", "0 MUST-DOS TOUCHED" (computed by planner/cost-engine, odometer 700 ms); cards card-deal in (stagger 80–120 ms) |
| Actions | SEND TO CREW · NEEDS {k} YESES → `send_changeset` creates `polls(kind='changeset_approval')` with decider policy default per C41 (money or others affected → majority of affected, organiser breaks ties; time-critical in-trip → any affected + UNDO + notice; personal → self); `closes_at` ≤ earliest hold expiry from a nullable `HoldExpiryProvider` interface (`packages/domain/src/plan/hold-expiry.ts`; returns null here — P35 T4 wires the Viator implementation and owns the clamp tests); chat card in crew chat (P24 message type `changeset`); "Apply to my plan only" → F-081 |
| Approval | `approve_changeset` from app, chat card, actionable push (Approve/Reject), widget (P49 writes same command); tally live on `trip_plan:`; threshold met → server auto-applies (`apply_changeset`) and everyone's 3e-1 sweeps; expiry keeps current plan (C41) |
| Stale | any applied op touching the same items after `base_version` → status `stale` + "Plan changed — refresh" (server rebase via `planner/ops/rebase` when non-conflicting) |
| Booking impact | changes touching bookings show impact via a `BookingImpactProvider` interface (default: none) and require organiser confirm; supplier refusal → change marked blocked. P34/P35 register implementations and own the booking-impact/supplier-refusal tests |
| States to build | all rejected (CTA disabled), must-do touched warning, stale, voting/approved/rejected/expired chat card states, apply failure |
| Reuse | component + hooks exported from `features/plan/index.ts` for P31 (3f-7), P32 (3j-1), P36/P37 (3k-5, 3k-8) |

### F-081 Personal plan overlay (3e-3, 3j-1)

| Area | Behaviour |
|---|---|
| Semantics (Q-35) | "Apply to my plan only" / JUST ME applies accepted ops as personal ops visible only to me; items tagged "just you"; group plan unchanged; own share recomputed when skipping optional items (Q-44) |
| Storage | `personal_plan_ops(trip_id, user_id, change_set_id, ops, base_version, status)` owner-only (**doc delta**) |
| Merge | client `planner/overlay` merges group version + personal ops; group changes that conflict → overlay item marked "clashes with the crew plan" with keep/drop |
| Visibility | peers see only that the member skips an item (attendee removed) when ops remove attendance — never the alternative |

### F-083 Plan Map / Calendar views + calendar export (undesigned; design in code)

| Area | Behaviour |
|---|---|
| Map tab | P14 map kit: per-day coloured route polylines (Valhalla), numbered doodle pins per item, day filter chips, tap pin → item detail |
| Calendar tab | month/week grid of trip days with item bars; tap → day |
| Export | "Add to my calendar" → EventKit/CalendarContract write (write-only permission via P20) of my items (overlay-aware); subscribe feed `webcal://…/v1/trips/{id}/calendar.ics?token` with per-user revocable token (**doc delta**), updates when plan changes |

### F-050 Live collaboration (3g-2)

| Area | Behaviour |
|---|---|
| Presence | "● {names} HERE" (blink 1400 ms), avatar stacks on 3e-1/3e-2/3g-2 via `trip_presence:` `here{screen, day}` |
| Cursors | anchored to option/item ids (not raw coords): `cursor{anchor, offset}`, interpolated glide, fade after 3 s idle |
| Decision poll view 3g-2 | day option cards side by side (photo, name, travel, price), voter avatar stickers + count, leader blue fill + yellow ring + LEADING (hops to new leader); vote pop + "+1" float; tie, closing/closed → result applied to plan via ChangeSet; >2 options stacked layout |
| Comments | anchored (`anchor_kind` item/option/day/poi-in-option); composer (design in code), +1 with count "+1 from Rin · 4m", typing dots |
| Guide accommodation | guide reads comments (P32 crew-chat guide) and proposes accommodation as a ChangeSet with `guide_actions` undo window → KEEP IT / UNDO (`undo_guide_action`) and typed-in reply |
| Realtime | ballots and comments via commands + `trip_plan:`; cursors/typing via publish proxy only |

## Architecture & contracts

| Kind | Delta |
|---|---|
| Tables | create `comments`, `comment_plus_ones` (data-model §3.3); add `personal_plan_ops` (owner-only, C2) and `calendar_feed_tokens(user_id, trip_id, token_hash, revoked_at)` (**doc delta**); `change_sets`, `polls` exist (P13, P26) |
| RLS | comments: participants read/insert, author edit/delete; plus-ones self; personal ops owner-only; `guide_reader` has no grant on the table, only on view `llm.my_personal_plan_ops` filtered `user_id = current_setting('app.uid')::uuid` (the worker sets `app.uid` to the job's owner per transaction) |
| Sync | `trip` stream gains comments, plus-ones; `me`-scoped `personal_plan_ops` (**doc delta**: add to `trip_me`) |
| Commands | §4.6 `apply_plan_ops`, `create_changeset`, `set_changeset_item`, `send_changeset`, `approve_changeset`, `apply_changeset`; §4.2 `add_comment`, `plusone_comment`; new `edit_comment`, `delete_comment`, `unplusone_comment`, `revoke_calendar_feed` (**doc delta**) |
| Versioning | every group apply: `base_version` check in tx → new version id → `trips.current_version_id`; conflict → `PLAN_VERSION_CONFLICT{latest}`; client rebases via `planner/ops/rebase` and retries once, else surfaces |
| Realtime | `trip_plan:` `plan.ops{version, ops}`, `guide.touched`, `forecast.band`, `changeset.*`; `trip_presence:` `here`, `cursor{anchor}`, `typing` (client publish via proxy, ≤ 5 Hz) |
| Jobs | `plan.changeset_expiry` (closes polls at `closes_at`, keeps plan) (**doc delta**), `plan.stale_sweep` on version bump |
| Push | changeset approval request with actions Approve/Reject (category per async §3), result notice |
| Routes | `GET /v1/trips/{id}/calendar.ics?token` (**doc delta**) |

## Tasks

### T1 — Comments + personal overlay schema, permission tests
- Goal: persistence for collaboration and overlay.
- Files: `packages/db/src/schema/collab.ts`, `packages/db/migrations/<ts>_plan_comments_and_personal_overlay.sql`, `packages/db/test/permissions/{comments,comment-plus-ones,personal-plan-ops}.test.ts`, `packages/domain/src/plan/{comments,overlay,presence,hold-expiry,booking-impact}.ts`, `infra/powersync/streams/plan.yaml` (per-phase stream file merged into `infra/powersync/sync-streams.yaml` by the build)
- Steps: 1. Tables + `calendar_feed_tokens`. 2. RLS + grants + `llm.my_personal_plan_ops` view. 3. Stream entries. 4. zod contracts for presence payloads; nullable provider interfaces.
- Tests: `pnpm --filter @critterpass/db test -- permissions/comments permissions/personal-plan-ops`
- Done when: non-participant reads 0 comments; peers read 0 personal ops; `guide_reader` with `app.uid`=A reads only A's personal ops and 0 rows from the base table.

### T2 — Plan ops + version conflicts + rebase
- Goal: `apply_plan_ops` with lock rules and rebase.
- Files: `services/api/src/commands/plan/apply-plan-ops.ts`, `services/api/src/plan/{versioning,lock-rules}.ts`, `packages/planner/src/ops/rebase.ts`, `packages/planner/test/rebase/*.test.ts`
- Steps: 1. Policy per Q-30; member edits rejected with `FORBIDDEN{use_changeset}` so client wraps them. 2. Version bump + `rt_outbox` `plan.ops`. 3. Rebase non-overlapping ops; conflicting → error with latest. 4. Activity events.
- Tests: `pnpm --filter @critterpass/planner test -- rebase`; `pnpm --filter @critterpass/api test -- commands/plan`
- Done when: 50 randomized concurrent op streams converge to the same version on replay; booked-item move without confirm rejected.

### T3 — ChangeSet lifecycle + decider policies
- Goal: create/toggle/send/approve/apply/stale/expire.
- Files: `services/api/src/commands/changesets/{create,set-item,send,approve,apply}.ts`, `services/api/src/plan/decider-policy.ts`, `services/worker/src/jobs/plan/{changeset-expiry,stale-sweep}.ts`
- Steps: 1. Poll creation via P26 poll engine with policy defaults (C41) and `closes_at` bound by hold expiry. 2. Tally → auto-apply at threshold; organiser tie-break. 3. Stale detection + expiry. 4. Chat card message + actionable push via P11.
- Tests: `pnpm --filter @critterpass/api test -- commands/changesets`; `pnpm --filter @critterpass/worker test -- jobs/plan`
- Done when: table-driven tests cover all 4 policies × (approve, reject, tie, expiry); double-approve idempotent; stale set cannot apply; with a stub `HoldExpiryProvider` returning T, `closes_at` ≤ T; null provider leaves the policy default.

### T4 — Personal overlay merge
- Goal: F-081 end to end.
- Files: `packages/planner/src/overlay/{merge,conflicts}.ts`, `packages/planner/test/overlay/*.test.ts`, `services/api/src/commands/changesets/apply.ts` (personal scope branch), `apps/mobile/src/features/plan/overlay/**`, `e2e/plan/overlay.yaml`
- Steps: 1. Merge function + conflict markers. 2. Personal apply writes `personal_plan_ops` + share recompute (cost-engine). 3. "just you" tags + keep/drop UI.
- Tests: `pnpm --filter @critterpass/planner test -- overlay`; `maestro test e2e/plan/overlay.yaml`
- Done when: peer device plan unchanged; own share lowered when skipping optional item.

### T5 — Plan overview (3e-1)
- Goal: overview screen with reorder, chips, presence, sweep.
- Files: `apps/mobile/src/features/plan/overview/**`, `apps/mobile/src/features/plan/index.ts`, `apps/mobile/src/app/(trip)/[tripId]/plan/index.tsx`, `packages/i18n/locales/en/plan/overview.po`, `e2e/plan/overview.yaml`
- Steps: 1. Local queries (group + overlay + draft mode). 2. Drag reorder with spring, remote reorder animation. 3. Chips, weather, sweep once per unseen change. 4. All missing states.
- Tests: `pnpm --filter mobile test -- features/plan/overview`; `maestro test e2e/plan/overview.yaml`
- Done when: reorder on device A animates on device B < 1 s; offline reorder reconciles.

### T6 — Day view, item detail, add/remove
- Goal: F-078.
- Files: `apps/mobile/src/features/plan/day/**`, `apps/mobile/src/app/(trip)/[tripId]/day/[day].tsx`, `packages/i18n/locales/en/plan/day.po`, `e2e/plan/day-edit.yaml`
- Steps: 1. Day list + item detail sheet. 2. Time picker (15-min), attendees, move/remove. 3. Add from search/saved/freeform with fit check. 4. Member edits → auto ChangeSet.
- Tests: `pnpm --filter mobile test -- features/plan/day`; `maestro test e2e/plan/day-edit.yaml`
- Done when: member add produces a ChangeSet card in chat; organiser add applies directly.

### T7 — Timeline core (grid, drag, snap, lanes, reflow, a11y)
- Goal: F-079 editing mechanics.
- Files: `apps/mobile/src/features/plan/timeline/{timeline-grid,timeline-block,lane-layout,use-timeline-drag,reflow}.ts(x)`, `apps/mobile/src/features/plan/timeline/__tests__/**`
- Steps: 1. Lane layout algorithm (pure, tested). 2. Gesture Handler 3 + Reanimated worklets drag/resize with snap + haptics. 3. Collision reflow spring. 4. Accessibility actions.
- Tests: `pnpm --filter mobile test -- features/plan/timeline`
- Done when: CI perf budget on the drag Maestro run (dropped-frame count ≤ budget) passes; a11y actions change times by 15 min. Real-device 60 fps check → P54 launch checks.

### T8 — Timeline overlays: rain band, guide ghost, remote cursors
- Goal: F-079 multiplayer + weather layer.
- Files: `apps/mobile/src/features/plan/timeline/{rain-band,guide-ghost,remote-cursors,guide-banner}.tsx`, `apps/mobile/src/features/plan/collab/use-presence.ts`, `e2e/plan/timeline.yaml`
- Steps: 1. Rain band from hourly forecast + drift. 2. Ghost from pending weather ChangeSet (seeded fixture in tests); accept animation → review. 3. Presence publish (throttled) + interpolated cursors.
- Tests: `pnpm --filter mobile test -- features/plan/timeline/overlays`; `maestro test e2e/plan/timeline.yaml`
- Done when: two simulators show each other's cursor; ghost accept routes to 3e-3 with the ChangeSet.

### T9 — Review changes screen + chat approval card
- Goal: F-080 UI reused across flows.
- Files: `apps/mobile/src/features/plan/review/**`, `apps/mobile/src/app/(trip)/[tripId]/review/[changesetId].tsx`, `packages/i18n/locales/en/plan/review.po`, `e2e/plan/review.yaml`
- Steps: 1. Card deal, toggles, odometer chips. 2. Send/apply-personal actions. 3. `ChangesetChatCard` exported for P24 chat renderer (voting/approved/rejected/expired/stale). 4. Push action handling.
- Tests: `pnpm --filter mobile test -- features/plan/review`; `maestro test e2e/plan/review.yaml`
- Done when: approving from push updates the chat tally on another device; all-rejected disables send.

### T10 — Live collab decision view + comments
- Goal: 3g-2 and anchored comments.
- Files: `apps/mobile/src/features/plan/collab/**`, `services/api/src/commands/comments/{add,edit,delete,plusone,unplusone}.ts`, `apps/mobile/src/app/(trip)/[tripId]/decide/[pollId].tsx`, `packages/i18n/locales/en/plan/collab.po`, `e2e/plan/collab.yaml`
- Steps: 1. Option cards, vote stickers, LEADING hop, tie/closed states. 2. Comment composer, +1, typing. 3. Guide accommodation card with KEEP/UNDO (`undo_guide_action`). 4. Closed poll → apply via ChangeSet.
- Tests: `pnpm --filter @critterpass/api test -- commands/comments`; `pnpm --filter mobile test -- features/plan/collab`; `maestro test e2e/plan/collab.yaml`
- Done when: comment + +1 + vote visible on second device < 1 s; UNDO reverts the guide change.

### T11 — Map & Calendar views
- Goal: F-083 views.
- Files: `apps/mobile/src/features/plan/views/{plan-map,plan-calendar}.tsx`, `packages/i18n/locales/en/plan/views.po`, `e2e/plan/views.yaml`
- Steps: 1. Map with per-day routes/pins (P14 kit, offline). 2. Calendar grid. 3. Segmented control wiring.
- Tests: `pnpm --filter mobile test -- features/plan/views`; `maestro test e2e/plan/views.yaml`
- Done when: map works offline with downloaded region; tapping pin opens item detail.

### T12 — Calendar export (device write + ICS feed)
- Goal: F-083 export.
- Files: `services/api/src/plan/calendar-feed.ts`, `services/api/src/commands/plan/revoke-calendar-feed.ts`, `apps/mobile/src/features/plan/views/export-sheet.tsx`
- Steps: 1. RFC 5545 ICS for my items (overlay-aware, tz-correct, stable UIDs from `stable_id`). 2. Revocable token feed. 3. Device write via the `cp-calendar` write method that P27 exposes (contract hook; P29 does not edit P27 files — if missing, plan.md delta adds `write.ts` to P27).
- Tests: `pnpm --filter @critterpass/api test -- plan/calendar-feed` (validates with `ical.js` parser)
- Done when: `ical.js` round-trip parses every event with correct tz and stable UIDs; revocation returns 404. Manual Apple/Google Calendar import → P54 launch checks.

## Phase acceptance criteria

- [ ] T1–T12 done-when checks pass.
- [ ] Concurrency: randomized two-client op test converges; no lost update.
- [ ] Every approval path (app, chat card, push, widget command) calls `approve_changeset` and resolves per C41.
- [ ] Guide-authored changes only enter as ChangeSets (no direct `plan_items` write path from AI; code search test).
- [ ] Presence/cursor payloads contain no C3 or coordinates.
- [ ] Maestro plan suite green on iOS and Android.

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| Timeline gesture complexity/perf | worklet-only math; lane layout pure + tested; list-mode edit always available |
| Conflict storms in big crews | ops granular per item; rebase; server serialises per trip via advisory lock |
| Presence traffic | ≤ 5 Hz, anchors not coords, no history on presence namespace |
| Overlay semantics confusion | explicit "just you" tags; flag `plan.personal_overlay` can hide the action |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Forecast data (P15) | rain band hidden; "forecast unavailable" state |
| Poll engine (P26), chat renderer hook (P24) | required deps; blocked otherwise |
| Calendar write permission copy | export via ICS only |

## Open questions

1. Who may reorder/apply directly: default organiser + co-organisers (Q-30); members via ChangeSet.
2. Drag preview broadcast: default commit-on-drop ops + presence-only preview positions.
3. Doc delta: `personal_plan_ops`, `calendar_feed_tokens`, ICS route, comment edit/delete commands, `plan.changeset_expiry`, `cp-calendar` write method.
4. Accepting a guide weather suggestion does not consume a redraft (C13).
5. P10/plan.md delta: sync streams split into per-phase files `infra/powersync/streams/<domain>.yaml` merged into `sync-streams.yaml` at build (P29 `plan`, P30 `explore`, P31 `proposal`, P33 `money`, P34 `bookings`, P35 `suppliers`).
6. P27 delta: `cp-calendar` write method owned by P27.
