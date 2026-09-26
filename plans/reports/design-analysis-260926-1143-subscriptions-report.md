# Design Analysis: 4 Subscriptions (Pass+ and Trip Boost), 20 screens

Slice: 4e (final paywall) · 4a (rejected directions) · 4b (upgrading) · 4c (crew side) · 4d (managing) · 4f (entry points).
Sources: all 20 screenshots viewed; screens.json captions; raw HTML slices (tg-motion params); section-4 intro block + "EVERY WAY IN / RULES" board (raw HTML after 4f-3); prototype `x-dc` wiring; doodles.js (motion DSL easings); site text (Referral, Legal).
Palette tokens used in the slice: ink `#17142a` (bg), paper `#f4efe4`, surface `#1f1b38` / `#2c2750`, muted text `#a9a3c0`. **Pass+ = yellow `#ffd84a`**, **Boost = pink `#ff5fa8`**, first-trip-free/entry stamp = blue `#4f86ff`, kept/success = green `#54d6a4`, warning/"last one" = orange `#ff9a4d`, handwriting (Caveat) `#c4623e`/`#ff9a4d`. Fonts: Archivo 900 condensed (font-stretch 62–70%) for headlines, Geist body, Geist Mono for MRZ/labels, Caveat for guide asides.

Motion DSL easings (doodles.js): `out` = cubic-bezier(0,.55,.45,1), `in` = (.55,0,1,.45), `io` = (.65,0,.35,1), `back` = (.34,1.56,.64,1) (overshoot). Presets: float 4200ms (ty 0→-9, r -2°→2°), bob 2400 (ty -6), wiggle 1600 (r ±4°), pulse 1600 (s 1→1.07), ping 1800 (s .6→1.5, o .8→0), spin 9000 linear, blink 1200 (o 1→.25), hop 2600 (squash sy .9 → jump ty-14 sy1.05 → land sy.94 → settle). **Design loops entrance keyframes on a 9000ms clock for showcase only. In production, entrances play once.** tg-motion is a no-op under `prefers-reduced-motion`, so the app must honour Reduce Motion too.

---

## 1. Slice overview

### Business model (section-4 intro, verbatim rules)
- "Two paid options that stack. Pass+ follows one person into every crew. A Trip Boost sits on one trip, like a server boost: anyone in the crew can buy it, it unlocks the crew-level features for everyone, and the cost can be split through Balances like any other expense."
- **First trip free**: a crew's first trip is boosted for free, and "everyone has Pass+ until a week after landing" (Bali Six: Oct 12–26).
- **When a boost ends**: it runs until trip end + 7 days, which covers settling up and the recap. Plan, album, recap and map trail are kept for good. Redrafts, live map and new seats past 6 pause. Nobody is removed.
- **Who buys**: anyone in the crew. With a split, each share lands in Balances. A cancelled trip moves its boost to the next one.
- **Always free**: voting, planning, splitting money, offline maps, every critter. "Critters are never for sale."
- Prices: Pass+ **$3.99/mo · $29.99/yr** (−37%, $2.50/mo). Trip Boost **$12/trip** or **$59/yr per crew** ("yearly includes Pass+ for the buyer").
- **Paywall RULES** (board after 4f-3): "One paywall a day at most. Never on day-of screens, SOS, a delay or right after an error. Every one has a quiet no, and saying no hides it for that trip." Related (3p-6): the rating prompt never appears right after a paywall.

### User goals
- Free user who hits a limit: understand the limit in context and keep going (quiet no). Or upgrade themselves (Pass+), or unlock for the crew (Boost) and share the cost.
- Crew member whose trip got boosted: learn it happened, get the perks, pay back the share, say thanks.
- Subscriber: see the plan, switch monthly/yearly, pause between trips, cancel without dark patterns, fix a failed payment, redeem a gift, restore on a new phone.

### Entry points (designer's "EVERY WAY IN" list plus the prototype)
| From | Trigger | Goes to |
|---|---|---|
| 3n-1 Profile | PASS+ chip next to name | 4d-1 Your plan |
| 3n-2 Settings | "PASS+ · YEARLY ›" header chip | 4d-1 |
| 3n-5 App icon | STAMP style wears a PASS+ tag | 4e-1 Paywall |
| 3j-1 Guide chat | 30th answer of the day | 4b-1 inline card, then GET PASS+ to 4e-1 |
| 3c-9/3c-11 Pon's draft | Redraft with 1 left ("before the last free redraft, never after") | 4f-3, then 4b-3 |
| 3f-6 Who's in | Inviting a 7th person on a free crew | 4f-1, then 4b-3 |
| 3g-4 Crew map (chat MAP) | Opening the map on an unboosted trip | 4f-2, then 4b-3 |
| 3g-1 Crew chat | Someone else boosted | 4c-1 card, then 3i-5 Settle up |
| Push T-3d / 3m-1 Recap | Free first trip ending | 4c-2, then 4b-3 or 4e-1 |
| 3m-9 Recap postcard | "Mail a real one to each of you · PASS+" | 4e-1 |
| 5c-5 Widget gallery | NEXT FLIGHT (PASS+) / CREW, LIVE (BOOST) | 4e-1 / 5a-6, then 4b-3 |
| 5a-6 "On every lock screen" | "put this on the lock screen" on an unboosted crew map | 4b-3 |
| 5c-2 locked widget states | tap | the right offer |
| 3n-9/3n-10 Delete account | "Manage subscription ›" | store manage sheet |
| Paywall RESTORE, 4d-1 rows | Redeem / Restore | 4d-4 |
| (implied) push / deep link | billing failure; gift link | 4d-3; 4d-4 prefilled |

### Exits
4e-3 goes to 3n-5 App icon ("Pass+ styles already unlocked") or Done to Home. 4b-5 "TELL THE CREW" goes to 4c-1 (crew chat), Done to Home. 4c-1 "SETTLE $2" goes to 3i-5. 4d-* hand off to the store's payment and manage-subscription UIs. 4f-3 "USE MY LAST ONE" runs 3c-11 → 3c-12. 4f-1 "Keep it at six" returns to 3f-6 with Sam waitlisted. 4f-2 "Maybe later" returns to chat.

### Prototype wiring anomalies (fix during implementation)
- 4b-1 GET PASS+ goes to **4a-1 (rejected)**. It should go to 4e-1.
- 4a-1 "What's in each" goes to 4b-2. The final is 4e-2.
- 4d-1 "Change plan" goes to 4b-2. It should open the store plan-switch.
- 4d-1 "Payment method" goes to 4d-3. It should open the store payment settings; 4d-3 is a billing-failure state, not the payment-method screen.
- 4e-1 GET PASS+ skips the store sheet and goes straight to 4e-3.
- **4b-2 is superseded by 4e-2**: same matrix in the old dark style; its CTA "PASS+ · $3.99" vs 4e-2's "$29.99".
- Implementable set: 4e-1/2/3, 4b-1, 4b-3, 4b-4 (system UI), 4b-5, 4c-1/2, 4d-1..4, 4f-1..3. 4a-* are reference only.

---

## 2. Entitlement matrix (derived across the whole app)

Scopes: **U** = follows the user into every crew; **T** = attached to one trip/crew for the boost window; **W** = boost window = purchase (or trip creation for the free trip) → trip end + 7 days (inferred from "On until a week after you land, Apr 16", stamps "APR 2–16" / "OCT 12–26").

| Capability | Free | Pass+ (U) | Trip Boost (T, every crew member, W) | First trip free (T, W) | Crew yearly $59 | Source screens | Enforce |
|---|---|---|---|---|---|---|---|
| Guide answers, 1:1 ("Just me"): text + voice + camera, **one combined meter** | **30/day**, resets 00:00 | ∞ | ∞ **"ON TRIP"** (that trip only) | ∞ ("everyone has Pass+") | buyer ∞ (includes Pass+); crew ∞ on every crew trip for 12 mo | 4e-2, 4b-1, 3j-1..3 | server |
| Guide answers in crew chat (@guide / group mode) | counts against the asker? **but** "Maya has Pass+. Ask in the crew chat and Pon answers there", which implies any Pass+ member makes group answers free | ∞ | ∞ | ∞ | ∞ | 4b-1, 3j-1 | server (rule TBD) |
| System-initiated guide work (drafting, pitches, votes, proposal personal versions, morning briefing, auto-fix on delay, forecasts, quests, recap narration) | free, **not metered** ("Your Kyoto plan and the vote don't count towards this") | — | — | — | — | 4b-1 | server |
| Redrafts ("change a day" → diff) | **3 per trip**, resets per trip | **3 per trip** (Pass+ does not help) | ∞ (+"unlimited plan changes") | ∞ | ∞ | 4e-2, 4f-3, 3c-11/12 | server (atomic) |
| Crew seats | 6 | 6 | **16** | 16 | 16 | 4e-2, 4f-1 | server |
| Live crew map, ETAs, meet-up pin, PING ALL | — | — | ✓ | ✓ | ✓ | 4e-2, 4f-2, 3g-4 | server + client |
| Crew Live Activity on all phones + Dynamic Island, crew widget "CREW, LIVE" | — | — | ✓ | ✓ | ✓ | 5a-2, 5a-6, 5c-2, 5c-5 | server push |
| Own leave-by Live Activity, own alarms, critter-nearby LA, Countdown/Vote/Today/Balances widgets | ✓ | ✓ | ✓ | ✓ | ✓ | 5a-1, 5a-4, 5a-6, 5c-5 | — |
| Crew SOS + temporary location share (1h) | **must be free** (safety). 4f-2 copy lumps "walking times and SOS" into the boost map. Flag. | ✓ | ✓ | ✓ | ✓ | 3k, 4f-2 | — |
| Bookings from email (mailbox auto-scan), flight-day LA auto-start from email, NEXT FLIGHT widget | — | ✓ | **–** (table) vs "Everyone gets Pass+ features on trip days" (intro). Conflict. | ✓? ("everyone has Pass+") | buyer ✓ | 4e-2, 5a-3, 5c-5, 3h-1/2 | server |
| Manual bookings (forward to crew address, scan, paste) | assumed ✓ | ✓ | ✓ | ✓ | ✓ | 3h-2 | — |
| App icon **styles** | 2 | ALL | – | ALL (chip "ALL ICONS" pauses Oct 26) | buyer ALL | 4e-2, 3n-5, 4c-2 | client (alt icon API) |
| Earned critter icons / critter avatars | ✓ earned by being there, never bought | ✓ | ✓ | ✓ | ✓ | 3n-4, 3n-5 | server |
| "Avatars" in "Icon styles, avatars" | 2? | ALL | – | ? | ? | 4e-2 vs 3n-4 | **undefined** |
| Sponsored picks in Explore | SHOWN | NONE | NONE (boosted-trip context) | NONE? | NONE | 4e-2 | server |
| Printed postcard mailed to each crew member, 1 per trip | — | ✓ | ? | ? | ? | 3m-9 | server + vendor |
| Plan, album, recap, map trail, critters, stamps after boost ends | kept | kept | kept | kept | kept | 4b-3, 4c-2 | — |
| Voting, planning, splitting money, offline maps, notifications, community plans | ✓ | ✓ | ✓ | ✓ | ✓ | 4e-2 footnote | — |

Lifecycle overlays:
- **Paused Pass+**: loses unlimited guide + email bookings. "Your icons and avatar stay on while paused." No charges.
- **Cancelled (auto-renew off)**: full Pass+ until period end (Nov 2, 2027). **Expired**: loses icons ("Icons: Sakura Pon and 11 more"). The app icon must revert.
- **Billing failure**: full Pass+ for **7 days** grace (Nov 2 → Nov 9). Boosts unaffected ("Already paid").
- **Boost ended**: redrafts, live map and new seats past 6 pause. Existing members 7–16 stay. Paused chips: "UNLIMITED TOKEK, REDRAFTS, LIVE MAP, ALL ICONS".
- **Gift/promo time**: adds to the plan ("renewal moves to Feb 2, 2028").

Resolution functions (proposal):
```
passPlus(u)        = activeStoreSub(u) ∨ inGrace(u) ∨ cancelledButInPeriod(u) ∨ giftOrPromoTime(u) ∨ crewYearlyBuyer(u) ∨ firstTripFreeActive(any trip of u)
boostActive(t)     = paidBoost(t,W) ∨ firstTripFree(t,W) ∨ crewYearly(crew(t), now)
guideUnlimited(u,t)= passPlus(u) ∨ boostActive(t)            // t = trip context of the chat
redraftLimit(t)    = boostActive(t) ? ∞ : 3
seatCap(t)         = boostActive(t) ? 16 : 6                   // existing members never evicted
liveMap(t)         = boostActive(t)
emailImport(u)     = passPlus(u)                               // ∨ boostActive? (open question)
iconStyles(u)      = passPlus(u) ∨ pausedPassPlus(u)
sponsored(u,ctx)   = ¬passPlus(u) ∧ ¬boostActive(ctx.trip)
```

---

## 3. Per-screen spec

### 4e-1 Paywall (FINAL: the visa page)
- **Purpose**: one page, both offers. Pass+ is primary (the big visa). Trip Boost is secondary (the entry stamp). The crew's first-trip-free status is shown as context.
- **UI**: status bar; top row "✕" (left), "RESTORE" (right, Archivo 11px tracking .16em, `#a9a3c0`). Passport page card (left/right 16, top 96, h 532, r 24, paper `#f4efe4` with guilloché from two repeating-radial-gradients, a 10px spine shadow at left). Header "VISAS · VISAS · VISAS" / "PAGE 07" (Geist Mono 11). Title "GO FURTHER THAN FREE" (Archivo 900 44px, stretch 70%). Tokek sticker (92px, pose point) floats top right.
  - **Pass+ visa** (rot −1.5°, yellow with a 115° hatch, triple inset border ink/yellow/ink 35%): "VISA · FOR YOU · POUR VOUS", "PASS+" (38px), price "$29.99" + "A YEAR · $2.50/MO". Photo box with green gecko. Grid HOLDER WINSTON / ENTRIES UNLIMITED / VALID 12 MONTHS / WORKS IN EVERY CREW. Line "Guide chat, voice and camera without limits. Every icon style." MRZ "V<CPPASS<PLUS<<WINSTON<<<…". **Holographic seal** 46px (conic-gradient pink→yellow→green→blue, opacity .7, spinning) with a gecko outline. Light-sweep overlay.
  - **Trip Boost entry stamp** (pink triple-border rectangle, rot −3°, w 222): "ENTRY · FOR THE CREW", "TRIP BOOST · $12", "Redrafts, live map, crews of 16." Tappable (`data-cp="plan"`).
  - **FIRST TRIP FREE** round blue stamp (98px, rot −14°): "BALI SIX / FIRST TRIP FREE / OCT 12–26".
  - Caveat "Critters are never for sale." Dashed rule, then 2 MRZ lines "P<SGPCRITTERPASS<<WINSTON<<<…" / "CP0427<<SGP<<PASS<PLUS<<BALI<SIX<<<<<07".
  - Bottom: segmented "MONTHLY · $3.99" | "YEARLY · $29.99 [−37% pink badge]" (yearly default, flex 1.2). CTA "GET PASS+" (58h pill yellow, light sweep). Row "Boost a trip instead" (left) and "What's in each ›" (right, yellow).
- **Data**: user.displayName (HOLDER), user.homeCountry ISO-3 (SGP from home airport) for MRZ, passport number (CP0427, also on 3n-1 "P<SGPWINSTON<<CP0427"), current crew name + first-trip-free window (crew.firstTripFree{tripId, start, end}), store products (localized displayPrice, period, intro-offer eligibility), computed savings % and per-month price **per storefront**.
- **Actions**:
  - ✕ dismisses (counts as the "quiet no").
  - RESTORE goes to 4d-4 (prototype). Recommended: run the store restore inline, then show the result.
  - Toggle flips the plan. The price on the visa rolls like an odometer ($29.99 ↔ $3.99; the label "A YEAR · $2.50/MO" ↔ "A MONTH"). Prototype toasts: "$3.99 a month. Cancel or pause any time." / "$29.99 a year. That's $2.50 a month."
  - GET PASS+ opens the store purchase sheet, then verify, then 4e-3.
  - "Boost a trip instead" or tapping the stamp opens 4b-3 (sheet) for the **current trip context**.
  - "What's in each ›" goes to 4e-2.
  - Tapping the FIRST TRIP FREE stamp (proto, 4a-1) toasts "The Bali Six's first trip is free for everyone, until Oct 26."
- **Motion** (from HTML):
  1. Page slides up: ty 40→0, o 0→1, 0–540ms, ease `out`.
  2. Visa slaps on: s 1.18→1, o 0→1, 0–630ms, `back` (overshoot).
  3. Visa light sweep: a 64×300 white gradient (0→.6→0), skewX −18°, tx −120→440px in 1176ms `io`, repeating every 4.2s.
  4. Holo seal spins 360° linear in 7000ms, forever.
  5. Boost stamp: hidden to 900ms, then 900–1530ms s 1.2→1, o 0→1, rot −3°, `back`.
  6. FIRST TRIP FREE thud: delay 1500. Over 450ms s 2.2→.94 (ease `in`), then →1.04 at +720ms, →1 at +990ms. "Page jolts" on impact: add a 1–2px shake ~150ms + heavy impact haptic.
  7. Tokek float, 4200ms loop.
  8. CTA sweep: 60px skewX −20°, tx −140→420 in 1080ms every 3.6s.
  9. Plan toggle: odometer per-digit roll (~400ms, not coded).
  - Haptics: light (visa land), medium (boost stamp), heavy (first-trip stamp), selection (toggle). SFX: stamp thud (sound themes 3n-7).
- **States**: designed = default (yearly selected, crew in first-trip-free). **MISSING**:
  - products loading / price unavailable
  - store unavailable or purchases restricted (parental controls)
  - offline
  - purchase pending (Ask to Buy / SCA)
  - cancelled by user
  - failed
  - verifying after store success
  - already subscribed (should route to 4d-1)
  - intro-offer variant (if any)
  - no-crew / first trip already used (stamp variant)
  - multiple crews (which crew's stamp? which trip for "Boost a trip instead"?)
  - Android store variant
  - **no auto-renew disclosure, price-per-period terms, or Terms/Privacy links on this page**, all required by App Store 3.1.2 (4e-2 has only the renewal footnote)
- **AI**: none (MRZ + copy deterministic).
- **Realtime**: none, except that if a crewmate boosts while this is open, the stamp/boost option should update.
- **OS hooks**: store purchase API (products, purchase with account token, transaction listener), `canMakePayments`, haptics, sound, Reduce Motion.
- **Gates**: shown to non-Pass+ users. Frequency governor: max 1/day across entry points. Suppressed on day-of screens, SOS, delay flows, right after an error. Ignored for explicit user navigation (Settings, icons).

### 4e-2 What's in each (FINAL comparison, "PAGE 08")
- **Purpose**: the full comparison matrix. Choose Pass+ or Boost.
- **UI**: "← BACK". Paper page "ENTRIES · ENTRÉES / PAGE 08", "WHAT'S IN EACH". Grid columns 1.35fr | .8fr×3. Column header stickers: FREE (grey outline), PASS+ (yellow fill, rot −4°, ink ring), BOOST (pink outline). Yellow **highlighter band** (rgba(255,216,74,.4), r12) behind the selected column, default FREE per screenshot. Rows with dashed separators:
  - Guide chat, voice, camera: 30 A DAY | ∞ | ∞ ON TRIP
  - Redrafts from the guide: 3 A TRIP | 3 A TRIP | ∞
  - Bookings from email: – | ✓ (green check doodle) | –
  - Crew size: 6 | 6 | 16
  - Live crew map: – | – | ✓
  - Icon styles, avatars: 2 | ALL | –
  - Sponsored picks: SHOWN | NONE | NONE
  - Covers: You | You, every crew | One trip, whole crew
  - Footer: gecko sticker (bob), Caveat "Voting, splitting money, offline maps and every critter stay free for everyone."
  - Dual CTA: "PASS+ · $29.99" (yellow) | "BOOST · $12" (pink). Footnote "Pass+ renews yearly until you cancel. A boost is one trip, paid once."
- **Data**: static matrix from the entitlement catalog (server-driven so limits can change). Prices from the store. The period follows the 4e-1 toggle (4b-2 showed $3.99, so the CTA must reflect the selected period).
- **Actions**:
  - Tapping a column header slides the band to it, dims the other two, and lights up the matching CTA.
  - PASS+ CTA → purchase → 4e-3 (proto).
  - BOOST → 4b-3 sheet.
  - ← back to 4e-1.
- **Motion**: rows ink in top-down: stagger 120ms, each ty 8→0, o 0→1 over 540ms `out`. The band slides (~300ms spring, not coded). Non-selected columns dim (~opacity .45). Gecko bob 2600ms. CTA sweep 3600ms.
- **States MISSING**: loading prices; current-plan marker (Pass+ user viewing via "Change plan"); boosted-trip marker; monthly variant footnote; accessibility (table must read as rows for VoiceOver).
- **AI**: none. **Realtime**: none. **Gates**: none.

### 4e-3 Welcome to Pass+
- **Purpose**: purchase success. Show the perks and route to the most visible perk (app icon).
- **UI**: top half paper page ("VISAS · VISAS · VISAS / PAGE 07") with the same Pass+ visa and holo seal. Blue round stamp "ENTRY / ADMITTED / 02 NOV 2026". Tokek cheering sticker (140px). Bottom dark: "YOU'RE IN, WINSTON" (Archivo 900). Three perks with coloured check circles: yellow "Unlimited chat with Tokek and Pon, voice and camera"; green "Bookings pulled from your email"; pink "Every icon style and avatar". CTA "PICK A NEW ICON" (yellow). Footer "Yearly · renews Nov 2, 2027" (left), "Done" (right).
- **Data**: transaction purchaseDate (ADMITTED date), expiresDate/renewal date, product period, the guides of the user's trips (Tokek, Pon: personalised list), user name.
- **Actions**:
  - PICK A NEW ICON → 3n-5 App icon with Pass+ styles unlocked.
  - Done → Home tab.
  - Optional follow-on (not designed): connect email for bookings, since the Pass+ perk needs OAuth consent. The CTA points to icons, not email.
- **Motion**:
  - Visa drops: s 1.18→1, 630ms `back`.
  - ADMITTED slam: delay 900. s 2.2→.94 over 450ms `in`, →1.04, →1 by ~1890ms.
  - Confetti burst at ~720ms (period 6000 at .12), 80 pieces, origin (50%, 34%), 6 brand colours, gravity .32px/frame², ~1.8s life.
  - Tokek hop, 2600ms loop.
  - Perks tick one at a time (~150–200ms stagger).
  - Haptic: success notification on ADMITTED. SFX stamp + cheer.
- **States MISSING**: monthly variant; gift/promo-granted welcome; restore-success variant (should not replay the full celebration); upgrade from monthly to yearly; welcome for crew-yearly buyer; server verification still pending.
- **AI**: none. **OS**: alternate app icon API (next screen), haptics, sound.
- **Gates**: post-purchase only.

### 4a-1 Visa page (REJECTED direction A)
- Same offer as two selectable **stickers** on a visa page: yellow "PASS+ · FOR YOU" ($29.99 a year: "Unlimited guide chat, voice and camera. Bookings from email. Every icon and avatar.") and pink "TRIP BOOST · FOR THE CREW" ($12 a trip: "…crews up to 16. **Everyone gets Pass+ for the trip.**"). Blue FIRST TRIP FREE stamp. "CRITTERS ARE NEVER FOR SALE. YOU STILL EARN EVERY ONE." Toggle "MONTHLY · $3.99 / YEARLY · SAVE 37%", GET PASS+, links.
- Motion: page slides up; each sticker slaps with skew; stamp thumps. **Tapping a sticker switched the CTA and price between PASS+ and BOOST.**
- What 4e kept: the visa metaphor, the first-trip stamp, the monthly/yearly toggle, the quiet links. **What changed**: Pass+ became a personalised holographic visa (holder name, MRZ); Boost was demoted to an entry stamp; the CTA is fixed to Pass+, with Boost as a text link; sticker selection was removed.
- Note: 4a-1's "Everyone gets Pass+ for the trip" was **not** carried into 4e ("Redrafts, live map, crews of 16."). This is evidence the Boost→Pass+ scope was narrowed or left ambiguous.

### 4a-2 Boarding pass (REJECTED direction B)
- "PICK YOUR CLASS" / "Your first trip with a crew is on us. After that, pick what fits." Two tickets:
  - PERSONAL CLASS PASS+: GUIDE UNLIMITED / BOOKINGS FROM EMAIL / **ICONS ALL 24**, $29.99/YR or $3.99 a month, barcode.
  - CREW CLASS TRIP BOOST: avatars W M J R D A, REDRAFTS UNLIMITED / CREW MAP LIVE / SEATS UP TO 16, $12/TRIP, "$2 EACH, SPLIT 6 WAYS".
  - CTA "BOARD WITH PASS+".
- Motion: tickets print in with a paper shiver. The selected one lifts with a dark outline while the other dims. On purchase the stub tears and drops.
- Rejected because it favours one offer ("the other two favour one"). Useful leftovers: the per-head split price on the ticket, and the "ICONS ALL 24" count (conflicts with other counts, §8).

### 4a-3 Gold cover (REJECTED direction C)
- The user's navy pass ("CRITTERPASS PLUS · WINSTON · 7 TRIPS") gets a gold cover. "UPGRADE YOUR PASS". Swipeable pages: PAGE 1 · FOR YOU (Ask Tokek and Pon anything, any time / Bookings pulled from your email / Every app icon and critter avatar / No sponsored picks in Explore), PAGE 2 · FOR THE CREW (Unlimited redrafts / Live crew map), page 3 price. CTA "UPGRADE MY PASS · $29.99/YR" + "Boost a trip for the crew instead".
- Motion: the gold cover slides over the navy pass with a tilt. One foil sheen. **Gecko seal follows device tilt (motion sensors)**. The cover colour shifts gold→pink→cream per page.
- Rejected: Pass+-centric, crew offer buried on page 2. Also **collides with referral rewards**: Site-Referral awards a "Gold cover" at 5 stamps ("Stamps and covers are cosmetic"), so a paid gold cover would muddle that. The final 4e drops the device-tilt dependency.

### 4b-1 Out of questions (guide chat limit, inline)
- **Purpose**: the 30th answer of the day is used up. Explain the limit in the guide's voice, without blocking anything outside this chat.
- **UI**: guide chat sheet (grabber) over a blurred plan. Header: Pon sticker (greyed/"asleep" silhouette in screenshot), "PON", "Just me · Kyoto, Apr 2–9". User bubble "Can we swap Nara for Uji on day 3?". Pon in Caveat orange: "That's my thirtieth answer today, and the free ones are used up. I'll be back at midnight, or…".
  - **Limit card** (surface `#1f1b38`, yellow outline): "30 OF 30 TODAY" (yellow) + "RESETS 00:00". **30-segment meter** (10px bars, gap 3, all yellow). Body "Pass+ keeps Pon talking: text, voice and camera, as much as you like. Your Kyoto plan and the vote don't count towards this." Buttons "GET PASS+" (yellow) | "ASK AT MIDNIGHT" (outline).
  - Crew hint row: M avatar "**Maya has Pass+.** Ask in the crew chat and Pon answers there. ›".
  - Composer disabled (opacity .6): "+" and placeholder "Pon is back in 7h 12m".
- **Data**: UsageCounter{user, metric=guide_answers, periodKey(local date), used 30, limit 30, resetAt}; trip context (guide, dates, "Just me" thread); crew members with Pass+ (the first eligible, by name); countdown to reset.
- **Actions**:
  - GET PASS+ → 4e-1 (rise).
  - ASK AT MIDNIGHT → closes, toast "Pon will ping you at midnight." This implies the pending question is **queued and answered at reset**, with a push.
  - Maya row → crew chat 3g-1 (question pre-filled? not designed).
  - The composer stays usable for non-guide actions? ("The chat stays usable"; "Nothing is blocked outside this chat.")
- **Motion**: the meter fills as the last answer types in, and the 30th segment flicks yellow (brief flash ~200ms). Pon "trails off mid-sentence" (typewriter stops on "or…"). The card slides up under the line (spring ~400ms). Pon avatar dims to sleep. Haptic: light on the 30th segment.
- **States MISSING**:
  - pre-limit warnings (e.g. 25/30 soft meter?)
  - voice-mode limit (3j-2 mid-conversation)
  - camera point-and-ask limit (3j-3)
  - group-mode chat for free users with no Pass+ crewmate (row absent)
  - multiple Pass+ crewmates
  - solo trip
  - a boosted trip (never shown)
  - a question queued state in thread
  - the midnight answer arriving
  - timezone change while travelling
  - reset-while-open (composer re-enables)
  - offline
- **AI**: the limit line is **deterministic per-guide persona copy** (localised; must not consume a quota or an LLM call). Queued-question answering = a background LLM job at quota reset (input: thread + trip plan context; output: normal guide answer, may include plan ChangeSet proposals) → push "Pon answered". Metering hook on every guide answer: count 1 per completed answer turn (not per stream chunk), no count on error/refusal, exempt system jobs.
- **Realtime**: quota is per user; cross-device sync of the counter (phone + iPad).
- **OS**: push (midnight ping). **Conflicts with 5b ping budget/quiet hours**: a 00:00 ping is hostile, so deliver in the morning or the roundup instead.
- **Gates**: Free 30/day; bypassed by Pass+ or boostActive(trip).

### 4b-2 Compare plans (SUPERSEDED by 4e-2)
- Same matrix on the dark surface: headers FREE (grey) / PASS+ (yellow) / BOOST (pink). Rows identical except "App icons and avatars" (vs "Icon styles, avatars") and "you, in every crew". Check/minus circle icons. CTAs "PASS+ · $3.99" | "BOOST · $12". Motion: rows fill left to right as they scroll into view; a header tap highlights the column and dims the others.
- Implement only 4e-2. Its CTA price must follow the selected period (the $3.99 vs $29.99 discrepancy).

### 4b-3 Boost Kyoto (boost configuration sheet)
- **Purpose**: buy a boost for a specific trip. Choose the term and who pays.
- **UI**: sheet over a blurred destination photo. "THE BALI SIX · APR 2–9" (pink label), "BOOST KYOTO", Pon cheer sticker. Radio cards:
  - (selected, pink border) "THIS TRIP / On until a week after you land, Apr 16" **$12**
  - "EVERY TRIP, ALL YEAR / Any trip the Bali Six plan till next October, plus Pass+ for you" **$59** (choosing it stamps a small PASS+ sticker onto the option).
  - "WHO PAYS" segmented: "I'LL COVER IT" | "SPLIT 6 WAYS" (selected).
  - Avatars M J R D A fanned + "$2 each goes into Balances, like any shared expense. Settle it with the rest of the trip."
  - Dashed box "AFTER THE TRIP / The plan, album, recap and map trail stay forever. Unlimited redrafts and the live map pause until the next boost. Nobody gets removed from the crew."
  - CTA "BOOST FOR $12" (pink). Footer "Trip cancelled? The boost moves to your next one."
- **Data**: trip{id, name, dates, crew}, crew members (count, including buyer), boost window end = trip end + 7d, products (boost_trip, boost_crew_year) localized prices, split preview (share = price/N with rounding), existing boost state (hide if already boosted / first-trip-free active / in-flight purchase by another member).
- **Actions**:
  - Option select. WHO PAYS toggle: proto toasts "You cover the whole $12. Nobody owes you." / "$2 each goes into Balances."
  - Tapping ALL YEAR, proto toasts "$59 a year covers every Bali Six trip, plus Pass+ for you."
  - BOOST FOR $12 → creates a server **boost intent** (locks the trip for other buyers) → 4b-4 store sheet.
- **Motion**: switching to SPLIT fans the 5 avatars out from yours (stagger ~40ms, spring). "The price in the button counts from $12 down to your $2 share" (odometer). **This conflicts with the screenshot** (button still "$12 with split") and with checkout charging $12: the buyer is charged the full price. Selecting ALL YEAR stamps a PASS+ sticker (scale-slam like the stamps). Haptic: selection on toggle.
- **States MISSING**:
  - trip already boosted (by whom)
  - another member currently purchasing
  - first-trip-free already covering this trip
  - crew-yearly active
  - trip already ended
  - solo trip ("Just me": is boost offered?)
  - split with ALL YEAR ($59/6 = $9.83?)
  - pending members (Maybe/Unopened: included in N?)
  - buyer on a different storefront currency than the trip/crew currency
  - offline
  - price load failure
- **AI**: none (Pon sticker decorative).
- **Realtime**: intent lock broadcast ("Winston is boosting…") to prevent double-buy.
- **OS**: store purchase.
- **Gates**: any crew member can buy (not just the organiser).

### 4b-4 Checkout (system store sheet)
- **Purpose**: platform purchase confirmation.
- **UI** (drawn as an iOS App Store sheet over the dimmed boost screen): "Store" ✕. Product row with gecko icon "Trip Boost · Kyoto / Critterpass · one-time purchase". Account "winston@critterpass.app", Pay with "Visa •••• 4412", **Split "$2 each in Balances"**, Total "$12.00". Ring "Double-click to pay". Side-button hint "Double-click side button" at right edge.
- **Reality check**: the system sheet is **not customisable**. The product display name can be "Trip Boost", but there is no per-trip name unless the product is per-destination (don't). The **Split row cannot exist in the system sheet**; move it into 4b-3 and 4b-5. The account shown is the store account, not the app email. Android shows the Play purchase sheet.
- **Actions**: confirm (side button / biometric) → transaction. The app verifies server-side → 4b-5. Cancel → back to 4b-3 (intent released).
- **Motion**: the system sheet rises. The side-button hint pulses twice (system). When payment clears, the ring fills with a tick and the sheet "drops away into the stamp". The app must bridge with a **verifying** beat (≤ a few s) and a custom transition into 4b-5.
- **States MISSING**: pending (Ask to Buy / bank SCA), failed, cancelled, verification timeout (the purchase succeeded but the server is not confirmed yet: show "we'll finish this in the background"), duplicate boost detected after pay.
- **OS**: store purchase API, transaction observer (must be running at app launch for interrupted purchases), `appAccountToken`/obfuscated account id.
- **Gates**: n/a.

### 4b-5 Stamped (boost success)
- **Purpose**: celebrate, confirm the split, and prompt telling the crew.
- **UI**: paper page "ENTRIES · ENTRÉES / PAGE 08". Big pink rectangular stamp (rot ~−8°): "THE BALI SIX / BOOSTED / KYOTO · APR 2–16". Pon cheering sticker (hop) + Caveat "Unlimited redrafts. I have ideas about Nara." Dark bottom: "THE CREW'S IN", avatars M J R D A + "Maya, Jordan, Rin, Dev and Alex each owe you $2. It's in Balances." CTA "TELL THE CREW" (pink), "Done".
- **Data**: Boost{trip, window}, Expense(source=boost, payer=buyer, shares), members' names; the guide line (see AI).
- **Actions**: TELL THE CREW → posts/opens the crew chat with the boost card (4c-1). Done → Home.
- **Motion**: the stamp slams from above (reuse the thud kf: s 2.2→.94→1.04→1, `in` then settle) with a small **ink spread** (radial blur/bleed ~200ms) and a single page shake (±3px, ~250ms). Confetti (period 5200 at .08 → ~420ms, 70 pcs, origin 50%/32%). Pon hops in from the right. The five avatars drop in one by one **as each $2 is added to Balances** (tie the animation to server expense-share creation, or fake a stagger ~150ms). Haptic heavy on stamp, SFX thud.
- **States MISSING**: "I'll cover it" variant (no owe line); crew-yearly variant (PASS+ sticker + "every trip till Oct"); verification pending; expense creation failure (boost ok, split not recorded: retry); offline.
- **AI**: the Pon line is contextual ("I have ideas about Nara" references the contentious day). Either an LLM one-liner (input: trip plan + recent redraft history + chat snippets; output ≤ 80 chars, persona voice; must be fast or precomputed) or a template with the last-redrafted day name. Recommend a template + optional LLM with a timeout fallback.
- **Realtime**: boost.activated event → all crew devices (see 4c-1). Balances update.
- **OS**: haptics, sound, (crew) push. Passport page entry: does the BOOSTED stamp persist in the user's pass stamps (3l-2 / 3n-1)? Open question.
- **Gates**: n/a.

### 4c-1 Boosted by Winston (crew-side, Rin's phone)
- **Purpose**: tell the crew a boost happened, show the perks, collect the IOU, thank the buyer.
- **UI**: crew chat (3g-1 base). Header "← THE BALI SIX / 6 people · Pon is in this chat" + **"BOOSTED" pink pill**. "TODAY" divider.
  - Dev bubble "pon only gave us 3 redrafts, we used them all on day 2 😅".
  - **Boost card** (pink r24): W avatar + "WINSTON BOOSTED KYOTO / Apr 2–16 · split 6 ways". Perk chips (dark) "∞ REDRAFTS", "LIVE MAP", "**PASS+ ON THE TRIP**", "UP TO 16". Buttons "SETTLE $2" (dark filled) | "THANKS WINSTON" (outline).
  - Pon Caveat line "No more counting. Who wants day 3 back? I have a quieter Nara."
  - Maya bubble "thank you W!! paying you back now".
  - Settled row: "SETTLED · Maya and Jordan · 3 still to go" + stacked avatars M J.
  - Composer "Message the crew".
- **Data**: ChatMessage{type: boost_card, boostId}. The rendered state is **live**: settled members (from settlements of the boost expense shares), viewer's own share + status, perks list from the entitlement catalog.
- **Actions**:
  - SETTLE $2 → 3i-5 Settle up (preselect this IOU; rails: bank transfer / PayNow / cash).
  - THANKS WINSTON → one-shot reaction; flips to "SENT ♥", toast "Rin thanked Winston." Notifies the buyer.
  - Card tap → boost detail (not designed).
- **Motion**: the card drops into the chat with the pink stamp edge (spring). Perk chips pop in one at a time (~100ms stagger, scale .8→1). On each settle, that avatar slides into the SETTLED row (realtime).
- **States MISSING**:
  - buyer's own view (no SETTLE; "3 still to go" + NUDGE?)
  - viewer already settled (button → "SETTLED ✓")
  - "I'll cover it" variant (no settle; THANKS only)
  - all settled (card collapses? Settled Tokek sticker 3i-5)
  - boost refunded/revoked
  - boost moved (trip cancelled)
  - member who joined after the boost (seat 7+: owes nothing?)
  - Android
- **AI**: guide reaction message in chat, auto-posted after a boost (LLM or template, as above). Inputs: chat context (Dev's complaint), plan. Output: one line + optional action (offer to redraft day 3). Background job on boost.activated.
- **Realtime**: crew channel. Boost card + header pill + entitlement refresh on every member device (redraft counter → ∞, map unlock, seat cap). Push to members "Winston boosted Kyoto" (sender = crewmate avatar per 5b). Crew Live Activities become available (5a-6).
- **OS**: push (communication-style notification), Live Activity push-to-start on trip days.
- **Gates**: visible to all crew members; perks apply per the matrix.

### 4c-2 Free boost ending (reminder)
- **Purpose**: 3 days before the crew's free first trip boost ends: what's kept, what pauses, and the offer to boost the next trip or go Pass+.
- **UI**: yellow halftone hero: "← RECAP", "OCT 23". Giant "3" (split-flap). "DAYS LEFT ON YOUR FREE FIRST TRIP". Caveat "Settle up before Sunday and I'll send the album." Tokek wave sticker (float 4000ms).
  - Card "KEPT FOR GOOD" (green label) chips: THE PLAN, 312 PHOTOS, THE RECAP, 4 CRITTERS, MAP TRAIL.
  - Card "PAUSES OCT 26" (orange label) chips: UNLIMITED TOKEK, REDRAFTS, LIVE MAP, ALL ICONS.
  - CTAs "BOOST KYOTO · $2 EACH" (pink), "PASS+ JUST FOR ME" (outline), "Stay free".
- **Data**: firstTripFree window end, days remaining (**in the user's local tz**), trip stats (photos count, critters found), the crew's next trip (Kyoto) + split share (price/N), outstanding balance for the settle nudge.
- **Actions**:
  - BOOST KYOTO · $2 EACH → 4b-3 (split preselected).
  - PASS+ JUST FOR ME → 4e-1.
  - Stay free → back, toast "Staying free. The album and recap are yours either way." (counts as the quiet no; do not re-show this trip).
- **Motion**: the big number flips down like a departures board (split-flap, ~600ms per flip, from 4→3 or counting down from the previous value). KEPT chips settle first (stagger ~80ms, drop + settle). PAUSES chips grey out one by one (~120ms stagger, saturation→0).
- **Delivery**: "Arrives as a push three days before the free boost ends, and again on the recap". Server-scheduled job at end − 3d, per member, local time within the ping budget. Deep link to this screen. Also shown as a card/interstitial after the recap plays (3m-1). Must not collide with the rating prompt (never after a paywall).
- **States MISSING**:
  - no next trip planned (CTA? "Boost your next trip" or Pass+ only)
  - next trip already boosted
  - user already Pass+ (hide PASS+ CTA, keep boost)
  - final day (1 DAY LEFT) / ended variant
  - organiser vs member copy
  - "album" gating ambiguity
  - offline
- **AI**: the Caveat line could be LLM/template (settle nudge, uses outstanding balance + deadline). Recommend a template.
- **Realtime**: none (per-user). **OS**: scheduled push (server), deep link. **Gates**: shown only to crews on first-trip-free.

### 4d-1 Your plan (manage hub)
- **Purpose**: plan status, boosts overview, management actions.
- **UI**: "← SETTINGS", "YOUR PLAN". Yellow card "YEARLY / PASS+ / Renews Nov 2, 2027 · $29.99" + gecko sticker.
  - Section "BOOSTS" list: "Kyoto · the Bali Six / Trip Boost · on until Apr 16 · **2 of 5 settled**" + pink "ON" pill; "Bali · the Bali Six / First trip free · ended Oct 26" + "ENDED".
  - Section "MANAGE": Change plan "Yearly ›", Payment method "•••• 4412 ›", Redeem a code ›, Restore purchases ›.
  - Pink text "Cancel Pass+".
- **Data**: Subscription{product, period, status, renewalDate, price (localized), platform}; boosts where the user is buyer **or member?** (the list shows boosts bought by Winston + the crew's free trip), with window, status, settle count (for the buyer's split).
- **Actions**:
  - Change plan → store plan switch (upgrade/downgrade within the subscription group) or in-app plan picker.
  - Payment method → store payment settings (**last-4 is not available from IAP APIs**: drop it or show only for web-billed).
  - Redeem → 4d-4. Restore → 4d-4 (or inline).
  - Cancel Pass+ → 4d-2.
  - Boost row tap → boost detail (not designed).
- **Motion**: the pass card slides in from Settings "with the same gold as the upgrade" (shared-element from the 3n-2 chip, ~450ms spring). The boost settle count ticks up live (odometer on the digit).
- **States MISSING** (big gap):
  - free user (no Pass+): what shows? likely an upsell card
  - monthly; paused ("Paused until Mar 2"); cancelled-still-active ("Ends Nov 2, 2027", Resubscribe)
  - grace (links to 4d-3); billing retry/on hold (access lost)
  - expired
  - gift/promo-sourced Pass+ (no store sub, "Ends Feb 2, 2028")
  - crew-yearly ($59) row
  - purchased on the other platform ("Manage on Google Play/App Store")
  - Family Sharing
  - loading / offline
- **Realtime**: settle count via the user channel.
- **OS**: store manage-subscriptions sheet / Play subscription deep link.
- **Gates**: n/a.

### 4d-2 Before you go (cancel with pause alternative)
- **Purpose**: honest cancel flow. Offer a pause until the next trip. No dark patterns ("There's no timer and no discount countdown").
- **UI**: "← YOUR PLAN", "BEFORE YOU GO" + Pon sticker. Body "If you cancel, Pass+ stays on until Nov 2, 2027. Kyoto's boost is separate and stays on for the whole crew."
  - Pause card (yellow outline): "BETWEEN TRIPS? / PAUSE UNTIL KYOTO INSTEAD / No charges from now until Mar 2, a month before you fly. Your icons and avatar stay on while paused." Month bars N D J F (thin, dim) M A (tall yellow) with labels.
  - "WHAT YOU'D LOSE": "Unlimited Tokek and Pon", "Bookings from your email", "Icons: Sakura Pon and 11 more".
  - CTAs "PAUSE TILL KYOTO" (yellow), "KEEP PASS+" (outline), "Cancel anyway" (pink text).
- **Data**: subscription period end; next trip (Kyoto, Apr 2) → resume = trip start − 1 month (Mar 2); guides of the user's trips; icons currently unlocked via Pass+ (count, a named example).
- **Actions**:
  - PAUSE TILL KYOTO → back, toast "Paused until Mar 2. No charges till then."
  - KEEP PASS+ → back.
  - Cancel anyway → "asks once more in a sheet" → proto toast "Cancelled. Pass+ stays on until Nov 2, 2027." **In reality**: cancel must hand off to the store's manage-subscription UI (the app cannot cancel a store subscription).
- **Motion**: paused months shrink to thin bars (height 18→4px, ~400ms `io`, stagger N→F) while Kyoto's month (M/A) stays tall. Pon idle.
- **Platform feasibility (critical)**:
  - The App Store has **no subscription pause**.
  - Google Play pause is **user-initiated from Play**, limited to up to 3 months (Nov→Mar = 4 months exceeds it), for auto-renewing base plans.
  - **Pausing a prepaid yearly plan is contradictory**: the user already paid through Nov 2027, so "no charges from now until Mar 2" has no meaning. The only coherent reading is monthly billing, or "shift the paid year" (freeze the remaining time), which the stores can't do natively.
  - Emulation options: (a) iOS: turn off auto-renew in the store + server "paused" UI state + a reminder/win-back offer before the trip; (b) Play: deep link to the Play pause UI (max 3 months); (c) server-side deferral (Play `defer` grants free time, not a pause).
- **States MISSING**: no upcoming trip (pause until when?); monthly vs yearly copy; resume-early; paused state in 4d-1; confirm sheet; the store handoff return (did they actually cancel? observe via server notification); Android.
- **AI**: none. **Realtime**: none. **OS**: store manage-subscriptions sheet; push reminder at resume − N days.
- **Gates**: Pass+ subscribers only.

### 4d-3 Card declined (billing failure, grace period)
- **Purpose**: renewal failed. Reassure (access stays 7 days) and fix the payment.
- **UI**: orange halftone hero with a dark card graphic "•••• 4412 / EXP 10/27" (orange) + gecko sticker (wiggle 3000ms). Title "THE CARD DIDN'T GO THROUGH". Body "Your Pass+ renewal on Nov 2 was declined. The card expired last month. Everything stays on for 7 more days while you sort it." Info list: "Pass+ stays on until **Nov 9**" (orange); "Kyoto boost / Already paid, not affected" (green check). CTA "UPDATE CARD" (orange), "Try again".
- **Data**: subscription status = billing_retry + grace end (renewal date + 7d); affected boosts (unaffected). **Card last-4, expiry and decline reason are NOT available via App Store/Play APIs.** Only status plus grace expiry (server notifications / subscription status API).
- **Actions**:
  - UPDATE CARD → store payment settings (iOS: store billing page / system billing-issue message; Play: subscription center deep link). Returns to "a green tick on the same card", proto toast "Card updated. Pass+ renewed.". Requires polling status on foreground or a server notification (DID_RENEW / RECOVERED).
  - Try again → re-check status (the app cannot force a store retry). Proto toast "Still declined. The card expired in October."
- **Motion**: the card tilts and shakes once on open (rot ±6°, ~500ms, error haptic). On success the card gets a green tick (check doodle draws on ~300ms, success haptic).
- **Grace length**: Apple Billing Grace Period supports 3/16/28-day options. Play supports configurable grace periods (e.g. 3/7/14/30). A uniform "7 days" means **server-side grace** independent of store config (keep entitlement 7d after the failure notification), or aligning copy per platform.
- **States MISSING**: grace expired → on hold / access lost (what does the user see? reverting icons); recovered; the entry path (push "Your card didn't go through" + in-app banner? only the prototype path via Payment method exists); OS-native billing-issue sheet duplication (iOS shows its own message; suppress one); Android.
- **AI**: none. **OS**: push (billing issue), store payment deep link, system billing message API.
- **Gates**: subscribers in the billing-retry state.

### 4d-4 Redeem or restore
- **Purpose**: redeem gift/promo/partner codes; restore purchases on a new phone.
- **UI**: "← YOUR PLAN", "GOT A CODE?", "Gift codes, promo codes and codes from a partner airline all go here." **Three code boxes** (58h, r16, Geist Mono 22, green inset ring when valid): "PASS" - "7K2Q" - "MAYA". Gift card (green r24): M avatar "3 MONTHS OF PASS+ / From Maya, 'for all the planning'". Note "Adds to your current plan. Your renewal moves to Feb 2, 2028." CTA "REDEEM" (yellow). Divider. "NEW PHONE?" "Brings back Pass+ and any boosts you bought with this store account." "RESTORE PURCHASES" (outline).
- **Data**: Code{normalized "PASS-7K2Q-MAYA", type gift|promo|partner, grant (Pass+ 3 months), sender, message, expiry, redemptions}; the user's current subscription end → new end preview.
- **Actions**:
  - Typing or pasting fills the boxes (auto-advance, uppercase, strip dashes). Live validation → green.
  - The gift card flips from a plain envelope to reveal the sender.
  - REDEEM → back, proto toast "3 months of Pass+ from Maya. Renewal moved to Feb 2028."
  - RESTORE PURCHASES → proto toast "Found Pass+ and one boost. Both restored." (store sync + server reconcile).
- **Motion**: boxes fill per char (scale pop 1→1.05). Border → green on valid (~200ms) + success haptic. The gift card flips (3D rotateY 180°, ~600ms `io`) from the envelope back to the front.
- **Platform/policy (critical)**:
  - App Store 3.1.1: apps may not use their own code/key mechanisms to unlock features. Allowed: **App Store Offer Codes** (system redemption sheet or redeem URL; format not custom, no live preview of sender) and **gifts of IAP-purchased items**.
  - "Partner airline" codes must be Offer Codes, or granted outside the app.
  - A custom 3-box UI with the sender reveal works only for **server-issued gift codes funded by an in-app gift purchase** (Maya's purchase flow is not designed).
  - "Renewal moves" for an active App Store subscriber requires the Extend Renewal Date API (≤90 days per extension, ≤2 per 365 days). Nov 2 → Feb 2 is 92 days, **over the cap**. Alternatively an offer code applied at next renewal.
  - Play: promo codes are redeemed via Play (redeem deep link); `subscriptions.defer` can push the next billing date.
- **States MISSING**: invalid / expired / already redeemed / not for this platform / already Pass+ via other platform / network error / rate-limit / restore found nothing / restore found purchases owned by another Critterpass account (transfer rule) / restore in progress.
- **AI**: none. **OS**: clipboard paste (use the system paste control to avoid the paste-permission prompt), store restore/sync, offer-code redemption sheet, universal link prefill.
- **Gates**: n/a.

### 4f-1 Seven's a crowd (seat cap, contextual)
- **Purpose**: inviting a 7th person on an unboosted free crew opens an offer instead of an error.
- **UI**: background 3f-6 "WHO'S IN?" dimmed. "ROOMS HELD 3D 23:11:11" live countdown (tg-count). Response bar 4 IN / 1 MAYBE / 1 UNOPENED. Roster (W organiser, M/J/R IN, A MAYBE, D UNOPENED). "PON SUGGESTS" cards (RESEND / OFFER).
  - Sheet: "KYOTO · SEAT 7" (yellow), "SEVEN'S A CROWD". Seven seat glyphs (seat-back + seat): W M J R A D filled in avatar colours, S dashed yellow **pulsing**. Body "Free crews top out at six. Boost Kyoto and Sam gets a seat, and the whole crew gets the live map and unlimited redrafts." Price row "$12, or $1.72 each" + green chip "SPLIT 7 WAYS". CTA "BOOST KYOTO · $12" (pink). "Keep it at six".
- **Data**: crew/trip member count, seat cap, invitee (Sam: name, avatar initial), boost price, split preview over N+1 **including a not-yet-member**.
- **Actions**:
  - BOOST KYOTO → 4b-3 (which says "SPLIT 6 WAYS": inconsistent with 7).
  - Keep it at six → back, toast "Sam stays on the invite list. A seat opens if someone drops out." (waitlist).
- **Motion**: six seats fill left to right with the crew (stagger ~80ms, drop + settle). Sam's seat pulses (scale 1→1.07, 1400ms loop) in dashed yellow. Countdown ticks per second.
- **Split math**: 12/7 = 1.714… shown as $1.72 (ceil), so 7 × 1.72 = 12.04. A remainder rule is needed (buyer absorbs the cents, or a mixed 1.71/1.72). Split can't include Sam until he joins.
- **States MISSING**:
  - the 7th person joining via **link/code** (3a-10/3a-11): the joiner's "crew full / waitlist" screen
  - Sam's waitlisted invite view
  - seat opens (dropout 3f-7) → notify Sam + organiser
  - crew already at 16 on a boosted trip
  - after boost end with 7+ members planning the next trip
  - non-organiser inviting
  - multiple pending invites beyond 6
- **AI**: none (Pon suggestion cards belong to 3f-6).
- **Realtime**: roster + countdown live. **OS**: haptic warning-light on open.
- **Gates**: seatCap(t) = 6 unless boosted.

### 4f-2 Live map teaser (live map on an unboosted trip)
- **Purpose**: show what the live map did on the last boosted trip, then offer a boost.
- **UI**: last trip's crew map (3g-4 Ubud: "THE BALI SIX / 5 of 6 sharing · trip days only / LIVE", meet-up CAMPUHAN RIDGE 17:00, pins MAYA+RIN Karsa Spa, ALEX Warung Pondok, JORDAN on the scooter 2 km, dashed routes, bottom list with ETAs, PING ALL / I'M ON MY WAY, "Sharing switches itself off on Oct 19 at midnight.").
  - It sits under a **greyscale scrim**: rgba(23,20,42,.66) + backdrop grayscale(1).
  - Tags "PREVIEW · YOUR BALI TRIP" (paper) + "KYOTO ISN'T BOOSTED" (pink).
  - Bottom card: yellow circle pin icon, "THE LIVE MAP", "You opened it **41 times** in Bali." Body "Everyone on one map during the trip, with walking times and SOS. It switches itself off at midnight on the last day." CTA "BOOST KYOTO · $12" (pink), "Maybe later".
- **Data**: the user's most recent boosted trip with map usage; replay dataset for the preview; usage counter map_opens per user per trip (41).
- **Actions**: BOOST → 4b-3. Maybe later → back; "closes it for this trip, and it doesn't come back until the next one" (per-trip suppression).
- **Motion**: the map keeps moving in grey (pins glide, Jordan's trail). LIVE dot blink 1400ms. Gecko hop 2400ms. Meet-up pin ping 1800ms. The yellow pin (your dot) pings 2000ms (s .6→1.5, o .8→0). CTA sweep 3600ms.
- **Privacy/feasibility**: replaying friends' past positions needs stored location history. Site-Legal says "We store the places you have been as pass entries, not a trail of coordinates". 4c-2 keeps a "MAP TRAIL" for good. Conflict. Safer: an **illustrative/synthetic replay** (scripted positions on the real meet-up map), or only the viewer's own trail.
- **States MISSING**:
  - user never had a boosted trip (no Bali): generic demo teaser
  - what the map screen shows after "Maybe later" (own location only? empty state with small "Boost for live map" chip?)
  - trip not in progress (sharing is "trip days only")
  - crewmate already purchasing
  - offline
- **AI**: none (usage-stat template).
- **Realtime**: none (preview). **OS**: map rendering, backdrop blur/greyscale.
- **Gates**: liveMap(t). **Safety**: SOS must remain free; remove "and SOS" from the boost copy or clarify.

### 4f-3 Last redraft (pre-emptive limit)
- **Purpose**: before using the last free redraft, warn once. Offer a boost for unlimited.
- **UI**: background 3c-9 "PON'S DRAFT" (organiser-only "ONLY YOU SEE THIS", 8-day list, BUILD THE PROPOSAL, Ask Pon to change a day) dimmed.
  - Sheet: "KYOTO · REDRAFT 3 OF 3" (orange), "LAST FREE REDRAFT", Pon thinking sticker (wiggle 2200ms, "rubs his chin").
  - **Three pips**: 2 crossed out (diagonal strike), the last glowing orange (pulse 1400ms).
  - Quote box Caveat orange "Make it count. Or boost the trip and I'll keep redrafting until everyone's happy."
  - CTA "USE MY LAST ONE" (orange), "BOOST · UNLIMITED · $12" (pink outline). Footer "Redrafts reset every trip."
- **Data**: RedraftCounter{tripId, used 2, limit 3}; trip boost state.
- **Actions**:
  - USE MY LAST ONE → normal redraft flow (proto → 3c-11 Change a day). The boost button "stays one tap away on the result" (3c-12 variant with the boost CTA, not designed).
  - BOOST → 4b-3.
- **Trigger**: caption "Tapping REDRAFT with one left raises this first". The prototype shows it over Pon's draft and routes USE → Change a day. So is it triggered on "Ask Pon to change a day" or on "REDRAFT DAY 4"? Pick one. Recommend: on REDRAFT submit, so no input is lost.
- **Motion**: sheet rise. Pips: two cross-outs draw (stroke ~200ms each), the last pulses orange with glow. Pon bob 2800ms (background sticker) + wiggle.
- **States MISSING**:
  - 0 left (hard limit: what happens on "Ask Pon to change a day"?)
  - redraft failed (should not consume a count)
  - redrafts during the trip (3j-1 rain swaps: do they count? Dev: "we used them all on day 2")
  - who can redraft (organiser only vs crew pool)
  - boosted (counter hidden or ∞)
  - pre-warning at 2 left?
- **AI**: the redraft itself is an LLM job (3c-11/12). The gate must **atomically reserve** a redraft before starting the job and **release it on failure**. The quote line is templated persona copy.
- **Realtime**: the counter is per trip, so it must sync to co-organisers. **Gates**: redraftLimit(t).

---

## 4. Feature list

| # | Feature | Description | Screens | Cx | Justification | Depends on |
|---|---|---|---|---|---|---|
| F1 | Entitlement engine + catalog | Server-authoritative resolution of user- and trip-scoped features from all sources (store subs, boosts, first-trip-free, crew-yearly, gifts/promos, grace/paused), limits config, client cache + push invalidation | all | L | Multi-source, time-windowed, two scopes, offline cache, must drive widgets/LA/icons | accounts, crews/trips |
| F2 | Store billing integration (iOS + Android) | Products, purchase with account token, transaction listener, server verification (signed transactions / purchase tokens), server notifications (renew, fail, grace, refund, revoke, pause), reconciliation job, sandbox/prod | 4e-1, 4b-4, 4d-* | XL | Two stores × subs + consumables, idempotency, edge states, review compliance | F1 |
| F3 | Final paywall (visa) | 4e-1 with personalised visa/MRZ, holo seal, light sweeps, ordered stamps, odometer price, localized savings math, required disclosures | 4e-1 | L | Bespoke motion + dynamic storefront pricing + compliance copy | F2, F1 |
| F4 | Comparison page | 4e-2 matrix, highlighter band column select, dual CTA | 4e-2 (4b-2 superseded) | S | Static server-driven table + simple interaction | F1 |
| F5 | Welcome to Pass+ | 4e-3 celebration, perks, route to icons | 4e-3 | S | One screen, reuses visa + stamp components | F3, F18 |
| F6 | Paywall governor + entry-point registry | Central rules: ≤1 paywall/day, suppressed contexts (day-of, SOS, delay, post-error), quiet-no per trip per entry point, rating-prompt coordination, analytics | all 4f, 4b-1, 4c-2 | M | Cross-cutting state + server/client sync | F1, analytics |
| F7 | Guide answer metering + limit card | Atomic per-user daily counter (tz rule), exemptions, group-chat rule, 4b-1 inline card, composer lock, "ask at midnight" queue + answer job | 4b-1 | M | Counter + queue + LLM job + push timing | F1, guide chat, push |
| F8 | Redraft quota + last-redraft prompt | Per-trip atomic reserve/release around the redraft job, 4f-3 sheet, post-result boost CTA, hard-limit state | 4f-3 | S | Simple counter, the LLM job already exists | F1, redraft job (3c) |
| F9 | Seat cap + waitlist | Cap enforcement on every join path, 4f-1 sheet, waitlist invite state, seat-opens notification | 4f-1 | M | Multiple join paths + concurrency + undesigned waitlist UX | F1, invites (3a/3f) |
| F10 | Live map gate + teaser | Gate crew map/LA/widget, 4f-2 greyscale replay preview, usage counter, per-trip dismissal | 4f-2 | M | Replay data + privacy-safe preview | F1, crew map (3g) |
| F11 | Trip Boost purchase flow | 4b-3 options (trip / all-year), who-pays, boost intent lock, store checkout, verifying beat, 4b-5 stamp | 4b-3, 4b-4, 4b-5 | L | Trip binding + concurrency + two products | F2, F1 |
| F12 | Boost cost split → Balances | Expense(source=boost) in the charged currency, shares, rounding remainder, settle tracking, reversal on refund | 4b-3, 4b-5, 4c-1, 4d-1 | M | Reuses the ledger; currency/rounding/refund edge cases | Balances (3i) |
| F13 | Crew boost broadcast | Realtime boost.activated → header pill, chat boost card (live settled row), perks refresh, push, guide reaction message, Live Activity eligibility | 4c-1 | M | Realtime fan-out + live-rendered system message | realtime, chat (3g), F1 |
| F14 | Boost lifecycle | Window calc (trip end + 7d, recalculated on date change), first-trip-free auto-grant + anti-abuse, expiry job (pause features, stop crew LAs, freeze seats), move-on-cancel/credit, duplicate-buy credit, refund/revoke | 4b-3, 4c-2, 4d-1 | L | Many state transitions tied to trip lifecycle | F1, F2, trips |
| F15 | Free-trip-ending reminder | Scheduled push T-3d (local, ping budget), 4c-2 screen, recap placement | 4c-2 | M | Scheduling + next-trip logic + variants | F14, push, recap (3m) |
| F16 | Your plan hub | 4d-1 with all subscription/boost states, platform-aware manage links | 4d-1 | M | Many undesigned states | F1, F2 |
| F17 | Cancel + pause | 4d-2 honest cancel, store handoff, pause emulation per platform, resume reminder, paused state | 4d-2 | L | Stores lack in-app pause/cancel; emulation + observation | F2, trips |
| F18 | Billing-issue handling | Grace policy (server 7d), push + banner, 4d-3, store payment deep link, recovery detection, OS billing message coordination | 4d-3 | M | Notification-driven state, per-platform differences | F2 |
| F19 | Codes + gifting | Server gift codes funded by in-app gift purchase (flow undesigned), Offer Codes for promo/partner, 4d-4 live validation + reveal, grant/extend logic | 4d-4 | L | Store policy constraints + extension API limits | F2, F1 |
| F20 | Restore + account linking | Store sync, reconcile to the app account, transfer rules, anonymous→account migration | 4d-4, 4e-1 | M | Cross-account ownership edge cases | F2, auth (3a) |
| F21 | Crew yearly boost ($59) | Crew-scoped 12-month product incl. buyer Pass+, subscription-group placement, crew binding, buyer-leaves rules | 4b-3 | L | Unusual product shape across both stores | F2, F14 |
| F22 | Perk side-effects | Alternate app icon unlock/revert (foreground-only), widget timeline reload + locked states, crew LA push-to-start on boost | 4e-3, 4c-1, 4c-2 | M | OS constraints on icon revert and LA start | F1, 3n-5, 5a, 5c |
| F23 | Sponsored picks (free tier) | Not designed anywhere. Labelled sponsored slots in Explore, contextual only (policy: no ad data sharing) | (3d) | L | Needs partner ops, labelling, ranking, privacy review | Explore (3d) |
| F24 | Monetization analytics + experiments | Impressions, entry point, outcome, conversion, price tests (store-supported) | all | M | Event schema + privacy consent | F6 |

---

## 5. Data model contributions

- **Product** {id: pass_monthly | pass_yearly | boost_trip | boost_crew_year | gift_pass_3m, storeIds{ios, android}, type: auto_renew_sub | consumable | non_renewing, subscriptionGroup, grants[] (feature keys + scope + duration)}. Prices are never stored as truth; they come from the store per storefront.
- **Subscription** {id, userId, platform: app_store | play | promo | gift, originalTransactionId | purchaseToken, productId, status: active | grace | billing_retry | on_hold | paused | cancelled_active | expired | revoked, autoRenew, currentPeriodStart/End, graceEndsAt, pausedFrom/resumeAt, renewalPrice{amountMinor, currency}, storefront, environment, appAccountToken, lastEventAt}.
- **StoreTransaction** (immutable ledger) {id, userId, platform, transactionId, originalTransactionId, productId, purchaseDate, priceMinor, currency, storefront, quantity, signedPayload (JWS/token), revocationDate/reason, refundedAt, boostIntentId?, giftCodeId?}. Unique(platform, transactionId) for idempotency.
- **BoostIntent** {id, tripId, crewId, buyerId, productId, splitMode: cover | split, splitMemberIds[], status: open | purchasing | fulfilled | expired | cancelled, expiresAt (~10 min)}. One open intent per trip (unique partial index).
- **TripBoost** {id, tripId, crewId, buyerId, source: purchase | first_trip_free | crew_year | moved | promo, transactionId?, crewYearGrantId?, startsAt, endsAt (= trip.endDate + 7d, recomputed on date changes), status: active | scheduled | ended | moved | revoked | credit, movedFromTripId, expenseId?}.
- **BoostCredit** {id, crewId | userId, reason: trip_cancelled | duplicate_purchase, fromBoostId, expiresAt?, consumedByBoostId}.
- **CrewYearGrant** {id, crewId, buyerId, subscriptionId | transactionId, validFrom, validTo, includesPassPlusForBuyer: true}.
- **FirstTripFreeGrant** {crewId (unique), tripId, startsAt, endsAt, abuseCheck{memberOverlapHash, decision}}.
- **UsageCounter** {subjectType: user | trip, subjectId, metric: guide_answers | redrafts | map_opens, periodKey (user-local date for daily, tripId for per-trip), count, limitAtTime, updatedAt}. Guide answers: atomic increment on answer completion. Redrafts: reserve/commit/release rows {redraftId, status}.
- **QueuedGuideQuestion** {id, userId, tripId, threadId, text, createdAt, answerAfter (reset time or morning window), status}.
- **PaywallImpression** {id, userId, tripId?, entryPoint: guide_limit | last_redraft | seat_7 | live_map | free_trip_ending | icon_style | widget_next_flight | widget_crew_live | lockscreen_crew | postcard | settings, shownAt, outcome: purchased_pass | purchased_boost | dismissed | quiet_no, suppressedUntil (trip end)}. Governor reads the last 24h + per-trip quiet-no.
- **Code** {id, code (normalized, unique), kind: gift | promo | partner, grant{product, durationDays}, senderUserId?, message?, fundedByTransactionId?, partnerId?, platformRestriction?, maxRedemptions, redeemedCount, expiresAt, status}. **CodeRedemption** {codeId, userId, redeemedAt, appliedAs: server_grant | store_extension | offer_code, newPeriodEnd}.
- **Expense** (3i slice) gains source=boost + boostId. **ExpenseShare** per member. Settlement progress drives the 4c-1 SETTLED row and the 4d-1 "2 of 5 settled".
- **ChatMessage** type `boost_card` {boostId} (rendered live) + `system` for boost moved/ended.
- **CrewInvite** gains status `waitlisted_seat` + waitlistPosition.
- **Relationships**: User 1–n Subscription; Trip 0–1 active TripBoost (n historical); TripBoost 0–1 Expense; Crew 0–1 FirstTripFreeGrant; Crew 0–n CrewYearGrant; Code 0–n CodeRedemption.
- **Privacy**:
  - No payment card data (the stores hold it). Last-4 is not obtainable for IAP anyway.
  - Signed store payloads contain no PII beyond ids, but they are financial records, so retain them per tax/audit needs, even after account deletion (anonymise the user link).
  - **Crewmates' Pass+ status is disclosed** in 4b-1 ("Maya has Pass+"). Needs a product decision or opt-out.
  - Boost buyer identity is visible to the crew (by design).
  - Usage counters (map opens "41 times") are behavioural data. Gift message is user content.
  - Map teaser replay vs the policy on location trails.
  - Postcard perk needs crew **postal addresses** (3m-9, cross-slice).

---

## 6. Backend / API needs

**Endpoints**
- `GET /catalog`: product ids per platform, entitlement matrix (limits server-driven), paywall copy variants, experiment assignment.
- `GET /me/entitlements?tripId=`: resolved features, limits, usage (guide used/limit/resetAt, redrafts used/limit), sources, expiries. ETag + push invalidation.
- `POST /billing/apple/transactions` (signed transaction), `POST /billing/google/purchases` (purchaseToken, productId, obfuscated ids). Both idempotent; they fulfil subscriptions, boosts (via intentId) and gifts.
- `POST /billing/restore` (client-sent current entitlements) → reconcile, return owned items + conflicts (owned by another account).
- `POST /webhooks/app-store` (Server Notifications v2: SUBSCRIBED, DID_RENEW, DID_FAIL_TO_RENEW(+GRACE_PERIOD), GRACE_PERIOD_EXPIRED, EXPIRED, DID_CHANGE_RENEWAL_STATUS, DID_CHANGE_RENEWAL_PREF, REFUND, REVOKE, CONSUMPTION_REQUEST, OFFER_REDEEMED, RENEWAL_EXTENDED).
- `POST /webhooks/google-rtdn` (Pub/Sub push: SUBSCRIPTION_PURCHASED/RENEWED/IN_GRACE_PERIOD/ON_HOLD/PAUSED/PAUSE_SCHEDULE_CHANGED/RECOVERED/CANCELED/EXPIRED/REVOKED; one-time product purchased/cancelled; voided purchases API).
- `POST /trips/{id}/boost-intents` {productId, splitMode, memberIds} → intent + lock; `DELETE` to release; `GET /trips/{id}/boost` (state, buyer, window, settle progress).
- `POST /boosts/{id}/move` (on trip cancel; server-initiated), `POST /boost-credits/{id}/apply`.
- `POST /guide/answers` (existing guide API) returns `quota_exhausted {used, limit, resetAt, crewPassHolders[]}`; `POST /guide/questions/queue`.
- `POST /trips/{id}/redrafts:reserve` → reservationId | `limit_reached`; the job commits or releases.
- `POST /crews/{id}/invites` → `seat_limit {cap, offer}` or `waitlisted`.
- `GET /paywall/eligibility?entryPoint=&tripId=` → show | suppress(reason). `POST /paywall/impressions`.
- `POST /codes/validate` (rate-limited; returns grant preview + sender), `POST /codes/redeem`, `POST /gifts` (after gift IAP → code issued, share link).
- `GET /me/subscription/manage-links` (platform-appropriate).
- `POST /me/subscription/pause-intent` (records the desired resume date for emulation + reminder).

**Background jobs**
- Boost expiry at endsAt: flip entitlements, end crew Live Activities (push end), freeze seat additions, notify.
- Boost window recompute on trip date change/cancel. Move-to-next-trip or issue a credit.
- First-trip-free auto-grant on the crew's first trip creation; ending reminder at endsAt − 3d (per member, local time, ping budget).
- Queued guide questions answered at reset / next morning window → push.
- Billing reconciliation (daily poll of the store subscription status APIs for drift), grace-expiry enforcement (server 7d).
- Pause emulation reminders (resume − N days, e.g. "a month before you fly") + win-back offer.
- Refund/revoke handler: revoke boost/sub, reverse or annotate the boost Expense, notify buyer/crew.
- Gift code expiry, code-abuse detection, first-trip-free abuse checks.
- Icon-revert flag on lapse (client acts next foreground).

**Realtime channels**
- `trip:{id}`: boost state, redraft counter, seat cap, intent lock ("Winston is boosting…").
- `crew:{id}:chat`: boost_card inserts + live settled updates.
- `user:{id}`: entitlements changed (triggers UI refresh, widget reload, icon state), usage counter.

**Third parties**
- App Store (StoreKit purchase APIs, App Store Server API, Server Notifications v2, Offer Codes, Billing Grace Period, billing-issue message, manage-subscriptions sheet, refund-request sheet).
- Google Play Billing (Billing Library, Play Developer API purchases/subscriptionsv2, RTDN via Cloud Pub/Sub, voided purchases, promo codes, subscription deferral).
- APNs/FCM; ActivityKit push-to-start.
- Build-vs-buy decision: a subscription-infrastructure vendor vs in-house (stack-agnostic, decide in the stack discussion).
- Product analytics/experimentation.
- (Cross-slice) print & mail vendor for the Pass+ postcard.

---

## 7. Cross-slice dependencies & shared components

- **Balances/Money (3i)**: boost expense source, shares, settle flow 3i-5 (SETTLE $2), settle progress events, Settled Tokek.
- **Guide chat (3j)**: quota enforcement, limit card, group-mode rule, voice/camera modalities count, queued questions.
- **Next trip setup (3c)**: redraft job reserve/release, 3c-12 result boost CTA, organiser-only draft.
- **Proposal/RSVP (3f)**: 3f-6 invite → seat cap; 3f-7 dropout → waitlist seat opens + boost split re-split question.
- **Onboarding/invites (3a)**: 3a-10/3a-11 join paths must enforce the seat cap; anonymous-first purchases → account linking.
- **Crew (3g)**: chat boost_card + header pill; crew map gate (3g-4) + teaser.
- **During trip (3k)**: governor suppression on day-of/SOS/delay screens; SOS stays free.
- **After (3m)**: 4c-2 after the recap; postcard perk (Pass+); rating prompt coordination (never after a paywall).
- **You (3n)**: 3n-1/3n-2 plan chips → 4d-1; 3n-5 icon styles (Pass+ STAMP → paywall; revert on lapse); 3n-4 avatars gating conflict; 3n-9 delete account ↔ store subscription.
- **Help (3p)**: articles "Splitting a Trip Boost", "Why can't I buy critters?".
- **Off-app (5a/5b/5c)**: crew Live Activity (boost), flight-day LA (Pass+), widget locked states (5c-5), notifications sender identity (4c-1 push from crewmate, 4c-2 from guide), ping budget.
- **Explore (3d)**: sponsored picks (undesigned).
- **Web (Site-Referral)**: pass covers are referral rewards (keep them distinct from paid perks); gift-code landing/deep link.

**Shared components**
- Passport page (paper + guilloché + spine + page no.)
- Visa card (holo seal, light sweep, MRZ generator)
- Stamp (rect/round variants with the slam kf, ink spread, haptic+SFX)
- Split-flap number and odometer price
- Seat row glyph
- Limit meter (N segments) and quota pips (crossable)
- Offer sheet (title, body, primary pink/yellow CTA, quiet-no text button)
- Perk chip
- Kept/Pauses chip groups
- Code boxes (segmented input)
- Gift envelope flip card
- Plan card (yellow)
- Boost list row with ON/ENDED pill
- Greyscale preview scrim with tags
- CTA light sweep
- Confetti
- Guide sticker with presets (float/bob/hop/wiggle)
- Governor-aware `presentOffer(entryPoint, tripId)` helper

---

## 8. Implementation risks / hard parts

1. **Pause is not a store primitive.** The App Store has no pause. Play pause is user-initiated in Play, ≤3 months. The 4d-2 Nov→Mar pause is 4 months and sits on a **prepaid yearly** plan, which is contradictory. This needs a product redesign or emulation (auto-renew off + reminder + win-back).
2. **The app cannot cancel or switch store subscriptions itself.** Cancel/Change plan must hand off to store UI and observe the outcome via server notifications. The "asks once more in a sheet" flow becomes a system sheet.
3. **No card data from IAP.** "Visa •••• 4412", "EXP 10/27" and "the card expired" (4d-1, 4d-3, 4b-4 is the system sheet, fine) are unobtainable. 4d-3 must be generic unless web billing exists.
4. **Grace period "7 days"** doesn't match Apple's configurable options (3/16/28). Implement a server-side grace to keep the copy uniform, or vary the copy per platform.
5. **Custom code redemption vs App Store 3.1.1.** Partner/promo codes need Offer Codes (system sheet or redeem URL). Custom boxes + sender reveal only for IAP-funded gifts. The "renewal moves" extension is capped (≤90 days, ≤2/yr on the App Store); 3 months (92 days) exceeds it. The gift purchase flow (Maya's side) is entirely undesigned.
6. **The system purchase sheet can't show "Split $2 each in Balances"** or a per-trip product name. The split confirmation moves to app UI.
7. **Boost ↔ trip binding + concurrency.** Two crewmates buying at once, and iOS developers cannot refund a duplicate. Needs an intent lock and credit conversion. Consumable restore semantics: finished consumables are absent from transaction history unless explicitly opted in (recent iOS). The server ledger is the source of truth.
8. **Split currency and rounding.** The buyer is charged in their storefront currency (tax-inclusive, e.g. SGD for a Singapore user) while the design shows USD and "$2 each". Record the actual charged amount/currency from the signed transaction, convert to the crew settlement currency, and allocate the rounding remainder ($1.72 × 7 ≠ $12). Crewmates on other storefronts see different local prices for the same boost.
9. **Refund/revoke after the crew has settled IOUs.** Revoke perks mid-trip? Reverse shares? Refund money already paid between friends? A policy is needed; a store refund can arrive weeks later.
10. **Boost window tied to mutable trip dates** (date re-vote, delay, cancellation → move to "next one": crew's or buyer's?). Expiry must also stop crew Live Activities on all phones and freeze seats without evicting.
11. **Guide quota fairness and cost.**
    - Combined meter across text/voice/camera. Voice is a streaming conversation, so define the unit.
    - Reset "00:00" in which tz. Travellers crossing zones can game it.
    - Exempt system jobs.
    - Don't count failed answers.
    - One Pass+ member unlocking group-chat answers for up to 16 people is a cost exposure: needs a fair-use cap.
    - "Ask at midnight" push conflicts with the ping budget/quiet hours.
12. **First-trip-free abuse.** A new crew per trip = infinite free boosts. It needs a definition (first trip per crew vs per user) + member-overlap heuristics.
13. **Paywall governor.** One paywall/day across many entry points (in-app, widgets, Live Activity asks, push, recap), context suppression (day-of, SOS, delay, post-error), per-trip quiet-no, rating-prompt exclusion. It must be centralised (server + client) or rules drift.
14. **Perk side effects on lapse.** Alternate-icon revert only works in the foreground and shows a system alert. Widgets need timeline reloads. Live Activity push-to-start for 6–16 phones on boost; end on expiry.
15. **App Review compliance on 4e-1.** Missing auto-renew terms, price-per-period clarity for monthly, Terms/Privacy links. "Maya has Pass+" (another user's subscription) disclosure. Reimbursement IOUs for a digital purchase are person-to-person, but "SETTLE $2" inside the boost card could draw review questions. "Settle up before Sunday and I'll send the album" reads as gating content on payment.
16. **Crew yearly ($59) product shape.** An auto-renewing sub in the same group as Pass+ (upgrade path, proration) vs non-renewing 12 months. Binding to one crew. The buyer leaves/deletes account. Stacking with existing Pass+ (double pay).
17. **Cross-platform crews.** Entitlements must be server-side and platform-agnostic. Manage/cancel only works on the origin store ("Manage on App Store" when on Android). Android design is absent (iOS-only surfaces: side-button checkout, Dynamic Island).
18. **Map teaser privacy.** Replaying crewmates' past positions contradicts the policy "not a trail of coordinates". Use a synthetic replay.
19. **Anonymous-first accounts.** Purchases before sign-in (3a) must be tied via app account token and migrate on sign-in/merge. Restore when the store account is already linked to another Critterpass account.
20. **Sponsored picks** are promised for the free tier but undesigned. They conflict with "we do not share with advertisers". Removing ads is a Pass+/Boost perk with no implementation spec.
21. **Bespoke motion** (holo seal, light sweeps, ordered stamps with page jolt, odometer, split-flap, ink spread) must run at 60fps, respect Reduce Motion, and be reusable across 4e/4b/4c.

---

## 9. Ambiguities & open product questions

1. **Boost scope for crew members.** 4e-2 says Boost gives only ∞ guide chat "ON TRIP" (no email bookings, no icons). The section intro says "Everyone gets Pass+ features on trip days". 4a-1 says "Everyone gets Pass+ for the trip". 4c-1 has the chip "PASS+ ON THE TRIP". Which is it?
2. Does "∞ ON TRIP" mean the whole boost window (planning included) or only trip days? Guide chat about this trip only, or any guide use by crew members?
3. Boost window start: at purchase (needed for pre-trip redrafts) or trip start? The displayed range "Apr 2–16" hides this.
4. First trip free: full Pass+ for all members (email bookings included?) or boost + icons + chat? Does it start at trip creation? Does a solo trip count as "first trip"? Is it per crew or per user (abuse)?
5. Redrafts: organiser-only (3c-9 "ONLY YOU SEE THIS") or a crew pool (Dev: "pon only gave us 3")? What counts: change-a-day, full redraft, guide plan swaps during the trip (3j-1), weather/delay auto-fixes? What are "unlimited plan changes" (limited how for free)? Is it intentional that Pass+ gives no extra redrafts?
6. Guide quota: unit per modality (voice conversation? camera scan?), tz for 00:00, whether the limit-hitting question is answered, the group-chat rule when a crewmate has Pass+ (fair-use cap?), and is revealing a crewmate's Pass+ status OK?
7. "Ask at midnight": literally push at 00:00, or next morning / roundup?
8. Seat cap scope: crew-level or trip-level? After a boost ends, can a 7+ crew plan the next trip unboosted? What does a 7th joiner via link/code see? The waitlist UX for Sam? Should the split include Sam (4f-1 "7 ways") or only current members (4b-3 "6 ways")?
9. 4b-3 CTA: the caption says the button counts down to "$2 share", but checkout charges $12. Final label?
10. Split rules: include Maybe/Unopened members? Can a member decline their share? Re-split on dropout (3f-7)? Rounding remainder? Split for the $59 yearly?
11. "Trip cancelled? The boost moves to your next one": the crew's next trip or the buyer's? Do IOUs move too? What if there's no next trip (credit expiry)?
12. Duplicate boosts (two buyers) and refunds: credit, or store refund request? Impact on settled IOUs?
13. Crew yearly $59: auto-renewing or fixed 12 months? Shown where in 4d-1? Cancel flow? Is buyer Pass+ stacking with an existing Pass+ (refund/proration)? What if the buyer leaves the crew?
14. Pause: offered for monthly only? How is it meaningful on yearly? Max length given Play's 3-month cap and no App Store support? Resume date rule ("a month before you fly") when there's no next trip?
15. Grace: a uniform 7 days, or store-configured per platform? What does the user see after grace ends (on hold)?
16. Payment-method/last-4 UI: drop it (IAP), or is there web/external billing (US link-out, EU alternative terms, Android user-choice billing) in scope?
17. Codes: which are App Store Offer Codes vs server gift codes? The gift purchase flow for the sender (Maya), partner-airline program details, code format ownership, gifting on Android?
18. Restore: behaviour when the store account's purchases belong to another Critterpass account; anonymous-first purchases before sign-in.
19. Icon/avatar counts are inconsistent: Free "2" vs 3n-5 (FACE Free, STICKER Free, PASSPORT default, STAMP Pass+) vs 4a-2 "ALL 24" vs 3n-3 "5 of 9 unlocked" vs 4d-2 "Sakura Pon and 11 more". What exactly is Pass+-gated in "avatars", given critter avatars are earned free (3n-4)?
20. Sponsored picks: where, labelling, who sells them, targeting under a "no advertisers" privacy policy? Are they hidden for the whole crew on a boosted trip?
21. Postcard perk (3m-9): not in the comparison table. Pass+ of whom (sender only)? Addresses collection? Boost/first-trip-free included?
22. SOS on free trips: confirm crew SOS + temporary location sharing stay free (4f-2 copy implies SOS is part of the boost map).
23. Should the BOOSTED stamp persist as a passport page/stamp (4b-5 "PAGE 08")? Is it visible on profile?
24. Paywall governor: do crew-side cards (4c-1), pushes (4c-2), widget locked taps and Live Activity asks count toward "one a day"? Is quiet-no suppression per entry point or all offers for that trip?
25. 4c-2: CTA when no next trip exists; does "Settle up before Sunday and I'll send the album" gate the album (it shouldn't)?
26. 4f-2 after "Maybe later": what does the unboosted crew map show (own location only)? What's the teaser for users with no prior boosted trip? Real replay vs synthetic?
27. 4f-3 trigger point (open "change a day" vs submit REDRAFT) and the 0-left hard-limit state.
28. Is there any Pass+ intro offer/free trial besides first-trip-free? Family Sharing on/off?
29. Is boosting a solo ("Just me") trip allowed?
30. Mock timeline inconsistencies: admitted 02 Nov 2026 / renews Nov 2, 2027; declined renewal "Nov 2" with card EXP 10/27; the Kyoto boost (Apr 2027) "not affected" in Nov 2027; "till next October" for crew yearly. Confirm the intended dates only for copy templates.
31. Final routing: confirm 4a-* and 4b-2 are dropped and all paywall entry points use 4e-1/4e-2 (the prototype still links rejected screens).
