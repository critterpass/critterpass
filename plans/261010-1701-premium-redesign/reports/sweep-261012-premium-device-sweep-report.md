# Premium device sweep, 12 Oct 2026

Branch `feat/premium-sweep` (from `feat/premium-redesign` at `153e3fdd1`). The design | device sheets are posted to PR #894.

## Runs

| What | Run | Result |
|---|---|---|
| e2e-test build, Android x86_64 | 38166486463 | release `native-e2e-test-android-fcdf634ef7a4-38166486463` |
| e2e-test build, iOS simulator | 38166489704 | release `native-e2e-test-ios-a7afa6d3d626-38166489704` |
| Android, every flow | 38169854020, 38171553335 | all flows stopped on the error sheet at launch (fixed below); cancelled |
| Android, every flow | 38172309065 | Pass tab error at launch (fixed below) |
| Android, every flow | 38173963364 | first run with sheets: home, plan, vi, first-run, vi-trip |
| Android, the rest | 38178850535 | critters, first-run, wallet, pass, vi, chat |
| Android, plan-vote and trip | 38180268275 | trip passed; plan-vote dark pass fixed |
| Android, chat and plan-vote | 38183980482 | plan-vote passed; chat light pass captured, dark pass fixed after the run (not re-run) |
| iOS: home, pass, chat, wallet | 38178875135 | 16 shots; pass and wallet stopped by XCTest errors (see iOS) |

**Coverage:** 149 Android shots and 16 iOS shots cover **90 of 246** designed codes. Of the 90, 24 have dark shots and 23 have Vietnamese ones. The 246 includes about 30 codes no in-app capture can reach: native surfaces 6.27–6.36, the store shots, motion-only Foundations frames and purchase states. The biggest gaps are app problems, listed first under "Blockers" below.

## Fixed in this lane (launch blockers, cherry-picked to `feat/premium-redesign`)

- `c8194b339` `features/money/data/services.tsx`: the refused-write listener threw "useLocalFirst needs a LocalFirstProvider" because the premium tab bar mounts the Wallet tab before the local DB opens. Every signed-in premium launch showed the error sheet.
- `546e8b318` `app/(tabs)/wallet/_layout.tsx`: the premium wallet halves now wait for the local DB inside `LocalFirstGate`.
- `27a5a2f0a` `app/(tabs)/pass.tsx`: the premium Pass tab now waits the same way.

## Blockers to coverage (app, not flows)

1. **The premium plan map can't be reached (4.25–4.57).** The hub's Plan door opens `/[tripId]/plan`, which always draws the legacy map or day plan. The premium map lives only at `/[tripId]/plan/map`. Fix in `app/(trip)/[tripId]/plan/index.tsx`: in premium, redirect to `plan/map`.
2. **Premium Home has no crew chat button (5.01–5.12, 1.10).** The design for 3.02 shows a chat bubble with a badge next to the bell, and the legacy header has `onOpenChat`. No premium screen links to `/crew/<id>/chat`. Fix in `features/home/premium/home-premium-screen.tsx` (header actions).
3. **"Find bookings in my email" opens the legacy "Coming soon" sheet (7.03, 7.05).** Fix in `features/bookings/mailbox/MailboxSheet.tsx`, reached from `features/bookings/add/AddBookingView.tsx`. The premium `MailboxPremium` / `AddBookingPremium` are not on this path.
4. **Every flow logs a `[ui-qa] STICKER_NO_OUTLINE "tanuki:Pon"` report at launch, and that fails every shard.** It comes from `ui/sticker/Sticker.tsx:138`: some premium surface draws Pon without the outline.

## Findings by screen (Android unless marked iOS)

Verdicts: **match** (only the deliberate platform or plan-decision differences) or **off** (what differs, then the file).

### First run (part 2)
- 2.01 Splash: **off.** The Batur and Penida photo collage behind the passport is missing. "I have an invite code" and "Sign in" are left-aligned; the design centres them. File: `features/onboarding/premium/splash/PremiumSplashPage.tsx`.
- 2.05 Name: **off, keyboard.** The docked Next button covers the name field, and Tokek's note is hidden behind the keyboard. File: `features/onboarding/premium/name/PremiumNamePage.tsx` (footer inset with `KeyboardStickyFooter`).
- 2.06 Name at the limit: match.
- 2.07 This or that: **off.** In one run the name page's keyboard stayed up over the quiz (`PremiumTastePage.tsx`; dismiss the keyboard on step change). The screen check also flags SCREEN_FRAME, see "Screen checks".
- 2.08 Photo: not comparable. The design draws the camera-off state, but the emulator shows the default picker.
- 2.09 Home base: **off, small.** The stamp is a thin double ring where the design has a thick filled orange ring, and it is about 20% smaller. The field icon is a pin, not a magnifier. File: `features/onboarding/premium/home/PremiumHomePage.tsx`.
- 2.11 Pass issued: **off, small.** The stamps are thin rings and the sparkles are missing. File: `features/onboarding/premium/issued/PremiumIssuedPage.tsx`.
- 2.12 Save sheet: match (Android drops Apple; "Not now" is added).
- 2.13 Permissions: **off, small.** The tiles carry green ticks the design doesn't have. The Tokek note is a yellow card with a script name; the design draws a white strip with a bold name. That note difference repeats on 3.01, 3.02, 4.05, 2.13 and 7.24, so fix it once in `ui/premium/cards/GuideNote.tsx`.
- 2.14, 2.16: match.
- 2.15 Code found: **off, small.** The "Paste a link" header button is missing. File: `features/onboarding/premium/invite/PremiumCodePage.tsx`.
- 2.19 Manifest: **off, small.** The ADMITTED stamp is a thin outline where the design has a bold ring with a filled name, and the welcome script sits above the title instead of under the stamp. File: `PremiumManifestPage.tsx`.

### Home, trips, crews, inbox (part 3)
- 3.01 Crew ready: **off, small.** The crew name has no ⌄ caret (the caret sits on the members row) and the "Hey Winston" eyebrow is missing. File: `features/home/premium/home-premium-screen.tsx`.
- 3.02 Trip collage, light and dark: **off.** The chat button is missing (blocker 2), the eyebrow is missing, and the plan ring icon on "Plan 62%" is missing. Dark matches the dark tokens.
- 3.05 Trips, Android and iOS: **off.** The All / Planning / Home again segmented control collapses to an empty pill about 30 pt wide, and the search button is missing from the header. File: `features/home/premium/trips/trips-premium-screen.tsx`.
- 3.06, 3.18, 3.19: match.
- 3.07 Crew switcher: match. The menu anchors under the members row, not the title.
- 3.08 Start a crew, iOS: **off.** The sheet's Cancel / New crew / Start header draws under the status bar (the sheet isn't inset from the top), and the cover swatches wrap to a second row. File: `features/crew/premium/start-crew-sheet.tsx`.
- 3.09, 3.11, 3.13, 3.14, 3.15: captured, reviewed in the index only, no obvious break.
- 3.12 Crew settings: **off, small.** The QR and "7 days left" are missing from the code card ("No live code" with this seed), and the trip rows don't show dates or status. File: `features/crew/premium/crew-settings-screen.tsx`.
- 3.17 Inbox: **off.** It shows a small centred nav title instead of the large "Inbox" title, "Mark all read" became a ✓ icon, and card art is square initial tiles. File: `features/home/premium/inbox/inbox-premium-screen.tsx`.
- 1.04 Tab bar: on Android it's the Material bar with the guide FAB, by plan decision. **Off:** the FAB covers the trailing edge of list rows on 7.01, 7.02, 7.17, 7.29 and 9.01. Pages need a bottom inset for the FAB in `ui/premium/shell/navigation/premium-tabs.tsx` or the root scaffold.

### Decide and plan (part 4)
- 4.02 Search places: match; the field docks above the keyboard.
- 4.03 Guest guide (Vietnamese): **off.** The hero photo is a flat yellow block, and the notes card runs underneath the docked buttons with no bottom padding. File: `features/vote/premium/places/guest-guide.tsx`.
- 4.04 Destination: **off.** The "Best in April" month chart card and the "14 crew plans" row are missing. File: `features/explore/premium/destination/destination-page.tsx`.
- 4.05 Showdown: match. Android draws a plain back arrow, and "Closes" moved into the subtitle.
- 4.07 Solo, 4.22 Draft: captured.
- 4.25–4.57: not reached (blocker 1). 4.01, 4.06 and 4.08–4.21 weren't captured: the vote seed's showdown ends the flow's vote branch. The flow needs a `crew_with_code` setup branch.

### Chat and guide (part 5)
- 5.13, 5.15, 5.16, 5.17, 5.21, 5.22: captured.
- 5.14 Guide with the keyboard: **off, keyboard.** The sheet's header (✕, Tokek, Group | Me) rides up under the status bar while the keyboard is up, and the quick chips shrink to one. File: `features/guide/premium/guide-screen.tsx`.
- 5.24 Getting around: **off, small.** The map has no route line or driver pin; there's no ride booked in the seed.

### On the trip (part 6)
- 6.01 Trip hub, 1.05: **off.** A floating camera glyph overlaps the home indicator at the bottom centre, and the Quests tile is filled orange where the design draws a white tile. File: `features/trip/premium/hub/*`.
- 6.04 Day-of: **off, small.** The readiness card is missing the pickup sentence.
- 6.10 Crew map: **off.** On the emulator the map draws no street tiles (blank beige), though 6.13 draws them. File: `features/crew/live-map/premium/*`, or the map camera's region.
- 6.11, 6.12, 6.15, 6.25: captured.
- 6.13: shows the Boost gate (unboosted trip), by product rule.
- 6.19 Find a driver: match (no leg chips or shortlist with this seed).
- 6.21–6.23: sparse, because the seed has no supplier results (EMPTY_SCREEN).

### Wallet (part 7)
- 7.01 Bookings empty: match, apart from the search button missing from the header and the FAB overlap.
- 1.06 + into the sheet: match (shell grammar: Cancel / title).
- 7.02 Stack (Vietnamese): **off.** The bookings are a flat list, not the stacked wallet, and the "9 offline" badge is missing. File: `features/bookings/premium/WalletBookingsScreen.tsx`.
- 7.10 Flight: **off.** The "Saved on this phone" section (boarding pass, e-ticket) and the "Add to Wallet" button are missing, the share button became ⋯, and the dotted arc between the airports is missing. File: `features/bookings/premium/BookingDetailPremium.tsx`, `components/FlightTicket.tsx`.
- 1.13 Dark flight: match (the card stays light).
- 7.17 Balances: match. The header reads "Wallet" with the switch instead of "Money" with a currency chip; Vietnamese fits.
- 7.18 Add expense: **off, small.** The delete key shows "<" instead of ⌫, and the add button is all caps on Android. The Vietnamese amount "THÊM 250 N ₫" needs a language check. File: `features/money/premium/AddExpensePremium.tsx`, `components/AmountKeypad.tsx`.
- 7.21 Expense detail: **off, small.** The "Changes" history section is missing. File: `ExpenseDetailPremium.tsx`.
- 7.24 Settle up: match (paper-plane glyph where the design has an arrow).
- 7.29 Budget: **off.** The planned line, progress bar and pace sentence are missing (no budget set in this seed).
- 7.06, 7.13, 7.15, 7.16, 7.23, 7.26, 7.27: captured.

### Critters (part 8)
- 8.01 Critterdex: match. It's pushed with a back button, and the search field stays (lane decisions).
- The other critters codes weren't captured: the trip_today hatch and quests branches skipped. The flow needs a recheck against the hatch page's ids.

### Pass and account (part 9)
- 9.01 Profile: **off, small.** Edit is a pencil icon where the design has an "Edit" text pill, and the FAB overlap applies.
- 9.02 Edit profile: **off.** Save is a ✓ icon instead of the "Save" pill, and the round avatar overflows the passport photo slot. File: `features/you/premium/edit/edit-profile-premium-screen.tsx`.
- 9.04 Settings: match. The Pass+ chip became a passport icon.
- 9.07 Idea board: sparse with no ideas. **Off:** the "3 votes left" chip became a subtitle.
- 9.10 Pass+: no plan cards, because the store has no offerings on the emulator.
- 9.17 Your plan: shows the free plan state.
- 6.38 Notifications, dark: match.

### iOS
- The glass tab bar and the guide circle render, and premium turns on through Developer tools.
- **Off: the Pass tab** draws as an inset card with no large title or toolbar (no Edit or Settings), so the appearance step can't run on iOS. File: `features/you/premium/profile/profile-premium-screen.tsx` (RootScreen header inside the native tab).
- **Off:** 3.05 has the same collapsed segmented control as Android, and 3.08 has its header under the status bar.
- XCTest "Unknown error" and "App crashed or stopped" ended the pass and wallet flows right after the relaunch into premium. Recheck them once the Pass tab header is fixed.

## Screen checks
- SCREEN_FRAME on 2.07, 2.09, 2.10 and 2.11: the checks judge the premium onboarding pages against the dark launch ground (`#17142a`). Either `screen-checks-premium.ts` should treat `#f5f5f7` as a premium ground there, or this is a real light frame. Confirm on the sheet.
- EMPTY_SCREEN on 6.21–6.23, 7.03, 7.05, 9.07 and 9.17: sparse seed data, except 7.03 and 7.05, which are blocker 3.

## Flows
`e2e/premium/*.yaml`: first-run, home, pass, plan, plan-vote, chat, critters, trip, wallet, vi and vi-trip. Shared steps are in `e2e/premium/subflows/`. Shots are named `premium-<code>-<state>-<light|dark|vi>`, and compare mode pairs them with `docs/design-renders/premium/<code>.png`.

Follow-ups for the flows:
- Re-run chat to get its dark pass.
- Fix critters' hatch and quests branches.
- Add a setup branch to plan-vote for 4.08–4.21.
- Run plan.yaml once blocker 1 is fixed.
- Run the chat crew steps once blocker 2 is fixed.
