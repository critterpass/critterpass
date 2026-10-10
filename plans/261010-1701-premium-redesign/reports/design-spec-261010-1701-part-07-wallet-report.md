# Design spec: Part 7 "Wallet: bookings and money" (7.01–7.29, plus Foundations 1.06 and 1.13)

Sources: `$Z/CritterPass 07 Wallet.dc.html` (outline at `$SP/lane07/out/wallet.pp.txt`), `$SP/txt-07-Wallet.txt`, `$SP/shots/07/*.png`, Foundations 1.06 and 1.13 in `$Z/CritterPass 01 Foundations.dc.html`. Current app: `$R` = `/Users/quocs/Projects/critterpass-worktrees/deploy`, routes are relative to `$R/apps/mobile/src/app/`, features to `$R/apps/mobile/src/features/`.

## 1. Summary

- **31 screens**: 29 in part 7 (7.A bookings 7.01–7.15, 7.B spending 7.16–7.23, 7.C settling up 7.24–7.29) plus Foundations 1.06 (the `+` morph into "Add a booking") and 1.13 (dark flight detail).
- **Two design generations are mixed in this file.** 7.02, 7.03, 7.17, 7.18 and 7.24 are inline frames built from an older source (`Src3`): their headers have no Bookings | Money switch, the `+` is a flat `#1c1d24` circle, and the tab bar is an inline copy. The other frames are imported (`dc-import Phone`) and match Foundations. **The Wallet root is drawn three ways**: 1.06 (Wallet title, a dark "Next up" card, booking rows, `+` as a 60 pt bottom-right button), 7.01/7.16 (Wallet title, glass search plus an ink `+` in the header, Bookings | Money switch), and 7.02/7.17 (Bookings or Money as the title, no switch). See Q1.
- **New compared with the current app** (the current wallet UI is mostly flagged "undesigned" in its own code comments):
  - booking details per type: a stay detail with a photo header (7.06) and a flight ticket card with a perforation (7.10);
  - a full-screen boarding pass on dark with a "Brightness up" chip (7.11);
  - a cancelled flight with rebook options (7.12);
  - the insurance card as a read view (7.13);
  - past bookings grouped by trip, with search (7.14);
  - an iOS action sheet (7.15);
  - rooms after a stay is booked: Pon's proposal, the drag editor with a "By room / Evenly" split, and a member's peer swap (7.07–7.09);
  - receipt checking as a full screen (7.20);
  - a stay expense split by room (7.22);
  - a payment timeline (7.26);
  - the "SQUARE" closed-books stamp with export (7.28);
  - budget with a forecast and a guide swap (7.29);
  - Add to Apple Wallet or Google Wallet everywhere a pass shows.
- **The money logic is largely built**: balances, the add-expense keypad, OCR and its failure sheet, expense detail and history, settle and payment, payout methods, budget, and the `@cp/cost-engine` rooms, settle and forecast modules. Most of 7.B and 7.C is a re-skin of existing screens.
- **Hardest pieces to build well**:
  1. The 1.06 `+` → sheet morph. The page steps back while the sheet grows out of the `+`, and it needs a shared-element clip with Reanimated over the JS stack (`expo-router/js-stack`).
  2. The 7.08 drag-to-place room editor. Avatars lift, the drop target lights up and the split tiles roll live with no jumps.
  3. "Numbers never jump" across money. The digits roll on currency switch, on split changes, on the keypad and on settle, using the existing Odometer moved onto the Smooth spring.
  4. Add to Wallet (PassKit / Google Wallet). There is no module or signing service today.
  5. Splitting a stay expense by room so it follows the room plan, with top-up and refund lines (7.22). This needs a server-side recompute.

## 2. Screen table

Route paths are relative to `$R/apps/mobile/src/app/`. Logic means data and behaviour, not UI.

| code | title | screen type | header left / right | primary action | current route file(s) | logic |
|---|---|---|---|---|---|---|
| 1.06 | Morph: `+` → Add a booking | Root + half sheet | – / `+` (60 pt bottom-right button in 1.06; header `+` in 7.01) | Tile choice | `(tabs)/wallet/bookings/index.tsx` → `bookings/stack/WalletScreen.tsx`; sheet content = `bookings/add/ImportTiles.tsx` | exists |
| 7.01 | Bookings · empty | Root (large title) | – / glass search, ink `+` | Copy forward address | `(tabs)/wallet/bookings/index.tsx` → `bookings/stack/WalletView.tsx` (empty → `ImportTiles`) | exists (search missing) |
| 7.02 | Bookings · wallet stack | Root | – / ink `+` | Review crew finds | same → `bookings/stack/BookingDeck.tsx`, `flight-card/FlightCard.tsx`, `stack/banner.ts` | exists |
| 7.03 | Add a booking | Push, large title | glass back + "Bookings" eyebrow / – | Add (candidate) | `(tabs)/wallet/bookings/add.tsx` → `bookings/add/AddBookingScreen.tsx`, `AddBookingView.tsx`, `candidates/CandidateCard.tsx` | exists |
| 7.04 | Add by hand | Push, inline title (form) | glass back / Save (disabled pill) | Save | `(tabs)/wallet/bookings/edit/[id].tsx` (`id=new`) → `bookings/detail/BookingFormScreen.tsx`, `BookingFormView.tsx`, `form-model.ts`, `DatePickerSheet.tsx` | partial (flight-number lookup missing; airport suggestion is client-only) |
| 7.05 | Mailbox · connected | Sheet (large, grabber only) | – / – | Connect Gmail | `bookings/mailbox/MailboxSheet.tsx`, return route `(tabs)/wallet/mailbox/connected.tsx` | exists |
| 7.06 | Booking detail · stay | Push over a photo | clear-glass back / clear-glass ⋯ | Edit | `(tabs)/wallet/bookings/[id].tsx` → `bookings/detail/BookingDetailScreen.tsx`, `BookingDetailView.tsx` | exists (stay photo source missing) |
| 7.07 | Stay booked · Pon's rooms | Push, inline title + subtitle | glass back / glass share | Looks good | none in Wallet; rooms live in `(trip)/[tripId]/setup/[step].tsx` → `setup/rooms/*` | partial |
| 7.08 | Who sleeps where · edit | Sheet, full (Cancel / Save) | Cancel / Save | Save (crew told) | `setup/rooms/rooms-view.tsx`, `draggable-avatar.tsx` | partial (By room / Evenly expense split missing) |
| 7.09 | Your room · member | Push, inline | glass back / glass share | Ask someone else | `setup/rooms/member-tools.tsx` | partial (peer swap with two yeses missing) |
| 7.10 | Flight detail | Push, inline | glass back / glass share | Add to Wallet | `(tabs)/wallet/bookings/[id].tsx` → `BookingDetailView.tsx` + `flight-card/flight-model.ts` | exists (Add to Wallet missing) |
| 7.11 | Boarding pass · full screen | Full screen ✕ (dark) | ✕ / share | – (show) | `(modal)/bookings/pass/[id].tsx` → `bookings/boarding-pass/BoardingPassScreen.tsx`, `BoardingPassView.tsx`, `use-full-brightness.ts` | exists (Add to Wallet missing) |
| 7.12 | Flight cancelled · rebook | Push, inline | glass back / glass share | Rebook on SQ 942 | `BookingDetailView.tsx` (status `cancelled`) + `(trip)/disruption/[id].tsx` → `trip/disruptions/flight/*` | partial (same-fare alternatives missing) |
| 7.13 | Travel insurance | Push, large title | glass back + "Bookings" / – | Call assistance | `(tabs)/wallet/bookings/insurance.tsx` → `bookings/insurance/InsuranceFormScreen.tsx`, `InsuranceCard.tsx` | exists |
| 7.14 | Past bookings | Push, large title + search | glass back + "Bookings" / – | open a row | `(tabs)/wallet/bookings/archive.tsx` → `bookings/stack/ArchiveView.tsx` | partial (search, trip grouping, Recap link: client-side) |
| 7.15 | Booking options | Action sheet | – | Add to Apple Wallet | none (today: `SettingsGroup` rows in `BookingDetailView.tsx`) | partial |
| 7.16 | Balances · empty | Root (large title) | – / glass search, ink `+` | Scan receipt | `(tabs)/wallet/money/index.tsx` → `money/balances/BalancesScreen.tsx`, `BalancesView.tsx` | exists |
| 7.17 | Balances · one chart | Root | – / USD chip | Settle in 3 taps | same + `ui/data/BalanceBars.tsx`, `ui/data/Odometer.tsx`, `balances/CurrencySheet.tsx` | exists |
| 7.18 | Add an expense | Full screen ✕ (form) | ✕ / "Scan instead" | Add Rp 450k | `money/add.tsx` → `money/add-expense/AddExpenseScreen.tsx`, `AddExpenseView.tsx`, `AmountEntry.tsx`, `PayerPicker.tsx`, `ui/inputs/Keypad.tsx` | exists |
| 7.19 | Couldn't read the receipt | Full screen (dark camera) + sheet | – | Split evenly | `money/scan.tsx` → `money/receipt/ScanScreen.tsx`, `ScanView.tsx`, `FailureSheet.tsx` | exists (Undo toast missing) |
| 7.20 | Receipt · doesn't add up | Push, inline + Save | glass back / Save (text, disabled) | Add the tax line | `money/scan.tsx` review → `receipt/use-review-scene.ts`, `review-model.ts` (`totalGap`, keep-total), `LineAssignSheet.tsx`, `TypeLinesScreen.tsx` | partial (UI new; logic exists) |
| 7.21 | Expense detail | Push, inline | glass back / – | Edit | `money/expense/[id].tsx` → `money/expense-detail/ExpenseDetailScreen.tsx`, `ExpenseDetailView.tsx` | exists |
| 7.22 | Stay expense · by room | Push, inline | glass back / glass ⋯ | Settle up with Maya | `money/expense/[id].tsx` (`source=booking`) | missing (room split mode) |
| 7.23 | Every expense | Push, large title + filter chips | glass back + "Money" title / – | open an expense | `money/history.tsx` → `money/history/HistoryScreen.tsx`, `HistoryView.tsx` | exists |
| 7.24 | Settle up | Push, large title | glass back + "Money" / – | Remind everyone | `money/settle.tsx` → `money/settle/SettleScreen.tsx`, `SettleList.tsx`, `SettledTokekReveal.tsx` | exists |
| 7.25 | Pay someone | Push, inline | glass back / – | I've paid Maya | `money/payment/[id].tsx` → `money/settle/PaymentScreen.tsx`, `PaymentDetail.tsx`, `PayoutQr.tsx` | exists |
| 7.26 | Payment states · owed to you | Push, inline | glass back / – | I got it | same + `settle/DisputeSheet.tsx` | exists (timeline UI new) |
| 7.27 | Payout methods | Push, inline (form) | glass back / – | Save | `money/payout-methods.tsx` → `settle/PayoutMethodsScreen.tsx`, `PayoutMethodsEditor.tsx`, `PayoutMethodCard.tsx` | partial (default method) |
| 7.28 | All square | Push, inline | glass back / – | Back to the recap | `money/settle.tsx` (square state) + `settle/use-settled-ceremony.ts` | partial (export missing) |
| 7.29 | Budget · over | Push, inline + subtitle | glass back / glass ⋯ | See Pon's swap | `(tabs)/wallet/money/budget.tsx` → `money/budget/BudgetScreen.tsx`, `BudgetView.tsx` | partial (mid-trip swap suggestion) |
| 1.13 | Dark · flight detail | Push, inline (dark) | dark-glass back / share | Add to Wallet (light pill) | as 7.10 | as 7.10 |

## 3. Per-screen spec

### 3.0 Shared metrics (used below as named; do not re-derive)

- **Phone frame**: 390×844, ground `#f5f5f7`, status bar 54. Home indicator 134×5 r3 ink at bottom 8.
- **Glass nav button** (`GlassBtn`): 44×44 r22, Regular glass, icon 18.
  - Chevron is stroke 2.4. Share (tray-and-arrow) and ⋯ are stroke 2.2.
  - Design values: `rgba(255,255,255,.62)` blur 18 sat 1.8, inset top 1 px white .95, inner .5 px white .6, outline .5 px ink .07, shadow 0 8 20 −6 ink .16.
  - **OFF-TOKEN**: Foundations Regular glass is .56, blur 24, sat 1.9. Build with the token.
- **Inline header** (`HdrInline`): row at top 58, left/right 20.
  - `GlassBtn` left; title 17/600 centred, ellipsised; optional subtitle 12/400 muted, mt 1.
  - Right is a `GlassBtn` or a 44 pt spacer.
- **Large-title push header** (`HdrLarge`): `GlassBtn` at top 60, left 20; eyebrow 15/600 muted, gap 12.
  - Title 32/700 −0.03em at top 116, left 24. **OFF-TOKEN**: Display is 34/700 −0.03em.
  - Foundations says a push screen has an inline title (see Q4).
- **Root header** (`HdrRoot`): "Wallet" 34/700 −0.035em lh 1.1 at top 60, left 24, right 20.
  - Actions: gap 10, glass search 44 (icon 18 stroke 2.3) and ink `+` 44.
  - The `+` is the ink pill gradient `#30313b→#16171d`, inset top white .18, shadow 0 10 20 −8 ink .5, icon 18 stroke 2.4 white.
- **Wallet switch** (`Seg`): top 116, left/right 16, h34, pad 3, r17, bg `rgba(118,118,128,.12)`, 13/600.
  - Thumb: white r14, shadow 0 0 0 .5 ink .04 + 0 3 8 ink .12.
  - Off text `#3d404c`. **OFF-TOKEN**: control is `#f1f1f4`, secondary text is not a token.
- **Card**: white r24, shadow `0 0 0 .5 ink .05, 0 1 2 ink .04, 0 14 34 −12 ink .16` (written as card shadow below).
- **List row** (`Row`): min-h 62, pad 0 14, gap 12.
  - Icon tile 40 r12, tinted.
  - Title 15.5/600 (**OFF-TOKEN**: Headline is 16/600); sub 12.5 muted, mt 1, lh 1.35.
  - Divider .5 `rgba(28,29,36,.08)`; chevron 14 `#c4c6ce` stroke 2.6.
- **Key/value row** (`KV`): pad 11–12 × 16, key width 110–120 at 12.5 muted, value 14.5/600.
- **Primary** (`InkPill`): h56 r28, gradient ink, 17/600 −0.01em.
  - Inset top white .18, inner .5 white .07, shadow 0 1 2 ink .25 + 0 16 32 −10 ink .5.
  - Docked left/right 24, bottom 30 (it varies 24–40 per frame; use 30 + safe area).
- **Secondary**:
  - `GreyPill`: h52 r26, `rgba(118,118,128,.12)`, 16/600 (**OFF-TOKEN** fill; use control).
  - `WhitePill`: h52 r26, white, button shadow `0 0 0 .5 ink .06, 0 1 2 ink .04, 0 8 20 −6 ink .14`, 15/600.
  - `PinkPill` (destructive): h52 r26, `#ffe4f0` with `#b0306b` text 15/600. Foundations destructive text is `#d6337f`; the pill uses the vote-open tint pair.
- **Small pill**: h30–40 r15–20, 13–14/600, ink, control, or tinted.
- **Tag**: h26 pad 0 10 r13 12/600 on a status tint. Sticker tag: rotated −4°, pad 4 9, r8, crew colour, 2 px white border, 12/800 `#17142a`.
- **Guide note** (`GuideNote`): left/right 16, pad 8 14 8 8, r22, glass `rgba(255,255,255,.66)` blur 20 sat 1.8, inset top white, outline .5 ink .06, shadow 0 10 24 −14 ink .25.
  - Avatar: a 36 circle (Tokek `#fff3c4`, Pon `#ffe6d3`) with the 36 critter bottom-aligned and clipped.
  - Text 13/1.38 `#3d404c` with the speaker's name bold ink.
- **Crew avatar** (`Av`): circle in crew colour, initials 700 `#17142a` (**OFF-TOKEN** ink), white 2 px ring.
  - Stacks overlap −8. Sizes in use: 22/9, 24/10, 26/10, 28/11, 30/12, 36/13, 40/16, 44/18, 52/20, 56/22 (size/font).
- **Tab bar**:
  - 7.01 and 7.16 import `Tabs.dc.html`: glass pill r34 bottom 26, Wallet active as an ink pill with its label, Tokek raised 56.
  - 7.02 and 7.17 inline the same look (r32, .64, sat 1.8; **OFF-TOKEN** older copy).
  - The 1.04 native lens bar is not used in this part.
  - The tab bar hides on every pushed Wallet screen. The current app keeps it ("they keep the tab bar"), so that changes.
- "WAYS OUT" and "EVERY TAP" panels are annotations, not UI.

### 1.06 Morph: the `+` becomes the sheet, the page steps back

- **Page** (Foundations' Wallet root):
  - "Wallet" 34/700 at top 60, left 24. No header buttons and no switch in this frame.
  - **Next-up card**: left/right 16, top 118, h200, r30, bg `#1c1d24`, pad 18, inset top white .12, shadow 0 24 44 −20 ink .6.
    - Eyebrow "NEXT UP · TOMORROW 05:40" 12/700 +.1em at opacity .6; title "Batur sunrise" 28/800 −0.03em, mt 8; sub 13 at opacity .7.
    - Barcode band left/right 18, bottom 18, h40, r12, white stripes at opacity .85.
  - **Booking rows**: top 336, gap 10. Each is h68 r22 white, shadow `0 0 0 .5 ink .05, 0 14 34 −14 ink .18`, pad 0 14 0 10, gap 12.
    - Tile 48 r14: plane `#e6eeff`, bed `#fff1e6`, boat `#e3f6ec`, ticket `#ffe4f0`. Doodle 40.
    - Title 15.5/600, sub 12.5 muted.
  - **`+`**: 60×60 r30, right 24, bottom 40, ink gradient, shadow 0 16 30 −10 ink .55, icon 22 stroke 2.4.
  - The backdrop behind the page is `#1c1d24`.
- **Sheet** (half height, one choice): rect top 330, left/right/bottom 8, r46. Sheet glass `rgba(248,248,250,.86)` blur 34 sat 1.8.
  - Content pad 10 20 0. Grabber 36×5 r3 `rgba(60,60,67,.3)`, mb 16.
  - Title "Add a booking" 24/700 −0.025em.
  - **Close ✕ on the right**: 36×36 r18 `rgba(118,118,128,.14)`, icon 12 stroke 3 `#3d404c`. Foundations' sheet pattern is "Cancel left", see Q5.
  - Three tiles in a grid, gap 10, mt 18. Each is h124 r24 white, shadow `0 0 0 .5 ink .05, 0 12 26 −14 ink .2`, doodle 52 with a white sticker edge, label 13/600 centred.
    - The tiles: Forward an email (chat, sky), Scan a ticket (camera, pink), Add by hand (wallet, sun).
  - Footer, mt 16: Tokek 34 + "Forward to **bali6@in.critterpass.app** and I'll file it." 13/1.4 `#3d404c`.
- **Motion** (6 s demo loop, ms = fraction × 6000; filmstrip `$SP/film/07/strip-1.06-open.png`, `strip-1.06-close.png`):
  - Open:
    - (a) The `+` fades, rotates 45° and scales 1.2 over 0.20–0.26 (360 ms).
    - (b) The sheet clip grows from the `+` rect (`inset(744 24 40 306 round 30)`) to the sheet rect (`inset(330 8 8 8 round 46)`) over 0.20–0.42, eased `cubic-bezier(.32,.72,0,1)`. That is **Smooth**, which takes about 450 ms on device.
    - (c) Meanwhile the page scales to .92, moves down 14, dims to brightness .8 and rounds from radius 56 to 40, with the transform origin at 50% 0. **Smooth.**
    - (d) Sheet content fades in and rises 16 over 0.32–0.44, eased `(.2,.9,.3,1)`, starting after the clip is about 50% open.
  - Close: the content fades out first (0.72–0.78), then the clip shrinks back into the `+` and the page returns (0.74–0.92, Smooth). The `+` reappears at 0.90–0.96.
- **Taps** (from 7.01 and 7.03):
  - Forward → reveals and copies the crew address.
  - Scan → document scanner.
  - Add by hand → 7.04.
  - Swipe down or ✕ → close. Nothing is edited here, so close without asking.

### 7.01 Bookings · empty, three ways to fill it

- **Header**: `HdrRoot` + `Seg` (Bookings selected).
- **Hero stack**: a box at left/right 40, top 184, h230 holding three cards, each h150 r22:
  - sun `#ffd84a` rot −8° op .85 (left 0, right 16, top 0);
  - pink `#ff5fa8` rot 4° op .85 (left/right 8, top 18);
  - front card rot −2° (left 16, right 0, top 36): white .92 with a 2 px dashed `#c4c6ce` border, a `+` icon 26 `#9a9daa`, and "Your first booking" 13/600 muted.
  - Shadow `0 0 0 .5 ink .06, 0 20 36 −20 ink .4`.
- **Copy**: centred, left/right 28, top 432. "Flights, stays, tickets" 22/700 −0.025em (Title). "Everything saves to this phone, so it opens with no signal at the gate." 14.5 muted lh 1.42, mt 6.
- **Ways card**: left/right 16, top 524, r24, card shadow. Three `Row`s at min-h 62:
  - Forward the email: tile `#e6eeff`, link icon `#2f5fc4`, sub "bali6@in.critterpass.app", small "Copy" pill (h30 r15 control 13.5/600).
  - Scan a ticket or screenshot: tile `#fff6c9` (**OFF-TOKEN**, maybe tint is `#fff3c4`), camera icon `#8a6a0c`, chevron.
  - Add by hand: tile control, pencil icon ink, chevron.
- Tab bar from Tabs.dc.
- **Taps**: Copy → copies the address and shows a toast (1.03); Scan → document scanner (`cp-ocr` document scan); Add by hand → 7.04; Connect mailbox (listed in "Ways out", not drawn) → 7.05; Search → wallet search (missing); `+` → 1.06 morph sheet.
- **States**: this is the empty state. Loading uses the Foundations 1.02 skeleton (today's `Skeleton` cards).

### 7.02 Bookings · a wallet stack, next one on top

- **Header** (older generation): "Bookings" 32/700 −0.03em at top 64, left 24.
  - "9 offline" tag next to it: booked tint with a 6 px dot `#2e9a74` (**OFF-TOKEN**).
  - `+` 42×42 r21 flat `#1c1d24` (**OFF-TOKEN**; use the 44 ink pill).
- **Closed cards**: h110 r24 white, shadow `0 −2 10 ink .06, 0 2 4 ink .04`, pad 12 14.
  - Inset left/right = 32 − 6i; top = 124 + 44i, so the headers are 44 apart. Today's `BookingDeck` uses 58; build 44.
  - Each has a 38 photo thumb with a 2 px white frame, r11, rotated (−5°, 4°, −3°), shadow 0 2 6 ink .2.
  - Title 15/600, sub 12.5 muted, and a 10 px colour dot in the type colour (tangerine, sky, mint).
- **Front flight card**: left/right 20, top 258, r26, shadow `0 −4 16 ink .08, 0 20 40 ink .12`.
  - Top row, pad 16 18 0: "SQ 938 · Mon 12 Oct" 13/600 muted, and an "On time" tag (booked tint).
  - Route row, pad 12 18 16: SIN and DPS 40/800 −0.03em lh 1, times 14/600 muted, mt 3. Between them a 2 px dashed `#c4c6ce` line with a plane 20 on a white 32×28 chip.
  - Perforation: 2 px dashed `#e3e4e9` with notch circles 20 in the ground colour at x −30/+30.
  - Stub: a 4-column grid, pad 14 18, gap 6, labels 11.5 muted, values 17/700 (Boards, Gate, Seat, Bag).
  - Barcode band: left/right 18, h52, r10, ink stripes.
  - Footer, pad 14 18 16: `Av` 26 stack (M, A) and "Maya and Alex are on this flight. Tokek pings you when boarding opens." 12.5 muted.
- **Crew-finds banner**: left/right 20, top 668, r20, bg `#fff6c9`, pad 10 10 10 8. Tokek 40 (point pose), text 13/1.35 `#3d3210`, "Review" small ink pill h34 r17 13/600.
- **Taps**: a closed header → brings that card to the front (existing deck behaviour); the front card → the detail (7.10 or 7.06); the barcode → 7.11; Review → 7.03 (the crew-finds section); `+` → 1.06.
- **Offline**: "N offline" is the count saved on this phone, using the existing offline badge (`OfflinePill` / `bookings/data/offline.ts`).

### 7.03 Add a booking · forward, scan, paste

- **Header**: `HdrLarge` (eyebrow "Bookings", title "Add a booking").
- **Three tiles**: grid of 3, left/right 20, top 172, gap 10. Each is h120 r22 white with card shadow and pad 12.
  - The doodle is 44 with a sticker edge, tilted −6°/5°/−4°.
  - Label 15/600 at the bottom (margin-top auto), sub 12 muted.
  - Forward "Any email" (chat, sky), Scan "Paper or screen" (camera, pink), Paste "A link or code" (ticket, mint).
- **Address field**: left/right 20, top 306, h52 r18 white, shadow `0 0 0 .5 ink .05, 0 1 2 ink .04, 0 12 28 −14 ink .18`. Mono 13 "bali-six@in.critterpass.app" plus a Copy pill (h38 r13 control).
- **Section label**: "Found in your crew's inboxes · 2" 13/600 muted, left 24, top 380.
- **Candidate card** (large): left/right 20, top 404, r24, pad 14, gap 12.
  - Boat doodle 48 (−6°), title 16/600, sub 12.5 muted ("Fri Oct 16 · Sanur → Penida · 6 seats · $228").
  - Tags "From Alex's email" (rain tint) and "Split 6 ways" (control).
  - Buttons Add (ink) and Ignore (control), each flex h40 r20 14/600.
- **Candidate card** (compact): top 584, r22, pad 12 12 12 14. Car doodle 44 (5°), title and sub, "Add" ink pill h36 r18.
- `GuideNote` (Tokek) at top 672: "I check for new confirmations every morning. You can switch that off in Settings."
- **Taps**: Forward → copies the address; Scan → scanner; Paste → `paste/PasteSheet.tsx` (exists); Add → accepts the candidate (the row slides out, Smooth; the booking joins the stack); Ignore → rejects it; Back → the wallet.

### 7.04 Add by hand · fixes it for you (keyboard-heavy)

- **Header**: `GlassBtn` back at top 58, title "Add by hand" 17/600. Save pill on the right: h44 pad 0 18 r22, `rgba(118,118,128,.12)` with `#9a9daa` 15/600 while disabled. Enabled, it becomes ink-on-control or an ink pill (see Q6).
- **Kind chips**: a horizontal scroller at top 116, pad 0 16, gap 6, with a right-edge fade mask (82%→transparent).
  - Chips h36 pad 0 14 r18 13.5/600.
  - Selected: ink bg, white text, shadow 0 6 14 −6 ink .5. Others: white with a .5 outline.
  - Order: Flight, Stay, Activity, Boat, Transfer, Train, Car hire.
- **Flight number card**: left/right 16, top 170, card, pad 12 16 14.
  - Label 12/600 muted, value "SQ 938" 26/700 +.02em.
  - "Found it" booked tag with a check; sub "Singapore Airlines · A350 · times filled in" 12.5 muted.
- **From / To**: grid `1fr 36px 1fr`, gap 6, top 284, each card h86 r24, pad 12 14.
  - Code 30/800 −0.02em, city 11.5 muted. Between them a 36 swap button (glass .72, blur 14).
  - **Error state on To**: 2 px ring `#ff5fa8` plus glow `0 14 30 −14 rgba(224,70,142,.5)`. The label goes `#b0306b`; helper "One letter too many" 11.5/600 `#b0306b`.
  - Caret: 2.5×26 sky `#4f86ff`, blinking at 1000 ms (`tg-motion fx=blink`).
- **Suggestion banner**: left/right 16, top 382, h46 r23, `#fff6c9`, inset .5 rgba(150,120,20,.2). Tokek 32 on a sun circle. "Did you mean **DPS**, Denpasar?" 13 `#3d3210`. "Use DPS" ink pill h34 r17.
- **Detail rows card**: top 446, rows h52, key width 118 at 15 `#3d404c`, value right-aligned 15.5/500.
  - Rows: Day "Mon 12 Oct", Departs "09:05", Seat "Optional" (`#9a9daa`, weight 400), Confirmation "K7QX2M" (mono).
- **Text link**: "Faster next time: **forward the email**" 13 muted with the link in `#2f5fc4`, centred at top 678.
- **Disabled CTA**: left/right 24, bottom 30, h56 r28, `rgba(118,118,128,.14)` with `#8a8d99` 16/600 "Fix the airport to save". The label says why it is disabled. It turns into "Save" as an `InkPill` once valid.
- **Keyboard** (part 7 draws no keyboard; follow the docked-footer pattern of 2.05 and 4.02):
  - **Flight number**: ASCII, auto-caps characters, no autocorrect, return **Next**.
    - Lookup fires after the input matches `^[A-Z0-9]{2}\s?\d{1,4}$` and pauses for 400 ms.
    - The "Found it" tag pops in (Snappy) and Day, Departs and the airports fill in with a Smooth cross-fade per value.
  - **From / To**: ASCII, caps, no autocorrect, return **Next** (From→To→Seat).
    - No hard 3-letter limit: the error shows instead.
    - While To is focused, keep the field and the suggestion banner above the keyboard (scroll into view).
    - "Use DPS" replaces the value, clears the error, and keeps focus with the caret at the end.
  - **Day**: opens `DatePickerSheet` (half sheet) and the keyboard dismisses.
  - **Departs**: a time wheel in a half sheet (today's code uses a `numbers-and-punctuation` field; the picker is preferred).
  - **Seat**: ASCII caps, optional, return Next.
  - **Confirmation**: mono, caps, return **Done**, which saves if valid.
  - The CTA docks above the keyboard (`KeyboardFooter`); the "Faster next time" line hides under it.
  - Dismiss by dragging the scroll view (interactive) or with Done. A typed draft survives backgrounding ("nothing typed is lost").
- **Taps**: Close/back → 7.01, nothing saved. If edited, ask first (Foundations alert); Flight number → looks it up; Use DPS → fixes the airport; Forward the email → shows the address; Save → saves once valid.

### 7.05 Mailbox · connect, then connected

- **Backdrop**: a photo (380 tall) fading to the ground colour. Placeholder cards behind, scrim `rgba(20,22,40,.2)`.
- **Sheet**: left/right/bottom 8, top 180, r46, sheet glass .86 blur 34 sat 1.8, pad 12 20 0, grabber.
- **Title**: "Find bookings in my email" 26/700 −0.025em, max-w 230. Chat doodle 86 offset up 36 on the right. Body 13.5 muted lh 1.45.
- **Connected card**: mt 16, r22 white, pad 14 16, 2 px mint ring.
  - "G" tile 42 r12 (inset 1.5 `#e3e4e9`, 20/800 `#ea4335`).
  - "Connected · Gmail" 15/600; sub "winston@gmail.com · checked 07:02" 12 muted; a mint check circle 24.
- **Outlook row**: op .6, "O" tile on the rain tint, "Coming soon. Forward confirmations meanwhile."
- **Toggle row**: "Show finds to the crew" plus the sub "Off keeps them to you until you add them." Toggle 52×32 r16, off `rgba(120,120,128,.16)`, knob 28 white.
- **Actions**: "Disconnect" 15/600 `#b0306b`, centred, mt 18. "With Pass+" badge h26 r13 sun 11.5/800 `#17142a`.
- **Taps**: Connect Gmail → Google sign-in, read-only (`mailbox/oauth.ts`); Outlook → disabled; Toggle → shares new finds automatically (Snappy); Disconnect → Alert (destructive), then stops checking; Pass+ → 9.11.

### 7.06 Booking detail · stay

- **Photo header**: h300, bottom radii 36, gradient overlay `rgba(10,10,25,.45) → 0 at 40% → .55`.
  - Buttons: 40×40 r20, **OFF-TOKEN** glass `rgba(255,255,255,.2)` blur 16. Use Clear glass (`rgba(18,20,28,.30)`, blur 24 sat 1.6, inset top white 24%) at 44.
  - The back icon is an arrow (←), not the chevron used everywhere else: use the chevron. ⋯ on the right.
- **Title block**: left 24, top 206. Sticker tag "Stay" in mint. Title "Villa Kayu Manis" 30/800 −0.035em white (**OFF-TOKEN**; Display is 34/700).
- **KV card**: left/right 20, top 316, card. Five rows: When, Where, Confirmation code, Travellers, Price ("$1,840 · paid by Winston").
- **Cancellation banner**: top 574, r20, booked tint, pad 12 14. "Free cancellation until Oct 9, 14:00" 14/600 `#174a35` (**OFF-TOKEN**), sub 12 `#1f7a55`.
- **Shared toggle row**: top 650, r20 white, pad 12 16. Toggle on `#34c77b` (**OFF-TOKEN** system green).
- **Buttons**: Edit `WhitePill` and Delete `PinkPill`, flex with gap 8, left/right 20, bottom 34.
- **Scroll**: the photo stretches on pull-down and parallaxes at 0.5 on scroll up. The `GlassBtn`s stay, and an inline title fades in once the photo is gone (undesigned; standard large-header pattern).
- **Taps**: Back → 7.01; Cancellation line → full terms (`cancel_policy_text`, verbatim) in a half sheet; Toggle → shared vs personal (`visibility`); Edit → 7.04 filled in (`edit/[id]`); Delete → Alert 9.08; ⋯ → 7.15.

### 7.07 Stay booked · Pon proposes who sleeps where

- **Header**: `HdrInline`, "Villa Lumbung" + "Seminyak · Oct 12–17", with a share button on the right.
- **Summary card**: left/right 16, top 116, pad 14 16.
  - Bed tile 44 r12 on the rain tint. "3 rooms · 5 nights" 16/700, sub "$1,170 · paid by Maya".
  - "Emailed" booked tag with a check.
  - Grid of 3 below, mt 14, pt 12, top hairline: labels 10/700 +.08em `#9a9daa` (CHECK-IN, CHECK-OUT, CONF.), values 15/700. CONF. is mono.
- **Section head**: left/right 26, top 262. "Who sleeps where" 20/700 −0.02em, and on the right "Pon's first go" 12.5/600 `#a8501a` (**OFF-TOKEN** tangerine text).
- **Rooms card**: top 296, three `Row`s at min-h 70. Bed tiles: sun `#fff6c9`, rain, mint. Title like "Room 1 · King, ensuite"; sub "{trait} · $90 a night"; `Av` 30 stacks on the right.
- `GuideNote` (Pon, think pose) at top 520.
- **"Same pairs at the Ubud stay" toggle card**: top 604, min-h 60, sub "Oct 17–19 · 2 rooms, Jun and Dev share", toggle on.
- **Footer**: left/right 24, bottom 30, gap 10. "Adjust" `GreyPill` at w116 h52, and "Looks good" `InkPill` at flex h56.
- **Taps**: Looks good → locks the plan and tells the crew (`locked_at`, existing lock); Adjust → 7.08 sheet; Same-pairs toggle → `same_pairs_all_stays`; Share → system share; Back → Wallet.
- **Roles**: organiser view. Members get 7.09.

### 7.08 Who sleeps where · drag to adjust, the split follows

- **Behind**: the 7.07 page at blur 2 px, op .6, scrim `rgba(20,22,40,.24)`.
- **Sheet**: full height, top 54, left/right/bottom 8, r46, glass .88 blur 34, pad 10 18 0.
  - Header min-h 44: "Cancel" 16 `#2f5fc4`, title 17/600 centred, "Save" 16/700 `#2f5fc4`.
  - **Text-colour buttons here vs ink buttons elsewhere**: see Q5.
- **Room cards**: gap 10, mt 12. Each is r24 white, pad 12 14, bed tile 40.
  - Name 14.5/700; "$90 a night" 12 muted, tabular.
  - Seats: a row with gap 6, each seat w52: `Av` 44 (18/700) with the name 11.5/600 `#3d404c`.
  - **Drop target**: the card gets a 2 px sky ring + 0 14 30 −14 `rgba(47,95,196,.45)`. An empty seat is 44 with a 2 px dashed sky border, fill `rgba(79,134,255,.08)`, `+` 16 sky, and "Drop here" 11.5/600 `#2f5fc4`.
  - **Origin ghost**: 44 dashed `#c4c6ce` with the name in `#c4c6ce`.
  - **Lifted avatar**: at its finger position, rotated −8°, scale 1.12, white 3 px ring, shadow 0 18 30 −8 ink .5. A name pill below: 11.5/700 white on ink, pad 2 8, r10.
- **Unplaced row**: r22, 1.5 px dashed `rgba(28,29,36,.18)`, pad 10 14. Grey `Av` 40 `#e3e4ea`, "Sam isn't placed yet" 14.5/600, sub "Joined Oct 8, after the booking", chevron.
- **Split card**: r22 white, pad 12 14. "$1,170 split" 14.5/700 with a mini segmented h30 r15 pad 2 (By room | Evenly) 12/600.
  - Three tiles (flex, gap 6): r14 ground, pad 7 10, label 11/600 muted "King, each", value 16/700 tabular.
- **Gesture**:
  - Long-press (about 250 ms) lifts the avatar: Snappy scale and rotate, light haptic.
  - Drag follows the finger 1:1. Hovering a room lights its ring (Snappy).
  - Drop: the avatar lands in the seat with **Lively** (one wobble) and a light haptic. Seats on both sides reflow with Smooth layout.
  - Split tiles roll to their new values (Odometer, Smooth).
  - Dropping on an invalid spot (a full room) springs the avatar back home (Smooth) with a warning haptic.
  - Reduce Motion: no lift rotation; 150 ms cross-fade into place.
  - Existing `setup/rooms/draggable-avatar.tsx` has the drag.
- **Taps**: Save → crew told; Cancel → asks if edited; Sam's row → place Sam: a picker of rooms with space; By room / Evenly → switches the stay expense's split mode (missing; §7).

### 7.09 Your room · member view, a swap waiting on Ray

- **Header**: `HdrInline` as 7.07.
- **Hero**: left/right 16, top 116, h196, r30, gradient 150° `#e6eeff→#fff 70%`, shadow 0 24 44 −26 `rgba(47,95,196,.5)`.
  - Bed doodle 96 with a sticker edge, rotated 10° at the top-right.
  - "YOUR ROOM" 12/700 +.08em `#2f5fc4`; "Room 2 · Twin" 28/800 −0.035em lh 1.05; "With Ari. Bathroom across the hall." 13.5 `#3d404c`.
  - Bottom row: `Av` 40 pair, and on the right "Your share" 11.5/600 muted with "$135" 20/800 tabular.
- **Others**: "Everyone else · set by Maya" 13/600 muted at top 330, then a two-row card at top 354 (`Av` 28 stacks, "$225 each", "$150 each · near the pool").
- **Swap card**: top 500, h112, pad 14.
  - `Av` 36 (R), "You asked Ray to swap" 15/600, body 12.5 `#3d404c`.
  - Row mt 12: "Waiting on Ray" tag h30 r15, `#fff1e6` with `#a8501a` text and a clock icon (**OFF-TOKEN** tangerine tint). "Cancel request" grey small pill.
- **Footnote**: 12.5 muted, centred, at top 628.
- **Footer**: "Ask someone else" `GreyPill` h52, and "Message Ray" text button 15/600 `#2f5fc4` h36.
- **Taps**: Cancel request → withdraws the request (Smooth collapse of the card); Ask someone else → a person picker (a half sheet of crew avatars); Message Ray → the DM or crew chat with Ray.
- **Roles**: the member is read-only on rooms. Peer swap with consent is a gap (§7).

### 7.10 Flight detail · a real boarding card, saved for no signal

- **Header**: `HdrInline` "Flight" with share on the right.
- **Ticket card**: left/right 16, top 114, r28, card shadow, overflow hidden, pad 16 18 14.
  - Top row: an airline tile 26 r8 `#1f2a52` with "SQ" 10/800 `#ffd84a` (brand colours, keep). "SQ 938 · Mon 12 Oct" 13.5/600. "On time" tag h24 with a green dot `#34c77b`.
  - Route grid (`auto 1fr auto`, gap 10, mt 14): SIN and DPS 44/800 −0.035em, city 12.5 muted.
    - A dashed arc `#c4c6ce` 1.6 (`M4 34 Q60 −6 116 34`, dasharray 3 4).
    - ✈︎ 15 at the apex, rotated 8°, with "2h 35m" 11/600 muted below.
  - Times row mt 10: 20/700 tabular.
  - Perforation as 7.02 (notches 24 at ±30).
  - Stub: 4 columns, pad 12 18 16. Labels 10.5/700 +.08em `#9a9daa`, values 17/700, mt 2: TERMINAL 3, GATE B7, BOARDS 08:25, SEAT 34A. SEAT carries a pink lock icon 9 (private to you).
- **Section head**: left/right 26, top 366. "Saved on this phone" 13/600 muted, and "Works offline" 12/600 `#1f7a55` on the right.
- **Docs card**: top 390, rows h62, pad 0 14 0 10.
  - Boarding pass: an ink tile 42 r11 with white stripes, "Seat 34A · Group 4", and a green check circle 24 (`#34c77b`).
  - e-Ticket receipt: a "PDF" tile in control, sub "Saves when you're back on Wi-Fi" 12 `#a8501a`, and a progress ring 24 (conic tangerine 35% with a white 16 hole).
- **"Who sees it"** card at top 572: "Share with the Bali Six" 15.5/500 with a toggle. Two tags flex h30 r15: "Crew sees · flight, times" (booked tint) and "Only you · seat, pass" (pink tint).
- **Primary**: `InkPill` "Add to Wallet", with a wallet glyph 20×16 white stroke 2.
  - On iOS, use Apple's `PKAddPassButton` style or keep the ink pill? Apple's guidelines require the official badge (see Q7).
- **Taps**: Boarding pass row → 7.11 (zoom/rise); PDF → opens the e-ticket in Quick Look (row disabled until saved); Toggle → crew sees flight and times only (`flight_crew_visible`); Add to Wallet → the system Wallet sheet; Share → 7.15 (iOS action sheet); Back → 7.01.
- **Offline**: everything renders from the local copy. The PDF ring animates its progress (Smooth) and the row becomes tappable when done.

### 1.13 Dark · flight detail, the boarding pass stays light

- Same layout and taps as 7.10. Ground `#0e0f13`, ink `#f2f2f5`.
- **Glass buttons**: `rgba(40,41,50,.70)`, inset top white .07, inner .5 white .05, outline .5 white .09, shadow 0 8 20 −6 black .35. Close to the "dark glass 72%" token.
- **The ticket card stays white** with ink text (1.13 rule: "the scannable card stays light"). Notches stay ground-light `#f5f5f7` (**check**: they should match the dark ground; the frame keeps them light, see Q8).
- **Section labels**: "Saved on this phone" `#9a9daa`; "Works offline" `#5fd6a2`.
- **Docs card**: `#1c1d24` with no shadow (hairline .5 white .09), dividers .5 white .1.
  - Boarding-pass tile goes light `#f2f2f5` with white stripes. PDF tile `#2a2b33` with `#9a9daa` text.
  - "Saves when…" `#ffae73` (**OFF-TOKEN** dark tangerine). The ring's hole is `#1c1d24`.
- **Toggle**: on `#34c77b` with a **dark knob `#1c1d24`** (**OFF-TOKEN**; iOS keeps the knob white). Tags: success tint `#16332a/#5fd6a2`, pink tint `#3b1a2b/#ff8ac0`.
- **Primary flips light**: gradient `#ffffff→#e2e2e8`, text and icon `#15161b`, shadow 0 1 2 black .55 + 0 16 32 −10 black .7.
- **Brightness**: maximum when the pass opens, as in light.

### 7.11 Boarding pass · full screen, brightness up

- **Ground**: `#0e1020` (**OFF-TOKEN**; dark ground is `#0e0f13`).
- **Header**: row at top 58, left/right 20, all Clear glass (`rgba(18,20,28,.34)` blur 22 sat 1.6, inset top white .22, inner .5 white .14):
  - ✕ 44 on the left;
  - centre chip h32 pad 0 12 r16 "Brightness up" 12.5/600 white with a sun icon 14 `#ffd84a`;
  - share 44 on the right.
- **Pass card**: left/right 20, top 122, bottom 120, r30 white, shadow 0 30 60 −20 black .6.
  - Airline band `#1f2a52`, pad 18 20: tile 30 r9 sun with "SQ" 11/800 navy, "Singapore Airlines" 15/600, date 13 at op .8.
  - Route, pad 16 20: SIN and DPS 46/800 −0.035em, times 12.5 muted, a paper-plane glyph 22 `#c4c6ce` between.
  - Stub: 4 columns, pad 0 20 14. Labels 10/700 +.08em `#9a9daa`, values 19/700: GATE, BOARDS, GROUP, SEAT.
  - Dashed divider `#e3e4e9`.
  - **Code**: centred, pad 22 0 10, 190×190, pad 10, r14, inset 1 `#e3e4e9`, a 13×13 grid with gap 2. Render the real symbology from `barcode_format`. A PDF417 needs a wide slot (about 300×100); see Q9.
  - "Winston Tan · K7QX2M" 13 muted, with the code in mono.
- **Footer**: bottom 42. A no-wifi icon 15 and "Saved on this phone · works offline" 13 `rgba(255,255,255,.75)`.
- **Behaviour**:
  - Window brightness goes to maximum on mount and is restored on dismiss (`use-full-brightness.ts`, exists). The chip confirms it. Tapping the chip toggles it back (undesigned; recommended).
  - Keep the screen awake.
  - Never a second cover; ✕ returns to 7.10.
- **Motion in**: the boarding-pass row (or the 7.02 barcode) zooms into the card: a shared element, Smooth. The dark ground fades in, the chrome fades in after it. Reduce Motion: 150 ms cross-fade.
- **Taps**: ✕ → 7.10. Share → system share (the pass image and times; never the seat to the crew). Add to Wallet ("Ways out", not drawn) → system sheet.

### 7.12 Flight cancelled · rebook options, crew told

- **Header**: `HdrInline` "Flight" with share.
- **Status card**: left/right 16, top 116, h150, r26, pad 16.
  - Top row as 7.10, with a "Cancelled" tag (vote-open tint, dot `#e0468e`).
  - SIN and DPS 40/800 at op .45, struck through 3 px `#e0468e`.
  - Line 13 `#3d404c`: "Cancelled by the airline at 6:02 AM. You're owed a free change or a refund."
- **Section label**: "Tokek found these, same fare" 13/600 muted at top 290.
- **Options card**: top 314, rows h66.
  - Selected row: gradient 90° `#f2fbf6→#fff`, a "Best" booked tag h20, sub in `#1f7a55`, a filled ink check 22.
  - Other rows: an unselected ring 22 (inset 1.5 `#c4c6ce`). Times 16/700 tabular. The second sub is in `#a8501a` ("3 seats", scarcity).
- **Crew strip**: top 536, h52, r20, `rgba(118,118,128,.08)`. `Av` 24 stack and "Maya, Ari and Jun are on this flight too. They see these options." 13.
- **Plan impact line**: 12.5 muted, centred: "Day 1 moves 4 hours. Pon will shuffle the afternoon."
- **Footer**: bottom 24. `InkPill` "Rebook on SQ 942", then a row of two `GreyPill`s h44 r22 14/600: "Call the airline", "Ask for a refund".
- **Taps**: an option → selects it (Snappy radio), and the primary label updates with a Smooth cross-fade; Rebook → the airline's rebooking handoff (link). The product rule is "rebook is a link, never an action" (`packages/planner/src/disruption/classify-actions.ts:7`); see Q10; Call → dialer; Refund → the airline's refund page.

### 7.13 Travel insurance · a card in the wallet

- **Header**: `HdrLarge` (eyebrow "Bookings", title "Travel insurance").
- **Card**: left/right 24, top 172, h200, r24, gradient 135° `#2f5fc4→#4f86ff`, rotated −3°, shadow 0 22 44 `rgba(47,95,196,.35)`, pad 18 20, white text.
  - "TRAVEL INSURANCE" 11/700 +.08em at op .8, with a heart doodle 34.
  - "Chubb Travel" 26/800 −0.02em.
  - Fields mt 22, gap 24: labels 10/700 +.08em at op .7, values 15/600 (policy no. in mono).
- **Call**: "Call assistance" ink pill, left/right 20, top 404, h52 r26, phone icon 16.
- **KV card**: top 474, r22. Insurer; Policy number; Policy page "Kept with it ✓" 13/600 `#1f7a55`.
- `GuideNote` (Tokek) at top 632: "The Help screen shows this card when you need it."
- **Footer**: "Scan the policy" `WhitePill` and "Delete policy" `PinkPill`, bottom 34.
- **Taps**: Call → dialer; Policy number → copies it (toast); Policy page → the stored page (Quick Look); Scan → document scanner (exists); Delete → Alert 9.08.
- Today's route opens the form. The form becomes the edit state, reached by tapping the card or ⋯ (undesigned).

### 7.14 Past bookings · archive

- **Header**: `HdrLarge` (eyebrow "Bookings", title "Past bookings").
- **Search field**: left/right 16, top 168, h46 r23, `rgba(118,118,128,.12)`, magnifier 16 muted, placeholder "Flights, stays, confirmation codes" 16 `#8a8d99`.
  - Keyboard: default type, return **Search**. Results filter live. The keyboard drops on scroll (4.02 rule).
- **Groups**: from top 236, gap 22.
  - Group head pad 0 6: trip and month 18/700 −0.02em; "Recap" 13/600 `#2f5fc4` on the right.
  - Card r22, rows pad 12 14 12 10, doodle 40, title 14.5/600, sub 12 muted.
  - A cancelled row: op .55, struck title, a "Cancelled" pink tag h22 10.5/700.
- **Taps**: a row → its detail, read-only. Recap → that trip's recap (8.B). Back → 7.01.
- **Empty state**: undesigned; use the 1.01 empty state.

### 7.15 Action sheet · booking options

- iOS action sheet over the dimmed flight detail (scrim `rgba(20,22,40,.3)`).
- **Group**: left/right 10, bottom 104, r26, white .97.
  - Header "SQ 938 · Seat 34A" 13/600 muted, pad 14 16, hairline.
  - Rows h56, 18/400, centred: Add to Apple Wallet, Share with the crew, Open in Singapore Airlines, Mark as not ours, Delete booking (`#d6337f`).
- **Cancel**: a separate pill, left/right 10, bottom 36, h58 r22 white, "Close" 18/600.
- Build with the native `ActionSheetIOS` on iOS and a bottom sheet list on Android.
- **Taps**: Add to Wallet → system sheet; Share with the crew → shares the times; Open in the airline app → deep link or store; Not ours → moves it out of the crew wallet; Delete → Alert 9.08; Close → back.

### 7.16 Balances · empty ledger, first expense

- **Header**: `HdrRoot` + `Seg` (Money selected).
- **Hero**: left/right 16, top 168, h168, r30, gradient 145° `#1f2a52→#2f3a6e` (**OFF-TOKEN** navy), white, shadow 0 30 50 −24 `rgba(31,42,82,.6)`.
  - "Bali Six · you're square" 13/600 at op .8.
  - "$0.00" 46/800 −0.04em tabular.
  - Bottom row: `Av` 24 ×6 and "Nobody owes anyone yet" 12.5 at op .85.
  - Wallet doodle 96 at the top-right, rotated 14°, offset −8/−10.
- **Copy**: centred, top 362. "Add the first expense" 22/700; "Split it evenly, by share, or line by line from a receipt." 14.5 muted.
- **Tiles**: grid of 3, gap 10, top 462, each h104 r24 white. A circle 44 tinted (rain / sun-yellow / booked) with an icon 20, and a label 13.5/600: Scan receipt, Type it in, Set a budget.
- `GuideNote` (Pon) at top 600: "Tip: forward hotel and ferry emails. I'll add them here and in bookings."
- Tab bar.
- **Taps**: Scan receipt → 7.19 camera; Type it in → 7.18; Set a budget → budget setup (7.29 or the trip setup budget step); `+` → add expense (see Q2); Search → expense search (missing); Bookings segment → swaps the half.

### 7.17 Balances · up and down, one chart

- **Header** (older generation): "Money" 32/700 at top 64, with "$4,812 spent · The Bali Six" 13 muted below.
  - "USD ⌄" chip h34 pad 0 13 r17 white with button shadow, 13/600.
  - No switch and no search/`+`: unify with 7.16 (Q1).
- **Hero card**: left/right 20, top 136, h124, r28, shadow `0 2 4 ink .05, 0 16 36 ink .08`, pad 18 20.
  - "You're owed" 13/600 muted.
  - "$186.40" 52/800 −0.045em lh 1 tabular.
  - Wallet doodle 86 at the top-right (−18 up, rotated 10°) and a spark 28.
- **Bars card**: top 274, pad 12 16 8.
  - Header labels "Owes" / "Is owed" 11.5/600 muted, padding-left 64.
  - Rows h32: name width 56, 13.5 (700 for You).
  - Track: a centre line 1 px `rgba(28,29,36,.1)`. The bar is h12 r6, width |v|/max × 50%, mint `#54d6a4` for positive (grows right), tangerine `#ff9a4d` for negative (grows left), a 4 px stub `#d0d1d8` for zero.
  - Value width 62, right-aligned 13.5/600 tabular; colour `#1f7a55`, `#a8501a` or muted.
- **Action row**: top 528, gap 8. "Settle in 3 taps" ink pill flex h52 r26 15/600, then three white circles 52: scan-frame, `+`, chart.
- **Latest**: "Latest" 13/600 muted at top 600. Row card at top 622, r22, pad 10 16 10 10: food doodle 46, title 15/600, sub 12 muted lh 1.35, amount 15/600 tabular.
- **Number motion**: the hero and the bar values roll with the Odometer (existing `ui/data/Odometer.tsx`) on load, on sync changes and on currency switch. Bars grow from the centre line with Smooth (stagger 30 ms by row). See §5.
- **Taps**: USD → `CurrencySheet` (half sheet); Settle → 7.24; Scan → 7.19; `+` → 7.18; Chart → 7.29; Latest row → 7.21; a name row → filtered 7.23 (undesigned; recommended).

### 7.18 Add an expense · rupiah first, dollars underneath (number pad)

- **Header** (older generation): ✕ `GlassBtn` on the left; centre "New expense · Bali Six" 13/600 muted; right "Scan instead" white pill h36 r18 13/600 with button shadow. Full screen with ✕ (see Q3).
- **Amount**: centred at top 126. Currency "Rp" 30/700 `#9a9daa` raised 10 px, margin-right 6. Digits "450.000" 50/800 −0.045em tabular. Line "≈ $28.42 · $4.74 each" 14 muted, mt 2.
- **Description field**: left/right 20, top 220, h50 r18 white, pad 0 10 0 16. Text 15/500, with a category sticker tag on the right (pink "Food", rotated −4°).
- **Paid by**: label 13/600 muted width 56 at top 290, then `Av` 36 ×6, gap 6. Selected: ring 2.5 ground + 4.5 ink. Others at op .45.
- **Split**: `Seg` 3-way at top 346, h42 r21 pad 3: Evenly / By share / Custom.
- **Keypad**: grid 3×4, left/right 20, top 404, gap 8. Keys h62 r20 white, shadow 0 1 1 ink .05, 26/500. Keys: 1–9, 000, 0, ⌫.
- **CTA**: bottom 36, `InkPill` "Add Rp 450k" (a compact amount).
- **Keyboard and pad states**:
  - The amount uses only the in-app keypad (`ui/inputs/Keypad.tsx`, '000' supported in `add-expense/draft.ts`). The system keyboard never shows for the amount.
  - Tapping the description raises the system keyboard (sentences, autocorrect on, return **Done**). The keypad slides down under it (Smooth) and the CTA docks above the keyboard. Done or a tap outside brings the keypad back.
  - The category sticker auto-suggests from the text (`add-expense/suggest.ts`) and lands with Lively when it changes.
  - Tapping "Rp" opens `CurrencyPicker` (half sheet).
  - By share / Custom: the editors (`SplitEditorShares.tsx`, `SplitEditorCustom.tsx`) slide in where the keypad was (existing behaviour: "Change amount" returns).
- **Number motion**:
  - A typed digit enters from below inside its column (Odometer per digit, Smooth). The whole number re-centres with a Smooth layout shift, so nothing snaps.
  - The ≈ line and "each" roll with the same spring.
  - ⌫ rolls the last digit out downward.
  - Haptic: selection tick on each key.
- **Taps**: ✕ → asks if edited; Scan instead → 7.19, keeping the typed values; Add → saves, closes, and the balances roll on 7.17.

### 7.19 Error · couldn't read the receipt (dark)

- **Camera result**: ground radial `#4a4038→#221e1a 70%` (the photo). A receipt mock rotated 7° with a TOTAL highlight in mint at .4. A sticker "Too crumpled" in pink, rotated −8°.
- **Sheet**: bottom h420, top radii 34, light ground `#f5f5f7` even in this dark frame. Grabber at mt 8.
  - Row pad 16 24 0: Tokek 44 (think pose) and "TOKEK GOT HALF OF IT" 12/700 +.06em muted.
  - Title "The total, not the lines" 26/700 −0.025em.
  - Result card, margin 14 20 0, r20 white: a ✓ row (booked circle 20) "Total: Rp 1.080.000 at Ibu Oka", and a ✕ row (pink circle) "Line items: the fold hides all seven". Rows pad 12 14, 14.
  - Two white pills h44 r22 14/600: "Type the lines", "Retake, flatter".
  - Primary: `InkPill` "Split evenly · $11.37 each" at bottom 40.
- **Taps**: Type the lines → line editor with the total kept (`TypeLinesScreen.tsx`); Retake → camera again; Split evenly → saves, then a toast with **Undo** (1.03). Undo deletes the new expense; that delete is missing.
- **Motion**: the sheet rises with Smooth when OCR returns. The sticker drops with Lively (one wobble) on the photo.

### 7.20 Receipt · lines don't add up, fix in place

- **Header**: `HdrInline` "Check the receipt" + "Warung Babi Guling". On the right, "Save" as a text button 16/600 `#9a9daa` while disabled.
- **Error banner**: left/right 16, top 118, h62, r20, `#fff6f9` (**OFF-TOKEN**) with inset 1 `rgba(224,70,142,.25)`.
  - ✕ circle 34 on the pink tint.
  - "Lines come to Rp 412k, receipt says Rp 448k" 14.5/600 `#b0306b`; "Rp 36k is missing. Usually tax or a smudged line." 12.5 `#3d404c`.
- **Lines card**: top 196, rows h56, pad 0 14.
  - Label 15, then `Av` 22 stacks (who had it), amount width 72 right-aligned 15/600 tabular.
  - Suggested row on `#fff6c9`: "Tax and service 10%" 15/600 `#8a6a0c`, "Pon found it" 12/700, amount 15/700.
- **Choices**: a row at top 496, gap 8. "✓ Add the tax line" ink pill h44 r22, and "Split it evenly" grey pill.
- **Totals**: "Total — Rp 448,000 · $28.40" and "Paid by — `Av` Maya ⌄", both 15, at top 560 and 590.
- **Footer**: disabled "Match the total to save" (h56 grey), and "Retake the photo" text 15/600 muted.
- **Keyboard**:
  - Tapping a line's amount opens the decimal keypad (in-app `Keypad` in a bottom sheet, matching 7.18, return **Done**).
  - Tapping a label opens the default keyboard (return **Next** to its amount).
  - The CTA docks above the keypad.
  - Tapping the avatars opens `LineAssignSheet` (exists).
- **Motion**:
  - The mismatch banner collapses (Smooth height and opacity) once the totals match.
  - The disabled CTA becomes "Save · Rp 448k" (colour cross-fade, Smooth).
  - The suggested row tints into a normal row when accepted.
- **Taps**: Add tax line → keeps the total (`review-model.ts`, keep-total adds a `service` line); Split difference → spreads the gap by share; Edit lines → inline; Retake → camera; Paid by → `PayerPicker`.

### 7.21 Expense detail · shares and changes

- **Header**: `HdrInline` "Money" with no right action.
- **Title block**: food doodle 80 at the top-right (right 20, top 96, rotated 8°).
  - Left 24, top 116: "Babi guling, Ibu Oka" 13/600 muted; "Rp 1.08M" 46/800 −0.045em; "≈ $68.20 · Maya paid · Wed 14 Oct" 13 muted.
- **Tags**: at top 232: "Food" (pink tint) and "Split from a receipt scan" (rain tint).
- **Shares**: "Who owes what" label at top 280, card at top 302. Rows pad 8 14: `Av` 28, name 14/500, value 14/600 tabular.
  - The payer row is in `#1f7a55`: "Maya · paid  +$56.83".
  - A left-out row at op .5: "Left out".
- **Changes**: label at top 586. Timeline: left border 2 `#e3e4e9`, pl 14, gap 10. Entries 12.5: **Maya** "changed the split · 14:20", with the reason in muted.
- **Footer**: Edit `WhitePill`, Delete `PinkPill`.
- **Taps**: a share → edit that person's share (half sheet with the keypad); a change → what changed and who did it (half sheet); Edit → 7.18 in edit mode (`money/add?edit=`); Delete → Alert, crew told; Back → 7.23.

### 7.22 Stay expense · splits by room, follows the rooms

- **Header**: `HdrInline` "Expense" with ⋯ (glyph circles r1.3, stroke 2.6).
- **Summary card**: left/right 16, top 116, pad 16.
  - Bed tile 44 on the rain tint, "Villa Lumbung" 16/700, sub "Paid by Maya · from the booking". "By room" rain tag.
  - "$1,170" 44/800 −0.04em tabular, mt 12. "5 nights · 3 rooms · 7 people" 12.5 muted.
- **Rooms**: label at top 282, card at top 306, three rows min-h 64. Tile 38, "Room 1" 15.5/600, sub "King · $450". `Av` 26 stack, then value 15.5/700 with "each" 11 muted, width 58.
- **Your share banner**: top 514, h56, r20, `#fff6f9` with inset 1 pink .2. `Av` 30 W, "Your share" 14.5/600, "you owe Maya" 13/600 `#b0306b`, "$135" 18/800.
- `GuideNote` (Pon) at top 588: "If rooms change, this split changes too. Anyone who already paid gets a top-up or a refund line."
- **Footer**: `InkPill` "Settle up with Maya", and the text button "Split evenly instead · $167 each" 15/600 muted.
- **Taps**: Settle → 7.25 for Maya; Split evenly → confirm, then re-split (amounts roll); Open rooms → 7.07 / 7.08; ⋯ → edit / delete.

### 7.23 Every expense · filter by person

- **Header**: `GlassBtn` with the inline title "Money" (17/600), then the large title "Every expense" 32/700 at top 116 (mixed pattern).
- **Filter row**: left 20, right 0 (bleeds), top 170, gap 6. "Everyone" ink chip h36 pad 0 14 r18 13/600, then `Av` 36 chips.
  - A selected person is ring-highlighted (undesigned: use the 7.18 payer ring).
- **Day groups**: gap 16. Head 13/600 muted with the day total on the right. Card r22, rows pad 9 14 9 8: doodle 34, title 14/600, sub 11.5 muted, amount 14/600 tabular.
- **Taps**: a chip → filters (Snappy; rows animate in and out with Smooth layout); a row → 7.21; `+` (in Every tap, not drawn) → add expense; Back → 7.16.
- **Empty filter**: the existing "filter matches nothing" line.

### 7.24 Settle up · three payments, one reward

- **Header**: `HdrLarge` (eyebrow "Money", title "Settle up").
  - Under the title: Tokek 30 and "23 expenses, down to three payments." in **Guide type** (Borel 13, lh 1.45, `#6b5a24` **OFF-TOKEN**; Guide is Borel 15).
- **Payment rows**: left/right 20, top 210, gap 10. Each r22, pad 12 14, gap 10.
  - From `Av` 36 → arrow 18×12 `#9a9daa` → to `Av` 28.
  - Amount 18/700 tabular; status 12/600 in its colour: Requested `#a8501a`, Paid ✓ `#1f7a55`, Pending muted.
  - Optional "Nudge" ink pill h34 r17.
- **"How people pay you"** label at top 466. Chips h38 r19: Bank transfer (white), **PayNow** (ink, the default), Cash. Note 12.5 muted: "Your details are shared only with the person paying."
- **Reward card**: top 584, r22, white with a 1.5 dashed `#c4c6ce` border, pad 12 14. A locked gecko silhouette 54 (`#dcdde3`) with "?" 20/800 `#2e9a74`. "Two more payments and all six of you get the **Settled Tokek**." 13.5/1.4.
- **Footer**: `InkPill` "Remind everyone".
- **Taps**: a row → 7.25 (you pay) or 7.26 (owed to you); Nudge → sends once a day; toast; Chips → 7.27; Remind everyone → nudges all (online only; disabled offline with a reason).
- **Motion**: when a payment flips to Paid, the status cross-fades, the row's amount strikes or rolls to 0, and the reward counter decrements (Odometer). The final payment plays the Settled Tokek ceremony (Lively stamp; existing `use-settled-ceremony.ts`).

### 7.25 Pay someone · their QR, your bank app

- **Header**: `HdrInline` "Settle up".
- **Who and how much**: centred at top 110. `Av` 56 M with a ring of 4 white + shadow 0 10 20 −8 `rgba(224,70,142,.6)`. "$41.00" 46/800 −0.04em tabular, mt 12. "to Maya · spa, lunch and the boat" 13.5 muted.
- **Method switch**: `Seg` at top 264, h36 r18: PayNow / Bank transfer / Cash.
- **QR card**: left/right 76, top 314, r30 white, pad 14 14 12, shadow `0 0 0 .5 ink .05, 0 24 44 −20 ink .35`.
  - QR square r16, inset 1 `#e3e4e9`, pad 12, 11×11 modules with gap 2, r1.5.
  - Centre badge 44 r12 `#7b2d8e` (PayNow brand), 3 px white border, "PN" 11/800.
  - Caption 12.5 `#3d404c`: "Scan in your bank app, then type **$41.00**".
- **Copy row**: top 630, h58 r24 card. "Or PayNow to" 11.5/600 muted, "+65 9••• 4421" 16/600 tabular. Copy pill h40 r20 control with a copy icon 13.
- **Footer**: `InkPill` "I've paid Maya". Note 12 muted: "Maya confirms when it lands. Paid part? The rest stays open."
- **Motion**: switching the method cross-fades the QR card and the copy row to bank details or cash text (Smooth). The card keeps its height to avoid a jump, or animates height with Smooth.
- **Keyboard**: "Paid part?" opens the amount keypad (in-app `Keypad` in a half sheet, return **Done**). The existing MARK PAID footer docks above it.
- **Taps**: Method → switches; QR → long-press saves it to Photos (recommended); Copy → copies; I've paid → marks it sent, then 7.26 (payer side); Back → 7.24. The design text says "(7.16)", which is wrong.

### 7.26 Payment states · waiting, owed to you

- **Header**: `HdrInline` "Settle up".
- **Title row**: left 24, top 114, gap 12. `Av` 52 J; "Jordan owes you" 30/700 −0.03em lh 1; "$92.10" 24/800, mt 2.
- **Timeline card**: left/right 20, top 200, pad 16. Steps: node 22 circle.
  - Done: mint fill with an ink check 10.
  - Current: white with an inset 3 sun ring.
  - Next: white with an inset 2 `#d0d1d8` ring.
  - Connector 2×30 `#e3e4e9`. Title 14.5/600 (op .5 when future), sub 12 muted.
- **Note**: top 436, r20, `#fff6c9` pad 12 14, 13 `#3d3210`: "Waiting for you to confirm. It confirms itself after seven days."
- **Actions**: top 514, gap 8. `InkPill` "I got it", then a row: "Nudge Jordan" (`WhitePill` h48) and "It didn't arrive" (`PinkPill` h48).
- **Toast**: left/right 20, bottom 110, h58 r29 ink, shadow 0 14 30 ink .3. Mint check circle 36, "Nudged Jordan. Gently." 14.5/600 white.
- **Motion**:
  - "I got it" → the current node fills mint with a Lively check pop.
  - The connector draws down (Smooth) and the next node lights.
  - Balances re-count, so the amounts roll.
  - Success haptic.
  - The toast rises from the bottom (Smooth) and leaves after about 2.5 s (1.03).
- **Taps**: I got it → settled, both told; Nudge → once a day (disabled with "Nudged today" afterwards); It didn't arrive → `DisputeSheet` (exists); re-opens it and Jordan is told.

### 7.27 How people pay you · pick, then fill in place

- **Header**: `HdrInline` "Payout methods".
- **Title block**: left 24, right 110, top 114. "How people / pay you" 28/700 −0.03em lh 1.05; "Only the person paying sees these." 13 muted. Lock doodle 72 at the right, top 104, rotated 10°.
- **Methods card**: left/right 16, top 222, r26.
  - **Expanded PayNow** block: pad 12 14 14, gradient `#faf6fc→#fff` (**OFF-TOKEN**).
    - Tile 40 r12 `#7b2d8e` "PN"; "PayNow" 15.5/600; "Default · fastest for SG banks" 12 muted; an ink check 24.
    - Field grid `1.2fr 1fr`, gap 8, mt 12. Fields h52 r16 pad 6 12, label 10.5/600 muted, value 15/600.
    - **Focused field**: white with a 2 px ink ring. Idle field: ground fill.
  - Collapsed rows h62: tile 40 tinted, title 15.5/600, sub 12 muted, then an ink check 24 (enabled) or an "Add" pill h30 r15 control.
    - Bank transfer (`#e6eeff/#2f5fc4`), Wise (`#e3f6ec/#1f7a55`), Regional QR (control/muted, "Thailand, Vietnam, Malaysia"), Cash (`#fff3c4/#8a6a0c`).
- **Footer**: `InkPill` "Save".
- **Keyboard**:
  - Mobile: `phone-pad` (no return key) with an accessory bar "Next" → Name.
  - Name: default type, words caps, return **Done**.
  - Bank fields: number-pad for account numbers, ASCII caps for SWIFT.
  - The expanded block stays above the keyboard; Save docks above it.
  - Tapping another row collapses the open one and expands the tapped one (Smooth height, content fades). This is the existing editor in `PayoutMethodsEditor.tsx`.
- **Taps**: a method → edit in place; Default → makes it first (missing); Add → another method; Save → back to 7.24.

### 7.28 Settle up · all square, the trip's books close

- **Ground**: radial `#e3f6ec → #f5f5f7 70%` at 50% 30%.
- **Header**: `HdrInline` "Settle up".
- **Stamp**: centred at top 140, 220×220 circle, border 3 `#34c77b`, rotated −8°, fill white .5, inset 8 green .12.
  - Mono 11 +.24em `#1f7a55` "BALI SIX · OCT 22"; "SQUARE" 42/900 +.02em; mono "$2,418 · 46 EXPENSES".
  - Tokek 96 (cheer pose) at the right 46, top 0, rotated 12°.
- **Copy**: centred, top 430. "Everyone's even" 28/700; "The last payment landed. Tokek closed the books for Bali." 15 muted.
- **Links card**: top 530. Two `Row`s: "See every expense / 46 items, filter by person", "Export for your records / CSV or PDF".
- **Footer**: `InkPill` "Back to the recap".
- **Motion in**: Foundations 1.07 stamp: drops, squashes, inks, and the page answers (Lively). Then confetti once, and Tokek pops (Lively). Success haptic on impact. Reduce Motion: the stamp lands without falling.
- **Taps**: Every expense → 7.23; Export → share sheet with CSV or PDF (missing); Recap → 8.B; Adding a new expense later re-opens the books.

### 7.29 Budget · over by $86, what to trim

- **Header**: `HdrInline` "Budget" + "Bali · Day 5 of 8", with ⋯.
- **Summary card**: left/right 16, top 118, h200, r26, pad 16.
  - "Spent each" 13/600 muted; "$686" 40/800 −0.04em tabular.
  - On the right: "of $600 planned" 13/600 muted, with a "$86 over" pink tag h28 r14.
  - **Bar**: h14 r7 track `#eeeef2`. Ink fill to 87.5% (planned ÷ spent), then an over-part striped `#ff5fa8 / #ff8cc0` at 135°, 5 px stripes. A marker 2×26 ink at the planned line.
  - Labels 12 muted: Day 1 / Planned line / Day 8.
  - Forecast 13 `#3d404c`: "At this pace you'll end around **$1,020**, about $220 over."
- **Where it went**: label at top 342, card at top 366. Rows min-h 56: tile 40 r12 `#f6f6f8`, doodle 28, title 15.5/600, value 15/600, delta 12/600 (pink over, green under).
- `GuideNote` (Pon) at top 556: "Swap Day 7's beach club for Pantai Gunung Payung and you're back on track."
- **Footer**: "Raise budget" `GreyPill` (flex h52), "See Pon's swap" `InkPill` (flex h56).
- **Motion**: on enter, the bar grows from 0 (Smooth) and the striped over-part slides in after the ink fill reaches the marker. "$686" and the deltas roll (Odometer).
- **Taps**: See swap → the plan fix (part 4.G); Raise budget → a half-sheet stepper or amount keypad; a category → its expenses (7.23 filtered); ⋯ → budget settings.

## 4. Components

### (a) Foundations components used

- Screen types: Root (7.01, 7.02, 7.16, 7.17), Push (most screens), Sheet with grabber (1.06, 7.05, 7.08, 7.19), Full screen ✕ (7.11, 7.18), Alert (delete 9.08, cancel-if-edited), plus the iOS action sheet (7.15).
- Primary ink pill, pressed, disabled-with-reason (7.04, 7.20), destructive pink tint, small pills (Nudge, Add, Copy, Review), text buttons.
- 44 pt glass icon buttons, segmented control, toggle, chips, sticker tags, crew stack, cards and rows, guide note, toasts and banners (1.03), skeleton (1.02), empty state (1.01).
- Tab bar per `Tabs.dc.html`, and Foundations 1.07 stamp for 7.28.
- Already in the kit (`$R/apps/mobile/src/ui/`): `PillButton`, `Segmented`, `Toggle`, `Keypad`, `KeypadAmount`, `TextField`, `SearchField`, `SettingsGroup`, `Card`, `TileGrid`, `DashedAddCard`, `Sticker`, `GuideLine`, `OfflinePill`, `Skeleton`, `EmptyState`, `ErrorSheet`, `Grabber`, `KeyboardFooter`, `KeyboardScrollView`, `BalanceBars`, `Odometer`, `CountUp`, `LinearBar`, `PressScale`, `HeaderPill`, `BackEyebrow`.

### (b) New components this part needs

| Component | Metrics and states | Used by | Likely reused by |
|---|---|---|---|
| `TicketCard` | Card with a perforation: 2 px dashed `#e3e4e9` + notches 20–24 in the ground colour at ±30. Variants: `stack-front` (r26, 40/800 codes, 4-up stub at 17/700 + barcode band 52) and `detail` (r28, 44/800 codes, arc route, stub labels 10.5/700 +.08em). Status tag slot (on time / delayed / cancelled with strike-through at op .45). Lock glyph on private stub values. Dark: stays light. | 7.02, 7.10, 7.12, 1.13 | 6 (day-of flight), 3 (home next-up) |
| `PassFace` | Full pass: airline band (brand colour), codes 46/800, 4-up stub 19/700, divider, code slot (square 190 or wide PDF417), holder line with mono PNR. Always light. | 7.11 | 9 (Pass show mode), 6 |
| `NextUpCard` | Ink card h200 r30, eyebrow 12/700 +.1em at op .6, title 28/800, barcode band 40. | 1.06 | 3 Home |
| `CandidateCard` (re-skin) | Large (doodle 48, tags, Add/Ignore 40 pills) and compact (doodle 44, Add 36 pill). Leaves with Smooth slide and fade. | 7.03 | 3 Inbox |
| `ImportTile` | h120–124 r22–24, doodle 44–52 tilted, label + sub. | 1.06, 7.03, 7.16 (circle-icon variant h104) | 2, 4 |
| `KVCard` | Rows pad 11–12 × 16, key width 110–120 at 12.5 muted, value 14.5/600, optional mono. | 7.06, 7.13 | 9 |
| `FieldCard` | Label 12/600 + big value 26–30/700–800 + helper. States: default, focused (sky caret 2.5×26), error (2 px pink ring + glow, pink label and helper), found (booked tag). | 7.04 | 2 (pass form), 4 |
| `SuggestBanner` | h46 r23 sun tint, critter 32 in a sun circle, text 13, ink pill action h34. | 7.04 | 4.G fixes, 2 |
| `RoomCard` / `RoomSeat` | Bed tile 40, name 14.5/700, nightly 12 tabular. Seats w52: `Av` 44 + name 11.5/600. Drop-target ring, empty dashed seat, origin ghost, lifted avatar (−8°, 1.12, 3 px white ring, shadow). | 7.08 | 4.B setup rooms (same feature) |
| `SplitTiles` | Mini segmented (h30 r15) + tiles r14 ground, label 11/600, value 16/700 tabular (Odometer). | 7.08 | 7.22 |
| `YourRoomHero` | h196 r30 tinted gradient, doodle 96, eyebrow, 28/800 title, share on the right. | 7.09 | – |
| `RequestCard` | Avatar 36, title and body, a status tag with a clock (tangerine tint) + Cancel request. | 7.09 | 3 crew requests |
| `OptionList` | Rows h66 with a radio 22 (ring or ink check), "Best" tag, scarcity sub-colour, highlighted gradient row. | 7.12 | 4 votes, 6 disruptions |
| `InsuranceCard` (re-skin) | h200 r24 gradient sky, rotated −3°, label/value pairs, heart doodle. | 7.13 | 9 Help |
| `ActionSheet` | iOS group r26 white .97, header 13/600, rows h56 18/400, destructive `#d6337f`, a separate Close h58 r22. | 7.15 | everywhere ⋯ |
| `MoneyHero` | Ink-navy variant (h168 r30, gradient, 46/800, crew stack + line, doodle) and white variant (h124 r28, 52/800). Odometer value. | 7.16, 7.17 | 3 Home money glance |
| `BalanceBars` (re-skin) | Rows h32, centre line, bar h12 r6, mint or tangerine, zero stub 4 px `#d0d1d8`, value width 62 tabular. | 7.17 | – |
| `AmountDisplay` | Currency 30/700 muted raised 10 + digits 50/800 tabular + ≈ line 14 muted. Odometer per digit, re-centring with Smooth layout. | 7.18 | 4 budget set, 9 |
| `PayerRow` | `Av` 36 ×n, selected ring 2.5 ground + 4.5 ink, others at op .45. | 7.18, 7.20 | 5 polls |
| `ReceiptLineRow` | h56, label 15, `Av` 22 stack, amount width 72 tabular. Suggested-row tint (`#fff6c9`, 600/700 `#8a6a0c`) with a "{guide} found it" badge. | 7.20 | – |
| `MismatchBanner` | h62 r20 `#fff6f9` + pink inset, ✕ circle 34, title 14.5/600 pink + sub 12.5. Collapses on resolve. | 7.20 | 4 conflicts |
| `PaymentRow` (re-skin) | From `Av` 36 → arrow → to `Av` 28, amount 18/700, status colour, Nudge pill. | 7.24 | – |
| `PayoutQrCard` | r30 card, QR r16 with a centre brand badge 44, caption. | 7.25 | 9 |
| `StepTimeline` | Nodes 22 (done mint+check / current sun ring 3 / next grey ring 2), connector 2×30, title 14.5/600 + sub 12. | 7.26 | 6 ride states, 9 orders |
| `ExpandableMethodRow` | Collapsed h62; expanded with a tinted gradient and a 2-field grid (h52 r16, focused ink ring 2). | 7.27 | 9 account forms |
| `SquareStamp` | 220 circle stamp, 3 px border, mono rings, 42/900 word; lands via 1.07. | 7.28 | 8 stamps |
| `BudgetBar` | h14 r7 track, ink fill, striped over-part, planned marker 2×26, 3 labels. | 7.29 | 4.B budget |
| `CategoryDeltaRow` | Tile 40 `#f6f6f8`, doodle 28, value + delta (pink over, green under). | 7.29 | – |
| `DayGroupList` | Group head (label + total) + card of rows (doodle 34–40). | 7.14, 7.23 | 8 |

## 5. Motion and transition inventory

Part 7's HTML has **no keyframes** apart from the 7.04 caret blink. Every other entry below comes from Foundations rules and the 1.06 filmstrip.

| Trigger | What moves | Properties | Spring / timing | Evidence | Platform mapping |
|---|---|---|---|---|---|
| Tap `+` (Bookings) | `+` → "Add a booking" sheet; page steps back | `+` opacity 1→0, rotate 45°, scale 1.2; sheet clip from the `+` rect to the sheet rect (r30→46); page scale .92, y +14, dim (brightness .8 ≈ black overlay .2), corner r→40, origin top; content y 16→0, opacity 0→1 delayed ~50% | Smooth (demo bezier `.32,.72,0,1`); content `(.2,.9,.3,1)` | `$SP/film/07/strip-1.06-open.png`, `strip-1.06-close.png` (frames `p5-f00..11`) | Custom Reanimated: a shared-element clip over a transparent modal; the page step-back needs the root view transformed (iOS 26 has a zoom transition from a source view on iOS only, but not this clip-grow shape). Android: same custom. |
| Close sheet (swipe or ✕) | Reverse; content fades first | as above | Smooth; follows the gesture velocity | strip close | Custom; the gesture drives progress |
| Tap `+` (Money) | Same morph into add expense (Q2) | as above, sheet full height | Smooth | inferred | Custom |
| Bookings ↔ Money switch | Thumb slides; halves swap | thumb x; content opacity | Snappy (thumb); content 150 ms cross-fade | `Seg` 7.01/7.16 | `Segmented` + Reanimated; the current halves swap with no transition (`stack/wallet-halves.ts`) |
| Stack: tap a closed header | Card comes to the front, others re-stack | y, scale, z | Smooth | 7.02 | Existing `BookingDeck` springs; re-tune to Smooth |
| Stack: pull down | Cards fan apart (rubber-band) and spring back | gap | Snappy on release | existing | Existing |
| Push any detail | Standard push, tab bar hides | x, parallax | native push | Foundations screen types | JS stack `pushTransition`; hide the tab bar on push (changes today's behaviour) |
| Boarding-pass row or barcode → 7.11 | Card zooms to the full pass; ground fades dark; chrome fades in | shared-element bounds, bg opacity | Smooth | 7.10 → 7.11 | Custom shared element (1.05 zoom pattern) |
| 7.11 open | Brightness to max | system window brightness | instant on mount | text "brightness up" | `expo-brightness` (exists) |
| Validation error (7.04) | Ring and helper appear | ring opacity and width, helper height | Snappy; + warning haptic (recommended) | 7.04 | RN |
| Caret | Blink | opacity | 1000 ms loop | `tg-motion fx=blink dur=1000` | System caret (`selectionColor` sky `#4f86ff`) |
| Flight lookup found | "Found it" tag pops; fields fill | scale .8→1; per-field cross-fade | Snappy pop; Smooth fill | 7.04 | RN |
| Candidate Add / Ignore | Card leaves; list closes the gap | x / opacity, layout | Smooth | 7.03 | Reanimated layout |
| Room drag | Lift, follow, drop | scale 1.12, rotate −8°, shadow; target ring; land | Snappy lift; Lively land; Smooth reflow; spring-back Smooth | 7.08 | Gesture Handler pan + Reanimated (existing `draggable-avatar.tsx`) |
| Split values change (drag, By room ↔ Evenly, currency) | Per-digit roll | Odometer columns | Smooth (re-time from today's 650 ms bezier) | 7.08, 7.17, 7.22 | Existing `Odometer` / `useOdometer` |
| Balances load / sync / currency switch | Hero rolls; bars grow from centre | Odometer; bar width | Smooth, 30 ms stagger | 7.17 | Existing `BalanceBars` + `Odometer` |
| Keypad digit / ⌫ | Digit rolls in or out; number re-centres; ≈ line rolls | per-digit y; container x | Smooth; selection haptic | 7.18 | Existing `AmountEntry` |
| Description focus (7.18) | Keypad slides out, keyboard in; CTA docks | y | Smooth / keyboard curve | 7.18 | `react-native-keyboard-controller` style footer (`KeyboardFooter`) |
| Receipt result | Sheet rises; sticker drops | y; scale/rotate | Smooth; Lively | 7.19 | Bottom sheet + Reanimated |
| Mismatch resolved | Banner collapses; CTA enables | height/opacity; colour | Smooth | 7.20 | Reanimated |
| Payment confirmed | Node fills + check pop; connector draws; amounts roll | fill, scale, height | Lively pop; Smooth draw; success haptic | 7.26 | Reanimated |
| Toast | Rises, waits ~2.5 s, leaves | y, opacity | Smooth | 7.26, 7.19 (Undo) | 1.03 toast (existing island toast) |
| All square | Stamp drops, squashes, inks; confetti; Tokek pops | y, scale, ink opacity | Lively | 7.28 + Foundations 1.07 | Existing `motion/patterns/stamp.ts`, `confetti.tsx` |
| Settled Tokek reveal | Silhouette → sticker | opacity/scale | Lively | 7.24 | Existing `SettledTokekReveal.tsx` |
| Budget enter | Bar grows; over-stripes slide; numbers roll | width; x | Smooth | 7.29 | `LinearBar` + Odometer |
| Reduce Motion (all) | Everything above | – | 150 ms cross-fade; stamps land without falling | Foundations | `useMotionMode` (exists) |

**Numbers never jump.**
- Every money figure uses tabular figures (the design sets `font-variant-numeric: tabular-nums` on all amounts) and rolls with the existing per-digit Odometer.
- That covers heroes, shares, split tiles, the keypad amount, the ≈ line, budget figures, bar values and settle amounts.
- Today's Odometer runs a 650 ms bezier timing with a 30 ms digit stagger (`motion/patterns/odometer.ts`). Foundations allows only springs, so drive the columns with **Smooth** (no overshoot) and keep the 30 ms stagger. See Q11.

## 6. Native platform surfaces

| Surface | Design | Today | Change |
|---|---|---|---|
| **Add to Apple Wallet / Google Wallet** | 7.10 and 1.13 primary, 7.11 and 7.15 actions | Nothing: no module in `apps/mobile/modules/` (cp-ocr, cp-live-activity, cp-widgets, cp-notifications, … have no PassKit). `phase-34` decided "`.pkpass` / Google Wallet export not designed — default: not built" (`plans/260926-1718-critterpass-full-build/phase-34-bookings-wallet-import.md:235`). | New native module `cp-wallet-pass`. iOS: `PKAddPassesViewController` + `PKAddPassButton`; canAddPasses checks. Android: Google Wallet `PayClient.savePasses` or the "Save to Google Wallet" JWT link. Pass source: (a) pass-through of an airline `.pkpass` attachment when the email had one; (b) a CritterPass-signed generic boarding pass from `barcode_payload_enc` + BCBP fields (`packages/domain/src/bcbp`), which needs a Pass Type ID cert and a signing endpoint. Founder call (Q7). |
| Screen brightness | 7.11, 1.13 | `bookings/boarding-pass/use-full-brightness.ts` (expo-brightness, window only) | Keep; add keep-awake while open. |
| Document scanner / camera | 7.01, 7.03, 7.13, 7.19 | `modules/cp-ocr` (iOS Vision + VNDocumentCamera, Android ML Kit + doc scanner; barcodes pdf417/aztec/qr) | No change; re-skin the camera chrome (dark Clear glass). |
| Phone dialer | 7.12, 7.13 | `Linking` tel: | – |
| Google sign-in (mailbox) | 7.05 | `bookings/mailbox/oauth.ts` | – |
| System share sheet | 7.07, 7.09, 7.10, 7.11, 7.28 export | RN Share | Share the pass image and times; never the seat or barcode to the crew. |
| iOS action sheet | 7.15 | none (SettingsGroup rows) | `ActionSheetIOS`; an Android bottom-sheet list. |
| Notifications | "Tokek pings you when boarding opens" (7.02); "reminds you the day before" free cancel (7.06); crew told (7.07, 7.08, 7.12, 7.21); nudges (7.24, 7.26) | Boarding pushes `services/worker/src/jobs/flights/pushes.ts`, `boarding-schedule.ts`; free-cancel `services/worker/src/jobs/bookings/deadline-reminder.ts`; nudges exist | Copy and visuals per the part 9 / Foundations notification spec; no new jobs except the peer swap and the room-split change (§7). |
| Live Activity / widget | Not drawn in part 7 | `targets/widgets/LiveActivities/FlightLiveActivity.swift`, `Widgets/NextFlightWidget.swift` | Owned by parts 3 and 6. |
| Alerts | Delete (9.08), cancel-if-edited, disconnect mailbox | system/kit alerts | Part 9 owns 9.08. |

## 7. Logic and backend gaps (only what the design shows that `$R` lacks)

1. **Flight-number lookup that fills the times** (7.04 "Found it · Singapore Airlines · A350 · times filled in").
   - No endpoint exists; AeroDataBox is used only for status polling (`services/worker/src/jobs/flights/flight-poll.ts`, `adb-budget.ts`).
   - Needs `GET /flights/lookup?number=&date=` returning carrier, equipment, airports and scheduled times, under the existing ADB budget.
2. **Airport "Did you mean"** (7.04).
   - Client-only. Fuzzy-match on `@cp/domain` airports search (`packages/domain/src/airports/search.ts`) plus the bundled zones (`@cp/content/airports`).
   - No backend.
3. **Same-fare alternative flights with seat counts** (7.12).
   - No data source; the disruption policy makes rebooking a link (`packages/planner/src/disruption/classify-actions.ts:7`).
   - Seat availability is not in AeroDataBox or AeroAPI. Needs a founder decision (Q10).
4. **Peer room swap with two yeses and a pending state** (7.09).
   - `request_room_swap` only notifies the organiser (`services/api/src/commands/setup/room-prefs.ts:4-5`).
   - Needs a target user, `respond_room_swap`, a pending row, auto-apply on both yeses, and a cancel.
5. **Stay expense split by room that follows the room plan** (7.08 "By room / Evenly", 7.22).
   - `expenses.split_mode` is equal/weights/fixed/items only (`docs/data-model.md:272`).
   - `@cp/cost-engine` `rooms/split.ts` `splitStay` exists, and `room_plans.stay_booking_id` links the booking.
   - Needs a `rooms` split mode (or a booking-sourced expense recomputed on every room change), with top-up and refund lines for anyone who already paid.
6. **Add to Wallet pass** (7.10, 7.11, 7.15): a native module and possibly a `.pkpass` signing endpoint (§6).
7. **Booking "Mark as not ours" and "Open in the airline app"** (7.15).
   - Not ours: likely `edit_booking` visibility→personal or delete; semantics in Q12.
   - Airline app: needs an airline → app-link/store-id catalogue (content data).
8. **Export CSV / PDF** (7.28).
   - Nothing exists (no `csv` in the money feature).
   - CSV can be built client-side from synced rows. PDF needs `expo-print` or a server render.
9. **Default payout method** (7.27 "Default · fastest", "Makes it the one people see first").
   - No ordering or default field in `packages/domain/src/payout/catalogue.ts`. Needs a small server field.
10. **Undo after "Split evenly"** (7.19).
    - Client: delete the just-created expense through the existing delete (hide + reverse).
    - No backend unless the toast must survive offline (it queues anyway).
11. **Mid-trip budget swap suggestion** (7.29 "See Pon's swap").
    - The planner has OVER_BUDGET repair targets for drafts (`packages/planner/src/draft/repair-targets.ts:75`).
    - Nothing triggers a swap from actual spend versus forecast during the trip. Needs a guide job or a reuse of 4.G fixes.
12. **Stay photo on the booking detail** (7.06).
    - `bookings` has no photo or POI reference. Match the stay to a POI photo or fall back to a tinted header.
    - Small, client- or data-side.
13. **Wallet search and archive search / trip grouping** (7.01, 7.16 search buttons; 7.14). Client-only over synced rows.

## 8. Open questions

1. **Which Wallet root?**
   - 1.06: "Wallet", dark next-up card, rows, `+` as a bottom-right button, no switch.
   - 7.01/7.16: "Wallet" with search, header `+` and the Bookings | Money switch.
   - 7.02/7.17: "Bookings"/"Money" titles, older generation.
   - Recommendation: the 7.01 header and switch, with 7.02's stack as content (its front card is 1.06's "next up"). The 1.06 morph then grows from the header `+` at the top-right instead of a bottom-right button.
2. **What does `+` do on the Money half?** A choice sheet (Scan receipt / Type it in / Set a budget, matching the 7.16 tiles) via the 1.06 morph, or straight to 7.18?
3. **7.18 is a form drawn as a full screen with ✕ and no grabber.** Foundations says forms are full-height sheets with Cancel left and a bold verb right. Keep ✕ plus the bottom ink CTA?
4. **Pushed screens with large titles and a back eyebrow** (7.03, 7.13, 7.14, 7.23, 7.24) versus the Foundations push rule (inline title). Allowed variant or fix?
5. **Sheet header buttons are inconsistent**:
   - 1.06: ✕ on the right.
   - 7.05: grabber only.
   - 7.08: blue text Cancel/Save in `#2f5fc4`, while every other verb is ink.
   - 7.04 and 7.20: Save as a grey pill or grey text in a push header.
   - Pick one.
6. **Enabled Save style in a push header** (7.04, 7.20): ink pill or ink text?
7. **Add to Wallet**:
   - Build it, and which source: pass-through `.pkpass` only, or CritterPass-signed generic passes?
   - Apple requires the official "Add to Apple Wallet" badge, not a custom ink pill. Accept the badge on 7.10?
8. **1.13 dark**: should the ticket notches (`#f5f5f7`) and the dark toggle knob (`#1c1d24`) match dark tokens? iOS keeps knobs white.
9. **Barcode slot**: the design draws a square QR, but most boarding passes are PDF417 or Aztec. Use a wide slot (about 300×100) for PDF417?
10. **7.12 alternatives**: the product rule is "rebook is a link, never an action", and no source gives seat counts. Options:
    - (a) drop the list and keep "Rebook with the airline" plus impact;
    - (b) show schedule-only alternatives without seats or fares;
    - (c) a new data vendor.
11. **Number roll timing**: move the Odometer from 650 ms bezier to the Smooth spring (Foundations: only springs animate)?
12. **"Mark as not ours"** (7.15): make it personal, delete it, or return it to the inbox as a rejected candidate?
13. **Data inconsistencies in the frames** (fix the copy before goldens):
    - forward address `bali6@` (7.01, 1.06) vs `bali-six@` (7.03);
    - Alex (7.02, 7.17) vs Ari (7.08, 7.09, 7.12) for "A";
    - Ray (7.07–7.09) vs Rin (7.17, 7.21) for "R";
    - 7.21 Maya "+$56.83" should be +$54.56 with Jordan left out (5 sharers × $13.64);
    - 7.29 "$1,020 … about $220 over" is $420 over a $600 plan;
    - IDR is written "450.000" (7.18, 7.19) vs "448,000" (7.20). Format by locale (`money/format.ts`), never mixed;
    - 7.25 "Back → Settle up (7.16)" should be 7.24;
    - 7.09 room pairs differ from 7.07 (fine as a later state).
14. **OFF-TOKEN values to map or approve** (most recurring first):
    - Secondary text `#3d404c`.
    - Disabled/dim `#9a9daa`, `#8a8d99`, `#c4c6ce`; divider `#e3e4e9`.
    - iOS fill `rgba(118,118,128,.12/.14)` for secondary buttons and switches (token control `#f1f1f4`).
    - Avatar initials `#17142a`.
    - Toggle green `#34c77b`.
    - Tangerine tint `#fff1e6` / text `#a8501a`; sun tint `#fff6c9` vs token `#fff3c4`; `#3d3210` note text.
    - Error banner `#fff6f9`; pink accents `#e0468e`, `#ff8cc0`.
    - Money navy `#1f2a52→#2f3a6e`; `#7b2d8e` (PayNow brand) and `#1f2a52` (SQ brand) are brand colours, keep them.
    - `#174a35`, `#2e9a74`, `#6b5a24` (Borel line, 13 px vs Guide 15).
    - 7.11 ground `#0e1020`; 7.06 photo-button glass `rgba(255,255,255,.2)`.
    - Glass buttons at .62/blur 18 vs the .56/blur 24 token.
    - Type sizes off the scale: 32/700 titles (Display 34), 15.5/600 row titles (Headline 16), 14.5, 13.5, 30/800 and 28/800 heroes.
15. **Keyboard states are not drawn in part 7.** This spec applies the 2.05/4.02 pattern: return key = the screen's next step, primary docked above the keyboard, drag to dismiss. Confirm, or ask for drawn frames for 7.04, 7.18 (description), 7.20 and 7.27.

```
Status: DONE_WITH_CONCERNS
Summary: Wrote the build spec for Part 7 (29 wallet screens plus Foundations 1.06 and 1.13): screen table mapped to the existing routes, per-screen specs with exact measurements, components, motion (with a 1.06 filmstrip), native surfaces, a short gap list and open questions.
Concerns/Blockers: The design file mixes two generations (the Wallet root is drawn three ways); part 7 draws no keyboards and no number motion, so those parts follow Foundations and existing app patterns; Add to Wallet, peer room swap, the room-based stay split and 7.12's rebook list need founder decisions or backend work.
```
