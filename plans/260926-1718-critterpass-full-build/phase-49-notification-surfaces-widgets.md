---
phase: 49
title: Actionable notifications, ping settings, widgets
status: pending
depends_on: [5, 11, 12, 26, 48]
wave: 20
features: [F-176, F-177, F-178, F-179, F-180]
screens: [5b-2, 5b-4, 5c-1, 5c-2, 5c-3, 5c-4, 5c-5]
tasks: 10
owns:
  - packages/domain/src/surfaces/widget-snapshot.ts
  - packages/domain/src/surfaces/notification-categories.ts
  - packages/db/src/schema/widgets.ts
  - packages/db/migrations/<ts>_widget_tokens_and_installs.sql
  - packages/db/test/permissions/widgets.test.ts
  - services/api/src/commands/widgets/
  - services/api/src/commands/notification-prefs/
  - services/api/src/routes/widgets-snapshot.ts
  - services/api/test/widgets/
  - services/worker/src/jobs/widgets/
  - apps/mobile/modules/cp-widgets/
  - apps/mobile/modules/cp-app-group/src/snapshots/widgets/
  - apps/mobile/targets/widgets/Widgets/
  - apps/mobile/targets/widgets/Intents/Widget/
  - apps/mobile/targets/widgets/Intents/AppShortcuts/
  - apps/mobile/targets/notification-content/
  - apps/mobile/targets/_shared/Snapshot/
  - apps/mobile/targets/_shared/Categories/
  - apps/mobile/src/features/you/ping-settings/
  - apps/mobile/src/features/home/widget-gallery/
  - apps/mobile/src/app/you/pings.tsx
  - apps/mobile/src/app/you/widgets.tsx
  - apps/mobile/targets/widgets/CPWidgetBundle.swift   # append-only edit grant (owner phase 48): register phase-49 widgets
  - apps/mobile/src/data/push/categories.ts           # append-only edit grant (owner phase 11 folder): category registration call only
  - packages/i18n/locales/en/you/pings.po
  - packages/i18n/locales/en/home/widgets.po
  - e2e/notifications/actions/
  - e2e/widgets/
---
# Phase 49 — Actionable notifications, ping settings, widgets

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | C12 (Pass+ spoken read-out), C14 (countdown), C37 + Q-5A (NEXT FLIGHT widget Pass+), entitlement matrix rows (crew widget Boost, NEXT FLIGHT Pass+), paywall triggers 5c-2/5c-5 locked widget, §4 rows "Widget flip digits / StandBy / vote poster", "Tapping + opens the system widget sheet", "Interactive widget buttons on locked phone" |
| `docs/system-architecture.md` | §4.5 push, §4.8 extensions |
| `docs/data-model.md` | §3.11 `notification_prefs`, `ping_ledger`, `widget_push_tokens`, `installed_widgets`, `device_action_keys`; `ballots.source` |
| `docs/data-model-sync-and-privacy.md` | §1 snapshot rule (money widgets `privacySensitive`, no coordinates), §7 row 49 |
| `docs/api-contracts.md` | `register_widget_token` / `sync_installed_widgets`, `cast_ballot`, `nudge_payment`, `check_packing_item`, `GET /v1/widgets/snapshot`, `/v1/actions` |
| `docs/api-contracts-async.md` | §3.1 `widgets` push type, §3.4 categories (canonical), §4 widget intents, §6 App Group (canonical) |
| Phase files | 11 (router, budget, roundup, NSE, `set_notification_prefs` shell, action keys), 12 (entitlements), 26 (polls/ballots), 48 (widget extension bundle, App Group LA state) |
| Reports | `design-analysis-260926-1143-off-app-native-surfaces-report.md` (5b-2, 5b-4, 5c-*), native platform + fact-check reports (widget budgets, WidgetKit push, content extension limits); master §2 F-176…F-180, §6.1 rows, R7, R8 |
| Renders | `docs/design-renders/screens/5b-2_Vote_from_the_lock_screen.png`, `5b-4_How_much_we_ping.png`, `5c-1_Home_screen_before.png`, `5c-2_Home_screen_on_the_trip.png`, `5c-3_Lock_screen_widgets.png`, `5c-4_StandBy.png`, `5c-5_Widget_gallery.png` |

## Overview

Goal: every notification category acts without opening the app where allowed; the vote notification expands into an animated showdown poster; users tune the ping budget with a spoken sample; a full WidgetKit family (home, lock screen, StandBy) runs off App Group snapshots refreshed by widget push, with interactive App Intents and a gallery with truthful locked states.

Done when: a vote cast from a locked-phone notification action lands as a ballot (source `notification`) and re-posts with the stamp; ping budget changes route the next day's deliveries; all 7 home widgets + 5 accessory widgets + 2 StandBy widgets render real snapshot data, update via widget push, and locked widgets open the correct offer.

## Requirements

| Feature | Designed behaviour | States / undesigned (design in code) | Entitlement / decisions |
|---|---|---|---|
| F-176 actionable vote notification | 5b-2: category `cp.vote` with dynamic action labels (option names via `notificationActions` per vote, iOS 26); long-press opens Notification Content extension poster: both critters (baked frame sequence, SwiftUI animation allowed in content ext), VS pulse; background action → `cast_ballot` via action key without unlock; result re-posted as same `apps-collapse-id` notification with stamp; all other §3.4 categories registered with their actions | vote closed → action returns `VOTE_CLOSED`, re-post "vote closed, Bali won"; offline → queued in `pending-actions.json`, stamp "sending"; 3+ options (actions `VOTE_1..3`, more → OPEN); action key revoked → OPEN fallback | Free; R8 one idempotent endpoint |
| F-177 ping settings | 5b-4: daily budget slider (fills bar), roundup time, category toggles (per N-class), quiet hours, chattiness; dragging plays a spoken sample of a day at that level in the guide's voice (ElevenLabs owned voice, pre-rendered samples per guide × level from phase 13/18 content; offline → on-device TTS); OS-denied banners (notifications, time-sensitive, LA, widgets) with deep link to Settings; overflow note "queues for the roundup" | budget 0 = roundup only; ALWAYS class not toggleable (explained); Pass+ voice read-out toggle (C12) gated with offer | Free; spoken read-out Pass+ (C12) = closest truthful equivalent (iOS apps cannot speak notifications on a locked phone): (a) in-app read-out — opening the roundup/notification plays it in the guide's owned ElevenLabs voice (rendered server-side per roundup, cached on R2); (b) roundup + chat-class categories marked eligible for Siri Announce (iOS reads them with the system voice through AirPods/CarPlay when the user enables Announce); Android: in-app read-out only. Toggle copy states it: "Your guide reads the roundup aloud when you open it; Siri can announce it on AirPods." |
| F-178 widget platform + home widgets | App Group snapshot writer + `GET /v1/widgets/snapshot` fetch on widget push (iOS 26 `widgets` push type); `installed_widgets` sync; home widgets: Countdown (S/M; page-flip digit transition at midnight, Tokek wave on unlock via timeline entry), Vote (interactive `CastBallotIntent`, count rolls, turns into result at close), Today (L; stops strike through/fade, Tokek forecast line, NUDGE via `NudgeIntent`, packing check), Balances nudge (net only, `privacySensitive`), Crew (Boost; dots around next meet-up by ETA buckets), Critterdex progress, Next flight (Pass+); configuration via `SelectTripIntent`/`SelectCrewIntent` | empty (no trip / no crew) states; stale snapshot (>6 h) label; signed-out; locked (tier pill → deep link to offer); refresh budget exhausted → timeline-only | Countdown/Vote/Today/Balances/Critterdex free; Crew Boost; Next flight Pass+ (Q-5A) |
| F-179 lock-screen + StandBy | accessoryInline (countdown line), accessoryCircular (countdown ring, Critterdex progress), accessoryRectangular (vote score, next leave-by); vibrant/tinted art drawn for one colour (phase-05 mono variants); StandBy systemSmall pair: sleeping Tokek (breathing = 2 timeline frames at rest, system night mode handles red), leave-by digits flip each minute; at alarm time right side becomes alarm (from LeaveBy snapshot) | accented vs full-colour rendering modes; always-on dimmed | Free |
| F-180 widget gallery | 5c-5 in-app gallery: previews are live RN renders of the same snapshot at small scale; tier pills; "+" on iOS → animated how-to sheet (no API); Android handled in 50 (`requestPinAppWidget`); includes the Critterdex widget missing from design; locked BOOST/PASS+ widgets addable with gentle locked state that opens the right offer | no widgets installed / all installed; widget already added (from `installed_widgets`) | Tier pills from server-driven perk list (C48) |

## Architecture & contracts

| Area | Delta |
|---|---|
| Kill switch | Widget refresh pushes check `widgets.push.enabled` before sending through the shared reader (api: `createKillSwitches(pool)` `.middleware(key)` / `.assertOn(key)`; worker: `createKillSwitchReader` from `@cp/db`); off answers `STATE_INVALID {reason: 'switched_off', key}` (api-contracts §4.17), never retried, and the app shows its existing fallback |
| Migration `<ts>_widget_tokens_and_installs.sql` | `widget_push_tokens`, `installed_widgets` (data-model §3.11), RLS self; not published |
| Commands | `register_widget_token`, `sync_installed_widgets`; `set_notification_prefs` full validation (budget range, roundup time, per-category mode; voice read-out requires `passPlus`) |
| HTTP | `GET /v1/widgets/snapshot?trip_id` (S/K `read_snapshot`, ETag) — builder in `packages/domain/src/surfaces/widget-snapshot.ts`, schema versioned (`schema` int) |
| Worker | queue `widgets.refresh` debounced per user (≥15 min except vote close/tally ±, countdown midnight), triggered by `poll.*`, `ballot.cast`, `expense.*`, `leave_by.*`, `trip.*`, `entitlement.changed`, `collection.*`, `flight.event`; sends APNs `widgets` push + FCM `widget.refresh`; daily cap per device 40 |
| Notification categories | `packages/domain/src/surfaces/notification-categories.ts` (canonical ids from async §3.4) → generated Swift `targets/_shared/Categories/Categories.swift` + Kotlin (phase 50) |
| Native | `targets/notification-content/` (vote + RSVP posters), `targets/widgets/Widgets/*`, `targets/widgets/Intents/Widget/*` (`CastBallotIntent` shared with 48 via `_shared`), `targets/widgets/Intents/AppShortcuts/` (`AskGuideIntent`, `NextLeaveByIntent`, `SetActiveCrewIntent`, Control Center `ImUpControl`, `SOSControl`); `modules/cp-widgets` (reload timelines, current configurations → `sync_installed_widgets`, write snapshots) |
| Authz tests | foreign `installed_widgets` unreadable; snapshot route with key lacking `read_snapshot` → `ACTION_KEY_SCOPE`; snapshot never contains another member's budget or coordinates |

## Tasks

### T1 — Snapshot contract, route, tables
- Status: done — 243404c23
- Goal: one widget snapshot for all surfaces.
- Files: `packages/domain/src/surfaces/widget-snapshot.ts` (+ test), `services/api/src/routes/widgets-snapshot.ts`, `services/api/src/commands/widgets/*`, `packages/db/src/schema/widgets.ts`, `packages/db/migrations/<ts>_widget_tokens_and_installs.sql`, `packages/db/test/permissions/widgets.test.ts`, `services/api/test/widgets/*.test.ts`.
- Steps: 1. zod snapshot (countdown per C14, vote summary, today items, balances net, crew ETA buckets, critterdex, next flight, entitlements). 2. Route with ETag + key auth. 3. Commands + migration.
- Tests: `pnpm --filter @cp/api test -- widgets`; `pnpm --filter @cp/db test -- permissions/widgets`.
- Done when: snapshot for Pass+-less user omits next flight and sets `locked`; permission tests pass.

### T2 — App Group writer + cp-widgets module + Swift snapshot reader
- Goal: app writes, extensions read.
- Files: `apps/mobile/modules/cp-widgets/**`, `apps/mobile/modules/cp-app-group/src/snapshots/widgets/*`, `apps/mobile/targets/_shared/Snapshot/*.swift`.
- Steps: 1. Atomic writes of `snapshot/widgets.json`, `entitlements.json`, `prefs.json`. 2. Reload timelines on write. 3. Report configurations. 4. Swift Codable from zod.
- Tests: `pnpm --filter @cp/mobile test -- cp-widgets`; `xcodebuild test -scheme CPShared`.
- Done when: unknown fields ignored by Swift decoder test; writes are atomic (temp+rename test).

### T3 — Widget refresh pipeline
- Status: done — 84c88079c (server side; the extension push handler is native and still to do)
- Goal: server-driven refresh within budget.
- Files: `services/worker/src/jobs/widgets/{refresh,debounce}.ts`, `services/worker/test/widgets/*.test.ts`.
- Steps: 1. Event → affected users → debounce → push. 2. Daily cap + priority exceptions. 3. Widget extension push handler fetching snapshot with action key.
- Tests: `pnpm --filter @cp/worker test -- widgets`.
- Done when: 50 events in 10 min yield ≤1 routine push; vote close always pushes.

### T4 — Countdown, Vote, Critterdex home widgets
- Goal: 5c-1 free widgets.
- Files: `apps/mobile/targets/widgets/Widgets/{Countdown,Vote,Critterdex}Widget.swift`, `apps/mobile/targets/widgets/Intents/Widget/{CastBallotIntent,SelectTripIntent,SelectCrewIntent}.swift`.
- Steps: 1. Timelines (midnight entry, flip transition). 2. Interactive vote with optimistic tally + result state. 3. Empty/stale/signed-out states.
- Tests: `xcodebuild test -scheme CPWidgets -only-testing:HomeWidgetSnapshots`.
- Done when: snapshot tests for all sizes/states match renders; vote intent writes ballot `source: widget`.

### T5 — Today, Balances, Crew, Next flight widgets
- Goal: 5c-2 trip widgets incl. locked states.
- Files: `apps/mobile/targets/widgets/Widgets/{Today,Balances,Crew,NextFlight}Widget.swift`, `apps/mobile/targets/widgets/Intents/Widget/{NudgeIntent,PackingCheckIntent}.swift`.
- Steps: 1. Today L with strike/fade transitions and forecast line. 2. NUDGE (1/pair/24 h, server). 3. Crew (Boost) and Next flight (Pass+) locked renderings → offer deep links.
- Tests: `xcodebuild test -scheme CPWidgets -only-testing:TripWidgetSnapshots`; `pnpm --filter @cp/api test -- nudge-rate`.
- Done when: second nudge in 24 h returns rate-limit and widget shows "sent earlier"; locked widgets deep link to correct offer route.

### T6 — Lock-screen accessory + StandBy
- Goal: 5c-3, 5c-4.
- Files: `apps/mobile/targets/widgets/Widgets/Accessory/{CountdownInline,CountdownRing,VoteScore,CritterdexRing,NextLeaveBy}.swift`, `apps/mobile/targets/widgets/Widgets/StandBy/{SleepyClock,LeaveByAlarm}.swift`.
- Steps: 1. `widgetRenderingMode` accented/vibrant with mono art. 2. StandBy pair with minute timeline + alarm switch.
- Tests: `xcodebuild test -scheme CPWidgets -only-testing:AccessorySnapshots`.
- Done when: every accessory legible in tinted mode snapshot; StandBy switches to alarm at leave-by time.

### T7 — Categories + actionable notifications (all §3.4)
- Goal: every category's background actions work locked.
- Files: `packages/domain/src/surfaces/notification-categories.ts`, `apps/mobile/targets/_shared/Categories/Categories.swift`, `apps/mobile/src/data/push/categories.ts` (edit of phase-11 folder: registration call only), `e2e/notifications/actions/*.yaml`.
- Steps: 1. Canonical category table; generated registration. 2. Action handler in NSE-shared code → `/v1/actions`. 3. Re-post with collapse id and result text.
- Tests: `pnpm --filter @cp/domain test -- notification-categories`; `maestro test e2e/notifications/actions/`.
- Done when: each category's background action produces its command with `via: notif_action`, idempotent on replay.

### T8 — Vote poster content extension
- Goal: 5b-2 poster + stamp.
- Files: `apps/mobile/targets/notification-content/{NotificationViewController.swift,VotePosterView.swift,RsvpPosterView.swift,Info.plist}`.
- Steps: 1. SwiftUI poster with critter frames + VS pulse. 2. Actions update poster in place (`.doNotDismiss`), stamp on success, closed state. 3. RSVP poster reuse.
- Tests: `xcodebuild test -scheme CPNotificationContent`.
- Done when: poster snapshot matches render; vote from poster stamps without dismiss.

### T9 — Ping settings screen
- Status: in-progress — 88831e130 command and tests, 8851c8f2a screen (Settings row, you/pings catalog, mobile checks and device capture still to do)
- Goal: 5b-4 with spoken sample.
- Files: `apps/mobile/src/app/you/pings.tsx`, `apps/mobile/src/features/you/ping-settings/**`, `services/api/src/commands/notification-prefs/set-notification-prefs.ts`, `packages/i18n/locales/en/you/pings.po`.
- Steps: 1. Slider fills bar (motion preset), haptic ticks. 2. Sample audio per guide × level (content assets) with on-device TTS fallback. 3. OS-denied banners via cp-notifications permission state. 4. Voice read-out Pass+ gate + mechanism: roundup audio render (`roundup.narrate` via P13 voice client → R2) played in-app on open; Siri Announce eligibility on roundup/chat categories (T7 category flags); toggle copy states the locked-phone limitation.
- Tests: `pnpm --filter @cp/mobile test -- ping-settings`; `pnpm --filter @cp/api test -- notification-prefs`; Maestro `e2e/notifications/actions/ping-settings.yaml`.
- Done when: saving budget 3 routes the 4th BUDGET item of a day to roundup (router test with new prefs).

### T10 — Widget gallery + App Shortcuts/Controls
- Goal: 5c-5 and Siri/Control surfaces.
- Files: `apps/mobile/src/app/you/widgets.tsx`, `apps/mobile/src/features/home/widget-gallery/**`, `apps/mobile/targets/widgets/Intents/AppShortcuts/*.swift`, `e2e/widgets/gallery.yaml`.
- Steps: 1. Live previews from snapshot (RN components mirroring widget layouts). 2. Tier pills from perks; locked → offer. 3. iOS how-to sheet animation. 4. App Shortcuts + Controls.
- Tests: `pnpm --filter @cp/mobile test -- widget-gallery`; `maestro test e2e/widgets/`.
- Done when: gallery lists the 7 home widgets incl. Critterdex; how-to sheet opens on "+"; `ImUpControl` sets readiness.

## Phase acceptance criteria
- [ ] Locked-phone vote action casts ballot and re-posts stamp
- [ ] All §3.4 categories registered with working background actions
- [ ] Ping budget/roundup/quiet hours persisted and honoured by router
- [ ] 7 home, 5 accessory, 2 StandBy widgets snapshot-tested incl. empty/stale/locked
- [ ] Widget push ≤40/day/device with vote-close exception
- [ ] Gallery with truthful tier pills and iOS how-to
- [ ] No coordinates/budget maxes in snapshots; money widgets `privacySensitive`

## Risks & rollback
| Risk | Mitigation |
|---|---|
| Content extension memory/time limits | pre-baked frames, ≤12 frames; static poster fallback |
| WidgetKit reload budget | server debounce + timelines; flag `widgets.push.enabled` |
| Dynamic action labels unsupported on some OS builds | generic "Option 1/2" labels + poster shows names |

## Non-code dependencies
| Item | If not ready |
|---|---|
| Voice sample audio per guide (content factory) | on-device TTS sample |
| Communication Notifications capability | plain alert + avatar attachment (phase 11 fallback) |

## Open questions
1. Widget push daily cap 40/device — default assumed; tune after load test.
2. Doc delta: `widgets.refresh` queue missing from async §2.2; snapshot schema fields list.
3. Should Balances widget be free (matrix silent)? Default: free, net amounts only.
4. Doc delta: `roundup.narrate` job (roundup audio in guide voice for Pass+ read-out) and Siri Announce eligibility flags per category — default: add; C12 copy states locked-phone read-out is not possible (closest truthful equivalent).
