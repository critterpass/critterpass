# Lane report: Journeys D (on the trip, wallet)

Branch `feat/premium-journeys-trip-wallet`, worktree `fix-on-trip`. Parts 6 (in-app) and 7, Foundations 1.05, 1.06 and 1.13. Every premium screen is wired through the route switch (`premiumRoute` or `usePremiumUi()` in the route file); the legacy screen stays when the switch is off.

## Screens done (code → file)

Wallet and money (`apps/mobile/src/features/{bookings,money}/premium/`):

| Code | Screen | File |
|---|---|---|
| 1.06, 7.01, 7.02 | Wallet · Bookings half, `+` sheet | `bookings/premium/WalletBookingsScreen.tsx`, `AddBookingSheet.tsx` |
| 7.06, 7.10, 7.12, 1.13 | Booking detail (stay and every kind, flight card, cancelled flight, dark with the light card) | `bookings/premium/BookingDetailPremium.tsx`, `components/FlightTicket.tsx`, `DocsCard.tsx`, `ShareCard.tsx`, `KeyValueCard.tsx` |
| 7.11 | Boarding pass full screen | `bookings/premium/BoardingPassPremium.tsx`, `components/PassCode.tsx` |
| 7.13 | Travel insurance (card, call, form as its edit state) | `bookings/premium/InsurancePremium.tsx` |
| 7.14 | Past bookings with search | `bookings/premium/ArchivePremium.tsx` |
| 7.15 | Booking options (action sheet iOS, alert list Android) | `bookings/premium/booking-options.ts` |
| 7.16, 7.17 | Wallet · Money half | `money/premium/MoneyHomeScreen.tsx` |
| 7.18 | Add an expense with the number pad | `money/premium/AddExpensePremium.tsx`, `components/{AmountKeypad,SplitPeople,PayerRow,SpentDayLine,ChoiceStrip}.tsx` |
| 7.21 | Expense detail | `money/premium/ExpenseDetailPremium.tsx` |
| 7.23 | Every expense, filter by person | `money/premium/HistoryPremium.tsx` |
| 7.24, 7.28 | Settle up, all square (stamp, export) | `money/premium/SettlePremium.tsx`, `components/SettledSquare.tsx` |
| 7.25, 7.26 | Pay someone, owed to you (timeline) | `money/premium/PaymentPremium.tsx`, `components/{PaymentOwed,PayoutMethodBlock}.tsx` |
| 7.27 | Payout methods (default first) | `money/premium/PayoutMethodsPremium.tsx` |
| 7.29 | Budget | `money/premium/BudgetPremium.tsx`, `components/BudgetCategories.tsx` |

On the trip (`apps/mobile/src/features/{trip,safety}/premium/`):

| Code | Screen | File |
|---|---|---|
| 1.05, 6.01–6.03 | Trip hub: hero, Today / Plan / Map / Money, briefing, tiles, ticker, today's list | `trip/premium/hub/*` (zoom target id `tripZoomId(tripId)` from `@/features/trip`) |
| 6.04, 6.05 | Day-of (leave-by hero, readiness, pack chips, stops; free day) | `trip/premium/day/*` |
| 6.06 | Forecast | `trip/premium/day-change/ForecastPremium.tsx` |
| 6.07 | Storm swap | `trip/premium/day-change/StormPremium.tsx` |
| 6.09 | Flight disruption | `trip/premium/day-change/FlightDisruptionPremium.tsx`, `FlightParts.tsx` |
| 6.10–6.13 | Crew map on journeys B's premium map, with journeys A's Boost gate card | `trip/premium/crew-map/*` |
| 6.15, 6.18 | Offline page, queued send sheet | `trip/premium/offline/*` |
| 6.16 | Help | `safety/premium/HelpPremium.tsx`, `HelpParts.tsx`, `PhraseBig.tsx` |
| 6.17 | Crew SOS | `safety/premium/SosPremium.tsx`, `SosActions.tsx` |

Leave-by alarm (brand lane hand-off): the alarm request now sends the sun tint and the "Leave by 03:10 · Batur" title; the slider label reads "slide, I'm up →".

## Logic moved out of views (legacy unchanged)

Hooks both UIs share: `trip/hub/use-trip-hub.ts`, `trip/day-of/use-day-of.ts`, `trip/disruptions/{forecast/use-forecast-screen,storm/use-storm-screen,flight/use-flight-disruption}.ts`, `trip/briefing/briefing-copy.ts`, `trip/offline` (`queued` on the offline view props), `bookings/detail/use-booking-detail.ts`, `bookings/boarding-pass/use-boarding-pass.ts`, `bookings/insurance/use-insurance-form.ts`, `bookings/stack/use-wallet-screen.ts`, `money/{balances/use-balances-screen,history/use-history,expense-detail/use-expense-detail,settle/use-settle,settle/use-payment,add-expense/use-add-expense,budget/use-budget}.ts`, `money/expense-detail/detail-copy.ts`, `money/settle/payout-labels.ts` (`usePayoutFieldLabel`), `safety/{help/use-help-screen,help/help-copy,sos/use-sos-screen,sos/sos-copy}.ts`.

## Backend added (earlier in this lane)

Default payout method (payers see it first), wallet search, airport suggestions, the books export, ping summaries for the new screens, and a stay expense split by room that follows the room plan (`money/data/room-split.ts`, tested; not yet wired to a screen).

## Design conflicts resolved (plan decision 5)

- Wallet root: one layout (Wallet large title, Bookings | Money switch, search and the ink `+`), per the controller's decision.
- Hub switch: Today stays in place; Plan, Map and Money open their own pages over the hub (the hub keeps its back).
- Off-token sizes snap to tokens: airport codes and the delay figure use `display`/`hero`, stub values `navTitle`/`stepperValue`, the insurance card `stat`.
- Brand blues (airline band `#1f2a52`, insurance gradient) are drawn from tokens (ink surface; rain text → sky) because literal colours are not allowed in app code.
- Booking options show only what works today (share, not ours, delete); Add to Wallet and "open in the airline app" are hidden until their services exist.
- Flight cancelled (7.12): no same-fare alternatives exist, so the card says the airline owes a change or refund; rebook stays the existing link.
- Day-of 6.04 draws no back control: the headerless push gives the glass back circle in place of the left chip.
- Running late chooser on day-of is "+10 / +20 / +30 min" chips feeding the existing said-late flow.
- Help's consent asks in place on the page instead of a sheet; "Show this" opens the phrase on a light full screen at full brightness.

## Not built yet (left for the next pass)

6.08 running late, 6.19–6.25 drivers, 6.26 in-app alarm restyle, 6.38 notification settings, 7.03 add a booking page, 7.04 add by hand, 7.05 mailbox sheet, 7.07–7.09 rooms, 7.19–7.20 receipt check, 7.22 stay expense by room, 5.24 getting around (handed to this lane). Their legacy screens keep working under the premium switch. Vietnamese strings for the new message ids still need the catalog extract + translation pass (`pnpm --filter @cp/i18n extract`, then `compile`).

## Pieces another lane may want (for the controller to promote to the kit)

`trip/premium/components/{IconTile,LineIcon,crew-accent,turn}`, `bookings/premium/components/KeyValueCard.tsx`, `money/premium/components/{AmountKeypad,ChoiceStrip}.tsx`, `trip/premium/hub/ActivityTicker.tsx`.

## Still using a legacy piece inside a premium screen

`VisitConsentRow` on the hub, registered hub tiles (quests), the crew map's `MeetupEditor`, and `guideSticker` for the guide's critter kind. Each needs a premium version from its owner.

## Founder follow-ups

Add to Apple / Google Wallet passes, flight-number lookup, same-fare rebook alternatives, peer room swap, meet-up compass camera (6.14), driver live status, budget swap suggestion: not built (plan decision 7); nothing on screen points at them.

## Open questions

1. Hub switch: should Plan / Map / Money render inside the hub (tabs) instead of opening their own pages?
2. Boarding pass and flight card keep the airline's brand colours in the design; they are drawn from tokens now. Add brand tokens?
