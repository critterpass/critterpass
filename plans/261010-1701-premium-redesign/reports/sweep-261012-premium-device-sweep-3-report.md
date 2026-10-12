# Premium device sweep 3, 12 Oct 2026

Branch `feat/premium-redesign` (PR #894). Sheets are posted to PR #894 (compare mode). Builds: Android `native-e2e-test-android-e7cfe5f9a257-38235429546` (new, built at `a1512ac69` for the bundled splash photos), iOS `native-e2e-test-ios-a7afa6d3d626-38166489704` (no native change since). Each shard swaps in its commit's JS.

## CI

| Run | Head | Result |
|---|---|---|
| 38231359697 | `6b9d53e19` (the two merged polish branches) | red: mobile lint (an unused lint directive in `crews-route.tsx`), app tests (4 vote place tests: `useSoloStart` now reads the premium switch, the vote harness had no analytics provider) |
| 38235413118 | `a1512ac69` | green |
| 38250969385 | `c1530803e` | green |

The vote harness now renders inside `AnalyticsProvider` with PostHog stubbed at the network edge (as the crew harness does); no test was changed.

## App fixes

- **iOS full-height sheets** (`ui/premium/shell/screens/sheet-screen.tsx`). Cause: New poll is the first screen of the vote stack when opened from the crew chat, and a native stack never presents its first screen as a sheet, so it was drawn as a whole-screen card in the see-through group: Cancel sat under the status bar and the page showed through the 86% tint. A `SheetScreen` that is its stack's first screen now lays its header below the safe area on the opaque sheet material (and keeps its footer above the home indicator). iOS 4.01 now shows Cancel at the top under the status bar on an opaque sheet (run 38236571636).
- **Proposal Send never enabled**: no app bug. The `draft_ready` seed is a crew of one, so the builder opens its "nobody to send it to yet" page (`proposal-alone`, invite or lock in alone) and `build-send` never exists. `plan-draft.yaml` now waits for either page and leaves the alone page by its back button (no 90 s wait). 4.51 Who's in needs a seed with crewmates (staging item below).
- **iPhone edge swipe on the plan map**: `BackEdge` (`ui/premium/shell/navigation/back-edge.tsx`), a 20 pt see-through strip down the left edge laid right after the map, so the map never takes a swipe that starts at the bezel. The trip hub's door chips (`HubSwitch`) don't bounce when they fit, so the same swipe goes back there. `plan-home.yaml` now swipes first and only then taps the map's or hub's back button: in run 38248948193 the swipe from the plan map reached the hub.
- **i18n**: the crew switcher's 7 new ids and the compare empty state's 3 are translated to Vietnamese; compiled clean.
- **Device findings fixed on the way**: one-line labels held to one line (`badge`, `segment`, `pillSmall`, `textButton`…) now shrink to 75% to fit whole instead of being cut (`ui/premium/text/Text.tsx`; fixes "When all vote", the VI segments, the booking share pills, the visa card fields, "Ask Tokek"); the winner stamp's crew name fits its two lines; Find's tiles allow three lines; the crew-made page (3.09, no back by design), Find's Cancel and the ideas sheet count as their screen's way back; premium compare with an empty shortlist says so (new undesigned state); the plan check and balance bars read "Checking the plan" / "Whose picks made it" instead of a cut "CHECKIN…"; private tours' commission line names the guide ("Tokek", was the id "chava").
- **Screen checks**: the frame check now recognises a tall inset sheet that starts right under the status bar (the calendar sheets 4.11, 4.12 on both platforms); designed sparse states (6.21 no cards, 6.22 couldn't read, 6.23 empty shortlist, 9.07 empty idea board, 9.17 free plan with no store) skip the empty-screen check with their undesigned-state or render row.

## Device runs

| What | Run | Head | Result |
|---|---|---|---|
| Android, every `e2e/premium` flow (4 shards) | 38238356784 | `a1512ac69` | all 11 flows passed; every shard red on `[ui-qa]` and screen checks |
| iOS home, pass, chat, wallet, plan, plan-vote (2 shards) | 38236571636 | `a1512ac69` | home, chat, pass, wallet, plan-vote passed; plan stuck on the trip hub (edge swipe) |
| Android, every flow (4 shards) | 38245219867 | `90e3b30dd` | all flows passed; shards 1, 2, 4 **green**; shard 3 red only on screen checks (below) |
| iOS, same six (2 shards) | 38248948193 | `c80cee6c6` | home, chat, plan, pass, wallet passed, **zero `[ui-qa]`**; shard 1 red on 4.25 dark only; shard 2 red on a launch crash in plan-vote (finding 1) |

**Coverage:** **126 of 246** codes (sweep 2: 120). 44 have dark shots, 27 Vietnamese, 77 iOS (sweep 2: 32). By part: 1: 9/13, 2: 14/19, 3: 17/20, 4: 26/57, 5: 14/24, 6: 13/36, 7: 17/29, 8: 5/15, 9: 11/24, 10: 0/9 (store shots). Still out: the setup checklist and its steps (4.08–4.21 apart from 4.10–4.12), native surfaces (6.27–6.36), purchase states and motion-only frames.

## Findings, app (not fixed here)

1. **iOS launch crash after the premium switch** (run 38248948193, shard 2, `plan-vote.yaml`, third `start.yaml` with `crew_with_code` after `plan-places`): `premium-on.yaml` stops and relaunches the app; Maestro reports "App crashed or stopped" 3 s later on the launch splash. The two earlier relaunches in the same flow, and every Android relaunch, were fine. The shard keeps no iOS crash report; next step is to copy `~/Library/Logs/DiagnosticReports/*.ips` into the iOS shard artifact (`device.yml`) and re-run `plan-vote` on iOS.
2. **iOS: eight edge swipes after the plan menu never reach Home** (run 38248948193, `plan-menu.yaml` ends on trip settings / cancel trip): no map or hub is showing, so the swipe is taken elsewhere. The flow carries on through the tabs.
3. **Plan check never lands on staging** (4.43, Android and iOS): after 45 s the page still reads "Tokek is checking the plan", so 4.43 is a sparse page. Either the staging worker does not run the check for the `everyday` trip or its result doesn't sync. File: `features/plan/check/` (data) or the worker's plan check.
4. **Cancel the trip (4.55)**: "What cancelling does shows with signal" while online: `GET /v1/trips/{id}/cancel-summary` failed or didn't parse for the `everyday` trip. File: `features/plan/settings/data/use-settings-reads.ts`, `services/api/src/planning/trip-settings/reads.ts`.
5. **The proposal builder has no premium look**: `features/proposal/builder/` (and its alone page) still draws the current dark UI inside the premium app.
6. From sweep 2, still open: 4.06 opens the When step, not the checklist; the winner page's two headers; the plan map's missing search + ≡ bar; 7.17 empty "Latest"; 4.04 month chart.

## Findings by screen (Android unless marked)

- 4.01 New poll (iOS): **match** now: Cancel and Post under the status bar, opaque sheet. "When all vote" fits from `a1ed8f83d`.
- 4.11, 4.12 calendar sheets (both): match; the inset sheet no longer reads as a frame.
- 4.22 draft: match. 4.51: not reached (seed).
- 4.25–4.27 plan map: 4.25 dark is a black map (tiles late on the emulator at peek, both platforms; staging/emulator). Chips row present.
- 4.28 all days: one day in the `everyday` plan (seed), sparse.
- 4.43 plan check: **off**, still checking (finding 3); bar title fixed in `c1530803e`.
- 4.47 balance: match (5 rows, all even); just under the empty-screen line (23%) because the seed crew is even.
- 4.55 cancel trip: **off** (finding 4).
- 6.21 private tours: link rows only (staging has no supplier cards); guide name fixed in `95420b485`.
- 6.22: the couldn't-read page (6c-3), not the 6.22 check card: the lab opens it unread. 6.23: empty shortlist page (new state).
- 9.07 idea board: empty board (staging). 9.17 your plan: free, no store on the emulator.

## Staging data and config, not code

- `draft_ready` is a crew of one: the builder can only lock in alone; 4.51 needs a seeded crewmate.
- `everyday`: the plan has one day for a Nov 2–8 trip (4.26–4.28); the plan check never finishes (4.43); cancel summary unavailable (4.55).
- Drivers lab trip: no shortlist (6.23), no supplier cards (6.21).
- The store has no offerings on the emulators (9.17); the idea board is empty (9.07).
