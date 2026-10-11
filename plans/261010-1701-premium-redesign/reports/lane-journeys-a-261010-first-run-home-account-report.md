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

- 3.20 `features/home/premium/recovery/error-sheet.tsx` is built; `ui/shell/RootErrorBoundary.tsx` (shell lane) should render it when premium is on.
- 9.18 `last-redraft-premium.tsx` and 9.19 `live-map-gate-premium.tsx` are built as content; the plan lane (`app/(trip)/[tripId]/draft/last-redraft.tsx`) and the map lane (`features/crew/live-map/states/gate-card.tsx`) host them.
- 9.05 Offline storage (`app/(trip)/hub/offline-storage.tsx`, `features/trip/bundle/*`) is in the trip lane's files; not built here.
- Shared-looking pieces to promote to the kit: `monetize/premium/components/{glass-alert,modal-sheet,gold-button,confetti,split-flap-digit}`, `onboarding/premium/components/{CodeTiles,PassPaper,WizardPage}`, `crew/premium/components/qr-code.tsx`.

## Follow-ups for the founder / controller

- **Catalogs**: the new message ids are not extracted yet and have no Vietnamese translations. Running `@cp/i18n extract` in four lanes at once would conflict, so run it once on the integration branch, then do one VI pass.
- **Typecheck not run locally** (the brief forbids `tsc` on this Mac). Per-file checks did run: imports resolve, no redeclarations, no use before declaration, and ESLint is clean on every lane file. Full `tsc` runs on the integration PR.
- Resend invite, optionally at 21:00 (3.10): needs `resend_invite` plus invite-open tracking. That is a backend change, so the sheet shows no Resend card yet.
- "Tell me when it's done" on the boost lock (9.22): needs a push when the holder's boost confirms.
- Redeem a code (9.17): needs the StoreKit offer-code sheet and/or gift-code entry.
- Town → nearest airport "Did you mean" and one-shot GPS (2.10), the reinstall marker for "Welcome back" offline (2.02), Scan QR (2.16) and the live-map replay and open count (9.19) are still client and native follow-ups.

## Open questions

- 2.04 "Saved card · Remove it": swipe, ✕, or tapping the check? Saving a pasted non-invite link for the first trip is not built yet (it needs an on-device store), so removing it is not built either.
- Code validity: the design says 7 days, the server issues 14. The code line reads the server's `expiresAt`.
