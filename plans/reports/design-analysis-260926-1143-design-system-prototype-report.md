# Critterpass: design system, interaction model and prototype analysis

Date 2026-09-26. Scope: the whole app design system (tokens, components, motion, sound, a11y, l10n) plus the navigation model reconstructed from `Critterpass Prototype.dc.html`.
Sources:
- `design/Critterpass.dc.html` (149 phone screens, sliced by offset)
- prototype `<script type="text/x-dc">` (731 lines, parsed and executed under node to extract the flow graph)
- `design/doodles.js` (custom elements)
- `critters-data.js` header, `text/Site-*.txt`
- all 149 rendered screenshots. Every screen was viewed.

Frame chrome (the status bar, the MOTION caption under each phone and the label) is excluded from the frequency counts where noted.

---

## 0. Key findings (TL;DR)

1. **The app is dark-first and dark-only.** 136 of 149 screens sit on `#17142a`. Light is used only for "paper" document moments (passport, stamps, receipts). There is no light theme, even though the app-icon screen offers AUTO/LIGHT/DARK/TINTED for the icon.
2. **Everything is drawn with 6 accents plus an ink ramp.** The accents are yellow `#ffd84a`, orange `#ff9a4d`, pink `#ff5fa8`, blue `#4f86ff`, green `#54d6a4` and cream `#f4efe4`. The same 6 serve as guide colours, crew-member colours, category colours, confetti and tier colours. The semantic layer is thin and must be formalised.
3. **Typography runs on 4 in-app families.** Archivo is the heavy condensed display face: 900 weight, width axis at 58–84%, uppercase. Geist is the UI text face, Geist Mono is used for MRZ and data, and Caveat is the guide's handwriting voice. Instrument Serif appears only on the canvas and the website, never in the app.
4. **The motion system is custom elements.** `tg-motion` is a keyframe mini-DSL with 12 presets; 285 instances were found (155 preset + 130 custom). `tg-confetti`, `tg-type`, `tg-count` (a live countdown, not an odometer) and `doodle-art` (Canvas2D brush renderer with draw-on and blink) complete it.
   - Most entrances in the design are drawn as **9 s loops with long holds**. In the app they become one-shot entrances.
   - Loops are synced on a **global clock** (`startTime=0`).
5. **The prototype defines the real navigation grammar.** It has 10 transition types (push, sheet, rise, zoom = shared-element grow, burst, fold, flip, tab, fade, none), each with exact ms and easing. It also defines:
   - edge-swipe back (commits over 110 px or 0.55 px/ms)
   - sheet drag-dismiss (commits over 150 px)
   - press scale feedback
   - a "Dynamic Island toast" for in-app notices
   - 29 scenario entry points and 12 state groups
6. **The shell is a 5-slot tab bar:** HOME · TRIPS · raised guide FAB (opens guide chat sheet; hold opens Help) · WALLET · PASS.
7. **There is no audio or haptic code anywhere.** All sound and haptic intent lives in captions and on the Sound settings screen (3n-7). §5 is a cue list derived from them.
8. **Accessibility is mostly unspecified.**
   - The design uses fixed px and absolute positioning throughout, with text down to 7–8 px.
   - Several signals are colour-only: tier dots, overspend bar, form rings.
   - Several interactions are gesture-only: hold-to-fill, slide-to-board, drag-reorder.
   - `doodles.js` honours `prefers-reduced-motion` for loops and draw-on only.
   - Contrast on dark is good. The weak spots are tertiary text `#6f698c` (3.2–3.5:1) and outlines `#3a3466` (1.6:1).
9. **Localisation is high-risk.**
   - Uppercase copy is hard-coded in the source.
   - Condensed display lines use line-height 0.78–0.86, which will clip Vietnamese and Thai diacritics.
   - Archivo, Caveat and Geist have no CJK, Thai or Korean glyphs.
   - The MRZ strings need ICAO transliteration.
   - Direction arrows (`←`, `→`, `›`) are literal text characters.
   - Currency has 3 modes (home, local, both) plus a separate crew settlement currency.
10. **Design inconsistencies need decisions.**
    - Lisbon/Sardi colour is green in 3b-1 and 3b-3, blue in 3b-2, 3b-6, 3c-1, 3n-1, 5b-2 and 5c-1, and cyan `#9fe0ee` for Sardi's voice line in 3c-1.
    - Place-stamp colours do not match guide colours (CDMX is green, but Ajo's colour is pink).
    - Two paywall systems exist (4a exploration vs 4e final), and the prototype still routes 4b-1 and 4c-2 to 4a-1.
    - `font-stretch` 58% and 60% are below the loaded Archivo width axis minimum of 62, so they clamp.
    - Font weights are used that the stylesheet doesn't load: Geist 800, Geist Mono 600/700, Caveat 700.

---

## 1. Information architecture and navigation

### 1.1 App shell

**Screen frame**
- 390×844 frame with a 54 px corner radius and 20 px side gutters.
- Status bar is 50 px, with content starting around y=58. Home indicator is 134×5 at bottom 8.
- Bottom CTA stack is pinned at `bottom:36px` (primary pill plus a tertiary link, gap 12).

**Tab bar** (appears on 17 screens: 3b-1, 3b-2, 3b-4, 3b-5, 3b-6, 3d-2, 3d-4, 3e-1, 3h-1, 3i-1, 3i-6, 3k-1, 3k-2, 3l-2, 3l-7, 3l-8, 3m-2)
- 88 px tall, bg `#120f22`, top hairline `rgba(255,255,255,.07)`.
- Items are 62 px wide: 24 px doodle icon plus Archivo 800/700 10 px, .08em tracking. Active item is yellow `#ffd84a`; inactive is `#8d87a8`.
- Slots:
  1. **HOME** (`pin`)
  2. **TRIPS** (`ticket`)
  3. **Guide FAB** (see below)
  4. **WALLET** (`wallet`)
  5. **PASS** (`egg`)
- **Guide FAB**: a 66 px yellow circle raised −30 px with a 5 px `#17142a` ring. It holds the current guide sticker at 50 px (gecko recoloured `fill #fff3c4 spot #e0a92a accent #ff5fa8`).
  - Tap opens Guide chat as a sheet (3j-1).
  - Hold opens Help (3k-6, from the caption).
  - Label, and whether it swaps to the destination guide (for example Pon for Kyoto), are unspecified.

**Tab targets** (prototype `tab()`):

| Tab | Target | Notes |
|---|---|---|
| HOME | 3b-1, 3b-2 or 3b-6 | Picked by world state: first run, everyday, final vote |
| TRIPS | 3k-1 Trip hub | |
| FAB | 3j-1 | Opens as a sheet |
| WALLET | 3h-1 Bookings | Balances 3i-1 and Budget 3i-6 also show WALLET active |
| PASS | 3l-2 Your pass | |

- Tab switch resets the stack. The prototype has no per-tab stacks; this is a decision point.
- Re-tapping the active tab pops to its root.
- Tab-icon bounce: translateY −5, scale 1.18, 420 ms ease-out.

**Home header entry points** (3b-2, 3b-6)

| Element | Opens |
|---|---|
| "HEY WINSTON ›" | Profile 3n-1 |
| Crew name "THE BALI SIX ▾" (Archivo 900 30/.9, 72% width) | Crews sheet 3g-3 |
| Crew pill (avatar stack + chat doodle + pink count badge) | Crew chat 3g-1 |
| Bell with badge | Inbox 3b-4, or All caught up 3b-5 when empty |

**Screen header patterns**
- **(a) Pushed screen.** "← SECTION" back eyebrow (Archivo 800 11/.16em `#a9a3c0`), a status pill on the right, then a condensed H1.
- **(b) Sheet.** Grabber, then a coloured eyebrow (for example "SAVE YOUR PASS" in yellow, "JUST YOU AND PON" in green with a lock, "LAST CHECK" in pink), then H1.
- **(c) Story.** 8 progress segments, a guide avatar with "TOKEK PRESENTS · ♪ gamelan lo-fi", and ✕.
- **(d) Camera.** A mode pill on the left (ENCOUNTER, POINT AND ASK, LEGENDARY) and a context pill on the right.
- **(e) Collapsing large title (3n-6).** "Header collapses to a small title as you scroll."
- **(f) Colour hero panel.** Guide or urgency colour with an 8 px halftone, bottom radius 40. Used on 3d-1, 3b-8, 3k-2, 3k-4, 3k-5, 3k-6, 3k-8, 3k-10, 3o-2, 4c-2, 4d-3.

### 1.2 Transition vocabulary (prototype `trans()`, exact)

The standard easing below is `E = cubic-bezier(.32,.72,0,1)`. The scrim colour is `#07060e`.

| Type | Used for | Incoming | Outgoing | Duration / easing |
|---|---|---|---|---|
| push | Drill-down | translateX 100%→0 | translateX 0→−30%, scrim 0→.5 | 480 E |
| pop | Back | −30%→0 | 0→100%, scrim .5→0 | 420 E |
| sheet | Modal sheet | Sheet foreground translates up (844 − sheetTop), background fades in 320 ease-out | scale .93, scrim 0→.45 | 540 E |
| rise | Full-screen modal (checkout, paywall, slide-to-board, recap cover, SOS) | translateY 100%→0, delay 120 | scale .93, scrim .45 | 620 E |
| dismiss | Close a sheet or rise | Reverse; background fade 300 ease-in | — | 420 E |
| zoom / unzoom | **Shared-element grow** from the tapped card | scale from source width/390 about the source centre; clip-path inset rounded 22/s → 54; opacity 0→1 over the first 35% (linear) | scale .94, scrim .5 | 560 E (unzoom 460). Falls back to burst/unfade if the source is detached |
| burst | Celebration reveal (3c-2, 3l-1, 3l-6, 3l-10, 4b-5) | scale 1.2→1, opacity 0→1, 640 ms `cubic-bezier(.2,1.3,.35,1)`, delay 120, plus a full-screen flash `#fffbe8` peaking at .55 over 460 ms | opacity→0, scale .9, 360 ease-in | 640 |
| fold | AI-job handoff (3c-7→3c-8→3c-9, 3c-11→3c-12) | translateY 70→0 + fade, 560 E, delay 160 | fade + scale .9, 380 `cubic-bezier(.5,0,.75,0)` | 560 |
| flip / flipback | Card flip (defined, but unused by the flow) | rotateY −90→0 at perspective 1600, 420 `(.1,.6,.3,1)`, delay 260 | 0→90, 260 `(.5,0,.9,.5)` | 680 total |
| tab | Tab switch | fade 240 ease-out; children translateY 12→0 over 420 E (tab bar excluded) | — | 420 |
| fade | Same-slot state swap (replace) | opacity 0→1 | — | 300 ease-out |
| none / unfade | Default back for fade-family transitions | — | opacity 1→0 | 260 ease-in |

Back inversion map: `push→pop`, `sheet→dismiss`, `rise→dismiss`, `zoom→unzoom`, `flip→flipback`, `fade|tab|burst|fold|none→unfade`.

### 1.3 Sheets, detents, gestures

**Sheet styling**
- bg `#17142a`, top radius 30–32.
- Grabber 38–40×5 `#3a3466` at top ~10.
- The shadow `0 -12px 30px rgba(0,0,0,.4)` (18 uses) is most likely the sheet shadow.
- The presenting screen scales to .93 and dims (a page-sheet look). In static comps it shows as a "peek" strip at y≈60–90.

**Detents** (measured sheet top on the 844 frame)

| Detent | Top | Screens |
|---|---|---|
| **large** | 92–120 px (~.87) | 3b-3, 3b-7 (keyboard up), 3c-10 (keyboard), 3c-11, 3f-4, 3g-3, 3j-1 (120), 3o-4, 4b-1, 4b-3, 4b-4 (system store sheet, light `#f2f0ec`) |
| **medium / over-media** | 312–520 px | 3d-3 place detail (312, no grabber; photo pushes in behind), 3h-3 (412, over map), 3i-4 (452), 3i-3 (470, over camera), 3j-3 (520, over camera) |
| **content-fit** (auto height from bottom) | — | 3a-7, 3n-10, 3p-5, 4f-1, 4f-3, 5a-6 |

**Gestures** (prototype `pointer()`)

| Gesture | Mechanics |
|---|---|
| Tap vs drag | Movement over 8 px cancels the tap |
| Long-press | 320 ms (`hold`); used for composer hold-to-talk 3j-1→3j-2 |
| Edge-swipe back | Starts at x<28 when stack >1. Tracks 1:1; underlying layer moves −30%→0; scrim .5→0. Commits at dx>110 or v>.55 px/ms; settles 300 ms `cubic-bezier(.2,.8,.2,1)` |
| Drag-to-dismiss | Grab zone: top 110 px of a sheet, or top 160 px of a rise/zoom screen. Progress normalised over 520 px. Presenter scale .93→1, scrim .45→0; sheet background alpha fades with progress. Commits at dy>150 or v>.55 |
| Press feedback | Scale down to .92 (width <120), .96 (120–240) or .975 (>240) over 130 ms `cubic-bezier(.3,.7,.4,1)`. Release overshoots to 1.035 at 45%, 420 ms ease-out. Opt out with `nopress` |
| Dead-tap affordance | A yellow ring ripple plus a flash of tap targets. Prototype-only; drop it |
| Prototype keys | ←/Esc/Backspace = back, H = hints, R = restart. `slowmo` prop gives 1×, 2× or 4× (useful for motion QA) |

### 1.4 Screen graph

Reconstructed from the prototype flow (executed), helper methods and captions. Transition is in parentheses.

Always available in addition to the rows below:
- Edge-swipe back on pushed screens.
- Drag-dismiss on sheet, rise and zoom screens.
- The tab bar where present (HOME→3b-1/3b-2/3b-6, TRIPS→3k-1, FAB→3j-1 sheet, WALLET→3h-1, PASS→3l-2).

| Screen | Reachable → (trigger, transition) |
|---|---|
| 3a-1 Splash | OPEN YOUR PASS→3a-2 (push; caption: cover swings open, page fills screen); "I have an invite code"→3a-11 (push) |
| 3a-2 Your name | NEXT→3a-3 |
| 3a-3 Your photo | THAT'S ME→3a-4; USE A REAL PHOTO→camera (toast) |
| 3a-4 This or that | Tap either card→3a-5 (other card flings, stamp thuds; caption says 6 questions) |
| 3a-5 Home base | THAT'S HOME→3a-6 |
| 3a-6 Pass issued | SAVE MY PASS→3a-7 (sheet) |
| 3a-7 Save your pass | Apple / Google→3a-9; Phone→3a-8 |
| 3a-8 Phone sign-in | Auto: OTP autofill, then +2.15 s→3a-9; Apple / Google→3a-9 |
| 3a-9 Permissions | LET'S GO / Ask me later→3b-1 |
| 3a-10 Invite ticket | (deep-link entry) TAKE THE SEAT→3a-12; "Just look around first"→3f-2 |
| 3a-11 Join with a code | JOIN THE BALI SIX→3a-12; code boxes→wrong-code shake demo; Paste a link→re-drop; "Wrong crew?"→back. Also opened as a sheet from 3b-1 and by fade from 3g-3 |
| 3a-12 Pass, three taps | ISSUE MY PASS→3a-13 (caption: sign-in sheet as 3a-7 first) |
| 3a-13 You're in | SEE THE PLAN→3f-3; Say hi→3g-1 |
| 3b-1 Home, first run | 6 guide cells→3d-1 (hop then zoom); SOMEWHERE ELSE→3b-7 (sheet); JOIN WITH A CODE→3a-11 (sheet) |
| 3b-2 Home | bell→3b-4 (3b-5 once all handled); name→3n-1; crew name→3g-3 (sheet); crew pill→3g-1; BALI card→3k-1 (zoom); WHERE NEXT? / Kyoto sticker→3c-1; Lisbon sticker / PITCH A PLACE→3b-3 (sheet); guide tip→3d-1 |
| 3b-3 Pitch a place | ADD TO THE VOTE→back (caption: card flies onto the board); PORTO / SEVILLE alternatives (toast) |
| 3b-4 Inbox | Card titles→3g-2 / 3k-5 / 3f-6; inline actions (NUSA PENIDA, GILI T, APPROVE, KEEP 19:30, NUDGE DEV) slide the card off; after 3 handled→3b-5 (fade, replace); "Maya reacted"→3f-2 (sheet); "Jordan paid"→3i-5; segmented ALL / NEEDS YOU / CREW / GUIDES |
| 3b-5 All caught up | Tap sleeping gecko→wakes (pose wave, then sleep after 2.2 s) |
| 3b-6 Home, final vote | As 3b-2, plus the split card→3c-1 (zoom) and tally strip→3c-1 |
| 3b-7 Somewhere else | Marrakech result / keyboard "go"→3b-8 (zoom); other results (toast hints) |
| 3b-8 Marrakech | PITCH TO THE CREW→3b-6; SAVE / SOLO TRIP (flap + toast); local silhouettes (shake + hint) |
| 3c-1 Vote showdown | Tap Kyoto half→squash + VS punch; +1.5 s→3c-2 (burst); Lisbon half→toast |
| 3c-2 Kyoto wins | SET UP KYOTO→3c-3 |
| 3c-3 When | LOCK APR 2–9→3c-5; step tabs→3c-5 / 3c-6 / 3c-7 |
| 3c-4 No week fits | 3 option radios re-flap the CTA. ASK DEV→toasts, +3.7 s→3c-3 (fade, replace); other options / "Pick a week anyway"→3c-5 |
| 3c-5 Budget | LOOKS GOOD→3c-6; ✓ step tabs→stepTo 3c-3; step tabs→3c-6 / 3c-7 |
| 3c-6 Rooms | LOOKS GOOD→3c-7; BUDGET ✓→stepTo 3c-5 |
| 3c-7 Must-dos | "Dev is typing" row→3c-10 (sheet); DRAFT MY TRIP→3c-8 (fold); ROOMS ✓→stepTo 3c-6 |
| 3c-8 Pon is drafting | Auto +5.2 s or tap→3c-9 (fold, replace) |
| 3c-9 Pon's draft | BUILD THE PROPOSAL→3f-1; "Ask Pon to change a day"→3c-11 (sheet), or 4f-3 when on the last free redraft |
| 3c-10 Add a must-do | Suggestion or "add"→back to 3c-7 (row fills, then pops) |
| 3c-11 Change a day | Day chips radio + reason chips; REDRAFT DAY 4→flap "REDRAFTING…"; +0.9 s→3c-12 (fold, replace). Other days→back + toast |
| 3c-12 Pon's redraft | KEEP IT / Put Nara back→back (3c-9 row flaps to new title) |
| 3d-1 Destination guide | Crew plans link→3o-1; place card→3d-3 (zoom); PITCH TO THE CREW→3c-1; SAVE / SOLO TRIP (toast) |
| 3d-2 Swipe together | Drag card (>110 px) or ✕ / ♥ buttons→fling; yes→MATCH stamp; WHY THIS? (toast) |
| 3d-3 Place detail | "18 min from the ryokan"→3d-4; ADD TO DAY 2 (in place); ↗ share (link) |
| 3d-4 Map | Bottom card→3d-3 (zoom); filter chips→pins re-drop |
| 3e-1 Trip plan | SHARE→3o-4 (sheet); day rows→3h-3 / 3d-2 / 3e-2 / 3k-2 / 3g-2; LIST / MAP / CALENDAR segmented |
| 3e-2 Day planning | MOVE IT, or tap the dashed ghost→block animates; +1.3 s→3e-3 |
| 3e-3 Review changes | SEND TO CREW→3g-1; "Apply to my plan only"→popTo 3e-1; per-row ✓/✕ flap |
| 3f-1 Build the proposal | PREVIEW AS RIN / DEV→3f-2 (sheet); SEND TO 5 FRIENDS→flap "SENDING…"→3f-6; TRAILER / POSTER / POSTCARD selector |
| 3f-2 Proposal trailer | I'M IN→3f-5 (rise); MAYBE→3f-4 (sheet); ✕→back; "Tap for Day 3" (restart slide) |
| 3f-3 Your version | I'M IN→3f-5 (rise); pick rows (toast "why"); Skip-Nara toggle→odometer $1,310↔$1,246 |
| 3f-4 Not sure yet | Reason chips; offer toggles→odometer + CTA flap; I'M IN AT $x→3f-5 (rise); "Still thinking"→back |
| 3f-5 Slide to board | Drag knob more than 70% of the 282 px track→6 s choreography→3f-6 (push) |
| 3f-6 Who's in | RESEND→slide off; +3.4 s toast [OPEN]→3f-7. OFFER→slide off. Inviting a 7th→4f-1 |
| 3f-7 Dev's out | APPLY CHANGES→back; "Ask the crew first"→3g-1 |
| 3g-1 Crew chat | MAP→3g-4; composer→3j-1 (sheet); VIEW (expense)→3i-1; poll YES/MAYBE/NO (+1 float); I'M IN (flap BOOKED) |
| 3g-2 Live collab | Option cards +1; KEEP IT / UNDO (toast) |
| 3g-3 Crews | Current crew→back; other crew→back (cross-fade Home to that crew); JOIN / LATER; JOIN WITH A CODE→3a-11 (fade, replace) |
| 3g-4 Crew map | Enter: +2.6 s toast "Jordan sent an SOS" [OPEN]→3k-10 (rise). Pins, meet-up pin, PING ALL, I'M ON MY WAY in place. Unboosted→4f-2 |
| 3h-1 Bookings | REVIEW→3h-2; pull-down fans cards |
| 3h-2 Add a booking | COPY (flap); ADD / IGNORE slide off |
| 3h-3 Getting around | SHOW THIS TO MADE→glow + TTS; BOOK (flap) |
| 3i-1 Balances | SETTLE IN 3 TAPS→3i-5; SCAN→3i-3 (sheet); ADD→3i-2 (sheet); BUDGET→3i-6 |
| 3i-2 Add an expense | Keypad, PAID BY radio, split segmented; ADD→back + toast; SCAN INSTEAD→3i-3 (fade, replace) |
| 3i-3 Scan a receipt | SPLIT IT→back; state swap→3i-4 |
| 3i-4 Couldn't read it | TYPE THE LINES→3i-2 (fade); RETAKE→3i-3 (fade); SPLIT EVENLY→back |
| 3i-5 Settle up | REQUESTED / PENDING→PAID ✓; both paid→confetti. NUDGE / REMIND in place |
| 3i-6 Budget | Tab bar only |
| 3j-1 Guide chat | PROPOSE TO GROUP→3g-1 (fade, replace); CALL A CAR→3h-3; TRANSLATE A MENU→3j-3; PHARMACY→3k-6 (all fade, replace); hold composer→3j-2 (fade, replace); GROUP / JUST ME segmented |
| 3j-2 Voice | SEND TO THE GROUP→3g-1 (fade) |
| 3j-3 Point and ask | SPLIT THE BILL→3i-3 (fade); ORDER FOR 6 / LEAST SPICY? (toast) |
| 3k-1 Trip hub | PLAN→3e-1; BOOKINGS→3h-1; MONEY→3i-1; QUESTS→3l-7; briefing DONE / NUDGE / SET inline |
| 3k-2 Day-of | 9° AT THE TOP→3k-7; summit row→3k-4; hot springs→3h-1; packing chips strike through |
| 3k-3 Lock screen | Live Activity / notification→3k-2 (zoom); Maya notification→3g-1 (zoom) |
| 3k-4 Offline | NO SIGNAL→back online (ticks, "SENT" flap); OPEN TODAY'S PLAN→3k-2 |
| 3k-5 Flight delayed | APPROVE / KEEP→card slides off, row added. TELL THE CREW→3g-1; +3.6 s toast "SQ 938 has landed" [OPEN]→3l-1 (burst) |
| 3k-6 Help | GO→3h-3; call / tile / phrase in place |
| 3k-7 Forecast | Watch rows→3k-8 / 3k-9 (others toast) |
| 3k-8 Storm warning | Option radios flap the CTA; CTA→back + toast |
| 3k-9 Running late | Same pattern as 3k-8 |
| 3k-10 Crew SOS | "See him on the map"→stepTo 3g-4; I'M GOING (flap) |
| 3l-1 Egg hatch | SAY HI→3j-1 (sheet); "later"→3k-1 (tab) |
| 3l-2 Your pass | Here-now card→3l-3 (zoom); legendary banner→3l-9; Vietnam→3l-8; quests→3l-7; ALL / FOUND / NEAR ME filter |
| 3l-3 Critter detail | Found forms→variant flip; locked forms shake; legendary→toast [OPEN]→3l-9; MAKE IT MY GUIDE (flap) |
| 3l-4 Encounter | Press-hold ring 1.5 s→3l-6 (burst); tap critter→hops away. State swap→3l-5. Entry comes from a location trigger (5a-4) or the Trip hub scenario |
| 3l-5 It wandered off | REMIND ME AT 07:00 (flap); "Back to the day"→back or 3k-1 |
| 3l-6 Befriended | ADD TO YOUR PASS→sticker clone flies (780 ms arc)→3l-2 (tab), lands with thud |
| 3l-7 Crew quests | Rows (toast) |
| 3l-8 Vietnam set | Cells (found: pop + note; locked: shake + city) |
| 3l-9 Once a year | Sakura row→3l-10 (burst); REMIND ME (flap) |
| 3l-10 Sakura Pon | Hold gold ring 2.4 s→confetti 140; +1.6 s→3l-2 (tab) |
| 3m-1 Recap | Enter: +1.6 s toast "Rate the trip?" [OPEN]→3o-3. SHARE RECAP→3m-3 (rise); WHERE NEXT?→3b-2 (tab); photos→3m-2; got-away→3l-9. System rating prompt 3p-6 appears after the story |
| 3m-3…3m-9 Story | Tap / next→push the next card; ✕→back. 3m-5 MVP vote→3m-6; 3m-7 REMIND→3m-8; 3m-9 SEND→back, "Mail a real one"→4e-1 (rise) |
| 3m-10 A year later | (push-notification entry) PLAN A REUNION→3b-2 (tab); ✕→Home |
| 3n-1 Profile | PASS+ chip→4d-1; EDIT→3n-3; SETTINGS→3n-2; RETAKE→3a-4 (sheet); crew rows→Home |
| 3n-2 Settings | Plan pill→4d-1; Music→3n-7; NOTIFICATIONS→5b-4; "more"→3n-6; QUIET / NORMAL / CHATTY plays a voice sample |
| 3n-3 Edit profile | Avatar / CHANGE→3n-4; App icon→3n-5; SAVE→back |
| 3n-4 Avatar | Pick critter→all previews update; DONE→back |
| 3n-5 App icon | STAMP (PASS+)→4e-1; style tiles swap preview; locked shake |
| 3n-6 Settings, more | →3n-8, 3n-7, 3p-6, 3p-2, 3p-4, 3p-1, 3n-9 (widget gallery 5c-5 is listed as a child but has no row) |
| 3n-9 Delete account | CONTINUE→3n-10 (sheet); SETTLE UP→3i-5 (then returns) |
| 3n-10 Hold to delete | Hold ring→3n-11; "Keep my account"→back ×2 |
| 3n-11 Account closed | UNDO→3b-2 (tab); Close→3a-1 |
| 3o-1 Crew plans | Pon's pick→3o-2 (zoom); filter chips toggle |
| 3o-2 Shared plan | COPY INTO OUR TRIP→3c-9; + per day / DAY 3 ONLY (toast) |
| 3o-3 Rate the trip | LOVED / FINE / SKIP flicks the card; SHARE THE PLAN TOO→3o-4 (sheet) |
| 3o-4 Share the plan | PUBLISH→back (envelope fly-off) |
| 3p-1 Help | Tiles→3p-2 / 3p-4 / 3p-6; shake anywhere→3p-2 |
| 3p-2 Send feedback | SEND IT→3p-3 |
| 3p-3 Feedback sent | BACK TO SETTINGS→3n-6; "See what others asked for"→3p-4 |
| 3p-4 Idea board | + SUGGEST→3p-5 (sheet); vote boxes |
| 3p-5 Suggest | VOTE (duplicate)→back; MINE'S DIFFERENT→back |
| 3p-6 Rate the app | Stars / Not Now→back (system sheet) |
| 4a-1 / 4a-2 / 4a-3 Paywall explorations | CTA→4b-4 (rise); boost→4b-3 (sheet); compare→4b-2; RESTORE→4d-4 |
| 4b-1 Out of questions | GET PASS+→4a-1 (rise; should be 4e-1); ASK AT MIDNIGHT→back; "Maya has Pass+"→3g-1 |
| 4b-2 Compare | PASS+→4b-4 (rise); BOOST→4b-3 |
| 4b-3 Boost Kyoto | WHO PAYS segmented; BOOST FOR $12→4b-4 (rise) |
| 4b-4 Checkout | Side-button / ring→4b-5 (burst) |
| 4b-5 Stamped | TELL THE CREW→4c-1; Done→Home |
| 4c-1 Boosted by Winston | SETTLE $2→3i-5; THANKS (flap) |
| 4c-2 Free boost ending | (push entry) BOOST→4b-3; PASS+→4a-1 (rise); Stay free→back |
| 4d-1 Your plan | Cancel→4d-2; Redeem / Restore→4d-4; Change→4b-2; Payment→4d-3 |
| 4d-2 / 4d-3 / 4d-4 | Actions→back + toast |
| 4e-1 Paywall (final) | GET PASS+→4e-3; boost→4b-3; What's in each→4e-2; RESTORE→4d-4. Billing segmented is a price odometer |
| 4e-2 What's in each | PASS+→4e-3; BOOST→4b-3 |
| 4e-3 Welcome | PICK A NEW ICON→3n-5; Done→Home |
| 4f-1 / 4f-2 / 4f-3 Limits | BOOST→4b-3 (sheet); quiet exit→back; 4f-3 USE MY LAST ONE→3c-11 |
| 5a-1 Leave-by LA | I'M UP (toast; ticks pips on all phones) |
| 5a-2 Crew, live | SOS→3k-10; RUNNING LATE |
| 5a-5 Dynamic Island | ASK TOKEK→3j-1; I'M UP |
| 5a-6 On every lock screen | Boost CTA→4b-3; quiet option→back |
| 5b-1 Notifications | Roundup→3j-1; Pon→3c-9; Balances→3i-1 |
| 5b-2 Vote notification | Vote actions (no unlock); "Open the showdown"→3c-1 |
| 5b-3 Leave-by alarm | SLIDE, I'M UP→5a-1; Snooze 5 min (once) |
| 5b-4 How much we ping | Budget drag; rows |
| 5c-1 / 5c-2 widgets | Vote side (interactive); NUDGE DEV (interactive) |
| 5c-5 Widget gallery | + per widget; CREW, LIVE→5a-6 (sheet); NEXT FLIGHT→4e-1 (rise) |
| 3k-3, 5a-3, 5a-4, 5c-3, 5c-4 | Display-only system surfaces (tap-through targets in §1.7) |

**No inbound in-app link** (reached via scenario, state swap, deep link or OS surface): 3a-10, 3c-4, 3i-4, 3k-3, 3l-4, 3l-5, 3m-1, 3m-10, 4a-2, 4a-3, 4b-1, 4c-2, 4f-1, 4f-2, 4f-3, all of 5a/5b/5c.

### 1.5 State groups

The prototype `STATES` list gives one route with several states. Implement these as a single screen with a state machine, not separate routes:

- [3b-1 | 3b-2 | 3b-6]
- [3b-4 | 3b-5]
- [3c-1 | 3c-2]
- [3c-3 | 3c-4]
- [3c-8 | 3c-9]
- [3f-6 | 3f-7]
- [3i-3 | 3i-4]
- [3j-1 | 3j-2 | 3j-3] (guide modes)
- [3k-1 | 3k-5]
- [3k-2 | 3k-3 | 3k-4]
- [3l-4 | 3l-5]
- [4a-1 | 4a-2 | 4a-3]

### 1.6 Scenario entry points (prototype `SCEN`, 29)

Format: scenario → the stack it opens.

1. New here → [Splash]
2. Somewhere else → [3b-1, 3b-7]
3. Invited by a friend → [3a-10]
4. Bali, 17 days out → [3b-2]
5. Vote and set up Kyoto → [3b-6, 3c-1]
6. Change a day with Pon → [3c-9]
7. Kyoto proposal as Rin → [3f-2]
8. The crew → [3b-6]
9. Day 4 Batur sunrise → [3k-3]
10. Things go sideways → [3k-7]
11. Jordan hits SOS → [3g-1, 3g-4, 3k-10]
12. Landing late → [3k-1, 3k-5]
13. Finding a critter → [3k-1, 3l-4]
14. The Critterdex → [3l-2]
15. After the trip → [3m-1]
16. Other crews' plans → [3d-1, 3o-1]
17. Make it yours → [3n-1, 3n-3]
18. Pon runs out of answers → [4b-1]
19. Boost Kyoto → [3b-6, 4b-3]
20. Free first trip ends → [3m-1, 4c-2]
21. Manage your plan → [3n-1, 3n-2, 4d-1]
22. Settings and sound → [3n-1, 3n-2]
23. Feedback and ideas → [3n-6, 3p-1]
24. Leaving → [3n-6, 3n-9]
25. Pass+ final paywall → [4e-1]
26. Hitting a limit → [3f-6, 4f-1]
27. The recap story → [3m-1, 3m-3]
28. Off the app → [5a-1]
29. Invited, the short way → [3a-10]

The prototype persists the stack in `localStorage cp-proto-stack` and restores it on load. That is the equivalent of app state restoration.

### 1.7 Deep-link targets and back-stack synthesis

The prototype `PARENT` map is the logical "up" parent used when a screen is entered cold. Use it to **synthesise the back stack for deep links**. Examples:

- 3c-9→3c-7→3c-6→3c-5→3c-3→3c-2→Home
- 3l-3→3l-2
- 3k-10→3g-4→3g-1→Home
- 3m-3..9→3m-1
- 4e-1→Home

**Universal links** (host `critterpass.app`, per `Site - Referral`: `critterpass.app/i/WINST8`)

| Link | Opens | Notes |
|---|---|---|
| `/i/<code>` invite or referral | 3a-10 | Deferred deep link with prefilled crew and invitee data. "Opened from WhatsApp"; web invite has a QR code and an expiring code. Fallback to 3a-11 with the code pasted |
| Place share | Place in crew context | "Link copied. It opens in the app for the crew" (3d-3 ↗) |
| Proposal / personal version | 3f-2 → 3f-3 | |
| Read-only plan | Plan view | 3o-4 "Copy a read-only link" |
| Gift / promo code | 4d-4 | Prefilled `PASS-7K2Q-MAYA` |
| Recap share | 3m-3 | Story 9:16, postcard, poster; web viewer for non-users? |
| Booking forward address | Email inbound | `bali-six@in.critterpass.app` (3h-2). An address, not a link, but it routes to 3h-2 review |

**OS-surface routes**

| Surface | Route |
|---|---|
| Leave-by Live Activity / DI / "Rise and shine" notification | 3k-2 |
| Crewmate chat notification | 3g-1 |
| Evening roundup | 3j-1 |
| Pon pitch notification | 3c-9 or 3f-3 |
| Balances notification | 3i-1 |
| Vote notification | 3c-1 (actions in place) |
| Flight landed | 3l-1 |
| SOS push | 3k-10 |
| Critter nearby LA / push | 3l-4 |
| Storm LA | 3k-8 |
| Running-late reroute | 3k-9 |
| Anniversary | 3m-10 |
| Free-boost ending push | 4c-2 |
| "Fix shipped" Inbox card | 3p-3 note |
| Idea shipped | 3p-4 |
| Widgets | countdown→3k-1 / 3b-2; vote→3c-1; Today→3k-2; balances→3i-1 / 3i-5; crew live→3g-4; Critterdex→3l-2; next flight→3h-1 |
| StandBy / alarm | 5b-3 |
| App Store subscription management | External link |

---

## 2. Design tokens

### 2.1 Colour

Frequencies are hex occurrences across screen bodies, including doodle attributes.

**Ink ramp (dark UI)**

| Token (proposed) | Hex | Uses | Role |
|---|---|---|---|
| ink-950 | `#0b0a12` | 213 | Device bezel; key shadow `0 1px 0` |
| ink-930 | `#0d0b18` / `#0e0c1c` | 12 / 4 | Scene backdrop: camera sheets (3f-4, 3i-4), night scenes (3l-10, 5b-3) |
| ink-900 | `#120f22` | 18 | Tab bar, sunken |
| **ink-850 (bg.base)** | `#17142a` | 1671 | App background; also *ink text on accents* (982 as color) |
| ink-800 (bg.raised) | `#1f1b38` | 479 | Cards, list groups, bubbles, keypad keys |
| ink-780 | `#241f3d` | 13 | Wallpaper stripes, alt surface |
| ink-700 (bg.control) | `#2c2750` | 323 | Chips, segmented track, secondary buttons, progress track, ring track |
| ink-600 (border.control) | `#3a3466` | 321 | Outlines 2 px, off-toggle track, grabber, locked silhouettes, dashed placeholders |
| ink-500 | `#5b5487` | 4 | Rare |
| ink-400 (text.tertiary) | `#6f698c` | 128 | Footers, timestamps (3.2–3.5:1) |
| ink-300 | `#8d87a8` | 116 | Inactive tab, quaternary text |
| ink-200 (text.secondary) | `#a9a3c0` | 781 | Secondary text, eyebrows, **tier common** |
| ink-100 | `#d8d3ee` | 13 | Unselected chip text |
| divider | `rgba(255,255,255,.07)` | 132 | Row separators, tab bar hairline |
| scrim | `#07060e` @ .45–.5 (proto); `rgba(23,20,42,.6)` in comps | — | |

**Paper (light, document moments)**

| Token | Hex | Role |
|---|---|---|
| paper | `#f4efe4` (1324) | Primary text on dark; paper surface; sticker die-cut edge; selected segment bg; Cusco / Paco colour; Winston's colour |
| paper-bright | `#fffdf6` | Sticker white, receipt, doodle eye |
| paper-warm | `#fff3c4`, `#fff1dc`, `#fff1d6` | Warm tints, critter bellies |
| paper-ink | `#211d18` / `#221e19` (brush default ink) | Ink on paper, doodle strokes |
| paper-muted | `#3d372f`, `#5d564b`, `#6b6356`, `#8a7f6c`, `#b7ad9c`, `#cfc4ad` | Paper greys (mostly canvas captions) |
| rust | `#c4623e` | Caveat handwriting on paper ("Critters are never for sale"), EXIT / BALI stamp ink |
| canvas | `#e9e4da` | Design canvas only |

**Accents** (the 6-colour system; ink `#17142a` is used on top of all of them)

| Accent | Hex | Uses | Guide / place | Semantic roles observed |
|---|---|---|---|---|
| yellow | `#ffd84a` | 802 | **Tokek / Bali** | Primary CTA, focus / selection ring (`inset 0 0 0 2px`), active tab, Pass+ brand, **legendary**, "needs you" highlight, guide voice (Tokek), confetti |
| orange | `#ff9a4d` | 195 | **Pon / Kyoto** | Kyoto hero, heatmap ramp (`rgba(255,154,77,.2/.34/.5/1)`), warnings (owed-money card 3n-9, card declined 4d-3, last redraft 4f-3), Pon voice |
| pink | `#ff5fa8` | 328 | **Ajo / Mexico City** | Urgent (leave-by, delay, SOS, help), badges and counts, destructive (delete), **Boost brand**, **epic**, negative balance, clash, rooms-held timer |
| blue | `#4f86ff` | 185 | **Lundi / Iceland** | Weather / info, **rare**, "you" dot on maps, planned status, flights category |
| green | `#54d6a4` | 329 | **Sardi / Lisbon** (3b-1) | Success, IN, PAID, online, toggles on, confirm (befriend, issue pass), code valid, owed-to-you |
| cream | `#f4efe4` | — | **Paco / Cusco** | Neutral 6th member colour |

**Accent shades used**

| Family | Hex values | Where |
|---|---|---|
| Green deep | `#2e9a74` | Critter spots, PAID stamp |
| Gold | `#e0a92a`, `#c89221`, `#c99a2a`, `#8a6414` | Legendary |
| Gold bronze | `#6b5a24` (34, legendary silhouette), `#3a2f14` (gold-dark bg) | Legendary |
| Pink light | `#ffc2d9`, `#ff8fbf`, `#fff1f6` | Axolotl / critter fills |
| Pink deep | `#c94f86`, `#c43d7d`, `#3a1830` | |
| Blue | `#2f5fc4`, `#8fb0ff` | |
| Leaf | `#a9d08c` (55) | Gecko body |
| Cyan | `#9fe0ee` | Sardi voice line 3c-1 (inconsistent) |

**Map and system colours**
- Map: base `#172536` with 2 px grid `rgba(244,239,228,.05)` every 60–72 px; park/water `#1d3a38`, `#12261f`, `#0f2624`.
- System: iOS blue `#0a84ff` (rating alert); store sheet `#f2f0ec` / `#e2dfd8`; neutral greys `#8a8a8a`, `#b0b0b0`, `#141414` (icon previews, tinted mode).

**Tier colours** (3l-2, 3l-3 labels, exact)

| Tier | Colour | Visual treatment |
|---|---|---|
| Common | `#a9a3c0` | — |
| Rare | `#4f86ff` | Recolour (for example Temple Tokek green `#54d6a4` / `#2e9a74`); blue avatar ring |
| Epic | `#ff5fa8` | Pose change plus pink die-cut edge: `filter: drop-shadow(±2px 0 0 #ff5fa8)` ×4 |
| Legendary | `#ffd84a` | Gold edge via `drop-shadow(±3px … #ffd84a)`, sparkles, gold ring; silhouette `#6b5a24` with yellow "?"; "one day a year" |

- Locked slots: `doodle-art locked` (`#3a3466` silhouette) with a "?" in the tier colour.
- Found corner dots (3l-8) are coloured only; there is no shape encoding.

**Crew member colours** (Bali Six, reused everywhere: avatars, map pins, signatures, award cards)

| Member | Colour |
|---|---|
| Winston | cream |
| Maya | pink |
| Alex | blue |
| Jordan | yellow |
| Rin | green |
| Dev | orange |

- Uni Housemates cycles the same palette: K orange, S blue, T yellow.
- On paper, colours are adjusted: Jordan's signature becomes `#3a3466`, Dev's becomes rust.
- Rule needed: is member colour per user or per crew, and how are collisions handled with 7–16 members (Boost)?

**Inconsistencies to resolve**
- **Lisbon/Sardi**: green in 3b-1 and 3b-3; blue in 3b-2, 3b-6, 3c-1, 5b-2, 5c-1 and the 3n-1 stamp; cyan voice text in 3c-1.
- **Place stamps** on 3n-1 do not follow guide colours: LISBON blue, HÀ NỘI orange, SEOUL pink, CDMX green (Ajo is pink), BALI yellow dashed.
- Recommend a `place.color` source of truth, with guide colour = place colour.

### 2.2 Typography

Loaded (Google Fonts link): Instrument Serif (ital 0/1), Geist 400–700, Geist Mono 400/500, Caveat 500/600, Archivo `wdth 62..125, wght 400..900`.

**In-app families and roles** (weights actually used)

| Family | Weights (count) | Role |
|---|---|---|
| **Archivo** (variable) | 700 (461), 800 (950), 900 (882) | All display, titles, labels, buttons, chips, numerals. Always uppercase. Width axis only 58–84% |
| **Geist** | 400 (183), 500 (633), 600 (400), 700 (268), **800 (11, not loaded)** | Body, list rows, inputs, chat |
| **Geist Mono** | 400, 500, **600 (186), 700 (5), not loaded** | MRZ, passport field labels ("GIVEN NAME · PRÉNOM"), times in timelines, receipts, codes, photo placeholders, map captions |
| **Caveat** | 600 (67), **700 (1, not loaded)** | Guide voice lines (colour = guide colour), signatures, postcard notes, captions on paper |
| Instrument Serif | — | Not used in-app (canvas and site only); drop from the app bundle |
| SF / system | — | Only inside system surfaces (Sign in with Apple button, rating alert) |

**Width axis usage (font-stretch)**

| Value | Uses | Note |
|---|---|---|
| 78% | 244 | |
| 70% | 150 | |
| 80% | 109 | |
| 72% | 49 | |
| 74% | 29 | |
| 62% | 28 | |
| 66% | 24 | |
| 84% | 22 | |
| 60% | 9 | Below the loaded minimum of 62; renders at 62 |
| 76% | 8 | |
| 64% | 7 | |
| 68% | 6 | |
| 58% | 2 | Below the loaded minimum of 62; renders at 62 (3m-3, 3m-9) |

Normalise to 5 steps: **62 / 66 / 70 / 78 / 100**.

**Proposed type scale** (derived from frequency, excluding canvas chrome)

| Token | Spec | Where |
|---|---|---|
| display-mega | Archivo 900, 110–176 / .78–.8, wdth 62, tracking −.02em | Single-word heroes: KYOTO 124 (3c-2), BALI 176 (3m-3), 03:10 132 (3k-2, 5b-3), StandBy 150, showdown 120, destination 116, "3" 128 (4c-2); lock-screen clock 112 (72%) |
| display-hero | 900, 72–90 / .8–.85, wdth 62–66 | Countdown BALI 90, $186.40 84, amount 76, $1,350 72, MARRAKECH 74, BOOSTED 86 |
| display-xl | 900, 56–64 / .84–.86, wdth 66–70, −.01em | DELAYED 2H 10M, ROUGH SEAS, BEFRIENDED!, WHERE TO FIRST? |
| **h1** (screen title) | 900, **40–52 / .86**, wdth **70**, −.01em | Most common: 52 ×24, 46 ×19, 44 ×18, 40 ×17, 48 ×10. Recommend a base of 44 that auto-fits between 40 and 52 |
| h2 | 900, 30–36 / .9, wdth 70–72 | Crew name, section heroes |
| h3 | 900, 20–28 / 1, wdth 70–80, .02em | Card heroes (TIRTA EMPUL, SIN → KIX codes 44–64) |
| title | 900, **15–17 / 1**, wdth **78**, .02em | List and card item titles (NISHIKI AT DUSK) |
| button-lg | 900, 16, wdth 100, **.06em** | Primary pill CTA |
| button-sm | 800, 11–14, .06em | Mini actions, header pills |
| **eyebrow** | **700, 11, .16em**, `#a9a3c0` | Section labels (315 uses) |
| label / chip | 800, 10–11.5, .06–.1em | Pills, status chips, tab labels (10, .08em) |
| micro | 800, 7–9.5 | Tier labels, map pin sub-labels. **Too small; min 11 recommended** |
| body-lg | Geist 500, 14–14.5 / 1.4–1.45 | |
| body | Geist 500, 13–13.5 / 1.35–1.45 (400 variant) | |
| body-sm | Geist 500, 12–12.5 / 1.3–1.4 | |
| caption | Geist 500, 10.5–11.5 | |
| row-title | Geist 600, 14–15 | Settings rows, names |
| input | Geist 600, 17–20; OTP 700, 24 | |
| mono-data | Geist Mono 500, 8.5–12, .04–.08em | MRZ 500 12–12.5; code boxes 500 22 / .1em |
| voice | Caveat 600, 17–22 / 1.1 (postcard 26, signatures 22) | |

- Numerals: `font-variant-numeric: tabular-nums` on countdowns and amounts (29 uses). Needed for odometer and split-flap.
- `text-wrap: pretty` is used on 428 elements and `balance` on 5 (web-only; native needs a line-break strategy).

### 2.3 Spacing

**Frequencies**
- Gutters: `left/right 20` (256 uses); 14 inside cards; 16 in some sheets.
- Gaps: 6 (392), 12 (360), 4 (285), 8 (270), 10 (212), 2 (189), 16 (155), 3 (145), 14 (104), 5 (101).
- Card padding: `12px 14px` (66), `14px 16px` (46), `2px 14px` for list groups whose rows carry `9px 0` vertical padding.

**Proposed scale:** 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32. Layout constants:

| Constant | Value |
|---|---|
| gutter | 20 |
| status-bar | 50, content top 58 |
| cta-bottom | 36 |
| cta-gap | 12 |
| tabbar | 88 |
| home-indicator | 34 zone |

**Control heights**

| Control | Height |
|---|---|
| Primary CTA | 58 (r29) |
| Secondary pill | 56–58 |
| Header pill | 36–40 |
| Chip | 26–32 |
| OTP box | 46×56 |
| Keypad key | ~64 |
| Toggle | 46×28 (knob 22) |
| Avatar | 18 / 26 / 32 / 44 |
| FAB | 66 |

### 2.4 Radii

| Value | Uses | Role |
|---|---|---|
| 50% | 485 | Circles |
| 20 | 286 | Cards, list groups |
| 3 | 282 | Segments, bars |
| 4 | 235 | Tags, battery |
| 9 | 167 | Segmented items |
| 54 | 149 | Frame |
| 16 | 148 | |
| 1.5 | 148 | |
| 14 | 129 | Tiles, inputs |
| 10 | 127 | |
| 22 | 115 | Big cards |
| 29 | 92 | CTA |
| 18 | 92 | |
| 12 | 82 | |
| 24 | 52 | |
| 32 / 30 top | 22 | Sheets |
| `0 0 40px 40px` | 13 | Hero panels |
| 22.4% | 13 | App-icon squircle |

- Chat bubbles are asymmetric: `18 18 18 4` and `16 16 16 4`. Ticket stub: `10 16 16 10`.
- Proposed tokens: xs 4, sm 9, md 14, lg 20, xl 24, sheet 32, hero 40, frame 54, pill = h/2, circle.

### 2.5 Elevation, rings, shadows

**Rings (the primary "elevation" language: flat and sticker-like)**
- Avatar cut-out ring: `0 0 0 2px <bg>` (`#17142a` ×133, `#1f1b38` ×116).
- Selection double ring: `0 0 0 3px #17142a, 0 0 0 5px <accent>` (chips, avatars, icons).
- Selected option: `inset 0 0 0 2px #ffd84a` (24).
- Idle input: `inset 0 0 0 2px #3a3466`.
- Valid: `inset … #54d6a4`. Error: `#ff5fa8`.

**Shadows and filters**

| Use | Spec |
|---|---|
| Sheet | `0 -12px 30px rgba(0,0,0,.4)` |
| Floating card | `0 20px 40px rgba(0,0,0,.4)`, `0 8px 20px rgba(0,0,0,.3)`, `0 6px 18px rgba(0,0,0,.25)` |
| On paper | `0 6px 14px rgba(23,20,42,.12)` |
| Printed / hard offset | `0 6px 0 rgba(0,0,0,.25)`, `0 2px 0 rgba(0,0,0,.3)` (icon tiles), `text-shadow 3px 3px 0 #17142a` (postcard BALI) |
| Sticker drop (canvas, doodles.js) | `rgba(0,0,0,.32)` blur 5 y 2.5 (×DPR) |
| Die-cut tier edge | `filter: drop-shadow` ×4 (epic pink 2 px, legendary yellow 3 px) |
| Glow ring feedback (proto `glow()`) | `0 0 0 0→16px rgba(255,216,74,.75→0)` 900 ms ×2 |

### 2.6 Textures and ornaments

| Texture | Spec | Where |
|---|---|---|
| **Halftone dots** on colour | `radial-gradient(rgba(23,20,42,.12–.14) 1.3px, transparent 1.7px) 0 0/8px 8px` | Every colour hero, ticket, card, showdown |
| Dots on dark | `rgba(255,216,74,.2)` 9 px; `rgba(244,239,228,.07)` 9 px; `rgba(255,216,74,.10)` 14 px | Splash, invite, voice orb |
| **Guilloche paper** | `#f4efe4 repeating-radial-gradient(circle at 50% 120%, rgba(23,20,42,.05) 0 1px, transparent 1px 7px)` (variants at 20% 120%); coloured guilloche on cards `repeating-radial-gradient(circle at 110% -10%, rgba(255,154,77,.09)…9px)` | Passport pages |
| Hatched photo placeholder | `repeating-linear-gradient(135deg, rgba(255,255,255,.035–.08) 0 8px, transparent 8px 16px)` on muted colours (`#6b2b1c`, `#26402c`, `#1d3a38`, `#4a3a22`…) with a Geist Mono "photo · …" caption | All photos are placeholders |
| Engraving | `repeating-linear-gradient(115deg, rgba(23,20,42,.05–.06) 0 1px, transparent 1px 6px)` | Gold cover, visa |
| Barcode | `repeating-linear-gradient(90deg, #17142a 0 2px, transparent 2px 4px, …)` | Tickets, receipts, boarding pass |
| Rays | `repeating-conic-gradient(rgba(255,241,220,.45) 0 9deg, transparent 9deg 18deg)` + `spin` 9 s | 3c-2, 3l-6 |
| Glows | `radial-gradient(circle at 50% 42%, rgba(255,154,77,.28), transparent 62%)` | Drafting, got-away, alarm warm glow |
| Holographic seal | `conic-gradient(#ff5fa8, #ffd84a, #54d6a4, #4f86ff, #ff5fa8)` rotating | 4e-1 visa |
| Sheen | skewX(−20°), 60 px, `linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)` swept by tg-motion | Every primary CTA (15), passport cover, visa |
| Lock-screen wallpaper | `#241f3d` with 135° stripes | Stand-in |

### 2.7 Surfaces: dark vs light

| Surface | Screens |
|---|---|
| Dark base `#17142a` | 136 |
| Paper full-screen `#f4efe4` | 3 (3a-13 manifest, 3m-8 stamp page, 3n-11 account closed) |
| Paper top-half heroes | 3p-3, 4b-5, 4e-3 |
| Paper document cards | 3a-2, 3a-6, 3a-12, 4e-1, 4e-2, 4a-1 |
| Colour floods | Orange 3c-2 and 3m-6; yellow 3m-3 |
| Deep scenes `#0d0b18` / `#0e0c1c` | 3f-4, 3i-4, 3l-10, 5b-3 |
| Map `#172536` | 3g-4, 3k-9 |
| Black | StandBy 5c-4 (landscape 844×390, the only landscape comp) |

The only rule implied is **paper = official document or passport moment; colour flood = celebration or urgency**. Name these semantic surface roles (`surface.document`, `surface.celebrate`, `surface.alert`) so they are applied consistently.

### 2.8 Iconography

All icons are `doodle-art` brush doodles, with no icon font.

- **Creatures (6):** gecko, tanuki, puffin, axolotl, sardine, alpaca.
- **Critters:** `cp-001…cp-150`, from `critters-draw-*`.
- **Icons (28):** arrow, bed, bell, boat, cal, camera, car, chat, check, circle, egg, flame, food, heart, lock, pin, plane, rain, spark, squiggle, star, sun, temple, ticket, underline, volcano, wallet, wave.
- **Poses:** idle, wave (23), cheer (26), think (20), point (14), sleep (5), crack (egg, 1).
- **Attributes:** `kind, pose, size, ink, fill, accent, spot, belly, eye, pupil, seed, blend (multiply | source-over), sticker (edge colour), sticker-w, locked (silhouette colour), anim=none, blink=false, delay`.
- 574 of 667 instances are `anim="none"`, so draw-on is reserved for about 90 hero moments.
- Text glyphs are used as icons: ✕, ←, →, ›, ▾, ♡, ♥, ▲, ✓, ⌫, ↗, ▶. They need replacing with real icons for mirroring and accessibility.

---

## 3. Component inventory

Screen ids are examples, not exhaustive, where marked "…". Variants are separated by " / ".

### 3.1 Shell and navigation

| # | Component | Variants / spec | Screens |
|---|---|---|---|
| 1 | Screen scaffold | Dark / paper / colour-hero / scene; optional halftone; status-bar tint (time varies per scene: 2:48, 16:38, 21:10…) | All |
| 2 | Tab bar + guide FAB | 5 slots; active yellow; FAB 66 px guide sticker; hold→Help | 17 screens (§1.1) |
| 3 | Back eyebrow link | "← SECTION" Archivo 800 11/.16em | Most pushed screens |
| 4 | Close button | ✕ glyph, circular 40 px on media | 3d-3, 3i-3, 3m-*, 4e-1… |
| 5 | Large title / collapsing title | Condensed H1; collapses on scroll | 3n-6 (collapse); all |
| 6 | Header pill cluster | EDIT / SETTINGS / SHARE / SAVE ♡ / JOIN WITH A CODE / RESTORE; status pills (ONLY YOU SEE THIS 🔒, ROOMS HELD countdown, KYOTO WON 4–2 tilted sticker, LIVE •, NO SIGNAL •, BOOSTED, DEV REPLIED) | 3c-9, 3f-6, 3b-1, 3n-1… |
| 7 | Home header | Greeting→profile, crew switcher ▾, crew pill (avatar stack + chat + badge), bell + badge | 3b-2, 3b-6 |
| 8 | Sheet container | Large / medium / fit detents; grabber; presenter scale .93 | 22 screens (§1.3) |
| 9 | Full-screen modal (rise) | Checkout, paywall, slide-to-board, story | 3f-5, 4b-4, 4e-1, 3m-3 |
| 10 | Story shell | 8 progress segments (5–6 s, linear fill), guide header + music label, tap zones, hold-to-pause | 3f-2, 3m-3…3m-9 |
| 11 | Wizard step tabs | 4 steps; done state ✓ green text; current yellow pill | 3c-3…3c-7 |
| 12 | Page dots | "PAGE n OF 4" + pill dots (active 18×8) | 3a-2…3a-5; 4a-3 carousel dots |
| 13 | Island toast (prototype) | 122×35→360×62 pill from the Dynamic Island; guide sticker 32 + 2-line text + optional OPEN yellow button; auto-hide 2.8 s | Prototype, everywhere |
| 14 | Keyboard-attached composer | + button, pill input, mic circle (cream); hold-to-talk | 3g-1, 3j-1, 3j-3, 4b-1, 4c-1 |

### 3.2 Buttons and inputs

| # | Component | Variants | Screens |
|---|---|---|---|
| 15 | Primary pill CTA | 58h r29; **yellow** (default), **green** (3a-12, 3l-3, 3l-6), **pink** (3j-2, 3m-5, 3n-9, 4b-3, 4c-2, 4f-*), **orange** (4d-3, 4f-3), **ink** (3a-13, 3c-2, 3n-11), **cream** (3m-1, 3p-3); sheen sweep; label can flap (split-flap) to reflect state (REDRAFT DAY n, I'M IN AT $x) | All |
| 16 | Secondary outline pill | 2 px `#3a3466`, transparent | 3d-1, 3g-4, 3k-10, 4c-2, 4d-2, 3o-3 |
| 17 | Tertiary text link | Geist 600 14 `#a9a3c0` / cream; pink for destructive ("Cancel anyway") | Most screens |
| 18 | Split CTA row | Primary + secondary, or primary + circular icon (chat, ↗) | 3d-3, 3l-3, 3f-2, 3f-3 |
| 19 | Inline action buttons | Small pills in cards: yellow choice, green approve, orange nudge, ghost | 3b-4, 3k-1, 3k-5, 3i-5, 3h-2 |
| 20 | Circular icon button | 40–56 px dark or cream (mic), on-photo back / share / heart | 3d-3, 3g-1, 3h-3 |
| 21 | Text field | Yellow focus ring 2 px; live-typing mirror to passport | 3a-2, 3p-5 |
| 22 | Search field | Pin / plane icon, clear ×, results list | 3a-5, 3b-7, 3c-10, 3d-4, 3p-1 |
| 23 | OTP / code boxes | 6× 46×56 r14 (digits drop, green on valid, pink + shake on invalid); segmented 4-4-4 gift code | 3a-8, 3a-11, 4d-4 |
| 24 | Numeric keypad | 3×4 incl. 000 and ⌫; amount display with odometer; ≈ conversion line | 3i-2 |
| 25 | Toggle | 46×28, knob 22; on `#54d6a4`, off `#3a3466`; squash knob animation | 3a-9, 3f-4, 3n-2, 3n-7, 3o-4, 3h-2, 3f-7, 5b-4 |
| 26 | Segmented control | Track `#2c2750` or `#1f1b38` r12; selected cream + ink (or yellow in 3i-2); 2–4 segments; badge inside (−37%) | 3b-4, 3e-1, 3l-2, 3n-2, 3n-5, 3n-8, 3i-2, 3j-1, 4e-1, 4b-3, 3m-2, 3p-4, 3n-4 |
| 27 | Radio option card | Outline highlight + "TOKEK PICKS / PON'S PICK / KARSA SAID YES" tag; radio dot variant | 3c-4, 3k-8, 3k-9, 4b-3 |
| 28 | Slider | Track + cream knob, coloured fill (green music, yellow effects) | 3n-7 |
| 29 | Range with private markers | Sweet-spot band, anonymous dots per person, draggable knob | 3c-5 |
| 30 | Segmented budget slider | 10 draggable segments | 5b-4 |
| 31 | Slide-to-confirm | Track 68h r34, critter knob, label; drag with commit threshold | 3f-5, 5b-3 |
| 32 | Hold-to-confirm ring | Conic fill ring 100–120 px with HOLD label; colour per context (green, gold, pink) | 3l-4, 3l-10, 3n-10, 4b-4 (pay ring) |
| 33 | Settings list group | Rows: title / subtitle, trailing value in yellow ›, toggle, check, "🔒 Private"; destructive row pink | 3n-2, 3n-6, 3n-8, 4d-1, 3n-3, 3f-1, 5b-4 |
| 34 | Language list | Native name + English subtitle + check circle | 3n-8 |

### 3.3 Chips, badges, tags

| # | Component | Variants | Screens |
|---|---|---|---|
| 35 | Taste / choice chip | Selectable; selected = accent fill + double ring + ±2° tilt; outline unselected; icon variant | 3a-4, 3a-12, 3c-11, 3f-4, 3n-1, 3n-10, 3p-2 |
| 36 | Filter chip | Yellow active / dark inactive; horizontal scroll | 3d-4, 3o-1 |
| 37 | Quick-action chip | Dark pill, horizontal scroll | 3j-1, 3j-3 |
| 38 | Info pill on hero | Ink-filled on colour or outline ("7H FROM SIN", "$1,480 EACH") | 3c-1, 3d-1, 3b-8, 3k-8, 3o-2 |
| 39 | Status chip | BOOKED green, VOTE / 1 VOTE pink, OPTIONAL outline, IN green, MAYBE yellow, UNOPENED dark, PLANNED blue, BUILDING orange, LOOKING AT IT cream, PLAN B, WATCHING, GO, SET, ON, ENDED, FREE / BOOST / PASS+ plan badges | 3e-1, 3f-6, 3p-4, 3k-7, 4d-1, 5c-5 |
| 40 | Count badge | Pink 18 px min, ink ring 2 px | 3b-2 |
| 41 | Tier label | "RARE · WATER TEMPLES" coloured Archivo | 3l-3, 3l-4, 3l-5 |
| 42 | Stat chip row | +150 XP / TEMPLE TOKEK / 2 IN THE CREW; +$22 EACH / 1 BOOKING MOVED / 0 MUST-DOS TOUCHED | 3l-6, 3e-3, 3c-12 |
| 43 | Tilted sticker label | Rotated pill (KYOTO WON 4–2, PLANNING MODE, place name labels on vote board) | 3c-3, 3e-2, 3b-2 |

### 3.4 People, critters and stickers

| # | Component | Variants | Screens |
|---|---|---|---|
| 44 | Initial avatar | 18–32 px circle in member colour, ink initial, cut-out ring | Everywhere |
| 45 | Avatar stack | Overlap −7 px, count label, "+n"; bobbing = pending (opacity .55) | 3b-2, 3c-9, 3k-2, 3e-3 |
| 46 | Critter avatar | Sticker in circle, tier ring (rare blue, epic pink, legendary gold), idle wobble everywhere | 3n-1, 3n-3, 3n-4 |
| 47 | Empty seat | Dashed circle or card ("Dev not yet", Sam seat 7 pulsing) | 3a-13, 4f-1, 3f-5 |
| 48 | **Sticker (doodle-art)** | Die-cut edge, draw-on, blink, poses, seeds, blend, locked silhouette, tier edges | Everywhere |
| 49 | Guide line | Sticker 44–52 + Caveat line in guide colour; optional bubble (dark or paper) | Most screens |
| 50 | Guide FAB sticker | Guide on a yellow disc | Tab bar |
| 51 | Silhouette slot | Grey or gold "?" silhouette, breathing | 3l-2, 3l-8, 3b-8, 3b-1 (first-run cells) |

### 3.5 Cards and surfaces

| # | Component | Variants | Screens |
|---|---|---|---|
| 52 | Surface card | `#1f1b38` r20–22, padding 14/16 | Everywhere |
| 53 | List card with dividers | Rows with `rgba(255,255,255,.07)` rules | 3b-4, 3f-6, 3g-4, 3c-9 |
| 54 | Colour tile grid | 2×2 hub tiles (PLAN / BOOKINGS / MONEY / QUESTS); help tiles; stat tiles (tilted) | 3k-1, 3p-1, 3k-6, 3m-1, 3n-1 |
| 55 | Hero panel | Colour + halftone + r40 bottom; sticker overlapping edge | 3d-1, 3k-2, 3k-5, 3k-6, 3k-8, 3k-10, 3b-8, 3o-2, 4c-2, 4d-3 |
| 56 | Countdown hero card | Yellow trip card: NEXT UP, destination display, countdown chip + PLAN % chip, guide over edge | 3b-2, 3b-6 |
| 57 | Action / inbox card | Icon tile + title + subtitle + inline actions; slides off when handled | 3b-4, 3k-1 |
| 58 | Suggestion card | "PON SUGGESTS" orange card with action rows | 3f-6 |
| 59 | Dashed add card | "+ SOMEWHERE ELSE", START A CREW, invite card, "found bookings" review strip, pitch-a-place circle | 3b-1, 3g-3, 3h-1, 3b-2 |
| 60 | Crew card (switcher) | Avatar stack, new-count badge, last message | 3g-3 |
| 61 | Empty state | Sleeping guide + title + line | 3b-5 |
| 62 | Checklist / progress list | Pending dashed-orange spinner → green check; "tick in" | 3c-8, 3k-5, 3k-10, 3k-4 |
| 63 | Outbox list | Clock icon rows → ticks, "SENDS WHEN YOU'RE BACK" | 3k-4 |

### 3.6 Document artefacts (passport metaphor)

| # | Component | Variants | Screens |
|---|---|---|---|
| 64 | Passport cover | Orange (3a-1), gold (4a-3), navy (behind gold); globe emblem, sheen, tilt-follow seal | 3a-1, 4a-3, 3n-5 icon |
| 65 | Passport ID page | Guilloche paper, photo frame, fields (Geist Mono labels bilingual EN/FR), MRZ 2 lines, SAVED tick | 3a-2, 3a-6, 3a-7, 3a-12 |
| 66 | Paper page chrome | "ENTRIES · ENTRÉES", "VISAS · VISAS · VISAS", "PAGE 07/08/13", "POST · COURRIER", "DEPARTURES · DÉPARTS" | 3m-8, 4e-*, 4b-5, 3p-3, 3n-11 |
| 67 | **Stamp** | Round (HOME, SIN, BALI arrived, LISBON faded, RECEIVED, PAID IN FULL, stamp row on profile, dashed pending), rectangular (BOOSTED, EXIT SEE YOU, FIRST TRIP FREE, ADMITTED), MATCH / YES (swipe); double ring + arched text + date; ink colour per context | 3a-5, 3a-6, 3m-8, 3n-1, 3n-11, 4a-1, 4e-*, 4b-5, 3p-3, 3m-6, 3d-2 |
| 68 | Ticket / boarding pass | Notched perforation, dashed tear line, route SIN ✈ KIX, field grid, barcode, stub; yellow crew ticket, blue flight, pink boost class | 3a-10, 3f-5, 3h-1, 4a-2, 5a-3 |
| 69 | Visa sticker | Pass+ yellow visa (holder photo, fields, holo seal, MRZ), Trip Boost pink entry stamp | 4e-1, 4e-3, 4a-1 |
| 70 | Receipt | Zig-zag edges, mono lines, dashed rules, highlighted recognised lines, barcode, stamp | 3i-3, 3i-4, 3m-6 |
| 71 | Postcard | Photo front + back (Caveat note, stamp with guide, address lines), flip loop; format thumbnails | 3m-9, 3f-1 |
| 72 | Crew manifest card | Tilted cards stamped in order, dashed pending, green "just now" | 3a-13 |
| 73 | Gift card / credit card | Card graphic with tilt; envelope flip | 4d-3, 4d-4 |
| 74 | Booking wallet stack | Fanned coloured cards (pull to fan), expanded boarding pass | 3h-1 |
| 75 | Signature layer | Handwritten member names in colours, written on | 3m-8 |

### 3.7 Data visualisation, progress and numbers

| # | Component | Variants | Screens |
|---|---|---|---|
| 76 | Segmented progress | Replies (4 green / 1 yellow / 1 dark), set progress, 30-pip meter, quest pips, crew-up segments, redraft pips crossed, ping budget | 3f-6, 3l-8, 4b-1, 3l-7, 3k-3, 4f-3, 5b-4 |
| 77 | Linear bar | Budget breakdown, category spend vs plan, XP bar, hype bar, ETA bar | 3c-5, 3i-6, 3l-7, 3f-3, 3h-3 |
| 78 | Progress ring | Countdown drain (3k-2), hold-fill (3l-4), lock-screen ring (5a-4, 5c-3) | 3k-2, 3l-4, 5a-4, 5c-3 |
| 79 | Donut | Share breakdown | 3f-3 |
| 80 | Month bar chart | Prices / crowds per month, highlighted months, legend chips | 3d-1 |
| 81 | Hourly crowd forecast | Bars with now-marker / best-chance highlight | 3d-3, 3l-5 |
| 82 | Diverging balance bars | Centre line, pink owes / yellow-green owed | 3i-1 |
| 83 | Day bars vs plan | Dashed plan line, today marker, overspend pink | 3i-6 |
| 84 | Weather strip | Day columns, icon, temp, rain-probability capsule bars | 3k-7 |
| 85 | Calendar heatmap | 7-col month, n/6 free per day, guide-colour ramp, best-window outline | 3c-3, 3c-4 |
| 86 | Poll bars | Option rows fill, avatars, counts | 3g-1 |
| 87 | Countdown text | `tg-count` dhms / hms / ms, tabular | 3b-2, 3k-1, 3k-2, 3f-3, 3f-6, 5a-* |
| 88 | Odometer number | Rolling digits for money and prices | 3i-1, 3i-2, 3f-4, 3f-7, 3n-8, 4e-1, 4b-3, 5c-1 |
| 89 | Split-flap / departures digits | Big number flip, minute flip, button label flap | 4c-2, 5c-4, 5c-1, prototype `flap()` |
| 90 | Count-up stat | Stats and XP | 3n-1, 3l-6, 3m-4 km |
| 91 | Typewriter / streaming text | `tg-type` (reserves final box) | 3g-2, 3j-1, 3p-2, 3b-3, 3m-7 |

### 3.8 Planning, voting, collaboration

| # | Component | Variants | Screens |
|---|---|---|---|
| 92 | Day row | Coloured number tile (day + weekday) + title + sub + status chip / weather icon; drag-reorder | 3e-1, 3c-9, 3o-2 |
| 93 | Day timeline planner | Hour grid 07–19, 15-min snapping blocks (colour per type), rain band hatched overlay, dashed suggestion ghost, planning-mode tag, bottom suggestion bar | 3e-2 |
| 94 | Diff / change row | Old struck + new bold + reason + avatars + ✓/✕ toggle | 3e-3, 3c-12, 3j-1, 3f-7 |
| 95 | Must-do row | Owner avatar, title, sub, ✓ / ENTERED / typing dashed | 3c-7 |
| 96 | Room assignment | Room rows with draggable avatar pairs + tag | 3c-6 |
| 97 | Vote board (stickers) | Floating guide stickers + name labels + voter avatars dropping + pitch slot | 3b-2 |
| 98 | Split showdown card | Diagonal split, VS badge, mini on Home; full-screen halves | 3b-6, 3c-1, 5b-2, 5c-1 |
| 99 | Result tally card | Rows with avatars and score | 3c-2 |
| 100 | Swipe card stack | Drag-fling card, YES stamp, "said yes" pill, action row ✕ / WHY / ♥, progress 12/30 | 3d-2 |
| 101 | Rate card stack | Flick up / left, LOVED IT / FINE / SKIP IT, tip field, counter | 3o-3 |
| 102 | Live collab option cards | LEADING tag hops, votes pop, presence cursor with name tag | 3g-2 |
| 103 | Chat message | Other (dark r18 18 18 4), me (yellow), guide (Caveat, no bubble), photo, date divider | 3g-1, 4c-1 |
| 104 | Chat rich cards | Poll, bookable offer (I'M IN · 1 SLOT LEFT), expense row (VIEW), boost card, SETTLED strip, typing dots | 3g-1, 4c-1 |
| 105 | Reaction floats | Pills floating up the story | 3f-2 |
| 106 | Proposal format picker | Trailer / poster / postcard thumbnails | 3f-1 |
| 107 | Idea vote box | ▲ count box (yellow when voted) + status chip + crew faces | 3p-4, 3p-5 |
| 108 | Mood picker | 5 critters (GRR / MEH / OKAY / GOOD / LOVE IT), others grey | 3p-2 |
| 109 | Attachment thumb | Screenshot with × peel, add slot | 3p-2 |

### 3.9 Map, trip-day, money, camera

| # | Component | Variants | Screens |
|---|---|---|---|
| 110 | Map canvas | Stylised navy, roads, parks | 3d-4, 3g-4, 3h-3, 3k-9, 4f-2 |
| 111 | Map pins | Place pill pin (icon + name + avatars, category colour), selected (yellow thick ring), person pin (avatar + status), meet-up ★ pin (pulses), you-dot, car marker, closed-road segment, cluster "+9", guide sticker walking | Same |
| 112 | Route line | Dashed yellow, animated draw; trail stops | 3h-3, 3m-4, 5a-1 |
| 113 | Place card carousel | Photo + title + meta + avatars + day chip | 3d-4 |
| 114 | ETA list | Person, status, time | 3g-4 |
| 115 | Crew rail | Avatars sliding along a line to a flag | 5a-2, 5a-6 |
| 116 | Leave-by hero | Giant time, instructions, drain ring, crew-up avatars (sleeping bob) | 3k-2 |
| 117 | Packing chips | Strike-through with pen stroke | 3k-2 |
| 118 | Timeline list | Mono time + title + sub | 3k-2 |
| 119 | Phrase card | Local phrase (Geist 700 20 or Caveat) + translation + play button (TTS) | 3h-3, 3k-6 |
| 120 | Emergency tiles | CALL 112 cream card, tourist police, 4 problem tiles, clinic row GO | 3k-6 |
| 121 | Settle row | From avatar — amount → to avatar + status (REQUESTED / PAID ✓ / PENDING, NUDGE) | 3i-5 |
| 122 | Payment method chips | Bank transfer / PayNow / Cash | 3i-5 |
| 123 | Camera viewfinder | Corner brackets, ping rings, mode pill, context pill | 3l-4, 3l-10, 3i-3, 3j-3 |
| 124 | Scan overlay | Scan line sweep, highlighted lines, fold stutter | 3i-3, 3i-4 |
| 125 | AR translation labels | Pills peeled onto menu lines, dietary chips (✓ VEG, ✕ PEANUTS) | 3j-3 |
| 126 | Voice orb | Guide in a halftone disc, breathing rings, waveform bars, transcript | 3j-2 |
| 127 | Watch-list row | Icon circle + title + desc + status chip | 3k-7 |
| 128 | Import source tiles | FORWARD / SCAN / PASTE colour tiles + copyable address | 3h-2 |
| 129 | Parsed booking card | Fields + "FROM ALEX'S EMAIL" + split toggle + ADD / IGNORE | 3h-2 |

### 3.10 Critters

| # | Component | Variants | Screens |
|---|---|---|---|
| 130 | Critterdex header | 9/150 display, places pill, segmented filter | 3l-2 |
| 131 | Here-now forms card | 4 forms with tier labels, hint line | 3l-2 |
| 132 | Legendary banner | Gold-outlined row | 3l-2 |
| 133 | Set row / set grid cell | Silhouettes row; cell with 4 corner form dots + name + city ("???") | 3l-2, 3l-8 |
| 134 | Critter detail card | Coloured card, #number, tier chip, "also has it" avatars, field-note Caveat, info tiles | 3l-3 |
| 135 | Forms selector | 4 cells, found vs locked with requirement | 3l-3 |
| 136 | Encounter bottom card | Tier label, title, body, HOLD ring | 3l-4, 3l-10 |
| 137 | Wander-off footprints | Footprint trail, dashed ring | 3l-5 |
| 138 | Befriended reveal | Rays + sticker slap + chips | 3l-6 |
| 139 | Month strip | 12 month pills, legendary dots, current outlined, trip-window filled | 3l-9 |
| 140 | Quest card | Title in accent, pips or avatars, reward line, reward sticker | 3l-7 |
| 141 | Egg | Wobble / crack / hatch | 3l-1, tab icon |

### 3.11 Recap and memories

Recap stat tiles (tilted), awards grid (6 colour cards + ☆ vote), route map with rider, receipt card, got-away silhouette with warm glow, stamp spread with signatures, postcard + format chips, memory photo hero with reaction chips.
Screens: 3m-1…3m-10.

### 3.12 Monetisation

| # | Component | Screens |
|---|---|---|
| 142 | Visa page paywall | 4e-1 |
| 143 | Comparison table with highlighter band | 4e-2, 4b-2 |
| 144 | Plan option radio rows | 4b-3 |
| 145 | Billing toggle with discount badge | 4e-1, 4a-1 |
| 146 | Perks checklist (coloured check circles) | 4e-3, 4a-3 |
| 147 | Limit meter card | 4b-1 |
| 148 | Seats row (7th dashed) | 4f-1 |
| 149 | Greyed live preview teaser | 4f-2 |
| 150 | Pause-months bars | 4d-2 |
| 151 | Kept / paused chip groups | 4c-2 |
| 152 | Store purchase sheet (system) | 4b-4 |

### 3.13 System surfaces (native extensions, rendered without app code)

| # | Surface | Variants | Screens |
|---|---|---|---|
| 153 | Live Activity (lock screen) | Leave-by trail with walking guide + pips + I'M UP; crew rail; flight (flips to pickup); critter-nearby ring; storm | 3k-3, 5a-1…5a-4, 5a-6 |
| 154 | Dynamic Island | Compact (guide peeks left, minutes right), expanded (trail + 2 buttons), minimal | 5a-5 |
| 155 | Notification | Sender = guide or crewmate (communication notification with avatar), yellow evening roundup group, rich expanded vote poster + actions | 5b-1, 5b-2 |
| 156 | Alarm | Full-screen leave-by alarm, slide I'M UP, snooze once | 5b-3 |
| 157 | Widgets | Small countdown, small Critterdex, medium interactive vote, large Today, small balances with NUDGE, crew (boost); lock-screen inline / circular / rectangular (tinted) | 5c-1…5c-3 |
| 158 | StandBy | Sleeping guide clock + flip-minute alarm panel | 5c-4 |
| 159 | Widget gallery | Rows with FREE / BOOST / PASS+ badges and locked state | 5c-5 |
| 160 | Alternate app icons | 4 styles (FACE, PASSPORT, STAMP Pass+, STICKER) × light / dark / tinted, plus earned critter icons (locked) | 3n-5 |
| 161 | System prompts | Permission prompt (triggered by toggles), rating sheet, Sign in with Apple | 3a-9, 3p-6, 3a-7 |

**Estimated count:** about 160 distinct components or variants-families.

| Group | Count |
|---|---|
| Primitives / tokens-level | ~45 |
| Composites | ~75 |
| Feature widgets | ~25 |
| Native-extension views | ~15 |

---

## 4. Motion system

### 4.1 `tg-motion` DSL: exact grammar (doodles.js)

**Element attributes**

| Attribute | Meaning |
|---|---|
| `fx` | Preset name (table below). Used when `kf` is absent. Default is a no-op `0:o1;1:o1` over 2000 |
| `kf` | Keyframe string. Overrides the preset's keyframes |
| `dur` | ms. Overrides the preset's duration |
| `delay` | ms |
| `ease` | Default easing for keyframes without `e=`. A token name or raw CSS. Default **`io`** |
| `iter="1"` | One-shot. Otherwise **infinite, with `animation.startTime = 0`**: the loop is locked to the document timeline, so all loops share a **global clock** and stay in phase across elements and screens. **No design element uses `iter`**: everything loops |
| `stagger` | ms. Animates each **child** separately with `delay + i*stagger` (lists, bars, dots) |
| `origin` | CSS transform-origin |
| `block` | `display:block` (default inline-block) |

Reduced motion: if `prefers-reduced-motion: reduce`, **no animation at all**; elements render in their static CSS state.

**Keyframe string grammar**

```
kf       := segment (';' segment)*
segment  := OFFSET ':' token*            ; OFFSET = 0..1 (fraction of dur)
token    := 'tx' NUM ['%'] | 'ty' NUM ['%']   ; translate, px (or %)
          | 's' NUM                      ; uniform scale (sets sx=sy)
          | 'sx' NUM | 'sy' NUM          ; axis scale
          | 'r' NUM                      ; rotate, deg
          | 'o' NUM                      ; opacity
          | 'e=' ('in'|'out'|'io'|'lin'|'back'|<raw css easing>)
```

- **State carries forward.** A property not mentioned keeps its previous keyframe value. Initial state is `tx0 ty0 r0 s1 o1`.
- Each segment compiles to one WAAPI keyframe: `transform: translate(tx,ty) rotate(r) scale(sx,sy); opacity: o; easing: e`.
- `e=` sets the easing **from this keyframe to the next**.
- The overall animation timing is `linear`; all easing is per segment.
- Transform order is fixed: translate, then rotate, then scale.

**Easing tokens**

| Token | Value |
|---|---|
| `in` | `cubic-bezier(.55,0,1,.45)` |
| `out` | `cubic-bezier(0,.55,.45,1)` |
| `io` | `cubic-bezier(.65,0,.35,1)` |
| `lin` | `linear` |
| `back` | `cubic-bezier(.34,1.56,.64,1)` (~10% overshoot) |

**Presets** (keyframes, duration ms, use count)

| fx | kf | dur | Uses | Meaning |
|---|---|---|---|---|
| bob | `0:ty0;.5:ty-6;1:ty0` | 2400 | 33 | Idle hover |
| float | `0:ty0 r-2;.5:ty-9 r2;1:ty0 r-2` | 4200 | 25 | Sticker drift + rock |
| wiggle | `0:r-4;.5:r4;1:r-4` | 1600 | 16 | Rocking |
| pulse | `0:s1;.5:s1.07;1:s1` | 1600 | 13 | Attention breathe |
| ping | `0:s.6 o.8 e=out;1:s1.5 o0` | 1800 | 15 | Radar ring (pairs offset by dur/2) |
| spin | `0:r0 e=lin;1:r360` | 9000 | 4 | Rays, holo seal |
| marquee | `0:tx0 e=lin;1:tx-50%` | 16000 | 2 | Ticker (duplicate content) |
| rise | `0:ty14 o0 e=out;.08:ty0 o1;.8:ty0 o1;.9:ty-6 o0;1:ty-6 o0` | 6000 | 2 | Enter, hold, exit loop |
| blink | `0:o1;.5:o.25;1:o1` | 1200 | 15 | Live dot |
| hop | `0:ty0 sy1;.1:ty0 sy.9 e=out;.22:ty-14 sy1.05 e=in;.34:ty0 sy.94 e=out;.42:ty0 sy1;1:ty0 sy1` | 2600 | 16 | **Squash and stretch** hop (anticipation 10%, jump, land squash, settle, rest) |
| grow | `0:sx0 e=out;.4:sx1;1:sx1` | 4000 | 14 | Bar fill (origin left) |
| tug | `0:tx-8;.5:tx8;1:tx-8` | 1800 | 0 | Side-to-side |

130 custom `kf` strings. The most common durations are 6000 (33), 9000 (31), 2600, 3600, 2400, 1400.

**Other custom elements**
- **`tg-count`**: a **live countdown**, not an odometer. Attributes `from` (seconds) and `format` = `dhms` ("17D 05:26:47"), `hms` or `ms`. Ticks every 1 s. 11 instances.
- **`tg-type`**:
  - Typewriter at `speed` ms per char (default 40; 30–45 used), with an extra 260 ms after `,` `.` `?`.
  - Holds for `hold` ms (default 2800), then retypes (loops).
  - Caret: 2 px currentColor blinking at 480 ms alternate.
  - **Reserves the full text's box** with an invisible ghost, so layout never jumps.
  - Ignores reduced motion. 3 instances.
- **`tg-confetti`**:
  - Canvas particle burst, fired when the global-clock phase `at` of `period` passes. The prototype sets period 1e12 so it fires only on demand (`burst()`).
  - Parameters: `count` (70 default; 50–80 used), origin `ox`, `oy`, `colors` (6 accents).
  - Physics per frame: angle −90° ± 63°, v 5–14, gravity .32, drag .985, spin ±.2 rad, life −.009 (~1.8 s at 60 fps), rect 5–11×3–7, flutter `scaleY cos(2r)`. Only runs while visible. 9 instances.
- **`doodle-art`**:
  - Canvas2D brush renderer: tapered ink ribbons, washes with seeded offset, multiply blend, die-cut sticker edge drawn to an offscreen canvas.
  - **Draw-on** is 1500 ms for creatures and 700 ms for icons, easeInOutQuad. Strokes draw in order by length budget; washes fade in over 25–80%; the sticker edge fades in over the first 25%.
  - **Blink**: a closed-eye frame for 150 ms every 2.6–6.2 s (random), only when visible.
  - Lazy start via IntersectionObserver (rootMargin 150).
  - Anything under 44 px draws instantly. Click replays the draw-on.
  - DPR is capped at 2, with 1.25× oversampling. Reduced motion draws the final frame.

### 4.2 Prototype micro-interaction library (exact params)

| Helper | Spec | Use |
|---|---|---|
| press | Scale .92 / .96 / .975 over 130 `(.3,.7,.4,1)`; release overshoot 1.035 over 420 ease-out | Every tappable |
| toggle | Track colour .25 s; knob slides with `scaleX 1.25` stretch, 380 `(.3,1.5,.5,1)` | Toggles |
| seg | Swap styles; scale .9→1.06→1 over 320 ease-out | Segmented |
| chip select | Rotate ±2°, from rot×3 + scale .86 → 1.12 → settle over 420; double-ring style | Taste chips |
| flap | rotateX 0→90→0 at perspective 300 over 340 ease-in-out; text swaps at 170 | Button and label state changes (split-flap) |
| float | "+1" / "♥" Archivo 900 20 yellow with ink shadow; rises 40 px over 800 | Votes, loves |
| count | Number tween, ease-out cubic, 700 (XP 900) | Odometer stand-in |
| slideOff | translateX 110% + rotate 4°, fade over 360 `(.5,0,.75,0)`; then collapse height and padding over 320 E | Handled cards |
| shake | translateX −8, 7, −5, 3, 0 over 420 | Errors, locked |
| wobble | rotate −3, 2.5, −1, 0 over 480 | Cover, gift |
| glow | Yellow ring expands 0→16 px, fades, 900 ×2 | Phrase card, call |
| drop | translateY −18→0 + fade over 380 `(.3,1.5,.5,1)` | Digits, boxes |
| reveal | Fade + translateY 12→0 over 460 E | Staggered content |
| pop | Scale 1→1.12→1 over 360 ease-out | Selection, landing |
| thud | **Whole screen** translateY 0→5→−2→0 over 280 | Stamp or landing impact ("page shakes") |
| flash | Full-screen `#fffbe8` .55 peak over 460 | Burst transition |
| confetti | 90 particles, ±69° spread, v 5–15, gravity .34, drag .985, life −.008 | Celebrations (40 hold-complete, 110 settle, 140 legendary) |
| toast | Island pill 122×35→360×62, r20→28 over 440 `(.2,1.25,.3,1)`; children stagger 150+40n over 220; hide 400 `(.4,0,.2,1)`; auto-dismiss 2.8 s (up to 6 s with action) | In-app notices |
| choreo | Grabs all `tg-motion[dur=X]` on the screen, pauses and scrubs them (timeline control) | Slide-to-board, egg hatch, befriended |

### 4.3 Recurring motion patterns

Durations below are derived from `kf` offsets × `dur`.

| Pattern | Parameters from code | Screens | Proposed token |
|---|---|---|---|
| **Stamp slam** | `0:s2.2 o0 e=in;.05:s.94 o1;.08:s1.04;.11:s1` @9000 = **450 ms ease-in fall, 270 overshoot, 270 settle (~1 s)**; + `thud` jolt + confetti. Softer s1.6 (crew cards, BALI word), rotated s2.4 r−30→−6 (3m-8). Prototype Kyoto stamp: s2.6 r−8 → .95 r−1 → 1 over 480 `(.5,0,.8,.4)`, delay 560, thud at +280 | 3a-6, 3a-13, 3c-2, 3m-3, 3m-6, 3m-8, 3p-3, 4e-1, 4e-3, 4b-5, 3n-11, 3d-2 MATCH | `motion.stamp` = {fall 450 in(.55,0,1,.45), overshoot 1.04, settle 540; impact → jolt 280 + haptic heavy + sfx.thud} |
| **Sticker slap-in** | `0:s0 r±18–30 o0 e=back;.06:s1 r±6–10` @9000 = 540 ms back-ease; stagger 300 | 3m-3, 3l-6, 4a-1, 3b-3 | `motion.slap` 540 back, stagger 300, sfx.slap |
| **Drop-in with tilt** | `0:ty-40 r-8 o0 e=back;.07:ty0 r-2` (630); ticket `ty60 r6 → ty0 r-2` (720) | 3a-6, 3a-10 | `motion.settle` 630 back, rest angle −2° |
| **Deal-in** | Rows or cards appear in sequence: `0:ty-30 o0 e=back;.05:ty0` @9000 stagger 160 (450 ms each); prototype rows `translateY −12→0` 400 E delay 520+80n | 3e-3, 3m-5, 3c-9, 3f-4, 3f-7, 3c-12 | `motion.deal` 400–450, stagger 80–160 |
| **Card fling (swipe)** | Drag: `translate(dx, dy×.3) rotate(dx/14°)`. Threshold abs(dx)>110. Yes: `translate(60,−640) rot 10 scale .7` over 400 `(.5,0,.8,.5)`. No: `(−560,40) rot −28`. Return: .45 s `(.3,1.5,.5,1)`. Next card from `ty26 s.93` over .5 s `(.3,1.4,.5,1)`. MATCH stamp 360 + thud | 3d-2; 3a-4 (other card flings); 3o-3 flick 380 `(.5,0,.8,.4)` | `gesture.fling` |
| **Spring rise / spring settle** | Toggle knob, drop, spring-back `(.3,1.5,.5,1)` (8% overshoot); next card `(.3,1.4,.5,1)` (5%); pins `(.3,1.6,.5,1)` (11%) | 3g-1 messages, 3l-7 pips, 3e-1 re-sort, 3d-4 pins | `spring.snappy` / `spring.bouncy` / `spring.gentle` (§4.4) |
| **Odometer roll** | Captions only; the prototype tweens numbers (ease-out cubic 700). Needs per-digit rolling columns with tabular numerals | 3i-1, 3i-2, 3f-4, 3f-7, 3n-8, 4e-1, 4b-3, 5c-1 | `motion.odometer` 600–700 out, per-digit stagger 30 |
| **Split-flap** | rotateX 90° flip at 340 (proto); departures board big number; StandBy minute flip; widget day flip | 4c-2, 5c-4, 5c-1, CTA label changes | `motion.flap` 340 |
| **Draw-on stroke** | doodle 1500 / 700 easeInOutQuad; pen strokes (best-window circle 3c-3, scribble 3c-4, strike-through 3k-2, route 3m-4, signatures 3m-8) | Many | `motion.draw` 700–1500 |
| **Confetti** | See §4.1 / §4.2 | 3a-6, 3a-13, 3c-2, 3f-5, 3l-1, 3l-6, 3l-10, 3i-5, 3p-3, 3p-4, 4b-5, 4e-3 | `fx.confetti` {count 40/70/90/140} |
| **Squash and stretch** | `hop` preset; egg-hatch land `sy.94 sx1.04`; app-icon swap `sx1.14 sy.86 → sx.94 sy1.06 → 1` (iOS squash) at 250–400; vote-half squash `scale(.985,.95)→(1.005,1.02)` 460 | 3l-1, 3l-4, 3n-5, 3c-1, 3a-13 | `motion.squash` |
| **Hold-to-fill** | Ring conic fill; prototype fill 1500 ms (legendary 2400), drain 450; critter scales 1→1.3 with progress; complete → thud + confetti 40 → burst next at +300. Design intent: the ring fills with **location dwell** and drains slowly when you wander, **continuing while locked** | 3l-4, 3l-10, 5a-4, 3n-10 | `interaction.holdFill` {fill 1500 / 2400, drain rate, haptic ramp} |
| **Page turn** | Passport cover swing (3a-1), fresh spread (3m-8), countdown page-flip (5c-1). Not in code | 3a-1, 3m-8, 5c-1 | `motion.pageTurn` 600–700 (3D rotateY with shading) |
| **Shared-element grow** | `zoom` transition (§1.2) + hop pre-beat (200 ms delay, sticker translateY −20 scale 1.12 over 320) | 3b-1, 3b-2, 3b-6, 3d-1, 3d-4, 3o-1, 3l-2, 3b-7, 3k-3 | `transition.zoom` 560 / 460 |
| **Fly-to-slot arc** | Clone travels via a midpoint lifted 140 px, rotate −14°, scale to target, over 780 `(.4,0,.2,1)`; then pop + thud + toast | 3l-6→3l-2; 3b-3 card to board; 3c-10 must-do; 3o-2 paper plane | `motion.flyTo` 780 |
| **Slide-to-confirm choreography** | 6000 ms timeline: knob 0.6–2.04 s io; ticket thump s1.03 at 2.28 s; stub tear tx30 ty130 r16 over 2.28–3.24 s (in); confetti 2.4 s; egg drop back 3.24–3.72 s; rail avatar 3.24–3.72 s; counter swap 3.6 s. Track 282 px; commit >.7; else spring back 280 cubic-out | 3f-5 | `interaction.slideToConfirm` |
| **Sheen sweep** | CTA `0:tx-140 e=io;.3:tx420` @3600 = **1080 ms sweep every 3.6 s**; visa `tx-120→440` @4200 .28 | All primary CTAs, 3a-1, 4e-1 | `fx.sheen` |
| **Ping rings** | 2 rings, `ping` 2200–2400 offset by half | 3c-8, 3j-2, 3l-4, 3g-4 meet pin | `fx.ping` |
| **Bar grow** | `sy0→1 e=out` by 30% @6000 (1.8 s), stagger 60; `grow` sx | 3d-1, 3i-6, 3i-1, 3d-3 | `motion.barGrow` 600–900, stagger 40–60 (compress for the app) |
| **Story progress** | `sx0→1 lin` @5000–6000 | 3f-2, 3m-3…9 | `story.slide` 5000 |
| **Typing and streaming** | Dots `0:ty0;.25:ty-4;.5:ty0` @1200 stagger 160; tg-type | 3g-1, 3g-2, 3c-7, 3j-1 | `fx.typing` |
| **Waveform / EQ** | `0:sy.3;.5:sy1;1:sy.3` @900 stagger 70 (voice) / 140 (music bars) | 3j-2, 3n-6, 3n-7 | Drive from real audio levels |
| **Ambient particles** | Petals `ty560 tx±30–36 r200–420` @6500–9600, staggered 530 | 3l-10 | `fx.petals` |
| **Path follower** | Route rider tx/ty through 5 stops @9000; cursor path @7000; car along route @8000 linear with ETA bar drain `sx1→.15` | 3m-4, 3g-2, 3h-3 | Map-driven |
| **Rocking thinker / breathe** | `r±3 ty2` @3400; StandBy `ty-3 s1.02` @3600; locked slots "breathe faintly" | 3n-9, 3n-10, 5c-4, 3l-2 | `idle.think`, `idle.breathe` |
| **Rays** | Spin 9000 on conic gradient | 3c-2, 3l-6 | `fx.rays` |

### 4.4 Proposed motion tokens

**Durations (ms)**

| Token | Value | Examples |
|---|---|---|
| instant | 120–130 | Press-down, tiny fades |
| fast | 220–260 | Fades, tab fade, toast children |
| base | 320–360 | pop, segmented, flap, slideOff, stamp-match |
| medium | 420–480 | push / pop, shake, toast, deal, stamp-land |
| slow | 540–640 | sheet, zoom, rise, burst, fold, stamp full ~1000 |
| extra | 780–1100 | fly-to, sheen sweep 1080, draw-on icons 700 / creatures 1500 |
| story | 5000 | Per story slide |
| loops | bob 2400, float 4200, wiggle 1600, pulse 1600, ping 1800–2400, blink 1200–1400, hop 2600, spin 9000, marquee 16000 | |
| stagger | 40 (tight), 60–80 (rows), 120–160 (cards / dots), 260–300 (stamps / stickers) | |

**Easings**

| Token | Value | Use |
|---|---|---|
| `ease.standard` | `cubic-bezier(.32,.72,0,1)` | Navigation, sheets, reveals (iOS-like; 90% by 37% of t) |
| `ease.enter` | `cubic-bezier(0,.55,.45,1)` | |
| `ease.exit` | `cubic-bezier(.5,0,.75,0)` / `(.55,0,1,.45)` | |
| `ease.inOut` | `cubic-bezier(.65,0,.35,1)` | |
| `ease.slam` | `cubic-bezier(.5,0,.8,.4)` | Stamp fall, card flick, match |
| `ease.gesture` | `cubic-bezier(.2,.8,.2,1)` | Post-gesture settle |
| `ease.press` | `cubic-bezier(.3,.7,.4,1)` | |
| `ease.back` | `cubic-bezier(.34,1.56,.64,1)` | ~10% overshoot at 57% of t |
| `ease.burst` | `cubic-bezier(.2,1.3,.35,1)` | 3% |
| `ease.island` | `cubic-bezier(.2,1.25,.3,1)` | 2% |

**Springs** (fitted from the overshoot curves; mass 1; starting points for tuning)

| Token | Source curve | Overshoot | ζ | Response | Stiffness / damping | Use |
|---|---|---|---|---|---|---|
| `spring.snappy` | `(.3,1.5,.5,1)` @380 | 8% | .63 | .31 s | k≈420, c≈26 | Toggle, drop, spring-back |
| `spring.bouncy` | `(.3,1.6,.5,1)` @420 | 11% | .57 | .34 s | k≈350, c≈21 | Pins, pop-ins |
| `spring.gentle` | `(.3,1.4,.5,1)` @500 | 5% | .68 | .40 s | k≈240, c≈21 | Next card, VS punch |
| `spring.soft` | `(.3,1.3,.5,1)` @560 | 3% | .75 | .45 s | k≈195, c≈21 | Day block move, burst-in |
| `spring.sheet` | `ease.standard` 540 | 0% | ≈.9–1 | ~.5 s | — | Sheets |

**Choreography rules** (implicit in the design)

1. Entrances play **once** on first appearance. The design's 9 s and 6 s loops are presentation artefacts.
2. Idle loops share a global clock so stickers breathe in sync. Randomise phase per element only where the caption asks (for example "stickers idle on their own loops").
3. Impact moments stack **visual + screen jolt + haptic + SFX** at the same frame.
4. Every state change on a button label uses flap.
5. Handled items slideOff then collapse.
6. Numbers never jump: they roll or count.
7. "Only the guide's typing dots bounce" in chat (3g-1). Motion budget per screen is intentional.

---

## 5. Sound and haptics cue list

The prototype has no audio or haptic code. The settings model comes from 3n-7, 3n-6 and 3n-2:
- **Music:** on/off plus volume. Each guide has a theme that changes when you land. Named themes: Tokek "gamelan lo-fi", Pon "koto and rain", Lundi "slow sea shanty". Ajo, Sardi and Paco themes are unspecified.
- **Effects:** volume plus categories:
  - "Stickers and stamps: the slap, the thud, the peel"
  - "Critter voices: a chirp when a guide pops up"
  - "Quiet on the road: mutes everything 22:00–07:00 **and inside temples**" (a geofenced mute)
- **Haptics:** "Taps on stamps, holds and votes".
- **Voice:** "Talk out loud: voice replies when you speak first".
- **Easter egg:** tap the build number 5× to play Tokek's theme (3n-6).

Type: S = SFX, M = music, V = voice/TTS, H = haptic. "(inf)" means inferred from motion and not stated.

| Screen | Moment | Type | Cue |
|---|---|---|---|
| 3a-1 | Cover swings open | S H (inf) | Page / leather creak, light impact |
| 3a-2 | Letters land on passport, MRZ rewrites | S (inf) | Soft type tick per char |
| 3a-3 | Guide drops into photo frame with flash blink | S (inf) | Shutter click |
| 3a-4 | Other card flings; answer stamp **thuds** | S H | Whoosh + stamp thud (stamps category) + haptic |
| 3a-5 | HOME stamp inks | S (inf) | Ink press |
| 3a-6 | ISSUED **slams with a thud** + confetti; HOME stamp; Tokek cheers | S H V | Thud (heavy), confetti pop, critter chirp |
| 3a-7 / 3a-8 | SAVED tick; digits drop; **puffin claps** | S H | Tick, clap, success haptic |
| 3a-11 | Sixth box rings green / wrong code shakes | H S | Success / error notification haptic |
| 3a-13 | Crew cards stamp down one by one; Tokek hops | S H | 6 staggered soft thuds (260 ms) |
| 3b-2 / 3b-6 | **Bell rings once** when something new needs you; vote avatar drops with bounce | S H | Bell; light tap per vote |
| 3b-3 | Sardine sticker **slaps** on; card flies to board | S | Slap, whoosh |
| 3b-4 / 3b-5 | Cards slide off; **Tokek snores** | S V | Swipe; snore loop (critter voice) |
| 3c-1 | Tap half squashes, VS punches | H S | Vote haptic (medium) |
| 3c-2 | KYOTO stamps, confetti, rays; shown once to everyone | S H M | Thud + fanfare sting? (inf) |
| 3c-3 / 3c-4 | Heatmap fills day by day; pen circles / scribbles | S (inf) | Pencil scratch |
| 3c-5 / 3c-6 / 3e-2 | Knob drag; drag avatars; **15-min snapping** | H | Selection ticks at snaps and detents |
| 3c-7 | Clash **small shake** | H | Warning haptic |
| 3c-8 / 3k-5 / 3k-10 | Tasks tick green in real time | S H (inf) | Soft tick per item |
| 3c-11 / 3c-12 | Redraft fold "thinking beat"; changes tick in | S (inf) | Fold paper, ticks |
| 3d-2 | Fling; **MATCH stamp slams** | S H | Whoosh, thud, success haptic |
| 3d-3 / 3d-4 | Card drops into day; pins bounce | S (inf) | Plop |
| 3f-1 | Send stamps each friend's avatar | S H | Thud per avatar |
| 3f-2 | Story trailer, headline words stamp | S M (inf) | Word thuds; trailer music bed? |
| 3f-4 / 3f-7 | Share re-counts like an odometer | S (inf) | Roll tick |
| 3f-5 | Knob slides, ticket **thumps**, stub **tears**, confetti, egg drops, counter flips | H S | Drag detents → heavy thump → rip → pop |
| 3f-6 | "Segments fill as replies land, each with a small thump" | S H | Soft thump |
| 3g-1 / 3g-2 | Messages rise; votes pop | S (inf) | Message pop (respect chat mute) |
| 3h-3 | Phrase card **read out loud in Indonesian** | V | TTS in the local language |
| 3i-1 / 3i-2 | Odometer; keypad | S H (inf) | Key clicks, roll |
| 3i-3 / 3i-4 | Scan-line sweep; stutter at fold | S (inf) | Scanner hum |
| 3i-5 | Check stamps; last settle → **Settled Tokek on every phone at once** | S H | Stamp + slap, synced push |
| 3j-2 | Rings breathe while listening; Tokek **answers aloud**; swap cards drop | V S | STT + TTS guide voice; earcon on listen start/stop |
| 3j-3 | Translations **peel on** like stickers; clash dish shakes | S H | Peel, warning haptic |
| 3k-2 | Sleeping friends **snore** until "I'm up"; pen strikes packing | V S | Snore, pen |
| 3k-3 / 5a-1 | LA flips to driver ETA at 03:10; I'M UP pips pop | H | LA alert haptic |
| 3k-4 | Top card slides to night blue with a **soft thud**; ticks on reconnect | S H | Soft thud |
| 3k-6 | Phrase card plays "Saya butuh dokter." | V | TTS |
| 3k-7 | New warning slides in with **one soft buzz** | H | Warning |
| 3k-8 | Storm LA; card-trick flip | H S | LA alert; shuffle |
| 3k-10 | **Breaks through any screen with one long buzz**; SOS dot blinks | H | Long continuous (critical); push = time-sensitive / critical |
| 3l-1 | Egg wobbles, **cracks**, pops, confetti, Tokek squash-lands | S H V | Crack, pop, chirp |
| 3l-2 | New forms land in slot **with a thump** | S H | Thump |
| 3l-3 | Form spin swap; locked shakes | S H | Swish, error tap |
| 3l-4 / 5a-4 | Hold fills ring; leap into pass | H | **Continuous ramping haptic** during hold; success burst |
| 3l-6 | Sticker **slaps** down with spin, confetti, XP counts up | S H | Slap, confetti, coin ticks |
| 3l-7 | Pips fill; reward sticker spins onto everyone's phone | S | Slap (synced) |
| 3l-10 | Petals, lanterns; slower gold ring | M S | Ambient; slower ramp |
| 3m-3…9 | **Tokek narrates over his theme**: slaps, BALI slam + page shake, route counter, card slaps, **thermal-printer buzz**, PAID stamp, got-away glow, page turn + stamp slam, signatures writing, postcard flip bounce | M V S H | Narration VO per card; music bed "♪ gamelan lo-fi"; SFX per card |
| 3m-10 | Anniversary quiet notification | — | Default |
| 3n-1 | Stats count; stamps land with small thuds; Bali stamps itself | S H | Thuds |
| 3n-2 | Toggles snap; chattiness **plays a one-line sample in that voice** | V H | TTS sample |
| 3n-5 | Icon swap with iOS squash | H | Light |
| 3n-7 | Slider plays sample at level: **gamelan phrase** (music), **sticker slap** (effects); theme card crossfades | M S | Preview |
| 3n-8 | Language switch: **Tokek says one line** in it; currency odometer | V | TTS in the new language |
| 3n-10 | Critters **peel off with a soft rip** each; slap back on release | S H | Rip per critter, haptic per peel |
| 3n-11 | EXIT stamp, page shakes; UNDO re-stamps ENTRY | S H | Thud |
| 3o-2 / 3o-4 / 3p-2 | Paper-plane arc; envelope folds and flies; × peels sticker | S | Whoosh, fold, peel |
| 3p-1 | Shake-to-report (device shake) | H | Confirm tap |
| 3p-3 / 3p-4 | RECEIVED **thud** + confetti; vote stamp; SHIPPED confetti | S H | Thud, pop |
| 4e-1 / 4a-1 | Visa **slaps**, entry stamp, FIRST TRIP FREE **thuds** + page jolt; price odometer | S H | Slap, thud |
| 4a-2 | Tickets print with **paper shiver**; stub tears on purchase | S | Printer, rip |
| 4a-3 | Foil sheen; seal follows tilt | — | (gyro, no sound) |
| 4b-4 | Side-button hint pulses twice; system pay | H (system) | System |
| 4b-5 / 4e-3 | Stamp slams with thud + ink spread + page shake; ADMITTED thud + confetti | S H | Heavy |
| 4c-2 | Number flips like a departures board | S | Split-flap clatter |
| 4d-3 | Card tilts and shakes | H | Error |
| 5a-5 | **Island pulses yellow once and the phone gives a double tap** at 03:10 | H | Double tap (LA alert) |
| 5b-3 | Alarm **rings through Do Not Disturb** (leave-by times only); Tokek hops on the beat; snooze once, then crew ping | S H | Alarm sound (AlarmKit-class) |
| 5b-4 | Dragging budget: **Tokek reads out a sample day** | V | TTS |
| 5c-4 | StandBy digits flip each minute; 03:00 wake stretch + alarm | S | Flip, alarm |

**Gaps**
- No theme for 3 of 6 guides.
- No notification sound spec (custom per guide?).
- No volume ducking rules (TTS over music).
- No audio for accessibility (earcons).
- No policy for silent-switch or background audio.
- "Critter voices" have no content spec.

---

## 6. Accessibility

**What the design already does**
- High-contrast primary text (15.7:1 cream on ink).
- Tab icons have text labels.
- Quiet exits on every paywall.
- "Ask me later" on permissions.
- `doodles.js` respects reduced motion for loops and draw-on.
- Explicit alternatives in places: SCAN vs ADD, ✕/♥ buttons on the swipe stack, typing a must-do.
- Error screens are written as "three ways forward" rather than errors.

### 6.1 Reduce Motion strategy (proposed)

| Class | Examples | Reduce Motion behaviour |
|---|---|---|
| Spatial navigation | push, sheet, rise, zoom-grow, fold, flip, burst | Cross-fade 200 ms. Zoom becomes fade. Burst: no scale, **no white flash** |
| Idle loops | bob, float, wiggle, hop, ping, spin rays, marquee, petals, sheen, lantern sway, tilt-follow seal (gyro) | Static. Keep blink (tiny), or disable too |
| Impact / celebration | Stamp scale-fall, **screen thud jolt**, page shake, confetti, slap spins | State appears with a 150 ms fade. No jolt or shake. Confetti becomes a static burst sticker or is omitted. Keep haptic + SFX (they carry meaning) |
| Informational motion | Progress fills, hold ring, countdown drains, odometer, split-flap, bar grow | Keep as value change without roll or flip (instant digits); bars appear at final size |
| Draw-on / typewriter | doodle draw-on, pen strokes, `tg-type` | Final frame immediately. Stream text by chunk without the caret animation |
| Auto-advancing media | Story 5 s slides, Ken Burns push-in, trailer | No push-in. Keep auto-advance but announce; honour "hold to pause"; add a visible pause control (WCAG 2.2.2) |
| Gesture physics | Card fling, rubber-band | Shorter, no rotation |

- `tg-type`, `tg-confetti` and `tg-count` currently ignore reduced motion, and prototype transitions ignore it too.
- A **separate app-level "Motion: full / reduced / off" setting** is recommended, because the brand relies on motion.

### 6.2 Dynamic Type vs fixed condensed headlines

- Everything is fixed px and heavily absolute-positioned (`position:absolute; top:…`), which does not reflow.
- Text as small as **7–9.5 px** appears in 150+ places: tier labels, map sublabels, micro chips.
- Proposal:
  - Body, row and caption scale with the system text-size setting up to AX3 (clamped).
  - Display and h1 scale less (for example 0.5× the factor) and auto-fit width (minimum scale factor ~0.7, max 3 lines).
  - Mega numerals never scale; they are decorative duplicates of accessible text.
  - Move all layouts to stack or flow.
  - Minimum 11 pt for any informational text.
  - Chips wrap.
  - Tab labels hide at the largest sizes, using a large-content viewer on long-press, as iOS does.

### 6.3 Contrast (WCAG ratios computed)

| Pair | Ratio | Verdict |
|---|---|---|
| Cream on ink | 15.65 | Pass |
| Secondary `#a9a3c0` on ink / card | 7.43 / 6.83 | Pass |
| Inactive tab `#8d87a8` on `#120f22` | 5.52 | Pass |
| Ink on yellow / orange / green / pink / blue | 12.97 / 8.53 / 9.86 / 6.37 / **5.29** | Pass |
| Accent text on ink: yellow / green / orange / pink / blue | 12.97 / 9.86 / 8.53 / 6.37 / 5.29 | Pass; blue on card 4.86 |
| **Tertiary `#6f698c`** on ink / card | **3.48 / 3.20** | Fails AA for body; used for footers, timestamps, legal |
| **Outline `#3a3466`** on ink | **1.59** | Fails 3:1 for UI components: outlined secondary buttons, off-toggle track, dashed placeholders, input idle ring |
| Rust `#c4623e` Caveat on paper | 3.55 | Fails normal-text AA (Caveat at 17–22 px is not "large") |
| `#8a7f6c` on paper | 3.43 | Fail |
| Legendary silhouette `#6b5a24` on ink | 2.66 | Decorative OK; the "?" must carry meaning |
| Cream on pink / blue | 2.46 / 2.96 | Never do this; the design correctly uses ink |

Script-font legibility: Caveat carries important guide advice (for example the got-away reason and dietary guidance in 3j-3). Offer a "plain text for guide" option.

### 6.4 Colour-only signals

- **Critterdex form dots** "lit in their tier colour" (3l-8): no shape or number.
- **Avatar tier rings** (3n-4: blue / pink / gold).
- **Overspend day bar** pink (3i-6).
- Countdown "turns orange at ten minutes" (5a-3).
- Heatmap intensity: has n/6 labels, so OK. The best window is a yellow outline, which is fine.
- Balances bars: signed numbers present, OK.
- **Crowd-bar "now" marker** (3d-3) and best-chance bar (3l-5): colour plus a ring outline; add a text label.
- Toggle on/off: colour plus knob position. Add "On/Off" to the accessibility label.
- **Reply segments** (3f-6): legend present, OK.
- Member identity is colour plus initial, OK. The map "you" dot is colour only.
- Guide identity by colour: always paired with the name, OK.

### 6.5 Screen-reader labels for doodles

- `doodle-art` renders an unlabelled canvas.
- Proposal: a label generator from attributes:
  - Creatures: "{guide name}, {pose}" (for example "Tokek waving").
  - Critters: "{critter name}, {form} form" plus locked "Undiscovered local, found by being in {city}".
  - Icons next to text: decorative (hidden).
  - Standalone icons: semantic ("Chat, 5 unread").
  - Stickers inside avatars: the person's name.
- Group composite visuals into one element: passport page ("Winston's pass, home Singapore, issued 26 Sep 2026"), stamps, tickets, charts (text summaries: "Kyoto leads 4–2", "Crowds low before 7:30").
- The MRZ is decorative: hide it.
- Glyph icons (✕ ← → › ♡) need real labels.
- Live regions: countdowns (announce at intervals, not every second), streaming guide text (announce on completion), toasts.

### 6.6 Gesture alternatives (required)

| Gesture | Screens | Alternative |
|---|---|---|
| Slide-to-board | 3f-5, 5b-3 | Accessibility action "Board", double-tap |
| Hold-to-fill | 3l-4, 3l-10, 3n-10 | Custom action. For encounters the real mechanic is location dwell, so the hold is secondary; for delete, a confirm dialog |
| Drag-reorder / drag-to-assign / 15-min snapping | 3e-1, 3e-2, 3c-6 | Move up/down actions, time stepper |
| Card swipe / rate flick | 3d-2, 3o-3 | Buttons exist |
| Long-press composer (hold to talk) | 3j-1 | Mic button tap |
| Long-press island / photos | 5a-5, 3m-2 | System / context menu |
| Shake-to-report | 3p-1 | Tile exists |
| Edge-swipe back / drag-dismiss | — | Every sheet needs a visible close. Several lack ✕: 3b-3, 3c-11, 3g-3, 3o-4 |
| Hidden 5-tap on the build number | 3n-6 | Fine as an easter egg |

### 6.7 Other gaps

- Touch targets below 44 pt: chips 26–30 h, header pills 36, bell 36, count badges, month pills (3l-9), day chips, map pins.
- No focus order spec for layered, absolute layouts.
- No captions or transcripts for the narrated recap and guide voice.
- The SOS "long buzz" also needs persistent visual and flash alert parity (present) plus a VoiceOver announcement.
- No light mode or high-contrast variant (Increase Contrast should strengthen `#3a3466` outlines and `#6f698c` text).
- Landscape exists only for StandBy.

---

## 7. Localisation

**Languages and voice**
- UI languages (3n-8): English (default; "Guides mix in a few local words"), 中文（简体）, Bahasa Indonesia, 日本語, plus "12 more": Español, Português, Français, 한국어, ไทย, Tiếng Việt and 6 unnamed (16 total).
- Switching redraws the screen in place (no restart). The guide speaks one line in the new language (prototype sample lines: zh / id by Tokek, ja voiced by **Pon**; confirm which guide voices samples).
- "Each guide keeps a few words from home whatever you pick": Terima kasih, Selamat pagi, bilingual passport labels "PRÉNOM", "ENTRÉES", "COURRIER". Mixed-language strings need a markup convention so TTS pronounces the local words correctly and translators leave them untouched.
- Phrase cards and TTS in local languages: Indonesian shown; Japanese, Spanish, Portuguese, Icelandic, Quechua / Spanish (Cusco) and Arabic / French (Marrakech guest) implied.

**Currency model** (three distinct concepts)

| Concept | Source | Example / rule |
|---|---|---|
| **Home** currency | Home airport (SGD) | Profile-level |
| **Local** currency | Destination | IDR, JPY, MAD |
| **Crew / settlement** currency | Crew | "Balances split in the crew's currency. Rates work offline." 3i-1 shows a USD chip |

- Display mode HOME / LOCAL / BOTH changes every price in the app, with an odometer on the sample (3n-8: "Rp 75.000 ≈ S$6.40").
- Observed formats:

| Format | Example | Rule it implies |
|---|---|---|
| Destination-locale grouping | `Rp 450.000` (id-ID) inside an English UI | Uses the destination locale's grouping |
| Compact | `RP 450K`, `Rp 1.08M`, `Rp 60k`, `Rp 35k` | Compact notation, mixed case |
| Approximation | `≈ $28.42 · $4.74 each` | |
| Exchange hints | `¥1,000 ≈ $6.70`, `10 MAD ≈ $1` | |
| Home / USD | `S$`, `$1,310` | |
| Per-person rounding | "rounded to $10" (3o-4) | |

- Decide on:
  - locale-of-UI vs locale-of-currency formatting
  - symbol disambiguation ($ vs S$ vs US$)
  - compact-notation rules per language
  - offline FX snapshot staleness display
  - rounding per currency (IDR has no decimals, JPY no decimals)
- Time and distance: "24-hour · km" setting. Dates use ranges ("Oct 12–19", "Apr 2–9") that need interval formatting. Countdown "17D 05:26:47": the "D" needs localising.

**Text expansion risk (condensed Archivo headlines)**
- H1 blocks are sized to fill 350 px in 2 lines at 40–52 px with 70% width. FR, DE, ES, PT run 20–40% longer and will hit 3–4 lines or overflow into absolutely positioned elements (the guide sticker next to the title, for example 3c-9 and 3c-12).
- Hero words (KYOTO 124 px, BALI 176 px, MARRAKECH 74 px) are fitted by hand. Exonyms change: Kioto, Quioto, 京都, 교토.
  - Needs auto-fit single-line logic per string.
  - Needs a CJK fallback with no width axis. Use a heavy CJK face (for example Noto Sans CJK / Source Han Sans Heavy) with its own size table, since condensed CJK does not exist.
- Buttons (58 px pill, Archivo 900 16 + .06em uppercase) and two-button rows (3d-1 PITCH TO THE CREW + SOLO TRIP, 3k-10) will truncate.
- Tab labels are 62 px wide at 10 px: WALLET→PORTEFEUILLE and PASS→REISEPASS will not fit.
- Chips tracked at .06–.16em add ~10–15% width.

**Casing**
- Copy is authored in uppercase in the source; `text-transform` is used only 158 times.
- Store sentence-case strings and uppercase at render with locale rules: Turkish İ/ı, German ß→SS, Greek accent drop, and no-op for CJK, Thai and Korean.
- Also decide whether uppercase-condensed style applies to Vietnamese (legible, but diacritics collide at line-height .86).

**Diacritics and line-height**
- Critter and place names are native: CỤ RÙA, HÀ NỘI, ĐÀ LẠT, TÜRKIYE, CANCÚN, Tōdai-ji, Kōji.
- Line-height 0.78–0.86 on uppercase will **clip or collide stacked Vietnamese diacritics** (Ệ, Ộ) and Thai marks.
- Per-script line-height tokens are needed (≥1.0 for vi and th display; ≥1.15 for CJK).

**Font coverage**

| Family | Coverage |
|---|---|
| Archivo | Latin, Latin-ext, Vietnamese |
| Geist | Latin, Latin-ext, Cyrillic (verify Vietnamese) |
| Geist Mono | Similar to Geist |
| Caveat | Latin, Cyrillic (no Vietnamese; verify) |

- None cover CJK, Thai or Korean. Define fallback stacks per role, including a **handwritten fallback** for the guide voice (for example a CJK kaisho or hand font, or plain text).
- Note: Geist 800, Geist Mono 600/700 and Caveat 700 are used but not loaded.

**MRZ and passport**
- MRZ lines (`P<SGPWINSTON<<…`, `CP0427<<SGP<<SUNRISE<FOOD<EASY`) must follow ICAO 9303 A–Z, 0–9 and `<` only. Names need transliteration: Vietnamese strip diacritics, CJK romanise, Cyrillic transliterate.
- Travel-style codes need language-neutral tokens.

**Plurals and grammar**
- "4 OF 6 IN", "3 of 4 forms", "1 VOTE · DEV AND RIN TO GO", "2 IN THE CREW", "5 of 6 sharing", "Six of you" (spelled numbers).
- Needs ICU MessageFormat with plural, select, gender and ordinal rules.
- LLM-generated copy (pitches, briefings, personal versions, awards, postcard notes, notifications) must be generated in the user's language, with the guide's local words preserved.

**RTL**
- None of the named languages are RTL. The 6 unnamed ones and the Marrakech guest guide (Arabic phrase cards) make RTL plausible.
- Blockers if RTL is added:
  - text-glyph arrows (`← BACK`, `→`, `›`, `SIN ✈ KIX`)
  - edge-swipe direction
  - slide-to-board direction
  - progress, route and rail directionality
  - card slide-off direction
  - story tap zones
  - diagonal split cards
  - timeline hours
  - mirrored doodles (critters shouldn't mirror, arrows should)
- At minimum, RTL phrase-card text must render correctly inside an LTR UI.

---

## 8. Implementation guidance (stack-agnostic)

### 8.1 Build order (shared primitives first)

1. **Token package.**
   - Colour ramps plus semantic aliases (surface roles, accent roles, tier, member, guide/place).
   - Type ramps with width axis steps (62 / 66 / 70 / 78 / 100) and per-script overrides.
   - Space, radius, ring and shadow, textures (halftone, guilloche, hatch, engraving, barcode) as reusable painters or shaders.
   - Motion (durations, easings, springs, staggers) and sound / haptic cue IDs.
   - Export to every target: app, widgets, Live Activities, web site, social / store renderer.
2. **Fonts.**
   - Bundle Archivo variable subset `wdth 62–84` (plus 100 for buttons) and `wght 700–900`; Geist 400–800; Geist Mono 400–700; Caveat 600–700.
   - Script fallbacks.
   - Prewarm the fonts to avoid first-frame swaps on heroes.
3. **Sticker / doodle pipeline (critical path).** Choose between:
   - **(a)** porting the ribbon / wash renderer to the native 2D API (deterministic with seed); or
   - **(b)** baking at build time by running `critters-draw-*.js` / `doodles.js` headless. Outputs:
     - static raster per critter × form × pose × size bucket, with sticker edge and shadow
     - vector or stroke-path JSON (ordered polylines + widths) for draw-on via path trim
     - closed-eye frame for blink
     - monochrome / tinted variants for lock-screen widgets and tinted icons
     - locked silhouettes (single colour)
   - Widgets, Live Activities, notifications, app icons, share images, store and social assets cannot run the JS renderer, so they need (b) regardless.
   - Recommended: **hybrid**. Bake everything; use runtime draw-on only for the ~90 hero moments.
   - Volume: 150 critters × 4 forms, plus 6 guides × ~7 poses, plus 28 icon doodles.
4. **Motion runtime.**
   - `Loop(preset)` on a shared clock.
   - `Enter(preset, stagger)` one-shot.
   - `Stamp` (fall, overshoot, jolt, haptic, SFX in one call).
   - `Confetti` (GPU particles).
   - `Odometer` and `SplitFlap` (tabular digits).
   - `StreamText` (typewriter that tolerates unknown final length; animate container height).
   - `Countdown`, `Sheen`, `PingRings`, `Rays`.
   - `ProgressRing` / `HoldFill` (driven by value, not only by touch).
   - `SlideToConfirm`, `SwipeStack`, `DragReorder` with snap.
   - `FlyTo` (overlay clone), `SharedElementZoom`, `Sheet` (detents large / medium / fit, presenter scale .93, drag-dismiss), `IslandToast`.
   - A global **reduce-motion policy** hook read by every primitive.
   - A `slowmo` debug multiplier, as the prototype has.
5. **Surface primitives.**
   - Scaffold, TabBar + GuideFAB, HeroPanel, PassportPage (paper + guilloche + MRZ), Card / ListGroup, Chips, Buttons (with sheen and flap), Segmented, Toggle, Slider.
   - AvatarStack, CritterAvatar (tier ring), Stamp, Ticket, Receipt, Postcard, Visa.
6. **Feedback layer.**
   - Sound engine: SFX sprite by category; music per guide with crossfade on landing; ducking under TTS; quiet hours plus temple geofence mute; silent switch.
   - Haptic map: light / medium / heavy / selection / success / warning / error, plus a continuous ramp for hold and a long pattern for SOS.
   - One "impact" API fires visual, haptic and sound together.
7. **Screen assembly** on top of these, then native extensions (Live Activity / Dynamic Island, widgets incl. interactive, notification content with actions, alarm, StandBy, alternate icons).

### 8.2 Performance hotspots

| Hotspot | Where | Mitigation |
|---|---|---|
| Many `doodle-art` canvases, each redrawn fully per frame during draw-on and on every blink | Critterdex 3l-2 (~60 silhouettes), avatar grid 3n-4, vote board | Bake to bitmaps; blink = swap two cached frames; draw-on only on screen-enter heroes |
| 10+ concurrent infinite loops on Home and heroes | Home, heroes | Transform and opacity only, on the compositor / UI thread; pause off-screen (the design already uses IntersectionObserver); single shared clock |
| Confetti 90–140 particles plus rays plus sticker spin plus screen jolt at once | 3l-10, 3c-2, 3a-6 | GPU particle layer; cap particles; drop to ~40 on low-end |
| Blur, `filter: drop-shadow` ×4 die-cut edges, conic gradients | Tier stickers, holo seal | Pre-render tier edges into assets |
| Maps with animated pins, trails, meet-up pulse, crew rail updating each minute | 3g-4, 3d-4, 3k-9 | Coalesce updates; interpolate between fixes |
| Camera preview plus OCR / segmentation plus AR label placement plus sticker animation | 3l-4, 3j-3, 3i-3 | Throttle recognition; lock overlays after detection |
| Long lists: Critterdex 150 × 4, photo album 312, idea board, chat | 3l-2, 3m-2 | Virtualise; silhouettes as one-colour sprites |
| Story recap and share exports (9:16 story, postcard, poster, receipt image) | 3m-3…9 | Offscreen rendering at export resolution; deterministic (same seed) |
| Streaming LLM text into condensed headlines or cards | 3b-3, 3j-1 | Avoid re-layout of large display type per token; buffer by word or line |
| Fonts | Variable Archivo with width | Instance a few named widths to avoid runtime variation cost on some renderers |
| Live Activities / widgets | 5a-*, 5c-* | Strict size and update budgets: no custom animation beyond system transitions; "Tokek walks the trail" must be position updates, not continuous animation; the ring filling while locked needs periodic updates within budget |

### 8.3 Size of the build

| Item | Count |
|---|---|
| Distinct components / variant families | ~160 (§3) |
| Motion primitives | ~25 |
| Transition types | 10 |
| Sound categories | ~6 SFX families + ~40 distinct SFX + 6 music themes + TTS |
| Haptic patterns | ~10 |
| Native extension views | ~15 |
| Critter asset set | ≥600 critter renders + guide poses + icon set, ×3 densities, ×(colour, mono) |

### 8.4 QA hooks worth copying from the prototype

- `slowmo` 2× / 4×.
- Tap-target overlay (H).
- Scenario deep-entry list (29).
- State-swap groups.
- Persisted stack restore.
- Dead-tap feedback (debug builds only).

---

## Unresolved questions

1. **Lisbon/Sardi colour** (green vs blue vs cyan) and the place-stamp colour rule. Should guide colour equal place colour everywhere, and what colours do the 55+ non-guide places get?
2. **Member colours with more than 6 members** (Boost allows 16): palette extension or pattern? Is member colour per user or per crew?
3. **Paywall system:** is 4e final everywhere? 4b-1 and 4c-2 still route to 4a-1, and 4a-3 introduces a gold "cover" that the referral site also sells as a reward.
4. **Guide FAB:** does it swap to the destination guide (Pon for Kyoto) and its colour? What is its accessibility label? Is hold→Help real?
5. **Tab stacks:** keep per-tab navigation stacks (iOS norm) or reset on tab switch (prototype)?
6. **Encounter mechanic:** physical press-and-hold (3l-4) or location dwell (5a-4), or both? How does the ring drain rate work, and must the hold be accessible?
7. **Light mode, high-contrast and landscape / iPad:** are they out of scope?
8. **Android:** Dynamic Island, Live Activity, StandBy, interactive widget, AlarmKit and alternate-icon equivalents, plus Material back gesture. The design is iOS-only, but the site says "Free on iPhone and Android".
9. **Music themes** for Ajo, Sardi and Paco. Are narration and TTS voice actors, or synthetic per guide? What is the "critter voices" chirp content? Are there custom notification sounds per guide?
10. **Reduce motion:** follow only the OS setting, or add an in-app motion setting?
11. **Currency formatting:** follow the UI locale or the currency's native locale ("Rp 75.000" in an English UI)? What is the crew-currency selection rule (3i-1 shows USD for a Singapore-based crew)?
12. **Which 6 unnamed languages** are planned (any RTL)? Which guide voices each language sample (the prototype uses Pon for Japanese)?
13. **Uppercase condensed styling for CJK, Thai and Vietnamese:** keep it, or switch to a heavy non-condensed display style per script?
14. **Fonts** used but not loaded (Geist 800, Geist Mono 600/700, Caveat 700): intentional?
15. **Font-stretch below 62%:** extend the Archivo axis (not possible beyond the family range) or re-spec the 58/60 values?
16. **Island toast:** is the prototype's in-app notice the intended production pattern, or a prototype convenience?
17. **Doodle pipeline:** is runtime drawing required on-device (seeded variety, draw-on everywhere), or is baking acceptable?
18. **Sheet close affordances:** several sheets rely on drag-dismiss only. Add ✕ everywhere?
19. **Critical Alerts:** SOS "breaks through" and the alarm "rings through DND". Which entitlement or API is acceptable (time-sensitive, critical alerts, or system alarm)?
