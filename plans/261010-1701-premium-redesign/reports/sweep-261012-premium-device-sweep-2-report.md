# Premium device sweep 2, 12 Oct 2026

Branch `feat/premium-redesign` (PR #894), after the two polish branches were merged at `3951514fe`. Sheets are posted to PR #894 (compare mode). Builds: Android `native-e2e-test-android-fcdf634ef7a4-38166486463`, iOS `native-e2e-test-ios-a7afa6d3d626-38166489704`, each with this branch's JS swapped in.

## CI

| Run | Head | Result |
|---|---|---|
| 38189865718 | `3951514fe` | red: mobile lint (3 errors), app tests (native token copies, one recap story timeout) |
| 38192466428 | `0a4f56443` | green |
| 38198162657 | `2eaebc714` | green (includes the plan sheet crash fix) |
| 38203992066 | `e9ef7273b` | green (last code-bearing head; later commits are flows and this report) |

Fixed in `d23fcc088`: the native token copies were regenerated (`guideCritter` 38 → 36 in `CPPremium.swift` and `CpPremium.kt`); `features/trip/hub/tiles.tsx` no longer renders a component taken from context (the React compiler rule "Cannot create components during render"), the premium hub passes a function that returns its tile; the CSS gradient in `guest-dock.tsx` and the SF Symbol names in `BookingDetailPremium.tsx` carry the same lint exemption the other premium files use. The recap story test (`writes a crewmate's signature…`) timed out once and passed on the next run with no recap change; no code change was made. `crew-copy.test.ts` passes.

## i18n

One clash: `bookings.mailbox.connected` had two messages (`MailboxPremium` and the legacy `MailboxSheet`); the premium one is now `bookings.premium.mailboxConnected`. Extraction added 34 Vietnamese entries (bookings 13, onboarding 7, money 6, home 4, crew 3, trip 1); all are translated (placeholders unchanged, "Chat nhóm" as in the chat header), and `vi` has no empty entries. Compiled clean. Commit `1466e56cb`.

## Device runs

| What | Run | Result |
|---|---|---|
| Android, every flow | 38191499730 | cancelled: every flow stopped at the premium switch (Developer tools sits below the fold on the new Home); flow fixed in `0a4f56443` |
| iOS, home/pass/chat/wallet/plan | 38191529308 | cancelled with the Android run |
| Android, every flow (4 shards) | 38192468517 | 8 of 11 flows passed; plan crashed the app, wallet and vi-trip stopped on the second booking |
| iOS, home/pass/chat/wallet/plan | 38192471154 | chat passed; home, pass, wallet and plan stopped (see iOS) |
| Android, plan + wallet + vi-trip | 38197708954 | all three passed after the crash fix |
| Android, plan-vote | 38197834008, 38201944047 | passed; the second run votes from the showdown dock |
| iOS, pass/wallet/plan | 38201947392 | pass and wallet passed; plan stopped after the draft (see iOS) |

Every shard is marked failed by `[ui-qa]` reports even when all its flows passed (see the first finding).

**Coverage:** **120 of 246** codes captured (first sweep: 90). 43 have dark shots, 26 Vietnamese, 32 have iOS shots. Newly reached: 1.09, 1.11, 1.12, 1.13, 4.06, 4.13, 4.25–4.30, 4.36, 4.42, 4.43, 4.47, 4.53–4.55, 5.01 from Home's chat button, 7.13, 7.17, 7.18, 7.21, 7.23, 7.24, 7.26, 7.27, 7.29, 8.02, 8.05, 8.07, 8.12. The about 30 codes no in-app capture can reach (native surfaces 6.27–6.36, the store shots 10.x, motion-only Foundations frames, purchase states) are still out.

## Fixed in this lane

- **Crash, `da257c904`** `features/plan/premium/plan-map/plan-map-sheet.tsx`: dragging the plan map sheet called the JS helper `sheetHeight` inside the UI-thread gesture worklet ("[Worklets] Tried to synchronously call a Remote Function"), which killed the app on Android on any drag of the sheet. The iOS plan flow of run 38192471154 also ended on the springboard, most likely the same crash. The lower bound is now computed on the JS side.
- Flows (`e2e/premium/`): Home's chat button opens the crew chat; the hatch runs from the Critterdex's "Hatch it" (it never rises over Home by itself); the trip's Quests and Album tiles are reached from Home's live card; plan-vote votes from the showdown dock, adds a solo-trip branch and splits the setup steps into `plan-setup.yaml`; the premium switch scrolls to Developer tools; Pass+ pages are left by their back button; the iPhone booking options close with "Close"; the budget page stays open after saving; the second booking opens whether it comes to the front or opens straight away.

## Findings, app (not fixed here)

1. **`[ui-qa]` fails every premium shard.** NO_BACK_AFFORDANCE fires 154 times on premium pages that draw a back button (`/you/edit`, `/crew/<id>/chat`, `/hub/<id>`, `/wallet/bookings/<id>`, `/<id>/plan/map`, `/inbox`…): the premium shell's back buttons don't register with `ui/qa/back-affordance.ts`. STICKER_NO_OUTLINE fires 136 times for premium glyph stickers (`gecko:Tokek`, `star`, `spark`, `food`, `wallet`…) that the premium design draws without the white outline. Either the checks learn the premium shell, or the premium header and stickers report to them. Until then no premium sweep can be green.
2. **"Set up Kyoto" (4.06) opens the When step, not the setup checklist (4.08).** `voteRoutes.tripSetup` resolves `3c-3`, which `features/setup/routes.ts` registers as the When step; the premium checklist lives at `/[tripId]/setup`. A solo start lands there too. So 4.08–4.12 and 4.14–4.21 are still not captured.
3. **4.06 winner: two headers.** A "← Where next?" navigation bar sits above the page's own "✕ Where next? · Final · 5 of 5 voted". File: `features/vote/premium/final/winner-reveal.tsx` (or the route's layout).
4. **iOS: the legacy dark "YOUR CREWS" sheet opens over premium Home** (run 38192471154, home flow, after an edge swipe on Home). The flow's back steps then can't leave it. Look for a legacy crews drawer or swipe still mounted under `features/home/premium/home-premium-screen.tsx`.
5. **The plan map (4.25–4.27)**: no filter chips row (Day · Saved · Crew picks · Food), the top bar has back + ⋯ where the design has search + ≡, 4.25 and 4.26 look the same (the sheet starts at half, not peek), and the 12-hour times wrap ("10:40a / m", TEXT_WORD_BROKEN) in `plan-map/timeline.tsx`. 4.27 has no header (crew · dates · Share) and the day label is cut ("Mon 2 …").
6. **7.17 Money**: "Latest" is empty though the trip has expenses ("See all" shows), and the last amount is cut ("−200,00"). File: `features/money/premium/` balances.
7. **2.01 Splash**: the Batur and Penida photo cards are blank white. File: `features/onboarding/premium/splash/PremiumSplashPage.tsx`.
8. **4.04 Destination**: the "Best in April" month chart is still missing. File: `features/explore/premium/destination/destination-page.tsx`.

## Findings by screen (Android unless marked)

Verdicts: **match** (only deliberate platform or plan-decision differences, or seed data) or **off** (what, then file).

### First run (part 2)
- 2.01: **off**, blank photo cards (finding 7). Ways in are centred now.
- 2.05: match; the keyboard no longer covers the field or note. Small: the pass card scrolls up under the progress header.
- 2.09, 2.11, 2.13, 2.15, 2.19: match (inked stamps, sparkles, white guide strip, Paste a link, bold manifest stamp).

### Home, trips, crews, inbox (part 3)
- 3.01: match (greeting, caret on the title). Small: the guide note's action button is cut at the right edge.
- 3.02: match (greeting, chat button with badge, plan ring). Where next? isn't shown: no vote in the `everyday` seed.
- 3.05: match; the filter hugs its labels, search is back. No live card (seed).
- 3.08: **off, small**: 8 covers including 2 locked ones run off the edge (design: 6); the counter sits under the field, not inside it. File: `features/crew/premium/start-crew-sheet.tsx`.
- 3.12: **off, small**: notifications are a segmented control where the design has a "Mentions ›" row. Trip rows now show dates and status. "No live code" is seed data.
- 3.17: match (large title, Mark all read pill). Small: "Needs you · 2" carries the count in the label where the design has a pink badge (`inbox-premium-screen.tsx`).

### Decide and plan (part 4)
- 4.03: **off, small**: no share button in the header. Notes fade under the dock now. File: `features/vote/premium/places/guest-guide.tsx`.
- 4.04: **off** (finding 8).
- 4.06: **off** (finding 3).
- 4.13: not comparable: the solo When step ("When can you go?") was shot; 4.13 is the calendar-connected result page.
- 4.25–4.27: **off** (finding 5).
- 4.30 Find: match.
- 4.42 Swipe: match in layout; cards have no photos (staging places).
- 4.53 Trip settings: **off, small**: the trip rows have no icons and the "Live crew map · Boost" row is missing.

### Chat and guide (part 5)
- 5.01: match, now reached from Home's chat button (seed has no poll or offer).
- 5.14: match; the header stays clear of the status bar with the keyboard up. One quick chip only, before the trip.

### On the trip (part 6)
- 6.01: not comparable: the design is the pre-trip hub, the capture is a trip day (photo hero, Today · Plan · Map · Money). Tiles are white with icons now.
- 6.04: match (pickup sentence present).
- 6.10: match; street tiles draw now.

### Wallet (part 7)
- 7.02 (Android, iOS): match: stacked wallet, next booking in front, "2 offline". Header reads Wallet with the switch (lane decision).
- 7.05: **off, small**: a bare "Done" text at the sheet's top left, and the forward address row is cut. Gmail shows "Coming soon" (staging config). File: `features/bookings/premium/MailboxPremium.tsx`.
- 7.10: **off, small**: a stray "Scheduled" line under the ticket; no "Add to Wallet" on Android (expected). Saved on this phone and the arc are in.
- 7.17: **off** (finding 6).
- 7.18: match (⌫, sentence-case "Add ₫250K").
- 7.21: match; Changes is in.
- 7.29: the budget was never saved in run 38197708954 (flow fixed in `7f8bb768d`, not re-run).

### Critters (part 8)
- 8.05: match. Small: the "#11 in the Vietnam set" chip sits left where the design centres it (`features/critters/premium/hatch/hatch-scene.tsx`).
- 8.07: match in layout; quest titles arrive in capitals from the server.
- 8.12: empty journal (no photos in the seed).

### Pass and account (part 9)
- 9.01 (Android, iOS): match. iOS now has the large title with Edit and Settings.
- 9.02: match (Save pill, avatar fills the slot).
- 9.04 iOS: **off, small**: no back button, and the plan chip shows a double chevron ("Free plan › ›"). File: `features/you/premium/settings/`.

### iOS
- Pass flow: passes (run 38201947392) now that it leaves the Pass+ "What's in each" page by its back button; that page has no edge-swipe back.
- Wallet flow: passes (run 38201947392).
- Home flow: finding 4.
- Plan flow: the draft (4.22) is captured, then after "Build the proposal" (`draft-propose`) eight edge swipes never reach Home and the run ends on the springboard (both attempts, run 38201947392). Either the proposal page swallows the edge swipe and something below leaves the app, or the app exits; the shard has no crash report. The map, Find and trip settings were not reached on iOS. Next step: capture the screen right after `draft-propose` on iOS (`e2e/premium/subflows/plan-draft.yaml`).

## Staging data and config, not code

- Staging auth refused one anonymous sign-in ("failed to create anonymous session: UNKNOWN") at Start as, run 38191499730.
- Mailbox: Gmail is "Coming soon" on staging (7.05).
- Store has no offerings on the emulator (9.10, 9.17).
- `everyday` seed: the Bali Demo Crew has no live join code (3.12), no open vote (3.02), and its plan has one day though the trip is Nov 2–8 (4.25–4.27).
- `trip_today` seed: nobody shares location (6.10), no photos (8.12), quest titles in capitals (8.07).
- Start-as accounts have no taste answers (9.01 travel chips) and no live trip for the Trips page (3.05).
- Swipe places have no photos on staging (4.42).
- The emulator draws the plan map's tiles late at peek and half (4.25, 4.26) but in time at full (4.27).
