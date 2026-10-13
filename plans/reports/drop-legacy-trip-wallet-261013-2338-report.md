# Drop the legacy UI: trip + wallet lane

Branch `feat/drop-legacy-trip-wallet` (off `feat/drop-legacy-ui`), pushed. 11 commits, `afb73d823`..`f0f78ee7b`.

## Routes converted (premium screen is the default export, params kept)

- `(tabs)/wallet/**`: `_layout`, `bookings/_layout` (native stack only, no `usePremiumUi`, no legacy `Stack`), every bookings route (index, `[id]`, add, add-sheet, archive, edit/[id], insurance, link-code, mailbox, paste, pass/[id]), `mailbox/connected`, `money/{index,budget,currency,trip}`.
- `money/**`: `_layout`, add, expense/[id], history, payment/[id], payout-methods, scan, settle. `ScanScreen` always wears the premium look now (its `look` prop is gone).
- `(trip)`: `_layout` and `[tripId]/_layout` (premium branch only; small edits, plan-chat lane also touches them), `[tripId]/drivers/**` (12), `hub/**` (layouts, index, day, offline, offline-storage), `sos/**`, `help/**`, `disruption`, `forecast`, `late`, `storm`, `getting-around`, `lock-screen-offer`, `map/[tripId]`, `map/crew/[crewId]` (crew-map-redirect is premium only).
- `(tabs)/trips/[tripId]/**` and, as the controller asked, `(tabs)/trips/index.tsx` (renders `TripsPremiumScreen` in `LocalFirstGate`).
- `(modal)/bookings/pass/[id]`, `(modal)/supplier/**` (7).
- `trip/alarm/alarm-runtime.tsx` always draws the premium alarm.

## Deleted

258 files: legacy screens, views and parts across `features/{trip,safety,drivers,bookings,money,crew/live-map}`, their `dev/` lab scenes, legacy-only i18n messages (catalogs re-extracted), and 11 `(dev)` routes: money-lab, money-scene, bookings-lab, bookings-scene, trip-day-lab, trip-day-scene, disruption-lab, live-map, drivers-directory-lab, drivers-pick-scene, supplier-scene. Their `lib/dev-tools/dev-screens.ts` entries are gone too (only my lines changed). drivers-lab and supplier-lab stay, with only their live entries. help-scene and help-lab lose the shake-wallet and sos-map-no-pack scenes.

Logic moved out of legacy files: `view-types.ts` per folder (view props the hooks and premium share), `money/routes.ts` `MONEY_FALLBACK`, `receipt/member-pick.ts`, `balances/trip-label.ts`, `supplier/{booking-flow-model,payment-page,hold-left}.ts`, `getting-around/checked-date.ts`, `mailbox/mailbox-connect.ts`, `live-map/ping-toast.ts`, `trip/bundle/saved-trip.ts`. Fixtures went to `test-support/`.

Kept as logic, though no premium screen uses it yet: `safety/sos/alert-access.ts`, `bookings/flight-card/gate-memory.ts` and `bookings/supplier/concierge-state.ts`, with their tests. These are premium gaps; see the questions below.

## Tests

- Repointed to premium screens, with fixtures in `test-support/`: storm, forecast, flight, running late, day-of plus the in-app alarm, the hub (now `hub-screen` on TripHubPremium), crew map plus panel, sos-copy, share-policy (HelpConsent), wallet-switch (WalletHalfSwitch), money-display-live (premium ExpenseRow), add-expense-once (AddExpensePremium) and scan-screen.
- `trip-menu` became `trip-removal`: it tests `useTripRemoval`, which the premium hub's menu uses.
- The expense chat card test now runs on the new premium card.
- Privacy tests (`app/__tests__/private-amounts`, `private-booking-details`) now render the premium pieces. They showed that premium did not cover the money and booking amounts in problem-report screenshots, so I fixed it: BalanceHero, BalanceBars, ExpenseRow, Settle PaymentCard, the expense shares, KeyValueCard `private` rows (booking code and price), the boarding pass code and ref, and the policy number.
- Deleted, because they only covered legacy UI: full-brightness (premium does its own), label-layout and glide (legacy map), hero-layout, hub-view, booking-form-day (legacy month grid), details-row-label and details-sheet-keyboard (no premium details sheet), balances-solo (`isSolo` is still covered in the model test), the held-mail card render tests (the `linkCodeWasSent` logic test is kept), and the forward-address layout test.

## New

- Premium expense card in crew chat: `money/premium/ExpenseChatCardPremium.tsx`, registered with `registerPremiumChatCard('expense')`. The legacy card is deleted.
- `use-chat-expense` now also returns the viewer's share.
- The card's undesigned states are logged in `docs/undesigned-states.md`.

## Remaining legacy `@/ui` imports in my area

- **Non-visual (types and helpers):**
  - `@/ui/avatar/guides`: view-types, use-day-of, use-sos-screen, use-help-screen, use-driver-days, use-trip-guide, guide-critter, live-map register
  - `@/ui/people/GuideLine`: GuideId types, use-alarm-sync, hub/guide
  - `@/ui/people/member-name`, `@/ui/icons/generated`, `@/ui/cards/tone`
  - `@/ui/inputs/Keypad` (KeypadKey type in draft.ts and receipt/view-types)
  - `@/ui/map/region-pack`, `@/ui/plan/ActionPill` (type), `@/ui/qa/back-affordance`
- **Visual, still used by other lanes:**
  - `trip/hub/tiles.tsx` and `next-row.tsx` (hub tile registry for critters, album and recap)
  - `drivers/leg-card/DriverLegCard`, `replied/*`, `share/share-sheet-view`, `share/share-slot` (plan lane)
  - `bookings/supplier/Disclosure` (monetize)
- **Visual helpers for the shell lane:** `trip/access/trip-access-gate` (ScreenMissing), `trip/hub/local-first-gate` and `app/money/_layout` (SessionGate), `money/receipt/ScanSweep` (`@/ui/theme`; the premium scan stage draws it), `crew/live-map/map/guide-image` (sticker export for map pins).
- **Not mine:** `app/(tabs)/trips/_layout.tsx` still has `usePremiumUi` and a legacy branch (start-home or shell lane).

## For the e2e lane

- No premium testIDs changed. The legacy screens and their testIDs are gone.
- These flows open the deleted labs or scenes and need rewriting or deleting: `e2e/bookings/subflows/{open-lab,scene}`, `crew/live-map/{screens,screens-vi,subflows/scene}`, `driver-directory/subflows/open-lab`, `drivers/pick`, `go/subflows/scenes`, `help/shake-report` (shake-wallet), `home/post-trip-card-vi`, `money/subflows/{open-lab,scan-scenes,scene,settle-scenes}`, `plan/other-maps-without-region-pack` (sos-map-no-pack), `recap/hub-post-trip`, `screens/sweep/subflows/labs-trip`, `trip/alarm/lab`, `trip/day-of/{day-states,lab,subflows/lab-scene}`, `trip/disruptions/{flight-delay,forecast,running-late,storm-swap,subflows/lab-scene}`, `trip/hub/{lab,states,subflows/lab-scene,trips-empty}`, `trip/live-activities/lock-screen-offer-lab`, `trip/offline/lab`, `you/formats-en`.
- The release gate's `happy/suppliers.yaml` still works: `supplier-lab-live-offer` is kept.

## Checks

- `tsc --noEmit`: clean.
- eslint and prettier on every changed file: clean.
- Jest on every touched suite: all pass.
- `no-plan-ids`: passes.
- i18n extract and compile: done; Vietnamese added for the 3 new strings.

## Unresolved questions

1. The premium Help screen has no Android SOS alert-access rows (notifications, Do Not Disturb access, full-screen alerts); the legacy help screen had them. The logic is kept in `safety/sos/alert-access.ts`. Should it get a premium row?
2. Premium has no flight-card gate-change badge and no concierge card (`gate-memory`, `concierge-state` are kept but unused). Wire them in, or delete them?
3. Premium forecast never shows "all clear" when there are GO/SET rows, and shows no "no forecast yet" line. Is that intended by 6.06?
4. The premium day page shows no countdown ("22:00 to go"), only the leave-by time. Design choice?
5. The reanimated test double lacks `interpolate` and `interpolateColor`, so `share-policy.test` adds them locally. The shell lane may want them in `motion/test-support`.

Status: DONE_WITH_CONCERNS
Summary: The trip, wallet, money, safety, driver, supplier and crew-map routes render only premium screens; 258 legacy files and labs are deleted, the behaviour tests run on premium, and premium privacy masking and the premium expense chat card are added.
Concerns/Blockers: Shared `(trip)` layouts and `(tabs)/trips/index.tsx` overlap other lanes. The e2e flows listed above still open deleted labs. The premium gaps in questions 1–3 need a product call.
