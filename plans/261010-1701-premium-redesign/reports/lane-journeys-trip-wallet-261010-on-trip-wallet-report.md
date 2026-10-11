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
| 7.04 | Add by hand / edit booking (kind chips, airports with "Did you mean", trip-day chips) | `bookings/premium/BookingFormPremium.tsx`, `components/{FlightFields,ChoiceRow}.tsx` |
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
| 6.10–6.13 | Crew map on journeys B's premium map, with journeys A's Boost gate card | `crew/live-map/premium/*` (lives in the crew feature: features may only reach each other through their index; `LiveMapGatePremium` is now exported from `@/features/monetize`) |
| 6.15, 6.18 | Offline page, queued send sheet | `trip/premium/offline/*` |
| 6.16 | Help | `safety/premium/HelpPremium.tsx`, `HelpParts.tsx`, `PhraseBig.tsx` |
| 6.17 | Crew SOS | `safety/premium/SosPremium.tsx`, `SosActions.tsx` |
| 6.20 | Driver detail | `drivers/premium/DriverDetailPremium.tsx` |
| 6.24 | Rate your driver | `drivers/premium/RateDriverPremium.tsx` |
| 6.25 | Drivers our crews used (directory, empty area) | `drivers/premium/DirectoryPremium.tsx` |
| 5.24 | Getting around (map, route pill, transfer, ride card, phrase card, later legs) | `bookings/premium/GettingAroundPremium.tsx`, `components/GettingAroundParts.tsx` |
| 6.08 | Running late (map, stay flag, you, option cards) | `trip/premium/day-change/RunningLatePremium.tsx` |
| 6.19 | Find a driver (day chips, sources, shortlist bar) | `drivers/premium/FindDriverPremium.tsx` |
| 6.21 | Private tours (supplier cards, partner links, disclosure) | `drivers/premium/PrivateToursPremium.tsx`, `bookings/premium/components/DisclosureLine.tsx` (`DisclosurePremium`) |
| 6.22 | Check the card (in-place fixes, includes chips, guide's question; couldn't read it) | `drivers/premium/CheckCardPremium.tsx`, `components/{CheckParts,CouldntRead}.tsx` |
| 6.23 | Compare (table card, guide's risk note, docked picks) | `drivers/premium/ComparePremium.tsx`, `components/CompareTable.tsx` |
| 6.26 | In-app leave-by alarm (slide, I'm up) | `trip/premium/alarm/{InAppAlarmPremium,SlideToUp}.tsx`, switched in `trip/alarm/alarm-runtime.tsx` |
| 6.38 | Notification settings, with "Hide message text" (`notification_prefs.hide_message_text`; chat and guide pushes then read "New message in {crew}" or a line naming the guide, in `services/worker/src/push/message-text-copy.ts`) | `you/premium/notifications/*` (route `app/you/pings.tsx`) |
| 7.03, 7.05 | Add a booking page, mailbox sheet | `bookings/premium/{AddBookingPremium,MailboxPremium}.tsx`, `components/CandidateCard.tsx` |
| 7.19, 7.20 | Receipt check (failure and review panels over the scan camera) | `money/premium/receipt/ScanPanels.tsx` via `ScanView`'s `panelFor` |
| 9.05 | "Only on Wi-Fi" for automatic trip-day saves | `trip/bundle/background-prefetch.ts` (`useDayPrefs`), toggle on journeys A's `you/premium/offline` page |
| 4.x rooms, 7.07–7.09 | Rooms: organiser plan, drag editor sheet with the By room / Evenly split, a member's room with the swap request and wishes | `setup/premium/rooms/*` (one optional `View` prop on `setup/rooms/rooms-step.tsx`; `rooms` added to the views `app/(trip)/[tripId]/setup/[step].tsx` passes) |
| 7.22 | Stay expense split by room (rooms, your share, the guide's note, split evenly instead) | `money/premium/components/RoomSplitSection.tsx`, `money/data/use-room-split.ts`, `money/index.ts` (`useStayRoomSplit`) |
| — | Meet-up editor sheet on the crew map; visit consent line on the hub | `crew/live-map/premium/MeetupEditorPremium.tsx`, `trip/premium/hub/VisitConsentLine.tsx` |

Leave-by alarm (brand lane hand-off): the alarm request now sends the sun tint and the "Leave by 03:10 · Batur" title; the slider label reads "slide, I'm up →".

## Logic moved out of views (legacy unchanged)

Hooks both UIs share: `trip/hub/use-trip-hub.ts`, `trip/day-of/use-day-of.ts`, `trip/disruptions/{forecast/use-forecast-screen,storm/use-storm-screen,flight/use-flight-disruption}.ts`, `trip/briefing/briefing-copy.ts`, `trip/offline` (`queued` on the offline view props), `bookings/detail/use-booking-detail.ts`, `bookings/boarding-pass/use-boarding-pass.ts`, `bookings/insurance/use-insurance-form.ts`, `bookings/stack/use-wallet-screen.ts`, `money/{balances/use-balances-screen,history/use-history,expense-detail/use-expense-detail,settle/use-settle,settle/use-payment,add-expense/use-add-expense,budget/use-budget}.ts`, `money/expense-detail/detail-copy.ts`, `money/settle/payout-labels.ts` (`usePayoutFieldLabel`), `safety/{help/use-help-screen,help/help-copy,sos/use-sos-screen,sos/sos-copy}.ts`, `bookings/{add/use-add-booking,candidates/candidate-line,getting-around/use-getting-around-screen}.ts`, `trip/disruptions/late/use-known-late.ts`, `drivers/{find/use-find-driver,private-tours/use-private-tours,intake/check/use-check-card,compare/use-compare}.ts`.

## Backend added (earlier in this lane)

Default payout method (payers see it first), wallet search, airport suggestions, the books export, ping summaries for the new screens, and a stay expense split by room that follows the room plan (`money/data/room-split.ts`, tested; not yet wired to a screen).

By-room split (this pass): `split_mode = 'by_room'` with `split_stay_key` (migration `20261012000000_expense_split_by_room.sql`), shares from `roomSplitShares` (moved to `@cp/cost-engine`, with a property test that shares always sum to the expense), and every live by-room expense re-split in the same transaction as `set_stay_choice` / `set_room_assignment` (lock and swap requests change nobody's room). Someone who already settled sees a top-up or refund line, because balances come from the ledger. Database test `services/api/test/money/room-split.db.test.ts` passed on GitHub, along with the expenses and rooms suites.

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

- 7.09's swap with another member who agrees: the server only takes a request to the organiser, so the premium page asks the organiser (logged in `docs/undesigned-states.md`).
- Vietnamese strings for the new message ids still need the catalog extract and translation pass (`pnpm --filter @cp/i18n extract`, then `compile`), left to the integration pass. Every premium screen in this lane reuses current ids with the same placeholders (checked with a scan). The scan found the same kind of clash in other lanes' files (monetize, home, plan, setup, crew, explore, `search.offline.works.places`); extraction will stop until those are renamed.

## Pieces another lane may want (for the controller to promote to the kit)

`trip/premium/components/{IconTile,LineIcon,crew-accent,turn}`, `bookings/premium/components/KeyValueCard.tsx`, `money/premium/components/{AmountKeypad,ChoiceStrip}.tsx`, `trip/premium/hub/ActivityTicker.tsx`.

## Still using a legacy piece inside a premium screen

`useVehicleLine` (a hook, fine as is), registered hub tiles (quests), `guideSticker` for the guide's critter kind, `RideBackCard` on getting around, `MemberPicker` and the scan camera chrome in receipt check, and the said-late screen (6.08 builds only the known-late path). Each needs a premium version from its owner.

## Founder follow-ups

Add to Apple / Google Wallet passes, flight-number lookup, same-fare rebook alternatives, peer room swap, meet-up compass camera (6.14), driver live status, budget swap suggestion: not built (plan decision 7); nothing on screen points at them.

## Open questions

1. Hub switch: should Plan / Map / Money render inside the hub (tabs) instead of opening their own pages?
2. Boarding pass and flight card keep the airline's brand colours in the design; they are drawn from tokens now. Add brand tokens?
