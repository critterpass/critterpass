# Lane report: Journeys A (first run, home, crews, inbox, pass, account, Pass+)

Branch `feat/premium-journeys-start-home-account`, merged with `origin/feat/premium-redesign` (PremiumTabs fix, `useKeyboardFrame`, `/hub/<tripId>` as a screen) and `origin/feat/premium-kit`.

## Screens done (code → file)

Every premium view sits behind `premiumRoute({ premium, legacy })` (or `usePremiumUi()` where the route already branches); the legacy screens read the same hooks.

| code | premium view |
|---|---|
| 2.01, 2.02 | `features/onboarding/premium/splash/PremiumSplashPage.tsx` (via `app/onboarding/index.tsx`) |
| 2.03, 2.04 | `features/onboarding/premium/paste-offer/PremiumPasteOffer.tsx` (switched inside `features/launch/PasteLinkOffer.tsx`) |
| 2.05, 2.06 | `features/onboarding/premium/name/PremiumNamePage.tsx` |
| 2.07 | `features/onboarding/premium/taste/PremiumTastePage.tsx` |
| 2.08 | `features/onboarding/premium/photo/PremiumPhotoPage.tsx` |
| 2.09, 2.10 | `features/onboarding/premium/home/PremiumHomePage.tsx` |
| 2.11 | `features/onboarding/premium/issued/PremiumIssuedPage.tsx` |
| 2.12 | `features/onboarding/premium/save/PremiumSavePage.tsx` |
| 2.13 | `features/onboarding/premium/permissions/PremiumPermissionsPage.tsx` |
| 2.14, 2.18 | `features/onboarding/premium/invite/PremiumTicketPage.tsx`, `FullTripPanel.tsx` |
| 2.15, 2.16 | `features/onboarding/premium/invite/PremiumCodePage.tsx` |
| 2.17 | `features/onboarding/premium/invite/InviteRanOut.tsx`, `InviteProblemPage.tsx` |
| 2.19 | `features/onboarding/premium/invite/PremiumManifestPage.tsx` |
| 3.01–3.04 | `features/home/premium/home-premium-screen.tsx`, `home-sections.tsx`, `components/*` |
| 3.05, 3.06 | `features/home/premium/trips/trips-premium-screen.tsx`, `empty-passport.tsx` |
| 3.07 | `features/home/premium/crew-switcher/crew-switcher-menu.tsx` |
| 3.08, 3.09 | `features/crew/premium/start-crew-sheet.tsx`, `crew-on.tsx` |
| 3.10 | `features/crew/premium/invite-sheet.tsx` |
| 3.11 | `features/crew/premium/referral-screen.tsx` |
| 3.12, 3.15 | `features/crew/premium/crew-settings-screen.tsx` (+ `members/undoable-removal.ts`, 10 s Undo) |
| 3.13 | `features/crew/premium/edit-crew-screen.tsx` |
| 3.14 | `features/crew/premium/member-sheet.tsx` |
| 3.16 | `features/crew/premium/leave-crew-screen.tsx` |
| 3.17, 3.18 | `features/home/premium/inbox/inbox-premium-screen.tsx`, `inbox-first-time.tsx` |
| 3.19 | `features/home/premium/recovery/lost-link-screen.tsx` (via `app/+not-found.tsx`) |
| 9.01 | `features/you/premium/profile/profile-premium-screen.tsx` (Pass tab) |
| 9.02 + appearance | `features/you/premium/edit/edit-profile-premium-screen.tsx`, `appearance-sheet.tsx` (`app/you/appearance.tsx`) |
| 9.03 | `features/you/premium/app-icon/app-icon-premium-screen.tsx` |
| 9.04 | `features/you/premium/settings/settings-premium-screen.tsx` |
| 9.06, 9.07 | `features/help/premium/help-premium-screen.tsx`, `idea-board-premium-screen.tsx` |
| 9.08, 9.22 | `features/monetize/premium/components/glass-alert.tsx`, `boost-lock-alert.tsx` |
| 9.09 | `features/you/premium/delete/delete-premium-screen.tsx` |
| 9.10, 9.11 | `features/monetize/premium/paywall-premium.tsx`, `compare-premium.tsx` |
| 9.12, 9.14, 9.15 | `boost-premium.tsx`, `stamped-premium.tsx`, `welcome-premium.tsx` |
| 9.16 | `boost-card-premium.tsx` (switched inside `boost-card/boost-chat-card.tsx`) |
| 9.17, 9.23, 9.24 | `plan-premium.tsx`, `cancel-premium.tsx`, `billing-issue-premium.tsx` |
| 9.20 | `seat-cap-premium.tsx` (switched inside `seat-cap/seat-cap-sheet.tsx`) |
| 9.21 | `ftf-ending-premium.tsx` (`app/you/plan/first-trip-ending/[tripId].tsx`) |

## Backend added

- Crew pass cover and organiser hand-over (`6b36e9dc1`), the free-first-trip ending push three days before (`2c4186201`, `873f8bfff`), asking for a fresh invite and the waitlist place on full trips (`a12204a70`).

## Fixes found while finishing

- The boost card and the boost page read `ways` / `windowEnd` before their `const` declarations: a `ReferenceError` whenever a boost was split or had a window end. The stamp page declared its inks twice (would not compile).
- Crew settings trip rows opened the legacy trip route; they open `/hub/<tripId>` now.

## Conflicts resolved

- Wizard order name → photo → taste → home; members who haven't joined shown as counts and silhouettes; invite code expiry as the server issues it; nothing reads the clipboard before a tap; inbox pushed from Home's bell; one destructive pink; store purchase sheets stay native; pause on monthly plans only (the prompt's decisions).
- Printed and brand colours the premium tokens don't carry live in one file per area (`onboarding-colours.ts`, `monetize-palette.ts`, `you/premium/pass-paper.ts`, `crew-look.ts`). Each has a lint exception that says why. The kit lane should promote them.

## Hand-offs to other lanes (not in this lane's files)

- 9.18 `last-redraft-premium.tsx` and 9.19 `live-map-gate-premium.tsx` are built as content; the plan lane (`app/(trip)/[tripId]/draft/last-redraft.tsx`) and the map lane (`features/crew/live-map/states/gate-card.tsx`) host them.
- Shared-looking pieces to promote to the kit: `monetize/premium/components/{glass-alert,modal-sheet,gold-button,confetti,split-flap-digit}`, `onboarding/premium/components/{CodeTiles,PassPaper,WizardPage}`, `crew/premium/components/qr-code.tsx`.

## Gaps built after the first pass

- **Resend (3.10)**: the invite sheet suggests resending your own unanswered in-app invites (never naming who); a tap sends now, a long press waits for their usual hour. `send_nudge` gained `when: 'now' | 'their_hour'` (now unless quiet hours or the day's cap). `0ec80bded`
- **Tell me when it's done (9.22)**: `watch_boost_lock` adds the member to the lock's `waiting_uids` (migration `20261011120000_boost_lock_waiting.sql`, synced schema regenerated); a lock that lapses or is let go sends `boost_lock_freed` (from the trip's guide, into `/boost/<trip>`); a purchase already sends `boost_activated`. `8c43918d7`
- **Redeem a code (9.17)**: the App Store's in-app offer-code sheet (RevenueCat), re-check on close; Play and no-SDK phones open the store's redeem page. `74e540cbb`
- **Did you mean + Use my location (2.10)**: `/v1/geocode` names a misspelt town and its nearest airport; one when-in-use fix from the tap lists the nearest airports. `531264dce`
- **Welcome back (2.02)**: an iOS keychain mark written when a pass is saved or signed in; a reinstall opens on the navy passport, NO SIGNAL chip offline, Sign in waits for signal. `0b536e7bf`
- **Scan QR (2.16)**: one back-camera photo read on the phone by the OCR module's barcode reader, then handled like a paste. `e29175d0f`
- **Saved link (2.04)**: a non-invite web link pasted on first launch is kept (tap the check to drop it) and offered on Home once a trip exists, through the add-from-a-link page. `9cea82e4f`
- **Offline storage (9.05)**: `features/you/premium/offline/*` behind the switch on `app/(trip)/hub/offline-storage.tsx`: ink meter (saved MB, free GB, a bar per trip), Save now / Remove (asked first), auto-save toggle, over the trip feature's own pack logic. "Only on Wi-Fi" and a Recaps share are left out: the background prefetch has no Wi-Fi rule and recaps keep no offline media, so either would be a control that does nothing. `605eddbb2`
- **Something broke (3.20)**: the root, tabs, trip and sheet layouts export `PremiumRootErrorBoundary` / `PremiumGroupErrorBoundary` (`features/home/premium/recovery/premium-error-boundary.tsx`), which show the premium sheet when this run is premium (falling back to the current page if the sheet fails) and the current page otherwise; `premiumUiThisRun()` added to `lib/premium-ui`. `f2f52de45`
- **Message ids**: 14 premium messages that reused a current id with different placeholders or words have their own ids now; a scan of the lane's areas finds no id defined with two messages. `d4e1409b1`

## Follow-ups for the founder / controller

- **Checks**: no local lint, typecheck or tests ran after the coordinator's rule change (only `prettier --check`). Server tests added for CI: `services/api/test/home/nudges.db.test.ts` (resend now / quiet hours), `services/api/test/billing/boost-intent.db.test.ts` (`watch_boost_lock`), `services/worker/test/billing/lock-freed-push.db.test.ts`; app tests: `resend-summary`, `town-guess`, `scan-code`, `saved-link`, `use-nudge`, `plan-views`; domain: `nudges/__tests__/send-now.test.ts`, `links/__tests__/app-links.test.ts`.
- **Catalogs**: new message ids are not extracted (the coordinator runs extract once on the integration branch).
- **Not built, with why**:
  - Our own gift and partner codes (`redeem_code`, `create_gift` in api-contracts §4.15): no code is minted anywhere yet, the `codes.code_hash` needs a new peppered secret, and the code-enumeration limiter is not wired. That is the gifting feature, not a screen gap. Partner codes today are store Offer Code batches (`ops.offer_code_batches`), which the in-app sheet redeems.
  - Live-map replay and "opened it N times" (9.19): no data. `trip_locations` keeps no position history by design, and nothing counts map opens. The gate content stays as built, without them.
  - Welcome back on Android (2.02): Android clears app storage on uninstall. A reinstall-surviving mark needs Play Block Store, which is a new native module.
  - Live QR scanning: VisionCamera 5's core has no code scanner (a separate native package). Scan QR reads one photo instead.
- Hand-offs to other lanes: last-redraft and live-map gate content into their hosts.

## Open questions

- 2.04 "Saved card · Remove it": built as tapping the check (it empties; tapping again keeps the link). Swipe or ✕ would be a small change if preferred.
- Code validity: the design says 7 days, the server issues 14. The code line reads the server's `expiresAt`.
