# Design Analysis — 3h Bookings · 3i Money · 3j Guide (12 screens)

Date 2026-09-26. Sources: `design/Critterpass.dc.html` (screen slices 450837–547460), `Critterpass Prototype.dc.html` (x-dc script: behaviour map `F`, helpers `keypad/paid/slideOff/trans`), `doodles.js` (tg-motion/tg-type), screenshots, sections.json, requirements brief. Cross-checked against 3e-3, 3g-1, 3k-*, 3m-6, 3n-2/8, 4a/4b/4e, 5a-3, 5b-1, 5c-5 where they touch this slice.

---

## 1. Slice overview

**User goals**
- 3h: keep every booking (flight, stay, activity, boat, transfer, insurance) in one offline wallet; get bookings in with zero typing (forward email / auto-found in crew inboxes / scan / paste); move between places with a tracked ride + a local-language phrase card for the driver.
- 3i: log shared spend in any currency (keypad or receipt scan), see who owes whom in one crew currency, settle with the fewest payments, track spend vs plan with a forecast.
- 3j: ask the guide by text, voice, or camera; get answers as concrete plan changes; push those changes to the crew as a vote (or apply only to self).

**Navigation (from prototype `PARENT`/`F` map + tab wiring)**
- Tab bar (5 slots): HOME → Home · TRIPS → Trip hub · centre gecko button → Guide chat **as sheet** (long-press centre button anywhere → 3k-6 Help per 3k-6 caption) · WALLET → 3h-1 Bookings · PASS → Your pass.
- WALLET tab is highlighted on 3h-1, 3i-1 and 3i-6 → Money lives under Wallet too, but no Bookings↔Money switcher is drawn (see §8).

| Screen | In from | Out to |
|---|---|---|
| 3h-1 Bookings | WALLET tab; 3k-1 Trip hub BOOKINGS card ("9 SAVED all offline"); 3k-2 Day-of "Tickets in Bookings"; 3k-6 Help (insurance card lives here) | REVIEW → 3h-2; card tap → booking detail (not designed) |
| 3h-2 Add a booking | 3h-1 REVIEW; push "found N bookings" (implied) | ← Bookings; ADD slides card into wallet stack |
| 3h-3 Getting around | 3e-1 Trip plan "ARRIVE + POOL" day; 3j-1 CALL A CAR; 3k-6 Help GO; 5a-3 Flight-day LA flips to pickup | ←; BOOK later ride (creates split expense); chat bubble → driver chat (not designed) |
| 3i-1 Balances | 3k-1 MONEY card; 3g-1 expense card VIEW; 5b-1 "Balances" notification; 5c-5 Balances widget | SETTLE → 3i-5; SCAN → 3i-3 (sheet); ADD → 3i-2 (sheet); BUDGET → 3i-6; LATEST row → expense detail (toast only) |
| 3i-2 Add an expense | 3i-1 ADD; 3i-4 TYPE THE LINES (prototype routes here) | SCAN INSTEAD → 3i-3 (fade, replace); ADD → back to 3i-1 |
| 3i-3 Scan a receipt | 3i-1 SCAN; 3j-3 SPLIT THE BILL; 3i-4 RETAKE | SPLIT IT → back to 3i-1; ✕ |
| 3i-4 Couldn't read it | failure state of 3i-3 | TYPE THE LINES → 3i-2; RETAKE → 3i-3; SPLIT EVENLY → 3i-1 |
| 3i-5 Settle up | 3i-1; 3b-4 Inbox "Jordan paid you back"; 4c-1 Boost "SETTLE $2"; 3n-9 Delete account "SETTLE UP" | ← Money; NUDGE; REMIND EVERYONE |
| 3i-6 Budget | 3i-1 BUDGET | ← (tab bar present) |
| 3j-1 Guide chat | centre tab; 3l-1 Egg hatch SAY HI; 3g-1 "Message, or @tokek"; 5a-5 Dynamic Island ASK TOKEK; 5b-1 evening roundup notif; 4b-1 Out of questions is its limit state | PROPOSE TO GROUP → 3g-1 crew chat vote; JUST ME (apply privately); CALL A CAR → 3h-3; TRANSLATE A MENU → 3j-3; PHARMACY → 3k-6; hold input → 3j-2 |
| 3j-2 Voice | hold input bar in 3j-1 (prototype hold threshold 320 ms) | SEND TO THE GROUP → 3g-1 |
| 3j-3 Point and ask | 3j-1 TRANSLATE A MENU | SPLIT THE BILL → 3i-3; ORDER FOR 6 → order card (not designed) |

**Global motion tokens (prototype, reuse app-wide)**: standard ease `E = cubic-bezier(.32,.72,0,1)`; sheet in 540 ms (underlay scale .93, scrim 0→.45), dismiss 420 ms; push 480 ms (outgoing −30% X); fade 300 ms ease-out; tab 240 ms fade + children rise 12 px/420 ms; in-app toast = Dynamic-Island-shaped morph 122×35 → 360×62, 440 ms `cubic-bezier(.2,1.25,.3,1)`, auto-hide 2.8 s, guide avatar icon; `slideOff` 360 ms `translateX(110%) rotate(4deg)` `cubic-bezier(.5,0,.75,0)` then height collapse 320 ms E; `flap` (label rotateX flip + text swap at 170 ms) 340 ms; `pop` scale 1.12 360 ms; `shake` 420 ms (−8/7/−5/3 px); `drop` −18 px→0 380 ms `cubic-bezier(.3,1.5,.5,1)`; `count` number tween 700 ms ease-out-cubic. tg-motion default ease `io = cubic-bezier(.65,0,.35,1)`; presets: bob ty 0→−6 2400 ms, ping s.6/o.8→s1.5/o0 ease-out 1800 ms, blink o1→.25 1200 ms, grow sx0→1 in first 40% ease-out. Reduced-motion: all loops disabled (tg-motion checks `prefers-reduced-motion`) — keep that contract.

**Palette/typography used in slice**: bg `#17142a`, surface `#1f1b38`, chip `#2c2750`, hairline `#3a3466`, text `#f4efe4`, muted `#a9a3c0`, dim `#6f698c`; accents yellow `#ffd84a`, pink `#ff5fa8`, blue `#4f86ff`, green `#54d6a4`, orange `#ff9a4d`. Member colour tokens are stable per crew (W cream, M pink, A blue, J yellow, R green, D orange) and reused in avatars, receipt rows, settle rows. Fonts: Archivo 900 condensed (`font-stretch` 64–80%) for headings/numbers, Geist body, Geist Mono for receipt/email, **Caveat = the guide's voice** (every guide utterance), tabular-nums on amounts.

---

## 2. Per-screen spec

### 3h-1 Bookings
- **Purpose**: trip wallet; soonest-relevant booking expanded on top.
- **UI**: header "BOOKINGS" + green chip "✓ 9 OFFLINE"; stacked card deck (collapsed cards 58 px offset each, 200 px tall, colour by type: activity yellow/volcano, boat green, stay pink/bed, flight blue/plane); expanded flight card 346 px: `SQ 938 · MON 12 OCT` + status `ON TIME`, IATA codes 64 px condensed with times, grid BOARDS/GATE/SEAT/BAG, dashed tear line, barcode tile 74×74 + crew-on-flight line; guide nudge banner (dashed border, gecko "cheer", Caveat) "Found 2 bookings in Alex's inbox… REVIEW"; tab bar (WALLET active).
- **Data**: Booking{type, title, start local time, nights}, Flight{carrier, flightNo, date, dep/arr IATA, sched times, status, boardingTime, gate, seat (per viewer), bagAllowance, barcode payload}, co-travellers (crew members with same flight segment), offline count, pending import candidates count + source member.
- **Actions**: tap collapsed card → bring to front/expand (implied); pull-down → cards fan apart, spring back on release; REVIEW → 3h-2; barcode tap → full-screen boarding pass (implied, not drawn).
- **Motion**: pull-down rubber-band fan (card offsets scale with drag distance, spring return); 3 h before boarding the flight card "brightens" (raise screen brightness while barcode shown) and pins to lock screen (Live Activity, see 5a-3).
- **States designed**: populated + pending-imports banner. **MISSING**: empty wallet (no bookings), loading/sync, offline (only the badge implies it), flight DELAYED/CANCELLED/GATE CHANGE card variants (delay handled in 3k-5 but card not drawn), past bookings/archive, multiple trips, booking detail/edit/delete, barcode unavailable (email had no pass), other booking types (insurance card referenced by 3k-6, rail, car hire).
- **AI**: none on-screen beyond banner copy; background: import parsing (3h-2), boarding notifications.
- **Realtime**: new candidate from any crew member's inbox → banner appears for all crew; flight status push updates card.
- **OS hooks**: Live Activity (push-to-start ~T−3 h), notification "boarding opens", screen brightness, offline storage, possibly Add-to-Wallet (.pkpass) — not designed.
- **Gates**: wallet + manual free; email-found items are Pass+ ("Bookings from email": Free –, Pass+ ✓, Boost – in 4e-2/4b-2); Flight-day Live Activity from email = Pass+ (5a-3 "PASS+ · from your email"); NEXT FLIGHT widget Pass+ (5c-5).

### 3h-2 Add a booking
- **Purpose**: three import channels + review crew-found candidates.
- **UI**: back "← BOOKINGS"; title; 3 tiles (FORWARD yellow "Any email", SCAN pink "Paper or screen", PASTE blue "A link or code"); per-crew inbound address pill `bali-six@in.critterpass.app` + COPY; section "FOUND IN YOUR CREW'S INBOXES · 2"; candidate card (boat icon, "KURA KURA FAST BOAT", "Fri Oct 16 · Sanur → Penida · 6 seats · $228", chip "FROM ALEX'S EMAIL", toggle "Split 6 ways" (on), ADD / IGNORE); compact candidate (car, "AIRPORT TRANSFER Mon Oct 12 · 11:40 · paid by you · $36", ADD); guide footnote "I check for new confirmations every morning. You can switch that off in Settings."
- **Data**: CrewInboundAddress; ImportCandidate{source (forward|mailbox|scan|paste), sourceMemberId, parsed fields + per-field confidence, seats, price+currency, payer, split default, status}.
- **Actions**: COPY → clipboard, chip flaps to "COPIED", toast "Forward any confirmation to that address."; FORWARD → (implied) open mail compose / instructions; SCAN → camera (boarding pass barcode / ticket OCR / screenshot picker); PASTE → paste link/code; ADD → booking created (+ expense created & split N ways if toggle on and price present), card slides off (prototype slideOff), toast "Added to the wallet."; IGNORE → slide off, candidate dismissed for crew.
- **Motion**: parsed bookings assemble field-by-field as the guide "reads" them (fields fill sequentially like typing — reuse tg-type cadence or per-field reveal 460 ms E stagger); ADD slides card into the wallet stack (shared-element move to 3h-1 deck, or slideOff in prototype); toggle snap with overshoot (3n-2 note).
- **States MISSING**: parsing in progress (the assemble animation is the only hint), parse failed/unsupported email, duplicate detected ("already in wallet"), scan camera permission denied, paste empty/unrecognised, no candidates, Pass+ locked state for inbox scanning, crew member who hasn't connected email.
- **AI**: LLM structured extraction from email HTML/PDF/image → Booking JSON {type, vendor, dates, tz, places, pax/seats, price, confirmation code, payer}; background job (mailbox daily scan); output validated against schema + dedupe.
- **Realtime**: candidates visible to whole crew; ADD/IGNORE by one member resolves for all (who is allowed? see §8).
- **OS hooks**: pasteboard (use paste control to avoid iOS paste prompt), camera + barcode (PDF417/Aztec/QR — IATA BCBP), photo picker for screenshots, share extension (not designed but natural for "Any email"/PDF), mail compose.
- **Gates**: mailbox auto-scan = Pass+. Forward-to-crew-address gating unclear (§8).

### 3h-3 Getting around
- **Purpose**: live ride leg (airport → villa) + next leg booking + phrase card for driver.
- **UI**: top 440 px map (dark grid placeholder "map · Ubud"), origin blue dot, dashed yellow route (2 segments), destination pin "VILLA" (pink, bed icon), car marker (yellow circle 46 px, car doodle); back button + pill "AIRPORT → VILLA · 1H 05M"; bottom sheet (radius 32): driver avatar "M" orange, "MADE IS 4 MIN AWAY", "White Avanza · DK 1234 AB · booked by Tokek", chat button; ETA progress bar 8 px; phrase card (cream) "SHOW THIS TO MADE" + play button, local text 20 px "Tolong ke Villa Kayu Manis, Jalan Raya Sayan, Ubud.", gloss "Please take us to…"; "LATER TODAY" row "VILLA → WARUNG BIAH BIAH · 12 min by car · Rp 60k, split 6" + BOOK.
- **Data**: Ride{leg from/to, provider, driver name/photo, vehicle model/colour/plate, status, ETA, driver location stream, bookedBy (guide), price, split}; PhraseCard{lang, text, gloss, destination address, audio}; upcoming legs derived from plan items.
- **Actions**: play → TTS reads phrase in Indonesian (prototype: glow + toast "Reading it out in Indonesian."); BOOK → flap "BOOKED ✓", toast "Car booked. Rp 60k, split six ways." (creates Ride + Expense split 6); chat → message driver; ← back.
- **Motion**: car creeps along route in real time (proto kf `tx0 ty0 → tx40 ty-32`, linear, 8000 ms); ETA bar drains with it (`sx1 → sx.15`, linear, 8000 ms, origin left). Production: interpolate between GPS fixes along polyline, bar = remaining/total ETA.
- **States MISSING**: searching for driver, driver arrived, in-trip, completed, cancelled/no driver, driver late, ride-provider unavailable in country (deep-link fallback), location permission denied, offline (phrase card must work offline — 3k-4 lists "Phrase cards"), audio muted/silent switch, BOOK failure/price change.
- **AI**: guide books rides autonomously ("booked by Tokek"); LLM writes phrase card (address + politeness register in local language, gloss in app language); TTS voice.
- **Realtime**: driver position/ETA pushed to all crew in the car; ride booked visible in crew chat/money.
- **OS hooks**: maps SDK, location (blue dot), audio playback that ignores silent switch (playback audio session), TTS (on-device or pre-rendered), haptic on arrival, Live Activity for ride (not designed — 5a-3 flips flight LA to pickup: "Made is at door 3 with a sign"), notification "driver 4 min away", large-type/landscape "show to driver" mode (implied by "SHOW THIS TO MADE").
- **Gates**: none shown.

### 3i-1 Balances
- **Purpose**: money home: net position, per-member bars, entry to settle/scan/add/budget.
- **UI**: header "MONEY · $4,812 SPENT" + currency chip "USD"; "YOU'RE OWED" + $186.40 (84 px yellow condensed); gecko "think" bobbing (2600 ms); diverging bar chart card (OWES ← centre line → IS OWED; rows: name, left bar pink, right bar yellow(you)/green(others), signed amount coloured); primary CTA "SETTLE IN 3 TAPS"; 3 tiles SCAN / ADD / BUDGET; "LATEST" row (food icon, "BABI GULING, IBU OKA", "Rp 1.08M · Maya paid · Jordan skipped the pork", $68.20); tab bar.
- **Data**: crew settlement currency; total spent; per-member net balance (sum = 0: +186.40 +41.00 +0 −41.00 −92.10 −94.30 ✓); latest expense (original amount+currency, payer, exclusions, converted amount). Bar width = |net| / max |net| **per side** (You 100%, Maya 22% = 41/186.4; Alex 100%, Jordan 98%, Rin 44% = 41/94.3).
- **Actions**: SETTLE → 3i-5 (label count = number of simplified payments); SCAN → 3i-3 sheet; ADD → 3i-2 sheet; BUDGET → 3i-6; LATEST row → expense detail (prototype toast only); USD chip → currency switch (implied).
- **Motion**: bars grow out from centre line whenever a new expense lands (scaleX from centre origin, grow preset feel: ease-out ~1.6 s); hero number rolls like an odometer (per-digit vertical roll; proto `count` 700 ms ease-out-cubic).
- **States MISSING**: no expenses yet, all settled (0.00 everywhere; 3m-6 shows "Everyone's square"), you owe (negative hero — label/colour), loading, offline with pending expenses (3k-4 outbox), multi-trip within crew, full expense history list, expense detail/edit/delete, currency chip behaviour.
- **AI**: "Jordan skipped the pork" is generated reason text from auto-split; otherwise deterministic.
- **Realtime**: any member's new expense/settlement → balances recompute & animate on all devices; push from sender "Balances" (5b-1).
- **OS hooks**: Balances widget (5c-5, free, "who owes who, and a nudge"), notifications, haptic on odometer settle.
- **Gates**: free ("splitting money… stay free for everyone"). Boost split IOUs appear here as expenses (4b-3: "$2 each goes into Balances").

### 3i-2 Add an expense
- **Purpose**: fast manual expense in local currency.
- **UI**: "← MONEY" + "SCAN INSTEAD" chip; "NEW EXPENSE · BALI SIX"; currency prefix "Rp" + amount 76 px (tabular, id-ID grouping "450.000"); conversion line "≈ $28.42 · $4.74 each"; description row (food icon, "Smoothie bowls, Clear Café", category "FOOD"); PAID BY avatar radio (6, selected = yellow ring `0 0 0 2px bg, 0 0 0 4px #ffd84a`); SPLIT segmented EVENLY / BY SHARE / CUSTOM; custom keypad 3×4 (1–9, "000", 0, ⌫); CTA "ADD RP 450K".
- **Data**: amount (minor units; IDR exponent 0), currency, FX rate (proto 15,835 IDR/USD), crew currency, description, merchant, category, payer, split mode + participants/shares, date/time, location, trip day.
- **Actions**: keypad: append digit (max 10 chars), ⌫ (to "0"), "000" quick thousands; payer tap → ring moves; split mode switch; ADD → validates >0 (else shake), creates expense, returns to 3i-1, toast "Added Rp 450.000, $4.74 each."; SCAN INSTEAD → 3i-3 (fade replace). CTA label shortens (1.08M / 450K), disabled at 0 (opacity .4).
- **Motion**: digits roll in like odometer (proto: amount re-renders with −6 px/opacity .5→1, 180 ms ease-out per key); conversion + per-share re-count under typing; PAID BY yellow ring slides to tapped avatar (shared ring element, spring); ADD drops new row into LATEST on 3i-1 and its bar grows from centre line.
- **States MISSING**: BY SHARE and CUSTOM editors (not drawn), description/category entry (keyboard? auto-suggest from plan location?), currency picker, date edit, exclude members, offline (rate cached; "Rates work offline" 3n-8), stale FX warning, validation on custom totals ≠ amount, editing existing expense.
- **AI**: likely auto-fill description/category from current plan item + location (not stated). Deterministic math.
- **Realtime**: on save broadcast to crew.
- **OS hooks**: haptic per key, custom keypad (no system keyboard), locale formatting.
- **Gates**: free.

### 3i-3 Scan a receipt
- **Purpose**: OCR receipt → itemised lines → auto-assign who had what → split.
- **UI**: full-bleed camera (✕, "AUTO-SPLIT ON" green chip); receipt (merchant "IBU OKA · UBUD", "14/10 · 13:12 · meja 4", lines "Babi guling x5 850.000", "Es kelapa x6 130.000", "Service 10% 100.000", TOTAL 1.080.000) with recognised lines highlighted `rgba(255,216,74,.55)`; green scan line; bottom sheet: gecko "point", "TOKEK READ 3 LINES", "Tap a line to change who had it."; rows with assignment (avatar stack W M A R D + pink chip "NOT JORDAN"; "EVERYONE"; "BY SHARE"); per-person result "Jordan pays $1.50 · Everyone else $13.34"; CTA "SPLIT IT · MAYA PAID".
- **Math verified**: pork 850k ÷ 5 (excl. Jordan); coconut 130k ÷ 6; service 100k allocated proportional to each person's subtotal → Jordan 21,667 + 2,211 = 23,878 IDR ≈ $1.51 → shown $1.50; others 191,667 + 19,558 = 211,225 ≈ $13.34 ✓. So "BY SHARE" on service = pro-rata by item subtotal. Rounding remainder rule needed.
- **Data**: Receipt{image, merchant, datetime, table, currency, lines[{label, qty, amount, kind item|service|tax, assignment, reason, confidence}], total}, payer, auto-split flag.
- **Actions**: tap line → picker to change who had it; tap "MAYA PAID" → change payer (proto pop); SPLIT IT → expense saved, back to 3i-1, toast "Split. Jordan's out of the pork line."; ✕ close; AUTO-SPLIT toggle (off = everyone even?).
- **Motion**: scan line sweeps paper (proto kf `ty0 → ty190 → ty0`, ease io, 3200 ms, 3 px `#54d6a4` with 12 px glow); each recognised line lights yellow as the line passes; avatars slide onto rows below (stagger); tap opens picker (sheet).
- **States MISSING**: camera permission denied, no receipt detected/aim guidance, capture progress, low-light/torch, multiple receipts, tip line, tax-inclusive/exclusive, discount lines, total mismatch (sum lines ≠ total), currency ambiguity, auto-split off state, picker UI itself.
- **AI**: on-device live text detection for sweep/highlight; server multimodal LLM → structured lines + locale number parsing ("850.000" = 850,000); auto-assignment using crew **dietary profiles** (Jordan vegetarian → excluded from pork) + who was present (plan/location); reason strings. Single request/response (≤3 s target), not streamed.
- **Realtime**: resulting expense broadcast; LATEST on 3i-1 updates everywhere.
- **OS hooks**: camera, document edge detection/auto-capture, on-device OCR, torch, haptic on lock.
- **Gates**: money free; unknown if receipt OCR counts toward guide camera quota (§8).

### 3i-4 Couldn't read it (failure path)
- **Purpose**: partial OCR — keep what was read, give 3 ways forward, never a dead-end error.
- **UI**: camera bg; ✕; pink chip "TOO CRUMPLED"; greyed receipt placeholder lines with a fold shadow band, yellow locked TOTAL 1.080.000; yellow corner brackets (capture frame); sheet with grabber: "TOKEK GOT HALF OF IT", title "THE TOTAL, NOT THE LINES", ✓ "Total: Rp 1.080.000 at Ibu Oka", ✕ "Line items: the fold hides all seven"; two option cards "TYPE THE LINES — Tokek fills in the prices it could read" / "RETAKE, FLATTER — Hold it on the table. Tokek will wait"; CTA "SPLIT EVENLY · $11.37 EACH" (1,080,000 ÷ 6 = 180,000 ≈ $11.37 ✓).
- **Data**: Receipt.ocrStatus=partial, qualityIssue=crumpled/fold, total (confident), merchant, expected line count (7), partial line prices.
- **Actions**: TYPE THE LINES → manual itemised entry prefilled with read prices (proto routes to 3i-2 — plain expense, not itemised; gap); RETAKE → back to 3i-3 with auto-capture waiting for stable flat frame; SPLIT EVENLY → expense even split, toast "Split evenly, $11.37 each."
- **Motion**: scan line sweeps twice and stutters at the fold; total locks yellow; unreadable lines grey out; sheet slides up (sheet transition 540 ms E).
- **States MISSING**: total also unreadable (full failure), merchant unknown, blur vs glare vs cut-off variants (chip text varies), itemised manual editor.
- **AI**: image quality classification + confidence-scored partial extraction; guide copy chosen by failure reason.
- **Gates**: free.

### 3i-5 Settle up
- **Purpose**: simplified debts → track payment status → crew reward.
- **UI**: "← MONEY", "SETTLE UP", "Tokek netted 23 expenses down to three payments."; payment rows (from avatar → dashed line with amount → to avatar, status column): J $92.10 → W "REQUESTED" + "NUDGE"; A $94.30 → W "PAID ✓" (green); R $41.00 → M "PENDING"; card "HOW PEOPLE PAY YOU" chips BANK TRANSFER (selected) / PAYNOW / CASH + "Your details are shared only with the person paying."; locked Settled Tokek silhouette with "?" + Caveat "Two more payments and all six of you get the Settled Tokek."; CTA "REMIND EVERYONE".
- **Data**: SettlementPlan (derived from balances: 3 transfers settle 6 nets ✓), Payment{from, to, amount, currency, status pending|requested|paid|confirmed, method, nudges}, user payout methods (encrypted), reward progress.
- **Actions**: NUDGE → flap "NUDGED", toast "Nudged Jordan. Gently." (push to Jordan); REMIND EVERYONE → push to all unpaid ("Reminded Jordan and Rin."); status chip tap (proto) → PAID ✓ flap + green; select pay-in method(s); row › → payment detail (show details / PayNow QR / mark paid — not drawn).
- **Motion**: payment clears → row slides left and a check stamps on (proto: flap 340 ms + bg → green .3 s; stamp should thud + haptic); last payment clears → every phone gets the Settled Tokek sticker at the same moment (proto: 450 ms delay → confetti 110 pcs + toast "All square. Everyone gets the Settled Tokek.").
- **States MISSING**: nothing to settle, you owe (payer view: pay button, recipient's details revealed, PayNow QR, bank app deep link), partial payment, payee confirmation vs payer self-mark, disputed payment, payment in other currency, offline mark-as-paid (outbox), settlement recompute after new expense (plan changes while payments in flight).
- **AI**: copy only; netting is deterministic (min-transfer algorithm).
- **Realtime**: status changes broadcast; reward unlock fan-out to all 6 simultaneously (server timestamp + realtime + push).
- **OS hooks**: push notifications (nudge, paid), PayNow/bank deep links or QR render, haptic stamp, confetti, sound.
- **Gates**: free. Entry from Boost IOU (4c-1) and Delete-account (outstanding balances).

### 3i-6 Budget
- **Purpose**: spent vs planned, by category and day, with forecast.
- **UI**: "BALI BUDGET" + chip "DAY 5 OF 8"; SPENT $4,812 (64 px) vs PLANNED $7,440; progress track 14 px with yellow fill (65% = 4812/7440) and TODAY marker at 62.5% (5/8); category card STAYS $1,840/$2,700 (blue), FOOD $1,160/$1,500 (pink), TRANSIT $620/$1,100 (green), FUN $1,192/$2,140 (orange) — sums match totals ✓; BY DAY bar chart D1–D8 (yellow; D4 pink = over plan; future days empty stubs), "DASHES = PLAN" dashed line; guide line "On track to finish $210 under. The boat day is the biggest cost left."; tab bar.
- **Data**: Budget{planned total, per-category planned, per-day planned}, actuals aggregated by category/day (crew currency), trip day index, forecast (remaining planned + known booked costs), biggest remaining cost item.
- **Actions**: none drawn (tap category/day → filtered expenses implied); ← via tab.
- **Motion**: bars fill in day order on open (stagger); TODAY marker slides to current day; spent bar grows (tg-motion grow, 6000 ms loop → fill in first 40%, ease-out); forecast line redraws after every new expense.
- **States MISSING**: no budget set (3c-5 flow gives planned total), pre-trip (day 0), over budget (hero colour/copy), per-person view, category edit, days with no plan, currency switch.
- **AI**: one-line forecast narrative from deterministic numbers (LLM or template); identify "biggest cost left" from itinerary/bookings.
- **Realtime**: recompute on expense events.
- **Gates**: free. Privacy: must not reveal 3c private per-person maxes (only aggregate).

### 3j-1 Guide chat
- **Purpose**: text Q&A with guide that returns actionable plan changes.
- **UI**: sheet over dimmed plan (grabber); header gecko 58 px + "TOKEK" + "Group mode · all six can see this" + segmented GROUP / JUST ME; member bubble (M avatar) "It's pouring in Ubud. What now?"; guide reply in Caveat yellow (typewriter) "Rain till about three. Here's a dry afternoon that still gets you to dinner at 19:30."; plan-change card: struck-through old item "14:00 Campuhan Ridge walk" → "→ COOKING CLASS, PAON · Indoors · 4 seats held for 20 min"; "16:30 Monkey Forest" → "→ PURI LUKISAN MUSEUM · 10 min walk from Paon · covered garden"; summary "+$22 each · dinner unchanged"; CTAs PROPOSE TO GROUP / JUST ME; quick chips CALL A CAR / TRANSLATE A MENU / PHARMACY (horizontal scroll); input bar: "+" / "Ask, or hold to talk" / mic.
- **Data**: GuideThread{mode group|private}, messages, ChangeSet{changes[{fromItem, toItem{title, meta}, reason}], perPersonDelta, invariants ("dinner unchanged"), holds[{item, seats 4, expiresAt +20 min}]}, context (current day plan, weather, location, crew).
- **Actions**: send text; hold input → 3j-2 voice; + → attach photo/camera (implied); GROUP/JUST ME toggle; PROPOSE TO GROUP → creates vote in crew chat (3g-1), toast "Posted to the crew as a vote."; JUST ME → "Applied to your plan only."; chips route as §1.
- **Motion**: sheet rises with spring (proto 540 ms E, underlay .93); reply writes itself in (tg-type 30 ms/char + 260 ms pause at , . ?; caret blink 480 ms); plan card deals swaps one at a time (card-deal like 3e-3: drop/reveal stagger ~100–150 ms); PROPOSE morphs card into a vote card in crew chat (shared-element/fade into 3g-1).
- **States MISSING**: empty/first-open (greeting, suggestions), thinking/tool-running indicator, streaming error/retry, offline (queue question? 3k-4 outbox), hold expired, no-alternative answer, plain text answers without change card, JUST ME mode visuals, quota meter / 30-of-30 (designed as 4b-1 but in Pon context), message history scroll, attachments.
- **AI**: streaming LLM with tool calls: read plan/weather/places/opening hours/availability, place holds, compute cost deltas, produce ChangeSet JSON + short persona text. Persona voice (Caveat = guide). Must keep must-dos untouched (3e-3 invariant) and state invariants.
- **Realtime**: group mode → thread visible live to all 6 (streamed tokens to all? at least final messages); proposal → vote in crew chat with presence.
- **OS hooks**: sheet presentation, haptics on deal, microphone (hold), camera (+), notifications for others in group mode.
- **Gates**: Free 30 questions/day (resets 00:00; plan + vote don't count — 4b-1), Pass+ ∞, Boost ∞ on trip; 4b-1: in crew chat a Pass+ member's guide answers for all ("Maya has Pass+. Ask in the crew chat and Pon answers there").

### 3j-2 Voice
- **Purpose**: hands-light voice ask with spoken answer + same change cards.
- **UI**: header "TOKEK · GROUP MODE" + blinking pink dot "LISTENING"; 2 concentric ping rings 320 px; dotted halo; big gecko 184 px bobbing; waveform 18 yellow bars; transcript (Archivo 26) "It's pouring in Ubud. What now?"; answer (Caveat 24) "Rain till three. Two dry swaps, and dinner stays at 19:30."; swap cards (blue rotated −1.5°, green +1°) "COOKING CLASS, PAON · +$18", "PURI LUKISAN MUSEUM · +$4" (sum = +$22 of 3j-1 ✓); CTA pink "SEND TO THE GROUP" + mic button (58 px, halo).
- **Data**: live transcript, answer text + TTS audio, ChangeSet with per-item delta.
- **Actions**: speak (hold or toggle), tap mic to stop/restart, SEND TO THE GROUP → crew chat vote, toast "Sent to the crew with both swaps."; dismiss (implied).
- **Motion**: rings breathe while listening (ping preset s.6/o.8 → s1.5/o0, 2400 ms, second ring +1200 ms); LISTENING dot blink 1400 ms; gecko bob 2200 ms; waveform follows voice (proto kf sy .3→1→.3, 900 ms, stagger 70 ms — production drive by mic RMS); on answer rings snap in, swap cards drop one after another (drop 380 ms overshoot, stagger).
- **States MISSING**: mic/speech permission denied, "thinking" between listen and answer, speaking (TTS playing, gecko mouth?), barge-in, no speech detected, noisy environment, offline, language mismatch, quota hit.
- **AI**: streaming STT (user language) → LLM → streaming TTS in guide persona voice; "Talk out loud: Voice replies when you speak first" (3n-2 setting); same ChangeSet contract as text.
- **Realtime**: group mode visibility; transcript persisted to thread.
- **OS hooks**: microphone, speech recognition, audio session (record+playback, ducking, Bluetooth/AirPods routing), haptics, keep-screen-awake while listening.
- **Gates**: same quota as chat ("Guide chat, voice, camera" one row).

### 3j-3 Point and ask
- **Purpose**: live menu translation overlay + dietary check across crew + follow-up Q&A.
- **UI**: camera bg; chips "POINT AND ASK" (yellow) and "INDONESIAN → ENGLISH"; menu "WARUNG PONDOK" (Nasi campur 35k, Sate lilit 40k, Lawar ayam 30k, Gado-gado 30k); translation stickers anchored beside each dish ("MIXED RICE PLATE", "MINCED FISH SATAY", "SPICY CHICKEN SALAD" (pink = clash), "VEG, PEANUT SAUCE"); per-member flags "JORDAN ✓ VEG" (green), "ALEX ✕ PEANUTS" (pink); bottom sheet: gecko "point" + Caveat advice "Gado-gado works for Jordan, but it's peanut sauce, so skip it for Alex. The nasi campur without sambal suits everyone."; chips LEAST SPICY? / ORDER FOR 6 / SPLIT THE BILL; input "Ask about this menu" + mic.
- **Data**: MenuScan{source/target lang, items[{original, translation (dish-level, not literal), price, bbox, ingredients/allergens, flags[{member, ok|clash, reason}]}], advice}; DietaryProfile per member (vegetarian, peanut allergy).
- **Actions**: LEAST SPICY? → answer "Nasi campur without sambal. Safe for all six."; ORDER FOR 6 → order card (local language) to show waiter; SPLIT THE BILL → 3i-3; free-text/voice follow-up.
- **Motion**: translations peel onto menu like stickers as camera locks on (sticker peel: scale/rotate from corner, stagger per line); clashing dishes shake once and turn pink (proto kf r0→−3°→3°→0 within first 15% of 4000 ms ≈ 600 ms; production `iter=1`).
- **States MISSING**: camera permission denied, searching/lock-on, low light, non-menu text, unsupported script, no dietary profiles set, offline (on-device OCR only?), order card screen, quota hit, frozen-frame (photo) mode.
- **AI**: on-device OCR with bounding boxes + tracking → crop/line text to multimodal LLM → dish identification, translation, ingredient inference, allergen/diet reasoning vs all crew profiles, advice text; follow-ups use same context. Latency target ≤1.5 s first stickers.
- **Realtime**: none required; advice could post to crew chat (not designed).
- **OS hooks**: camera live feed, on-device text recognition, AR-style anchoring (2D tracking sufficient), haptic on lock-on, torch.
- **Gates**: counts toward "Guide chat, voice, camera" quota (Free 30/day).
- **Safety**: allergy advice is safety-critical; must show caution + "ask the staff" phrase card (e.g. "Saya alergi kacang").

---

## 3. Feature list

| # | Feature | Description | Screens | Cx | Justification | Depends on |
|---|---|---|---|---|---|---|
| F1 | Bookings wallet | Typed booking cards, stacked deck, detail, offline cache incl. barcodes/PDFs, boarding-pass mode (brightness) | 3h-1 | M | CRUD + custom deck gesture + offline | Trips, crew, offline store |
| F2 | Booking import pipeline | Per-crew inbound address, schema.org JSON-LD first, LLM extraction fallback, dedupe, candidate review, auto-expense on ADD | 3h-2, 3h-1 banner | L | Email infra + LLM schema extraction + dedupe across 6 inboxes | F1, F9, LLM gateway |
| F3 | Mailbox auto-scan (Pass+) | OAuth read-only Gmail/Outlook, daily morning job, confirmation filter, per-crew surfacing | 3h-2, 3n-2 toggle | XL | Google restricted-scope verification + annual security assessment; token security; privacy review | F2, entitlements |
| F4 | Scan / paste import | Barcode (BCBP PDF417/Aztec/QR) decode, ticket/screenshot OCR, link fetch & parse | 3h-2 | M | On-device decode + reuse F2 extractor; PNR lookup not feasible | F2, camera |
| F5 | Flight tracking & co-travellers | Flight status provider, gate/boarding updates, "boarding opens" ping, crew-on-same-flight match; feeds 3k-5 delay flow | 3h-1 | L | 3rd-party data + webhooks + notif scheduling | F1, notifications |
| F6 | Boarding pass on lock screen | Live Activity push-to-start ~3 h before boarding; flips to pickup after landing (5a-3); Next-flight widget | 3h-1 (+5a-3, 5c-5) | L | Push-to-start tokens, LA budgets, Android equivalent | F5, Live Activity infra (5a) |
| F7 | Ride tracking & booking | Provider integration (transfer partners) or deep-link fallback, live driver location, ETA, book later leg, auto-split | 3h-3 | XL | No public consumer APIs for Grab/Gojek; per-country partners; realtime location | Maps, realtime, F9 |
| F8 | Phrase cards + TTS | LLM-written local-language phrases with gloss, pre-rendered audio per guide voice, show-to-driver mode, offline | 3h-3 (+3k-6) | M | Translation + TTS + offline packaging | LLM, TTS, offline pack |
| F9 | Expense ledger & multi-currency | Expenses in original currency, FX snapshot, crew currency, minor-unit math, split modes, deterministic rounding, realtime balances | 3i-1, 3i-2 | L | Money correctness, offline outbox, conflict rules | Crew, FX provider, realtime |
| F10 | Expense keypad UI | Custom keypad, locale grouping, 000 key, odometer rolls, payer ring, split modes incl. BY SHARE/CUSTOM editors | 3i-2 | M | Custom input + undesigned editors | F9 |
| F11 | Receipt OCR itemised split | Live scan + auto-capture, server extraction to lines, auto-assign via dietary profiles/presence, pro-rata service/tax, line picker | 3i-3 | L | Vision + LLM + split engine + reassignment UI | F9, F19, camera, LLM vision |
| F12 | Receipt failure path | Quality classification, partial results (total locked), type-lines prefilled, retake w/ auto-capture, split evenly | 3i-4 | M | Confidence plumbing + itemised manual editor (undesigned) | F11 |
| F13 | Settle up | Min-transfer netting, payment statuses, request/nudge/remind, payout methods (encrypted, reveal-to-payer), PayNow QR/deep links, Settled sticker fan-out | 3i-5 | L | State machine + privacy + synchronized reward | F9, notifications, realtime, rewards (3l/3n) |
| F14 | Budget & forecast | Planned by category/day, actuals, TODAY marker, forecast from remaining plan/bookings, guide one-liner | 3i-6 | M | Aggregations + forecast rules | F9, 3c budget, plan (3e), F1 |
| F15 | Guide chat core | Sheet chat, group/private threads, streaming persona replies, tool-calling ChangeSets, holds, quick actions, quotas | 3j-1 | XL | Agent orchestration, tool reliability, multiplayer thread, cost control | LLM gateway, plan model, entitlements |
| F16 | Propose to group | Convert ChangeSet → crew-chat vote (threshold e.g. 3 yeses), apply on pass, JUST ME personal apply | 3j-1, 3j-2 | M | Reuses 3e-3/3g vote infra; personal-plan overlay semantics | F15, 3g vote, 3e plan |
| F17 | Voice mode | Streaming STT → LLM → streaming TTS in guide voice, waveform from mic level, barge-in | 3j-2 | L | Latency, audio session, multilingual voices | F15, TTS |
| F18 | Point and ask | Live OCR with anchored translation stickers, dish reasoning, dietary clash flags, follow-up Q&A, order card | 3j-3 | XL | Realtime camera + tracking + LLM latency/cost + allergy safety | F15, F19, camera |
| F19 | Dietary profiles | Per-member diet/allergy/avoid data used by receipt auto-split + menu flags + drafting | (no UI in design) | S | Simple data, but sensitive + needs capture UI | Profile (3n/3a) |
| F20 | Settled Tokek reward | Crew-wide sticker grant when all payments clear, delivered simultaneously | 3i-5 | S | Server event + push | F13, sticker system |

---

## 4. Data model contributions

- **Booking** {id, crewId, tripId, type: flight|stay|activity|boat|transfer|ride|rail|car|insurance|other, title, vendor, confirmationCode, startAt/endAt (UTC + IANA tz), placeFrom/placeTo, address, nights, seats/pax, travellers[{memberId, seat, bag}], price{amountMinor, currency}, paidBy, linkedExpenseId, source: forward|mailbox|scan|paste|guide|manual, sourceMemberId, sourceRef (message-id hash), attachments[] (PDF, image, pkpass), barcode{format, payload}, visibility: crew|personal, offline: bool, createdBy, deletedAt}. Flight extension {carrier, flightNo, depIATA, arrIATA, schedDep/Arr, estDep/Arr, status, gate, terminal, boardingAt}.
- **ImportCandidate** {id, crewId, source, sourceMemberId, extracted JSON, fieldConfidence{}, dedupeKey (vendor+code+date), suggestedSplit{mode, n}, status: pending|added|ignored|duplicate, resolvedBy, resolvedAt}.
- **CrewInboundAddress** {crewId, localPart (slug e.g. bali-six, unique, rotatable), allowedSenders (member emails)}.
- **MailboxConnection** {userId, provider gmail|outlook, scopes, encryptedRefreshToken (KMS), enabled, lastScanAt, lastHistoryId}. Privacy: store extracted fields + hashed message ids only, never bodies; user can revoke; results shown to crew only for trip-matching bookings.
- **FlightWatch** {bookingId, flightKey (carrier+no+date), provider subscription id, lastPayload}.
- **LiveActivityRegistration** {userId, deviceId, kind: flight|ride|leave-by…, pushToStartToken, activityPushToken, startedAt, endedAt}.
- **Ride** {id, tripId, bookingId?, legFrom, legTo, provider, externalRef, driver{name, photo, phone-proxy}, vehicle{model, colour, plate}, status: requested|assigned|en_route|arrived|in_trip|completed|cancelled, etaAt, lastLocation{lat,lng,heading,ts}, price, expenseId, bookedBy: memberId|guide}. Location retained only during ride.
- **PhraseCard** {id, tripId, lang (BCP-47), text, gloss, purpose: ride|medical|diet|order…, context (placeId/address), audio{voiceId, url}, offline: bool}.
- **Expense** {id, crewId, tripId, dayIndex, description, merchant, category: stays|food|transit|fun|other, amountMinor, currency, fx{rate, source, asOf}, crewAmountMinor, paidBy, splitMode: even|shares|custom|itemised, date/time local, location, source: manual|receipt|booking|ride|guide|boost, receiptId, bookingId, createdBy, clientId (idempotency), version, deletedAt}.
- **ExpenseShare** {expenseId, memberId, weight | fixedAmountMinor, computedAmountMinor, excludedReason}.
- **Receipt** {id, imageRef (private bucket), ocrStatus: full|partial|failed, quality: ok|crumpled|blur|glare|cropped, merchant, dateTime, tableRef, currency, subtotal, total, expectedLineCount}; **ReceiptLine** {receiptId, label, qty, amountMinor, kind: item|service|tax|tip|discount, assignment: everyone|members[]|pro_rata, autoReason, confidence}.
- **Balance** (derived/materialised per crew+trip) {memberId, netMinor in crew currency}. Crew{settlementCurrency}.
- **Payment** {id, crewId, tripId, from, to, amountMinor, currency, status: pending|requested|marked_paid|confirmed|cancelled, method, requestedAt, nudges[{at, by}], paidAt, confirmedAt}.
- **PayoutMethod** {userId, type: bank_transfer|paynow|cash|…, encryptedDetails, country}. Privacy: revealed only to the payer of an open Payment to that user; audit log.
- **Budget** {tripId, currency, plannedTotal, categories[{category, plannedMinor}], dayPlan[{dayIndex, plannedMinor}]} (seeded from 3c anonymous sweet spot × members — never store/expose individual maxes here).
- **RewardGrant** {id, crewId, tripId, stickerId (settled-<guide>), grantedTo[], grantedAt}.
- **GuideThread** {id, crewId, tripId, guideId, mode: group|private, ownerId (private)}; **GuideMessage** {id, threadId, author: memberId|guide, modality: text|voice|camera, text, transcript, audioRef, imageRef, changeSetId, toolTrace (internal), tokensIn/out, createdAt}.
- **ChangeSet** {id, tripId, threadId, requestedBy, changes[{op: replace|move|add|remove, planItemId, newItem{title, placeId, start, end, meta}, reason, costDeltaPerPersonMinor}], invariants[] ("dinner unchanged"), totalDeltaPerPerson, holds[{supplier, item, seats, expiresAt, externalRef}], status: draft|proposed|approved|rejected|applied_personal|expired, voteId}.
- **Vote** (shared with 3e/3g) {id, subject ChangeSet, threshold (e.g. 3 yeses), ballots, closesAt (≤ hold expiry)}.
- **DietaryProfile** {memberId, diet: vegetarian|vegan|pescatarian|halal|kosher|none, allergies[], avoid[], spiceTolerance}. Sensitive (health-adjacent): explicit consent, crew-visibility setting, excluded from analytics/LLM logs retention.
- **MenuScan** {id, userId, imageRef?, srcLang, dstLang, items[{original, translation, price, bbox, ingredients[], flags[{memberId, verdict, reason}]}], advice} — ephemeral by default.
- **UsageMeter** {userId, date (local tz), guideAsksUsed} for 30/day free cap; exempt kinds: plan drafting, vote.

---

## 5. Backend / API needs

**Endpoints (REST/RPC; names indicative)**
- Bookings: `GET/POST/PATCH/DELETE /trips/{id}/bookings`, `GET /trips/{id}/bookings/offline-pack` (bookings + attachments + barcodes + phrase audio), `GET /crews/{id}/import-candidates`, `POST /import-candidates/{id}:add|ignore`, `POST /imports/scan` (image/barcode payload), `POST /imports/paste` (url|code), `GET /crews/{id}/inbound-address`, `POST /me/mailbox-connections` (OAuth code exchange), `DELETE /me/mailbox-connections/{id}`.
- Flights: `POST /bookings/{id}/flight-watch`; webhook receiver from flight data provider.
- Rides: `POST /trips/{id}/rides` (quote/book), `GET /rides/{id}`, `POST /rides/{id}:cancel`, provider webhooks (driver assigned/location/status), `POST /rides/{id}/messages` (driver chat, if supported).
- Phrases: `POST /trips/{id}/phrases` (generate), `GET /phrases/{id}/audio`.
- Money: `GET /trips/{id}/balances`, `GET/POST/PATCH/DELETE /trips/{id}/expenses` (idempotent clientId, version for conflicts), `POST /receipts` (upload → job), `GET /receipts/{id}` (status + lines), `POST /receipts/{id}:commit` (assignments → expense), `GET /trips/{id}/settlement-plan`, `POST /payments/{id}:request|nudge|mark-paid|confirm`, `POST /trips/{id}/payments:remind-all`, `GET/PUT /me/payout-methods`, `GET /payments/{id}/payee-details` (authz: payer only), `GET /fx/rates?base=` (daily snapshot for offline), `GET/PUT /trips/{id}/budget`, `GET /trips/{id}/budget/forecast`.
- Guide: `POST /guide/threads/{id}/messages` (SSE/WebSocket stream of tokens + tool events + ChangeSet), `POST /guide/voice/session` (streaming audio in/out), `POST /guide/camera/menu` (crops/text + bboxes → items/flags stream), `POST /changesets/{id}:propose|apply-personal`, `GET /me/usage`.

**Background jobs**
- Inbound email processing (MX → webhook → sanitize → JSON-LD/Microdata extract → LLM extract → validate → dedupe → candidate → push "Found N bookings").
- Daily mailbox scan per connected Pass+ user ("every morning", local tz), incremental via history id; revoke/cleanup.
- Flight status subscriptions; boarding-time scheduler (notif "boarding opens"; LA push-to-start T−3 h; flip to pickup on landing; hand-off to 3k-5 delay auto-fix).
- Offline pack builder per trip (bookings, barcodes, PDFs, phrase audio, FX table) → versioned bundle (3n-2 "Bookings, maps, phrases · 84 MB").
- Receipt OCR/extraction job (sync-ish, ≤ few s) + quality classifier.
- Balance/settlement recompute on expense change (materialised; event-sourced ledger recommended).
- Budget forecast recompute + guide one-liner generation (debounced).
- Nudge/remind delivery respecting ping budget + 20:00 roundup batching (5b-4) — money pings may be roundup-eligible.
- Hold expiry watcher → mark ChangeSet hold expired, update vote card.
- FX rates daily fetch.
- Receipt image retention/cleanup; MenuScan purge.

**Realtime channels**
- `crew:{id}:money` — expense.created/updated/deleted, balances.updated, payment.status, reward.granted (same server timestamp for "same moment" animation).
- `crew:{id}:bookings` — candidate.created/resolved, booking.added/updated, flight.status.
- `ride:{id}` — driver location (1–5 s), ETA, status; subscribers = riders in that leg.
- `guide-thread:{id}` — group mode messages + streamed tokens + ChangeSet deal events; presence (who is viewing).
- `crew:{id}:votes` (shared with 3g) — proposal vote created/ballot/closed.

**3rd-party data sources / services**
- Inbound email service (MX + webhook parse); Gmail API (restricted scope) + Microsoft Graph Mail.Read.
- Flight status/schedules data provider (gate, boarding, delays) with push alerts.
- Ride/transfer partners with booking + driver-tracking APIs per market; deep-link fallback to local ride-hailing apps; maps/routing/geocoding provider (ETA, polyline).
- FX rates provider (daily, 160+ currencies incl. IDR/JPY/ISK/MXN/EUR/PEN/SGD).
- Multimodal LLM (text, vision), STT (streaming, multilingual), TTS (per-guide voices; languages id, ja, is, es-MX, pt-PT, es-PE/qu).
- Activity/restaurant inventory with availability (+ hold where supported) for guide swaps; weather (hourly precip for "rain till three").
- Payment-instrument formats: PayNow/SGQR (EMVCo QR payload generation), bank deep links — no money movement in-app.

---

## 6. Cross-slice dependencies & shared components

- **3c-5 Budget** (private maxes → sweet spot) seeds 3i-6 planned totals; privacy contract must carry over.
- **3e plan model** (plan items, days, must-dos, 15-min timeline) is the target of ChangeSets; **3e-3 Review changes** = same change-list component (strikethrough old → new, avatars, cost delta chips, "SEND TO CREW · NEEDS 3 YESES" / "Apply to my plan only") → build one `ChangeSetCard` used in 3e-3, 3j-1, 3j-2, 3k-5.
- **3g-1 Crew chat**: vote/poll cards, expense message card ("Maya paid Rp 1.08M… VIEW" → 3i-1), guide-books-and-splits card ("I'M IN · 1 SLOT LEFT"), @guide mentions; PROPOSE lands here.
- **3k**: 3k-1 Trip hub cards (BOOKINGS 9 SAVED, MONEY +$186), 3k-2 day-of ticket link, 3k-4 offline outbox (expenses, votes, messages queue; phrase cards/bookings must be in offline pack), 3k-5 flight delay auto-fix (uses F5 + rides), 3k-6 Help (PHARMACY chip, phrase card + play, insurance card in Bookings, GO → 3h-3).
- **3l/3n stickers**: Settled Tokek reward uses the sticker/avatar system and locked-silhouette rendering (`doodle-art locked=`).
- **3m-6 Recap receipt** consumes category totals, meals count, settle duration → ledger must keep category + settlement timestamps.
- **3n-2 Settings**: "Find bookings in my email" toggle, "Talk out loud" voice replies, offline pack size; **3n-8** home/local/both price display + crew currency + "Rates work offline".
- **4b-1/4e/4a** entitlements: guide quota meter, email import Pass+, **4b-3/4c-1** Boost split IOUs as expenses → settle.
- **5a-3 Flight day LA**, **5a-5 Dynamic Island ASK TOKEK**, **5b-1** sender-branded notifications ("Balances" sender, guide roundup), **5b-4** ping budget, **5c-5** Balances widget (free), Next flight widget (Pass+).
- **Shared UI components**: tab bar with centre guide button (tap = sheet, long-press = Help), bottom sheet w/ grabber + spring, member avatar (colour token + initial) & stacked avatars, status chips (flap on change), odometer number, diverging bar, typed Caveat guide line (tg-type), quick-action chip row, input bar (+ / text / hold-to-talk mic), camera scaffold (✕ + status chip + bottom sheet), toast-as-island, confetti, keypad, segmented control, toggle, doodle-art icon set (volcano, boat, bed, plane, car, food, camera, wallet, cal, chat, ticket, check, gecko poses cheer/think/point).
- **Shared services**: LLM gateway (persona, tools, quotas, logging redaction), realtime bus, notification service (sender identity, batching), offline sync/outbox, entitlement service, TTS/phrase service, FX service, split engine (single source for 3g spa split, 3h auto-split, 3i, 4b boost).

---

## 7. Implementation risks / hard parts

1. **Inbox scanning compliance**: Gmail read scopes are "restricted" → Google OAuth verification + recurring third-party security assessment; months of lead time and cost; Outlook needs publisher verification. Apple/iCloud Mail has no API → forwarding only. "Crew's inboxes" means one member's mail content surfaces to others → explicit consent + trip-matching filter to avoid leaking unrelated personal bookings.
2. **Email extraction quality**: vendor templates vary; many emails carry schema.org reservation markup (use first, cheap/accurate), LLM fallback must be schema-validated with per-field confidence; group bookings (6 seats) vs per-person tickets; dedupe when 3 members forward the same confirmation; timezone of local times.
3. **Boarding barcode**: emails rarely contain the barcode; only scan/PDF/pkpass gives BCBP payload. Card design assumes barcode always present.
4. **Flight data**: gate/boarding times are provider- and airport-dependent; boarding time often unknown → fallback (dep − 40 min) must be labelled.
5. **Live Activity timing**: starting "3 h before boarding" while app is closed requires push-to-start tokens (iOS 17.2+), APNs LA priority budgets, 8 h active limit; Android has no 1:1 equivalent (ongoing/live-update notifications) — parity decision needed.
6. **Ride booking "by Tokek"**: Grab/Gojek offer no public consumer ride-booking API; Uber guest-ride APIs are partner-gated; realistic path = airport-transfer/private-driver partners with tracking APIs, else deep links (no live car, no auto-split certainty). Autonomy (guide books & charges without confirm) raises payment/cancellation liability.
7. **Supplier holds** ("4 seats held for 20 min"): few activity APIs support holds; faking holds breaks trust. Vote must close within hold window; expiry UX needed.
8. **Money correctness**: never let the LLM do arithmetic; integer minor units with ISO-4217 exponents (IDR/JPY/ISK = 0 decimals); deterministic remainder distribution (design shows $1.51 displayed $1.50 → define rounding/allocation rule so shares sum to total); FX snapshot per expense; rate source/time shown; edits re-flow balances and in-flight settlements.
9. **Offline + concurrency**: expenses/payments created offline (3k-4 outbox) → idempotency keys, version conflicts (two people log same bill), settlement plan invalidated by late expenses; "Rates work offline" needs cached rate table + later reconciliation policy (keep offline rate or re-rate?).
10. **Receipt OCR**: thermal/crumpled/handwritten, locale number formats ("850.000"), qty × unit vs line total, service + tax (e.g. Indonesian service + PB1 tax), totals mismatch; partial-confidence UX (3i-4) requires per-field confidence from the pipeline, and a line-item manual editor that isn't designed.
11. **Auto-assign from dietary profiles**: inference ("vegetarian ⇒ not pork") can be wrong (Jordan may have shared a dish); must be suggestion with visible reason + one-tap override; privacy of diet data shown on others' screens ("Jordan skipped the pork").
12. **Allergy safety in Point and ask**: LLM ingredient inference errors can cause harm; conservative flagging, uncertainty language, "ask staff" phrase card, disclaimers; legal review.
13. **Live camera overlay**: anchoring stickers to text with tracking at 30–60 fps on-device; LLM latency (1–3 s) vs "as the camera locks on"; cost per scan → on-device OCR first, send text/crops not frames; throttle.
14. **Voice latency & multilingual voices**: STT→LLM→TTS round trip < ~1.5 s to feel conversational; persona-consistent voices across English + local words; TTS/STT coverage for Icelandic and Quechua is weak; audio session conflicts (AirPods, silent switch, other audio).
15. **Group-mode guide thread**: privacy expectations (who sees a question), notification noise, whose quota is consumed, concurrent askers → queueing/turn-taking, streaming to 6 clients.
16. **"JUST ME" personal apply**: requires personal overlay of the shared plan (divergence, conflicts with bookings/holds, rejoining group plan) — non-trivial plan data model.
17. **Payout details**: bank numbers are sensitive; field-level encryption, reveal-to-payer audit; PayNow SG-only → per-country method catalogue; staying out of money-transmission regulation (no in-app transfers).
18. **"Same moment" reward**: offline/backgrounded devices can't animate simultaneously; define as server-timestamped grant + push; animation on next foreground.
19. **Typewriter vs streaming**: tg-type fixed 30 ms/char + punctuation pauses; real token streams arrive bursty → client-side smoothing buffer; accessibility (VoiceOver should read full text once, not per char; Caveat legibility, Dynamic Type).
20. **Demo data inconsistencies** to avoid in fixtures: seat 34A (3h-1) vs 14A (5a-3); car "White Avanza DK 1234 AB" vs "Silver Avanza DK 1842 AB"; 5b-1 "Dev owes you $41"/"Maya paid you back $92.10" vs 3i-1/3i-5 (Rin −41, Jordan owes 92.10); 3i-4 "all seven" lines vs 3i-3 3-line receipt with same total; cooking class "4 seats held" for a crew of 6; 3i-6 dashed plan line drawn flat at bar base (placeholder, not real per-day plan values).

---

## 8. Ambiguities & open product questions

1. Wallet tab = Bookings + Money? 3i-1/3i-6 highlight WALLET but tab routes to Bookings; no switcher drawn. How does a user reach Money from the tab bar?
2. Email import gating: compare table says "Bookings from email" = Pass+ only (not Boost). Does that cover forwarding to the crew address, or only automatic inbox scanning? Is Alex (source of "FROM ALEX'S EMAIL") required to be Pass+? Does a Boosted trip unlock it?
3. Crew-inbox consent: when Alex's inbox is scanned, can every crew member see/ADD/IGNORE his findings? Who is allowed to resolve a candidate? How are non-trip personal bookings excluded?
4. Booking visibility: which bookings are crew-shared vs personal (Rin flies separately)? Does the wallet show my segments only, plus shared stays/activities?
5. Boarding pass lock-screen pin: for every flight or only email-imported (5a-3 says Pass+ "from your email")? Also offer Add to Apple/Google Wallet?
6. "9 OFFLINE": count of bookings cached offline? What isn't offline and how is that shown?
7. Getting around: who is the ride provider in each market; does the guide book autonomously (payment, cancellation fees)? What does the chat bubble open (in-app, WhatsApp, provider)? Does BOOK auto-create a 6-way expense and who pays the driver?
8. Is there a ride Live Activity / Dynamic Island state (not designed)?
9. Crew settlement currency: who picks it (USD here while user's home is SGD), can it change mid-trip, and how do HOME/LOCAL/BOTH display settings (3n-8) interact with the Money screens?
10. Balance bars: per-side normalisation (as drawn) or one global scale?
11. Expense management: full history list, edit/delete permissions (creator only? anyone?), audit trail, disputes — none designed.
12. BY SHARE and CUSTOM split editors, excluding members, and partial-crew expenses (e.g. spa for 4) — UI not designed.
13. Receipt: how is the payer inferred ("MAYA PAID")? What does AUTO-SPLIT OFF do? Tip handling? Is the receipt image kept and visible to crew?
14. "TYPE THE LINES" — itemised manual editor (prefilled prices) vs plain Add expense (prototype routes to 3i-2)?
15. Settle up semantics: is payment ever in-app? Who flips PAID ✓ — payer marks, payee confirms, or both? What does REQUESTED mean vs PENDING? Cash confirmation? What if new expenses arrive after partial settlement?
16. Payout methods: catalogue per country (PayNow SG-only), can a user have multiple, and exactly what is revealed to the payer?
17. Settled Tokek: a Critterdex entry, a sticker/avatar, or an achievement? Does it break the "critters only earned by being there" rule? Per trip or per crew?
18. Budget: group-level only or per-person view too? Who can edit planned categories/day plan? Where do per-day plan values come from? Forecast method (plan + bookings)?
19. Guide group mode: does it notify other members, and do their replies join the thread? Whose free quota is consumed? Is group-mode history visible in crew chat?
20. JUST ME apply: personal plan fork semantics — does it affect shared bookings/holds and others' views?
21. Proposal threshold: same "needs 3 yeses" as 3e-3? Organiser override? Expiry tied to hold (20 min)?
22. Holds: real supplier holds or soft "we'll try"? Who pays if the vote passes (auto-book + auto-split?).
23. Voice: push-to-talk (hold) only, or tap-to-toggle hands-free? Spoken reply always, or only with "Talk out loud" on? Are audio recordings stored?
24. Point and ask: live AR vs freeze-frame; supported languages/scripts at launch; what ORDER FOR 6 produces; can advice be posted to crew chat?
25. Dietary profiles: where are they captured (no UI in any section), who can see them, consent model for health data (allergies)?
26. Quota: do receipt scans, booking scans, phrase generation, menu follow-ups count toward Free 30/day? Timezone for 00:00 reset while travelling?
27. Android parity for Live Activities, Dynamic Island, lock-screen widgets, pasteboard behaviour.
28. Missing states across slice (empty, loading, error, offline, permission-denied, locked/paywall) — confirm designer will supply or engineering defines from system components.
