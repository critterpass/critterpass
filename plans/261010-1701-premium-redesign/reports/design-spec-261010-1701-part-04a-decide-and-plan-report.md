# Design spec: Part 4a "Decide and Plan", screens 4.01–4.29

Source: `$Z/CritterPass 04 Decide and Plan.dc.html` (lines 22–434), `$SP/txt-04-Decide-and-Plan.txt` (lines 1–733), shots `$SP/shots/04/4.01–4.29.png`, `$Z/bali-map.html`, Foundations 1.09/1.11/U5. Current app: `$R` = `/Users/quocs/Projects/critterpass-worktrees/deploy`. All px are at 390×844 (1 pt = 1 px). "SH_CARD" = `0 0 0 .5px rgba(20,22,40,.05), 0 1px 2px rgba(20,22,40,.04), 0 14px 34px -12px rgba(20,22,40,.16)`. "SH_INK" = `inset 0 1px 0 rgba(255,255,255,.18), inset 0 0 0 .5px rgba(255,255,255,.07), 0 1px 2px rgba(20,22,40,.25), 0 16px 32px -10px rgba(20,22,40,.5)`.

## 1. Summary

- **29 screens**: 4.A picking the place (4.01–4.07), 4.B set up together (4.08–4.19), 4.C Tokek drafts it (4.20–4.24), 4.D the plan (4.25–4.29). Four are inline frames (4.05, 4.06, 4.10, 4.15) and carry no "Every tap" box; the rest are imported phones.
- **No tab bar on any phone in this range** (neither `Tabs.dc.html` nor the 1.04 native bar). Every screen is a push, a sheet, a full screen or the map. The Days/Map/Calendar segmented control the brief mentions does **not** appear in 4.01–4.29 (it is only the Foundations U5 sample, `$Z/CritterPass 01 Foundations.dc.html` "Controls"); the plan's views are one map with three sheet detents plus the pushed All days grid. The current app has no such control either.
- **New versus current app**:
  - Setup turns from the 4-step wizard (WHEN · BUDGET · ROOMS · MUST-DOS, `features/setup/shell/stepper.tsx`) into **one checklist of 7 rows, any order after Dates** (Dates, Free days, Budget, Must-dos, Getting there, Route, Rooms), with a **member's own "Your part" view** (4.09) and a **draft-as-you-go strip** (4.08/4.09).
  - Two new setup steps: **Getting there per member** (4.18) and **The route** (4.19, multi-stop).
  - Budget member step gains **how you sleep** + **room chips** on the same page (4.17) and a **slider** instead of the current keypad.
  - Vote showdown becomes **two stacked guide cards with VS and two buttons** (current: diagonal split halves you tap). Winner reveal becomes a **white stamp disc on the ground colour** (current: winner colour floods the screen with rays + confetti).
  - Plan: the **day plan moves into the map's half sheet** (drag in place while the map redraws), half detent rises from 452 to 544 pt, the full detent keeps a 146 pt island strip. The stop's long-press becomes an **iOS-style context menu with a lifted preview** (current: `item-detail-sheet.tsx`).
  - The map becomes a **light cream/blue style with a night variant** (current: one purple "Critterpass dark" style, `apps/mobile/assets/map-style/critterpass-dark.json`).
- **Hardest to build well**:
  1. The plan map + sheet (4.25→4.26→4.27): three detents with chrome that hands off (chips → Ideas count → island strip), camera re-fitting the visible map area per detent, and **drag-to-reorder inside the half sheet** with live route redraw and a drop slot that says if it fits.
  2. The checklist setup with progressive drafting: the domain is sequential today (`TRIP_SETUP_STEPS`, `set_setup_step`), and the "5 of 8 days sketched" strip needs a draft that updates as answers arrive.
  3. Cross-day drag on All days (4.28) with per-card fit glow and the before/after preview toast (logic exists in `use-cross-day-drag.ts`; the visual is new).
  4. Stop context menu (4.29) that coexists with hold-to-drag on the same stop.
  5. The new MapLibre light + night styles with day-coloured, white-cased routes (and Android parity of pins).

## 2. Screen table

Paths are under `$R/apps/mobile/src/app/` unless noted. Logic: exists / partial / missing.

| code | title | screen type | header left / right | primary action | current route file(s) | logic |
|---|---|---|---|---|---|---|
| 4.01 | New poll | Sheet, full height (form) | ✕ (control fill) / **Post** ink pill | Post | `vote/new-poll.tsx` → `features/vote/poll/create-poll-sheet.tsx` | exists |
| 4.02 | Search places | Search page, field docked above keyboard | none / ✕ glass beside field | search key | `places/search.tsx` → `features/vote/places/search-sheet.tsx` | exists |
| 4.03 | Guest guide (Marrakech) | Push over hero photo | glass ‹ / glass share + heart | Pitch to the crew | `places/[placeId].tsx` → `features/vote/places/guest-guide-page.tsx` | exists |
| 4.04 | Destination guide (Kyoto) | Push over coloured hero | glass ‹ / glass heart | Pitch to the crew | `explore/[destination].tsx` → `features/explore` `DestinationScreen` | exists |
| 4.05 | Vote showdown | Push | glass ‹ / "Closes Fri" chip | Vote {place} | `vote/[pollId]/index.tsx` → `features/vote/final/showdown-screen.tsx` | exists (layout new) |
| 4.06 | Winner stamp | Full screen (celebrate) | none drawn / none | Set up Kyoto | `vote/[pollId]/reveal.tsx` → `features/vote/final/winner-reveal.tsx` | exists |
| 4.07 | Solo trip confirm | Sheet, half (one choice) | grabber only | Start solo trip | in-page `features/vote/places/solo-confirm.tsx` | exists |
| 4.08 | Setup checklist (organiser) | Push | glass ‹ / glass share | Draft with what we have | `(trip)/[tripId]/setup/index.tsx` → `features/setup/shell/setup-screen.tsx` | **partial** (wizard → checklist; progressive draft missing) |
| 4.09 | Setup, member's part | Push | glass ‹ / none | row pills Set / Star | same route, member role | **partial** |
| 4.10 | When (heatmap) | Push | glass ‹ / none | Lock Apr 2–9 | `(trip)/[tripId]/setup/[step].tsx` (when) → `features/setup/when/when-step.tsx` | exists |
| 4.11 | Find your free days | Sheet, full | grabber only | Connect / Mark days by hand | `features/setup/calendar/calendar-connect-sheet.tsx` (opened from `when-step.tsx`) | exists |
| 4.12 | Mark your days | Sheet, full | grabber only | Save my days | `features/setup/calendar/manual-days-sheet.tsx` | exists |
| 4.13 | Calendar connected | Full screen (celebrate) | none / none | Back to setup | `setup/calendar/connected.tsx` → `features/setup/calendar/connected-screen.tsx` | exists |
| 4.14 | No week fits | Push | glass ‹ / none | Ask Dev | when step → `features/setup/when/window-options.tsx` | exists |
| 4.15 | Budget sweet spot (organiser) | Push | glass ‹ / none | Looks good | `setup/[step].tsx` (budget) → `features/setup/budget/budget-step.tsx`, `sweet-spot-card.tsx` | exists |
| 4.16 | Budget, waiting on maxes | Push | glass ‹ / "Step 2 of 4" pill | Nudge Ray and Dev | `features/setup/budget/budget-view.tsx` (k < 4 state) | exists |
| 4.17 | Your private max + sleep | Push | glass ‹ / "2 of 4" pill | Save privately | `features/setup/budget/private-max-view.tsx` + rooms prefs (`features/setup/rooms/member-tools.tsx`) | **partial** (sleep choice, ground floor) |
| 4.18 | Getting there | Push | glass ‹ / none | Next · budget | none in setup; `features/plan/all-days/getting-there-section.tsx` (viewer only) | **missing** (per member) |
| 4.19 | The route | Push | glass ‹ / none | Save the route | none in app; server `services/api/src/planning/areas/set-trip-stops.ts` | **partial** (UI missing, flag `trip.areas` off) |
| 4.20 | Pon is drafting | Full screen | none drawn (tap list says Close) | none | `(trip)/[tripId]/draft/drafting.tsx` → `features/plan/draft/drafting/drafting-view.tsx` | exists |
| 4.21 | Drafting, slow | Full screen with ✕ | glass ✕ / none | Ping me when it's ready | same (slow state) | exists |
| 4.22 | Pon's draft (all made it) | Push | glass ‹ / ink "Only you see this" chip | Build the proposal | `(trip)/[tripId]/draft/index.tsx` → `features/plan/draft/review/draft-review-view.tsx` | exists |
| 4.23 | Draft, one must-do missed | Push | glass ‹ / glass ⋯ | Send to the crew | same | **partial** (waitlist, ask-to-swap) |
| 4.24 | Redraft kept original | Push | glass ‹ / none | Keep Day 3 as it is | `(trip)/[tripId]/draft/redraft/[redraftId].tsx` → `redraft-diff-view.tsx` | exists |
| 4.25 | Plan, peek | Map root (no back drawn) | search pill / glass ≡ List | sheet drag | `(trip)/[tripId]/plan/map.tsx?sheet=peek` → `features/plan/trip-map/peek-sheet.tsx` | exists |
| 4.26 | Plan, one day at half | Map | search pill / glass "9" (Ideas) | hold-drag a stop | `plan/map.tsx?sheet=half` (`day-sheet.tsx`); drag today lives in `day/[day]/index.tsx` (`day-plan/use-reorder.ts`) | exists (moves into the sheet) |
| 4.27 | Plan, whole trip | Map at full | none (island strip) | row → day | `plan/map.tsx?sheet=full` → `trip-sheet.tsx` | exists |
| 4.28 | All days grid | Push | glass ‹ / glass share | drag stop to a day | `(trip)/[tripId]/plan/days.tsx` → `features/plan/all-days/*` | exists |
| 4.29 | Stop menu (long-press) | Context menu over blurred day | none | menu rows | `features/plan/day/item-detail-sheet.tsx` (a sheet today) | exists (presentation new) |

## 3. Per-screen spec

### 3.0 Shared chrome (applies unless a screen says otherwise)

- Status bar 54 pt; home indicator 134×5 r3 at bottom 8.
- **Glass nav button**: 44×44 r22, `rgba(255,255,255,.62)` blur 18 saturate 1.8, shadow `inset 0 1px 0 rgba(255,255,255,.95), inset 0 0 0 .5px rgba(255,255,255,.6), 0 0 0 .5px rgba(20,22,40,.07), 0 8px 20px -6px rgba(20,22,40,.16)`; row at left/right 20, top 56–60 (normalise to 58). OFF-TOKEN versus Regular glass (.56, blur 24, sat 1.9) and versus 40 pt icon buttons.
- **Inline title**: 17/600 centred (16/600 on 4.08, 4.09, 4.18, 4.19: normalise), subtitle 12/400 muted `#6e7180`.
- **Ink pill CTA**: h56 r28 `linear-gradient(180deg,#30313b,#16171d)`, 17/600 −0.01em white, SH_INK; left/right 24; bottom 28–40 across screens (normalise to 30 above the home indicator). Paired with a **text button** below: 15/600 muted, 6 pt vertical padding (h36–44 hit).
- **Card**: `#fff` r22–24, SH_CARD. List rows: padding 8–11/14, gap 12, separators .5 px `rgba(28,29,36,.07)`.
- **Section label**: 13/600 muted at x 26–28, 22 pt above its card.
- **Guide glass note** (bottom of setup screens): r22 `rgba(255,255,255,.66)` blur 20 sat 1.8, shadow `inset 0 1px 0 #fff, 0 0 0 .5px rgba(20,22,40,.06), 0 10px 24px -14px rgba(20,22,40,.25)`, padding 8 14 8 8, gap 10; avatar 36 circle (Tokek `#fff3c4`, Pon `#ffe6d3`/`#ffe9d6` OFF-TOKEN) with the critter 36 bottom-aligned; text 13 lh 1.38 `#3d404c` (OFF-TOKEN), guide name bold ink.
- **Tokek inline note** (yellow, actionable): r16 `#fff6c9` (OFF-TOKEN light Tokek tint), padding 8 10 8 6, gecko 28 in a white 28 circle, text 12.5 lh 1.35 `#3d3210`, action word 12.5/700 ink on the right.
- **Crew avatar**: sizes 20/22/24/26/34/36/40, 2 px border in the surface colour, overlap −8 (−6/−7 on small), initials 700 `#17142a` (OFF-TOKEN sticker ink). Crew colours W `#ffd84a`, M `#ff5fa8`, A `#4f86ff`, J `#54d6a4`, R `#ff9a4d`, D `#f4efe4`.
- **Tag**: h24 r12 padding 0 9, 11.5/700, status tints from Foundations.
- **Small pill**: h36 r18 padding 0 14, 13.5/600; control `#f1f1f4` (Nudge, Share) or ink `#1c1d24` white (Set, Star).
- **Modal sheet**: left/right/bottom 8, r46, `rgba(248,248,250,.88)` blur 34 sat 1.8 (4.07 uses .84), shadow `inset 0 1px 0 rgba(255,255,255,.95), inset 0 0 0 .5px rgba(255,255,255,.7), 0 0 0 .5px rgba(20,22,40,.06), 0 -10px 60px -10px rgba(20,22,40,.32)`; scrim `rgba(20,22,40,.2)` over the parent; grabber 36×5 r3 `rgba(60,60,67,.3)`.
- **Map sheet**: full-bleed, r34 34 0 0, `rgba(248,248,250,.92)` blur 30 sat 1.8, shadow `inset 0 1px 0 rgba(255,255,255,.9), 0 0 0 .5px rgba(20,22,40,.06), 0 -14px 40px -14px rgba(20,22,40,.3)`, padding 8 16 0, grabber 36×5 `rgba(60,60,67,.28)`. OFF-TOKEN versus the sheet variant (r46/.86/blur 34); it is a distinct material.
- Scroll: no screen in this range shows a large title collapsing; setup h1s (28–30 pt) sit in content and should scroll under the glass header (bar gains Regular glass once content passes under it). CTAs are fixed with a 130 pt fade from `rgba(245,245,247,0)` to `#f5f5f7` at 46% behind them (drawn on 4.03; apply to every fixed-footer screen).

### 4.01 New poll (sheet over crew chat)
- Sheet top 62, padding 10 18 0. Grabber, margin-bottom 10.
- Header row: left ✕ 44 circle filled `rgba(118,118,128,.12)` (control, not glass) with 14 px ✕ stroke 2.6; centre "New poll" 17/600; right **Post** ink pill h44 padding 0 18 r22 15/600.
- Question: margin-top 20, 26/700 −0.025em (OFF-SCALE), caret 2.5×28 `#4f86ff` blinking (1000 ms). Line "Asked in the Bali Six chat" 13 muted.
- Answers card margin-top 16 r22 white, hairline `0 0 0 .5px rgba(20,22,40,.05)`: rows h50 padding 0 14 gap 12: radio 22 ring 2 px `#d0d1d8`; label 16/400; drag handle 16×10 (3 bars `#c4c6ce`). "Add an answer" row h50: 22 disc `#2f5fc4` with white +, label 16/500 `#2f5fc4` (OFF-TOKEN link blue = rain text).
- "Closes" label 13/600 muted, padding 18 6 8. Segmented h36 pad 3 r18 `rgba(118,118,128,.12)`, segments flex 1.5/1/1/1 "When all vote · 1 h · 1 day · 3 days" 13/600 `#3d404c`; thumb r15 white, shadow `0 0 0 .5px rgba(20,22,40,.04), 0 3px 8px rgba(20,22,40,.12)` (Foundations U5 is h40/r20: OFF).
- Toggles card margin-top 16 r22: rows h52, 15.5 label; toggle 52×32 r16, on `#34c77b` (OFF-TOKEN iOS green), off `rgba(120,120,128,.16)`, knob 28 white shadow `0 2px 6px rgba(0,0,0,.18)`.
- Keyboard: caret in the question but no keyboard drawn. Spec: question focused on open, keyboard up, return key **Next** walks question → answers → new answer; the sheet's content scrolls above the keyboard; Post stays in the header (enabled once question + 2 answers). Swipe down with edits asks first (Foundations sheet rule).
- Taps: Close → crew chat, draft kept; Add an answer → new row (max 6); Closes → segment; toggles; Post → poll card in chat (5.A).
- Motion: rises from the chat composer "+" (signature 1.06 morph, Smooth); segment thumb Snappy; toggle Snappy; new answer row inserts with height + fade (Smooth).

### 4.02 Search places (keyboard up)
- Large title "Places" at left 24 top 60, 34/700 −0.035em (Display).
- Results card top 112 left/right 16 r24 SH_CARD: rows padding 9 14 9 10 gap 12: tile 48 r15 (tint by guide state: guest `#fff6c9`, live `#e6eeff`, locals `#f1f1f4`) with critter 44 (locked silhouette tint for no-guide); name 16/600 with the typed prefix **bold** and the rest 400; sub 12.5 muted; trailing tag h24 r12 11/700 ("Guest guide" maybe tint, "Guide live" booked tint, "4 locals" unopened tint).
- Tokek yellow note top 392 left/right 16 r20 `#fff6c9` + inset `0 0 0 .5px rgba(150,120,20,.2)`, gecko 40 pointing, text 13 lh 1.4 `#3d3210`.
- **Docked search row** top 488 (16 pt above the keyboard), left/right 12, gap 8: field flex h50 r25 glass `rgba(255,255,255,.72)` blur 24 sat 1.9, shadow `inset 0 1px 0 #fff, inset 0 0 0 .5px rgba(255,255,255,.7), 0 0 0 .5px rgba(20,22,40,.08), 0 12px 26px -12px rgba(20,22,40,.3)`; magnifier 17 muted, text 17, caret 2×20 `#4f86ff`, clear 20 disc `#c4c6ce` with white ✕. Close button 50 circle same glass with ✕ 16.
- Keyboard: system keyboard 290 pt (drawn `rgba(214,216,222,.78)` blur 30); return key **search** (blue `#2f6bff`, system). The row rides the keyboard; results stay readable above it; keyboard drops on search or on scroll.
- Taps: Back/✕ → vote board (4.A); typing → live results; a result → place sheet (pitch or save; live guide → 4.04, guest → 4.03); no-guide note → 4.03; search → runs, keyboard drops.
- States drawn: none; current sheet covers offline and nothing-found (keep).
- Motion: results reorder/fade per keystroke (Snappy); row hand-off with the keyboard uses the keyboard's own curve.

### 4.03 Guest guide (Marrakech)
- Hero photo h340 full-bleed (placeholder hatch). Glass buttons top 58: ‹ left; share + heart right (gap 10). Over a photo Foundations wants **Clear glass** (`rgba(18,20,28,.30)`, white icons): OFF-RULE here.
- Content sheet top 300, r34 34 0 0 `#f5f5f7`, shadow `0 -12px 30px -14px rgba(20,22,40,.25)`. Gecko sticker 104 (pose think) at right 18 top 236, straddling the edge.
- Tag "Guest guide · Tokek" top 322: rotate −3°, padding 5 10 r9 `#ffd84a`, 2.5 px white border, shadow `0 4px 10px rgba(20,22,40,.18)`, 12/800 `#17142a`. Title "Marrakech" 40/800 −0.045em lh 1 (OFF-SCALE). Sub 14 muted.
- Facts card top 446 h66 r22, 3 equal columns, dividers .5 px `rgba(28,29,36,.1)`: key 11/600 muted, value 15.5/700 (From home · 1 stop | Best · Mar–May | 10 MAD · ≈ $1).
- Notes card top 530, left/right 22, r 6 6 20 6, `#fff6c9`, rotate −1.2°, shadow `0 1px 2px rgba(120,90,0,.15), 0 16px 30px -16px rgba(120,90,0,.4)`: heading 11/800 +0.08em `#8a6a0c`; lines Borel 12.5 lh 1.6 `#3d3210` (OFF versus Guide 15); last line "still reading up…" `#a89a6a` = the stream's live tail.
- Footer bottom 30, left/right 16, gap 8: ink "Pitch to the crew" flex 1.5 h56 16/600; glass "Go solo" flex 1 h56 `rgba(255,255,255,.72)` blur 20.
- Taps: Back → 4.02; a note → expands with sources; Pitch to the crew → adds to the vote board (4.A); Go solo → 4.07.
- Motion: notes stream in line by line (fade + 4 pt rise, Smooth); tail blinks; the gecko hops in on arrival (Lively, as the current page does); hero stretch on overscroll (undrawn, iOS norm).

### 4.04 Destination guide (Kyoto)
- Hero h320 `#ff9a4d` + dot grid `radial-gradient(rgba(23,20,42,.12) 1.2px, transparent 1.7px) 0 0/10px 10px`. Glass ‹ and ♡ top 56.
- Text block left 24 top 120: "GUIDE: PON" 12/800 +0.08em `#5a2c08`; "Kyoto" 60/800 −0.05em lh .95 `#17142a`; tagline 14 `#3d2410` max-width 190 (all OFF-TOKEN, guide-tinted ink). Tanuki 150 waving at x228 y116 rotate −6°.
- Best-month card top 290 left/right 16 r22 padding 14: "Best in April" 13/700 + "From SIN · about $412 return" 12.5 muted; 12 bars flex gap 3 in 44 pt height, r3, `#dcdde3`, best month `#ff9a4d`; month initials 10.5/700 `#9a9daa`, best ink.
- "Pon's first-timer picks" 13/600 muted + "28 ›" bold, top 436. Carousel top 460, left 16, bleeding right: cards 150×120 r20 tinted (`#ffe9d6`, `#ffe4f0`, `#e3f6ec`), padding 12, doodle 44 top, label 14/700 bottom. Horizontal scroll with paging feel.
- Crew plans row top 598 r22 padding 12 14: 36 tile r10.8 `#ffe9d6` with ticket doodle; "14 crew plans" 14.5/600 + "How other crews did Kyoto" 12 muted; chevron.
- Footer bottom 28: ink "Pitch to the crew"; text "Plan it solo".
- Taps: Back → Home or the board; ♡ saves; a month → prices + weather for that month; a pick → place (4.36, other lane); 14 crew plans → published plans (`community/[destinationId]`); Pitch → vote (4.A); Plan it solo → 4.07.

### 4.05 Vote showdown
- Header top 60: glass ‹; centre "Next trip" 17/600 + "Final round" 12 muted; right chip h30 r15 white (shadow `0 0 0 .5px rgba(20,22,40,.06), 0 1px 2px rgba(20,22,40,.04), 0 8px 20px -6px rgba(20,22,40,.14)`) with 7 dot `#ff5fa8` + "Closes Fri" 12.5/600.
- Two guide cards left/right 20, h236 r28 white, shadow `0 2px 4px rgba(20,22,40,.05), 0 18px 40px rgba(20,22,40,.09)`; top card y124, bottom y388:
  - Critter sticker 132–134 overhanging top-right (−6, −20) or rotated −14°.
  - Place tag rotate −6° / +4°, padding 7 13 r10, 2.5 px white border, 18/800 `#17142a`, fill = place colour (tangerine / mint).
  - Pitch line 19/600 −0.015em lh 1.25, width 196, top 72–78.
  - Fact chips top 144: h26 r13 `#f1f1f4` 12/600, gap 6.
  - Footer bottom 18: voter avatars 26 (−8), progress h6 r3 track `#f1f1f4` fill place colour, count "3 votes" 15/700 (or "1 vote · Dev, Rin to go" 13/600 muted).
- VS disc 56 `#1c1d24`, 16/800 white, 5 px `#f5f5f7` border, centred at y346 straddling the cards, z5.
- Tokek glass note top 632 ("A tie goes to Kyoto: it's $440 cheaper…").
- Buttons bottom 36, left/right 20, gap 10: "Vote Kyoto" ink pill flex 1 h56 16/600; "Vote Lisbon" white pill flex 1 h56 (shadow as the chip).
- Motion: a vote fills the card's bar and slides the voter's avatar into its stack (Smooth); the other card dims slightly; buttons press-scale .97 (Snappy); a medium haptic on cast (current). A mind-change slides the avatar across cards (Smooth). When the poll closes → 4.06.
- Swipe vote (Foundations 1.09) is **not** this screen; it belongs to 4.42 "Swipe together" (other lane). 1.09 metrics for reference: card left/right 24, top 132, h500, white frame r36 pad 8, photo r29 with bottom gradient to `rgba(10,10,20,.6)`; title 30/800 −0.035em white; "I'M IN" stamp 34/900 +0.04em mint, inset 3.5 px ring r12, rotate −16°, lands from scale 1.4 at .14→.22 of 5 s with `cubic-bezier(.2,1.4,.4,1)`; card leaves: nudge 40 px + 4° (0.12–0.2), hold, then fly to x 460 y 40 rotate 20° (0.26–0.44, ease-in), next card rises from scale .93 y 18 (0.3–0.48, `cubic-bezier(.2,1.1,.4,1)`); action row bottom 44: ✕ glass 64, "Maybe" glass h48, ✓ ink 64 that pops scale 1.14 on commit.

### 4.06 Winner stamp
- Header centred top 66: "Where next?" 17/600 + "Final · 6 of 6 voted" 12.5 muted. No back or ✕ drawn.
- Stamp: white disc 250 at y128 (shadow `0 2px 4px rgba(20,22,40,.05), 0 24px 50px rgba(20,22,40,.12)`); ring 214 rotated −9°, double ring `inset 0 0 0 4px #e07a2a` + `inset 0 0 0 11.5px #e07a2a` (gap 6), text `#c45f16` (both OFF-TOKEN darker tangerine): "THE BALI SIX PICKED" 11/800 +0.2em; "KYOTO" 52/800 −0.04em; "WINS 4–2" 14/800 +0.12em.
- Tanuki 138 at (226, 282) hopping over the disc edge. Stickers: star 36 sun rot −14° (52,140); spark 32 pink rot 12° (300,118); plane 52 sky rot −6° (40,330).
- Tally card top 440 left/right 20 r24 padding 16 18 gap 16: rows name 16/700 (winner) / 16/600 muted (loser), avatars 24 (−7), count 20/700 width 22 right-aligned (loser muted); bar h10 r5 track `#f1f1f4`, fill place colour at vote share.
- Loser line top 614: sardine 56 rot −10° + Borel 13 lh 1.45 `#1f6b4c` "Sardi took it well…".
- Footer bottom 36 gap 12: ink "Set up Kyoto"; caption 13 muted "Lisbon goes back in the deck for next time".
- Motion: signature 1.07 stamp: disc scales in (Smooth), stamp ring drops from scale ~1.4 + rotate, squashes, inks (Lively, one wobble), page answers (tally card rises, bars fill, Smooth); heavy haptic on land. Tanuki `hop` loop 2600 ms (`0: ty0 sy1; .1: sy.9 ease-out; .22: ty−14 sy1.05 ease-in; .34: ty0 sy.94 ease-out; .42: sy1`). Stickers pop in staggered (Lively). Reduce Motion: 150 ms cross-fade, stamp lands without falling.
- Role: organiser gets "Set up Kyoto" → 4.08; everyone else needs their own exit (current: "Back home"). No member variant drawn.

### 4.07 Solo trip confirm (half sheet over 4.03)
- Sheet bottom-anchored (no top), padding 10 22 26, glass .84. Grabber margin-bottom 18.
- Solo pass ticket h118 r22 white rotate −1.5°, shadow `0 0 0 .5px rgba(20,22,40,.05), 0 14px 30px -14px rgba(20,22,40,.25)`: left body padding 14 16: "SOLO PASS · 1 SEAT" mono 9.5 +0.12em muted (Mono token at 9.5: OFF); "YOU ⇢ RAK" 30/800 −0.02em with dotted arrow; "Dates open · Tokek plans with you" 12 muted. Perforation 2 px dashed `#e3e4e9`. Stub 86 wide `#fff6c9` with gecko 70.
- Title 26/700 centred margin-top 22; body 14.5 muted lh 1.45 centred.
- Ink "Start solo trip" margin-top 20; "Not now" h44 15/600 muted.
- Taps: Back → 4.03; Dates open → 4.12; Start solo trip → solo setup with Tokek (4.40, other lane); Not now → back, nothing saved.
- Motion: sheet rises Smooth; ticket drops in with a small tilt settle (Lively). Swipe down = Not now.

### 4.08 Setup checklist (organiser, Bali)
- Header top 56: glass ‹, "Bali setup" + "Oct 12–19 · 6 going", glass share.
- **Draft strip card** top 114 left/right 16 r22 padding 14: gecko 40 in `#fff3c4` circle; "TOKEK IS DRAFTING AS YOU GO" 11/800 +0.06em `#8a6a0c`; "5 of 8 days sketched" 15/700; "Peek ›" 13/700. Day tiles margin-top 12: 8 tiles flex, gap 4, h34 r9; sketched = day colour with numeral 9.5/800 `#17142a` bottom-aligned (padding-bottom 4); unsketched `#f1f1f4` numeral `#9a9daa`. Caption 12 muted margin-top 8 ("Fri to Mon wait on Dev's free days and two more must-dos.").
- "4 of 6 ready" 13/600 muted at y296.
- **Checklist card** top 318: rows padding 8 14, gap 12. Status disc 26: done `#34c77b` with white check; open ring `inset 0 0 0 2px #dcdde3`. Title 15/600; sub 12.5 muted single line ellipsis. Trailing per row: Dates "Locked" tag (booked tint); Free days "Nudge" small pill (control); Budget / Must-dos / Getting there: who's done as 20 pt avatars (−8, initials 8/700); Route chevron; Rooms row disabled at opacity .5 ("Once the villa is booked").
- Footer bottom 28: ink "Draft with what we have"; caption "Tokek redrafts as the rest come in" 15/600 muted (drawn like a text button; it is a statement, make it 13/400 caption).
- Taps: Peek → the draft so far, read-only, on the plan map; a row → that step (free days, budget, must-dos (Ideas), getting there, route); Nudge → Tokek nudges Dev privately, once a day; faces → who's done, never what they entered; Draft with what we have → draft now, gaps stay; Share → trip invite link.
- Motion: a row's disc fills and checks (Lively pop) when its last answer lands; faces join the stack (Snappy); a newly sketched day tile flips from grey to its colour (Lively, staggered 60 ms). Nudge → pill reads "Nudged" disabled (Snappy cross-fade) until tomorrow.

### 4.09 Setup, member's part
- Header: glass ‹; "Bali setup" + "Winston is organising"; no right action.
- H1 top 116 left 24: "Two things left for you" 30/800 −0.04em lh 1.05 (OFF-SCALE); sub 14 muted "About a minute. Nobody sees your numbers."
- "Your part" at y208; card top 230 rows padding 11 14: open disc ring `inset 0 0 0 2px #1c1d24` (ink ring = your to-do); trailing ink small pill "Set" / "Star"; done rows green disc + chevron. Rows: Your max ("Only Tokek sees it"), Star a must-do ("Tirta Empul? You saved it"), Your free days, Getting there ("SQ 938 · lands 11:40").
- "The crew" at y470; card top 492 padding 14: "4 of 6 ready" 15/600 + avatars 24; 6 segment bars h6 r3 gap 4 (`#34c77b` done / `#e3e4e9`); day tiles as 4.08; caption 12 muted.
- Tokek glass note bottom 30 ("Set your max and I'll stop guessing at dinners.").
- Taps: Set → 4.17 (private); Star → Ideas with Tirta Empul highlighted; done row → change it; draft strip → draft so far, read-only; Back → trip hub (6.01) or crew chat.
- Roles: this is the member rendering of the same route as 4.08 (no Draft button, no Nudge, no Rooms/Route rows).

### 4.10 When (organiser)
- Header top 60: ‹, "Kyoto setup" + "Kyoto won 4–2".
- **Checklist pill** top 114 left/right 20 h62 r20 SH_CARD padding 0 14: ring 26 ink; "SETUP CHECKLIST · 1 OF 7" 11/800 +0.06em muted; "Dates" 15/700; right "Then any order" 12.5 muted. (Reused on every step page.)
- H1 top 196: "When can everyone go?" 28/700 −0.03em lh 1.08; sub 14 lh 1.4.
- Calendar card top 290 left/right 20 r24 padding 16: "April 2027" 17/600 + chip h26 r13 booked tint 12/600 "Apr 2–9 · all 6 free"; weekday row 11/600 muted; 7-column grid gap 4; cells h44 r12: number 15/600, fraction "4/6" 9.5/600 opacity .75. Heat fill by free count: 6 `#54d6a4`, 5 `#93e2c4`, 4 `#c6eedc`, 3 `#e2f4ea`, 2 `#eef1ef`, 1 `#f3f3f5` (intermediate mints OFF-TOKEN); selected range cells `#1c1d24` white text, each its own r12 (not joined).
- Pon glass note top 632. Footer bottom 40: ink "Lock Apr 2–9".
- Taps (from current + design): a day starts a range; Lock → dates locked, checklist row ticks, back to 4.08.
- Motion: range selection fills cell-by-cell along the drag (Snappy), selection tick haptic per day; Lock → button morphs to a check then pops the step (Smooth).

### 4.11 Find your free days (sheet, top 72, over "Kyoto setup")
- Sheet padding 10 18 0; grabber margin-bottom 14. Title row: "Find your free days" 26/700 −0.025em + "We read free and busy. Nothing else." 13.5 muted; calendar sticker 64 rot 8° top-right (margin-top −24).
- "What the crew sees" card margin-top 14 r22 padding 12 14: header 12/600 muted ("Apr 5–11" right); 7 cells gap 4: weekday 10.5/600 `#9a9daa`; tile h40 r10 10/700: free `#e3f6ec`/`#1f7a55`, busy `#1c1d24`/`#fff`, maybe `#fff3c4` + 1.5 px dashed `#d6b54a` / `#8a6a0c`. Lock line 12 `#3d404c`: "“Dentist 14:00” stays on your phone."
- Calendars card margin-top 12 r22: rows padding 11 14 gap 12: glyph tile 38 r11 (phone "31" `#ffe4f0`/`#b0306b`; Google "G" `#f1f1f4`/`#ea4335`; Outlook "O" `#e6eeff`/`#2f5fc4`); name 15/600; status 12 (synced `#1f7a55`, not connected muted, error `#b0306b`); action pill h32 r16 12.5/600 (Sync control, **Connect** ink, Retry control).
- Toggle row padding 14 6 0: "Share tentative as “maybe”" 14.5/600 + "The crew sees maybe, never the event." 12 muted; toggle on.
- Footer bottom 24: secondary button h54 r27 `rgba(118,118,128,.12)` 16/600 "Mark days by hand instead".
- Taps: Back/swipe → setup; Connect → system sign-in, then 4.10; What the crew sees → preview; toggle → maybe instead of busy; Mark by hand → 4.12.
- States drawn in one frame: synced, not connected, error with Retry. Permission denied (phone calendar) not drawn: keep current "Settings + by hand" row.

### 4.12 Mark your days (sheet, top 72)
- Title "Mark your days" 26/700 + "Pick a brush, then drag across the days." 13.5 muted.
- Brush segmented margin-top 14 h42 pad 3 r21 13.5/600, thumb r18 white; each segment has a 12 swatch r4 (free mint, busy ink, maybe `#fff3c4` + dashed `#d6b54a`).
- Month row margin-top 16: "April 2027" 17/700; chevrons ‹ › gap 18 (link blue).
- Grid margin-top 10 row-gap 6, cells h44: painted days join into runs (r14 at run ends, 0 inside, 2 pt side padding removed inside a run), 15/600; free `#54d6a4` ink text; busy `#1c1d24` white; maybe `#fff3c4` dashed; unpainted transparent.
- Finger halo: 40 circle `rgba(255,255,255,.35)`, ring 2 px `rgba(255,255,255,.9)`, shadow `0 6px 14px rgba(20,22,40,.25)`, blur 4.
- Overlap line margin-top 14: gecko 30 + 12.5 `#3d404c` "9 free days. Maya overlaps you on 6 of them."
- Footer bottom 24: ink "Save my days".
- Taps: Back → 4.11, marks kept; brush → picks; drag → paints, tap clears; overlap line → who overlaps which days; Save → setup, crew sees the summary.
- Motion: painting extends runs with the finger; each newly painted cell scales 0.92→1 (Snappy) with a selection haptic; runs merge with a radius morph (Snappy). Swipe sideways pages months (current). Design film: halo travels 0→120 px across one row (kf .1→.5 of 3600 ms).

### 4.13 Calendar connected (full screen)
- Confetti 26 pieces (mint, sun, sky) from (0.5, 0.22), once on arrival (design loops every 8 s).
- Halo 150 radial `#e3f6ec` 0–60% fading at 71%, ping ring 2 px mint (`ping` 1800 ms: scale .6→1.5, opacity .8→0), calendar sticker 104 mint, check badge 42 `#34c77b` with 4 px ground border at bottom-right.
- Title top 262 "You're free 14 days" 30/700 −0.03em; sub 14.5 muted lh 1.45.
- Mini month card top 356 left/right 16 r24 padding 14: 7-col gap 4, cells h24 r7 10.5/600: free `#54d6a4`/`#0f4a33`, busy `#e9eaee`/`#9a9daa`, other `#f6f6f8`/`#9a9daa`.
- "Other ways this can land" 12.5/600 muted at y560; three cards top 582 flex gap 8: `rgba(255,255,255,.7)` r18 padding 10, hairline; dot 8 (sun/grey/pink), 12.5/700 title, 11 muted line (Connecting · Not allowed · Didn't work).
- Footer bottom 34: ink "Back to setup".
- Taps: a day → free or busy, never the event; other ways → mark by hand (4.12) or disconnect; Back → 4.09.
- No ✕ drawn (Foundations full screen has ✕ top-left): see §8.

### 4.14 No week fits
- Header: ‹, "Kyoto setup" + "Step 1 · When" (legacy wording, see §8).
- H1 top 118 "No week fits all six" 30/700 −0.03em; sub 14 lh 1.4.
- Option cards top 216 left/right 20 gap 10, r24 padding 14 16: selected ring `0 0 0 2px #1c1d24` + `0 8px 24px rgba(20,22,40,.08)` (current uses a yellow outline); date 18/700; tag h24 r12 11.5/600 (maybe tint "Five of six · blossoms", booked tint "All six · −$90"); body 13 muted lh 1.4; 8 day bars h26 r7 gap 3 (mint free, sun partial).
- Pon's pick card top 500 r24 `#fff1e6` (OFF-TOKEN) padding 14 16 14 12: tanuki 52; "PON'S PICK · ASK DEV FIRST" 12/700 +0.06em `#a8501a`; 14 lh 1.4; Borel 12 `#8a4a12`.
- Footer bottom 34: ink "Ask Dev"; text "Pick a week anyway".
- Taps: Back → 4.09; Apr 2–9 → pick, Dev joins on the 5th; Apr 16–23 → pick, everyone, no blossoms; Ask Dev → private ask, told when he answers; Pon's note → why tentative is movable.
- Motion: cards deal in staggered (current, Smooth); selection ring morphs between cards (Snappy).

### 4.15 Budget sweet spot (organiser)
- Header: ‹, "Kyoto setup" + "Apr 2–9". Checklist pill "3 OF 7 · Budget · 4 of 6 in".
- H1 top 192 "What feels comfy?" 28/700; sub 14.
- Sweet-spot card top 284 left/right 16 r26 padding 16 18 (white; current is yellow): "Sweet spot, each" 13/600 muted + booked-tint chip "Under all 6 maxes"; amount 54/800 −0.045em tabular (OFF-SCALE); track h30: rail h6 r3 `#f1f1f4`, ink fill to the knob, max dots 14 (2.5 px `#b9bbc4` border, white), knob 24 ink with 4 px white border and `0 2px 8px rgba(20,22,40,.25)`; scale 12 muted "$800 · each dot is someone's max · $2,500".
- Breakdown card top 486 r26 padding 12 16 4: stacked bar h10 r5 gap 2 (flights sky, stays tangerine, food pink, fun mint, flex = amount); rows padding 4 gap 12: doodle 32, 15/600 (+ 12 muted sub), amount 16/600 tabular.
- Footer bottom 40: ink "Looks good".
- Motion: amount rolls (current), knob snaps to crew steps with tick haptic (current), stacked bar segments resize on knob move (Smooth).

### 4.16 Budget, waiting on maxes
- Header top 58: ‹; "Budget" 17/600; right progress pill h30 r15 `rgba(118,118,128,.12)` 12.5/700 `#3d404c` "Step 2 of 4".
- H1 top 120 "Two more maxes, then Pon prices it" 28/700 lh 1.1; sub 15 lh 1.42.
- Person grid top 248, 3 columns gap 10: tiles h112 r24; done: white + `0 0 0 .5px rgba(20,22,40,.05), 0 12px 28px -14px rgba(20,22,40,.18)`, avatar 40 (16/700), name 13/600, "Max in" 11.5/600 `#1f7a55` with lock icon; pending: `rgba(255,255,255,.5)` + `inset 0 0 0 1.5px rgba(28,29,36,.1)`, avatar opacity .45, name muted, "Not yet" `#9a9daa`.
- "Pon's range so far" card top 498 r24 padding 14 16: 15/600 + "Shows once four maxes are in" 12.5 muted; three hatched placeholders 28 r8 (`repeating-linear-gradient(135deg,#ececf0 0 4px,#f6f6f8 4px 8px)`).
- Footer bottom 30: ink with bell "Nudge Ray and Dev"; text "Price it anyway with four".
- Ways out: Nudge the missing two · Price with four · Change my max · Back.
- Motion: a tile flips from pending to done (Lively pop, avatar opacity .45→1) when a count arrives; placeholders shimmer until k ≥ 4.

### 4.17 Your private max + how you sleep
- Header: ‹; "Your private max"; right pill "2 of 4".
- H1 top 116 "Just for Pon" 28/700; sub 15 "Nobody sees your answers, not even Maya. Pon plans around them."
- Amount card top 214 h128 r24 padding 14 18: "Most I'd spend, each" 13/600 muted; "$1,400" 40/800 −0.04em tabular; slider rail h6 r3 `#eeeef2`, ink fill, knob 28 white `0 2px 8px rgba(20,22,40,.25), 0 0 0 .5px rgba(20,22,40,.08)`; scale 11.5 `#9a9daa` ($600 · $2,500).
- "How do you like to sleep?" at y362; 3 option cards top 386 gap 8, h104 r22 padding 12: selected ring `0 0 0 2px #1c1d24` + `0 12px 24px -12px rgba(20,22,40,.3)` and 20 ink check badge top-right; unselected `0 0 0 .5px rgba(20,22,40,.08)`; doodle 30 (selected in its accent, others `#c4c6ce`); title 14/700; line 11.5 muted (Share a room · Cheapest | Own room · +$35 a night | Don't mind · Pon decides).
- "Anything Pon should know" at y510; chips top 534 wrap gap 8: h36 r18 13.5/600; selected ink with check; others white (Light sleeper, Early riser, Night owl, I snore honestly, Ground floor).
- Pon glass note top 640. Footer bottom 30: ink with lock "Save privately".
- Keyboard: none drawn (slider). Spec: tapping the amount opens a numeric field (keypad, return **Done**) for exact entry; the card rides above the keyboard; current `private-max-view.tsx` is keypad-only, so keep the keypad as the tap path.
- Ways out: Save privately · Change any time · Back to budget.
- Motion: option select ring + badge (Snappy); chips toggle (Snappy); knob drag with step ticks.

### 4.18 Getting there
- Header: ‹; "Bali setup" + "Getting there".
- H1 top 114 "Day 1 starts at 16:30" 30/800 −0.04em; sub 13.5 lh 1.4.
- People card top 212 r22: rows padding 11 14 gap 12: avatar 34; "You · Singapore" 14.5/600; way 12 muted; optional warning 11.5/700 `#a8501a` ("Lands 16:00, joins for dinner"); trailing 13/700: "Booked" `#1f7a55` or "about $190" `#3d404c`.
- Tokek yellow note top 604 with "Ask" action.
- Footer bottom 28: ink "Next · budget".
- Taps: Back → 4.09; your row → pick your way (flight, bus, train, car, boat; a booking replaces the estimate); someone else's row → read-only, Nudge if they haven't picked; Ask → Tokek asks Alex privately; Next → 4.15 with everyone's way priced.

### 4.19 The route
- Header: ‹; "Kyoto setup" + "The route".
- H1 top 114 "Two stops, seven nights" 30/800; sub 13.5.
- Stop cards from y196, r22 padding 14 gap 12: number disc 30 (stop colour, 13.8/800 `#17142a`, 2 px white ring); city 17/700; "Apr 2–8 · 6 nights · Pon guides" 12.5 muted; guide avatar 40 in tint, or chevron.
- Travel-day connector: padding 6 0 6 28; dashed line 2×54 (`#9a9daa` 3 on / 4 off); card r16 hairline padding 8 12: "TRAVEL DAY · WED 8" 12/800 muted + "About 45 min by train · estimate" 13.5/600.
- "Add a stop" margin-top 10 h52 r20 1.5 px dashed `#c4c6ce` + icon, 15/600 `#3d404c`.
- Pon glass note top 540. Footer bottom 28: ink "Save the route"; text "Just one stop".
- Taps: a stop → its nights and dates, drag to reorder; travel day → how to get between, a booked train replaces it; Add a stop → city search (different time zone says no in a sentence); Save → budget and the draft follow; Just one stop → removes Nara, keeps the nights in Kyoto.
- Motion: drag reorder with lift (scale 1.03, shadow deepen, Snappy) and settle (Smooth); the connector redraws between new neighbours.

### 4.20 Pon is drafting (full screen)
- Background rays: 700 disc at (−155, −60), `repeating-conic-gradient(rgba(255,154,77,.18) 0 9deg, transparent 9deg 18deg)` masked `radial-gradient(circle,#000 14%,transparent 56%)`, spin 30 s linear.
- Tanuki 160 at (115, 150) floating (3600 ms: ty 0→−9, rotate −2°→2°); thinking bubble sticker 52 sun at (226, 142) rot 8°.
- Title top 318 centred "Pon is drafting your 8 days" 30/700 −0.03em; sub 14 muted "About 20 seconds. You review it before anyone else sees it."
- Task card top 458 left/right 20 r24 padding 6 16: rows padding 9, gap 12, separators; disc 22: done mint `#54d6a4` + check, running white with `inset 0 0 0 2.5px #ff9a4d` and label 14/700, queued `inset 0 0 0 2px #d0d1d8` row opacity .45; label 14/500.
- Day-sticker marquee bottom 60 h52: stickers padding 8 12 r10, 2.5 px white border, rotate ±3°, shadow `0 3px 8px rgba(20,22,40,.14)`, 12.5/800 `#17142a`, colours cycling sun/tangerine/mint/sky/pink; marquee 18 s linear 0→−50%.
- Taps: Close → safe to leave, a push lands when ready (→4.21 content); Pon → what it's weighing now. No close control drawn: see §8.
- Streaming: steps tick in the real job order (`features/plan/draft/drafting/step-copy.ts`); the marquee shows days as they are sketched.
- Reduce Motion: rays and marquee stop, tanuki still, steps cross-fade.

### 4.21 Drafting, slow (past 45 s)
- Background `radial-gradient(100% 60% at 50% 30%, #ffe6d3, #f5f5f7 70%)`.
- Header top 58: glass ✕; "Kyoto draft" 17/600.
- Dashed ring 200 (2 px `rgba(168,80,26,.3)`) spinning (9 s linear) behind tanuki 120 (think).
- Title top 350 "Taking a bit longer than usual" 26/700 lh 1.12; sub 15 lh 1.42.
- Task card top 470 r24 padding 14 16 gap 11: done disc 20 `#34c77b` (4.20 uses mint: unify); running ring 2.5 px sun with 8 sun dot, label 600, elapsed "1:12" 12 muted right; queued ring 1.5 px `#c4c6ce`, text `#9a9daa`.
- Footer bottom 30: ink with bell "Ping me when it's ready"; text button `#b0306b` "Cancel the draft" (destructive text OFF versus `#d6337f`).
- Ways out: Ping me and leave · Keep watching · Cancel draft (cancel asks first: Alert, destructive in pink).

### 4.22 Pon's draft (all must-dos made it)
- Header top 60: glass ‹; right ink chip h30 r15 12/600 white with lock "Only you see this".
- H1 left 24 top 116 "Pon's draft" 30/700; sub 14 muted "Apr 2–9, $1,310 each. Fix anything before the crew sees it."; tanuki 70 at right 16 top 96.
- Must-dos banner top 198 left/right 20 h36 r14 `#e3f6ec`: 13/600 `#1f7a55` + 5 avatars 22 (border `#e3f6ec`, −6).
- Days card top 246 r24: rows padding 7 14 7 10 gap 12: day tile 30 r10 in the day's colour (empty days `#f1f1f4`), numeral 14/800 `#17142a`; title 14/600; sub 11.5 muted ellipsis; must-do owner avatar 22.
- Footer bottom 30: ink "Build the proposal"; text "Ask Pon to change a day".
- Taps: Back → must-dos (4.40); a day → edit or ask Pon to change it; must-dos banner → which day each landed on; Ask Pon → redraft (4.48, counts toward the free 3); Build → board (4.52).

### 4.23 Draft, one must-do missed
- Header: ‹; centred "Pon's draft" + "Only you see this"; glass ⋯ (earlier drafts).
- Must-dos card top 118 h120 r26 padding 14 16: "Must-dos" 13/600 muted; "4 of 5 made it" 30/800 −0.03em; donut 64 (`conic-gradient(#34c77b 0 80%, #ffe4f0 80% 100%)`, inner 48 white, "80%" 15/800); avatars 26 + "all in · Ray's didn't fit" 12.5 muted.
- Didn't-fit card top 256 h178 r26 `#fff6f9` + `inset 0 0 0 1.5px rgba(224,70,142,.25)` padding 16: avatar 36; "DIDN'T FIT" 12/700 +0.06em `#b0306b`; title 17/700; body 13.5 `#3d404c` lh 1.4; buttons h42 r21 13.5/600 gap 8: ink "Ask Ray to swap", white hairline "Join the waitlist".
- "7 days · $1,180 each · under everyone's max" 13/600 muted at y456.
- Day rows card top 480 r24: min-height 62, day tile 40 r12 `#f1f1f4` ("DAY" 9/700 muted over 15/800 numeral); title 15.5/600; sub 12.5 muted; chevron.
- Footer bottom 30 gap 10: "Redraft" control pill w120 h52 r26 16/600 (h52 OFF versus 56); ink "Send to the crew" flex h56.
- Ways out: Ask Ray to swap · Waitlist · Redraft · Earlier drafts (⋯) · Send.

### 4.24 Redraft, kept the original
- Header: ‹; "Change Day 3" + "Arashiyama".
- Request bubble right-aligned top 120: ink `#1c1d24` r20 (bottom-right 6), padding 9 14, 15 lh 1.38 white, max-width 258.
- Result card top 200 r26 padding 16 (drawn h290 with empty space: use content height): tanuki 40 in `#ffe6d3`; "NO BETTER VERSION" 12/700 +0.06em `#a8501a`; "Day 3 stays as it is" 18/700; body 14 `#3d404c` lh 1.42; compare grid 2 columns gap 8: KEPT `#e3f6ec` r18 padding 10 12 (11/700 `#1f7a55` label, 14/600 title, 12 `#1f7a55` meta); TRIED `#f1f1f4` opacity .75 (title struck through, decoration `#b0306b`).
- "Other ways to get the tea ceremony" 13/600 muted at y510; list card top 534: rows min-height 62, icon tile 40 r12 (`#e6eeff` calendar, `#fff6c9` bolt), 15.5/600 + 12.5 muted, chevron.
- Footer bottom 30: ink "Keep Day 3 as it is".
- Ways out: Keep original · Move it to Day 5 · Redraft once more (1 left) · Back.
- Keyboard: the request was typed in the change-day sheet (current `change-day-view.tsx` "Anything else?"); not drawn here.
- Motion: bubble lands first, the thinking beat (current `redraft-thinking.tsx`), then the card rises (Smooth) and KEPT/TRIED fill in left→right.

### 4.25 The plan, peek
- **Map** full screen (`bali-map.html?v=trip`); top fade 0→170 `linear-gradient(180deg, rgba(245,245,247,.92) 40%, rgba(245,245,247,0))`. The design file's fitBounds padding is swapped, so the shot shows Bali tiny; intended framing: trip bounds fitted between y≈150 (under the chips) and the sheet top 548.
- Map content: other days' stops as 12 dots in their day colour, 2 px white border, 50% opacity; Day 3 stops numbered pins 24 sky with white numerals and 2.5 px white border; Day 3 route sky 4.5 over white casing 8; saved photo pins 34 r11 (2.5 px white border) with the saver's 14 avatar badge; idea ticks 10 white with 3 px `#a9d08c` ring; stay flag ink pill (yellow 16 r5 square + "Villa" 11/600 white, padding 6 10 6 7, r14).
- Top chrome z5, top 56 left/right 16 gap 8: search pill flex h48 r24 glass (as nav button) padding 0 6 0 16: magnifier, "Search Bali, or ask Tokek" 15 `#3d404c`, gecko 34 in a 36 `#fff3c4` circle; glass ≡ button 44.
- Filter chips top 114 left 16, gap 6, h34 r17 padding 0 13 13/600: active day chip ink with 8 sky dot "Day 3 · Wed"; others glass ("Saved 9", "Crew picks", "Food"). Horizontal scroll, bleeding right.
- **Peek sheet** top 548 (visible 296; current PEEK 300/844 ✓): day chips row margin-top 12, chips 52×54 r16 white (shadow `0 0 0 .5px rgba(20,22,40,.06), 0 4px 10px -6px rgba(20,22,40,.2)`), weekday 10.5/700 opacity .7, date 17/800 −0.02em, underline 18×3 r2 day colour at bottom 5; selected ink fill white text. Day head margin-top 14: "WED 14 OCT · DAY 3 OF 8" 12/700 +0.06em `#2f5fc4` (day-colour text); "Slow Ubud" 26/800 −0.035em; crew stack 24 (border `#f8f8fa`) right; "5 stops · 2 h 40 in the car · everyone" 13 muted; Tokek yellow note margin-top 12 with "Check".
- Taps: search → Find (4.30) scoped to the map in view; ≡ → places list (4.34); filter chip → fades everything else to 20%; stop number → its card in the sheet (the only label on the map); saved photo pin → place picked (4.35); day chip → redraws that day's route tracing out from the villa; drag sheet up → 4.26 then 4.27; Check → plan check (4.43).
- No back control drawn: see §8.

### 4.26 The plan, one day at half (drag in place)
- Map `?v=tripday` occupies 0–420 (camera fits the day's route into 0→300); top fade 0→130.
- Top chrome: search pill "Find anything, or ask Tokek"; right glass button shows the Ideas count "9" (13/800). Filter chips hidden at half.
- **Half sheet** top 300 (visible 544; current HALF 452/844 → change to 544/844). Day chips 46×48 r16 margin-top 10. Head margin-top 10: "WED 14 · DAY 3" 12/700 `#2f5fc4`; "Slow Ubud" 22/800 −0.03em (Title is 22/700: weight OFF); right chip h28 r14 `#e6eeff`/`#2f5fc4` 13/700 "Rain at 1 · fix".
- **Timeline** margin-top 8: row = time column 44 right-aligned 13/700 tabular (padding-top 12) + stop card flex r18 white SH_CARD padding 10 12 gap 10: number disc 24 day colour, numeral 11/800 `#17142a`, 2 px white ring; title 15/600 ellipsis; meta 12 muted; Booked tag with lock (booked tint). Leg connector h26 padding-left 68: line 2×26 `#dcdde3` + "Walk · 6 min" 11.5/600 muted.
- **Drag state**: drop slot = time label in `#2f5fc4` + dashed 2 px `#4f86ff` r18 h56 with `rgba(79,134,255,.06)` fill; the lifted card floats over it, offset right 6, `rotate(-1.5deg) scale(1.03)`, shadow `0 20px 34px -10px rgba(20,22,40,.38)`, its meta live-updating ("Maya + Rin · moving to 13:00"). Map shows a "Karsa Spa · 14:00" label chip on the moving stop.
- **Add bar** fixed bottom 28 left/right 16 z30: white h54 r27 shadow `0 0 0 .5px rgba(20,22,40,.06), 0 14px 30px -12px rgba(20,22,40,.3)` padding 0 6 0 8: ink + circle 40; "Add to Wed, or paste a link" 15 muted; gecko 38 in 40 `#fff3c4`.
- Taps: hold a stop and drag → lifts; the slot says if it fits; the map redraws live; booked stops don't move (refusal shake + reason); drop → done with Undo (members: Suggest); day chip → swaps day; drop a stop on a chip → moves it there; Rain at 1 · fix → fix opens in place; a stop → 4.29; add bar → Find scoped to Wednesday (4.30); 9 → Ideas tray; drag up → 4.27; drag down → 4.25.
- Keyboard: tapping the add bar opens Find (4.30, other lane) with its field focused; the bar itself never takes text here.
- Dark (Foundations 1.11): map night palette; lifted stop's shadow deepens instead of growing; day colours unchanged.
- Logic: reorder logic exists in `features/plan/day-plan/use-reorder.ts` (day plan screen); it moves into `features/plan/trip-map/day-sheet.tsx`.

### 4.27 The plan, whole trip (full)
- Island map strip `?v=island` at y50 h200; sheet top 196, so 146 pt of island shows (all days' stops as 12 dots in day colours, villa ink dot). No search pill or chips.
- Full sheet: "The Bali Six · Oct 12–19 · in 17 days" 12/700 muted; "The whole trip" 26/800 −0.035em; right "Share" small pill (control, icon). Tokek yellow note margin-top 10: bold lead "3 to fix, 2 to know." + "See".
- Days card margin-top 10 r22: rows h47 padding 0 12 gap 10: day bar 6×28 r3 day colour; date 12/700 muted w52; title 14.5/600 ellipsis; tags (Booked mint tint; "Too far" `#ffe9d6`/`#a8501a` OFF-TOKEN; Rain sky tint; Clash pink tint; "Day trip" maybe tint; "2 ideas fit" control/`#3d404c`; Vote pink tint); pace bars 5×(7×12 r2) gap 2 filled in day colour, rest `#e3e4e9`.
- Footer row padding 12 4 0: "9 saved places aren't in a day yet" 13 muted + "Ideas ›" 13 bold.
- Taps: a day row → that day at half (4.26); a chip → that problem in the plan check (4.43); See → 4.43; Share → link, PDF, calendar, driver; Ideas → 4.40; the island → drag down to peek (4.25).
- The design shows no "Move stops/All days" entry on this sheet (current trip-sheet has MOVE STOPS). All days (4.28) is reached from the day sheet or long-press; see §8.

### 4.28 All days (drag a stop onto another day)
- Header top 56: glass ‹; "All days" 17/600; glass share.
- Grid top 116 left/right 16, 2 columns gap 10: cards h150 r20 white SH_CARD padding 10 12: header row date 11.5/800 in the day's dark text colour (sun `#8a6a0c`, pink `#b0306b`, sky `#2f5fc4`, mint `#1f7a55`, tangerine `#a8501a`) + pace bars; mini map h64 r12 margin 6 −2 (`#eef0f3` while loading) showing that day's route (thin: 3 over casing 5) and numbered 18 pins in the day colour with white numerals, stay as ink 12 r4 square; title 14/700 ellipsis; meta 11.5 muted ("4 stops, Monkey Forest lifted"; "1 stops" is a plural bug).
- Lifted stop chip (dragged): white r16 padding 6 10 6 6, number disc 24 sky white numeral, 13/700 name, rotate −6°, shadow `0 18px 34px -8px rgba(20,22,40,.45)`.
- Target card glow: `0 0 0 3px #34c77b` (fits), orange (tight), grey (no); its meta becomes "Drop: +1 stop, 20 min in the car".
- Toast bottom 28 left/right 16: ink h54 r27 padding 0 18, `0 14px 30px rgba(28,29,36,.3)`, green dot 10, 13.5 white "Fits Sat at 10:00. Wed drives 25 min less.", "Preview" bold.
- Taps: a day card → 4.26; hold a stop dot, drag → cards glow green/orange/grey as it passes; drop → before/after preview of both days, then Move (members Suggest); Preview → same preview without dropping; long-press a card → its stops with "Move to day…" (no drag needed); Share → share the plan.
- Logic exists: `use-cross-day-drag.ts`, `move-preview.tsx`, `day-card.tsx`. `getting-there-section.tsx` on this screen today is not in the design (it moves to setup 4.18).

### 4.29 Stop menu (long-press any stop)
- Backdrop over the day page: `rgba(20,22,40,.25)` + blur 10 (title "Slow Ubud" 28/700 behind).
- Lifted preview card left/right 20 top 170 h124 r20 white, shadow `0 20px 50px rgba(20,22,40,.3)`, scale 1.03, padding 14 16 gap 12: day-colour bar 4 r2; title 17/600; "07:00–11:00 · driver Made" 13 muted; tags margin-top 12 (Booked mint 11.5/600; "1h 10m drive" control); car sticker 50 rot 8°.
- Menu left 20 top 310 w250 r20 glass `rgba(255,255,255,.64)` blur 24 sat 1.8, shadow `0 20px 50px rgba(20,22,40,.25)`: rows padding 12 16, 16/400 label left, doodle icon 22 right; separators .5 px `rgba(28,29,36,.1)`; a 6 px `rgba(28,29,36,.06)` gap before the destructive row; "Remove from plan" `#b0306b` (OFF versus `#d6337f`).
- Rows → destinations: Move to another day → day picker with fit dots, then the add sheet (4.39); Change time → time field, the day reschedules around it; Swap the driver → driver compare (6.23); Ask Tokek about it → guide chat with the stop attached; Share → system share; Remove from plan → removed, toast with Undo, back to Ideas.
- Detents: none. This is a context menu, not a detented sheet. Nothing of the map stays visible (the day page sits behind the blur). The current `item-detail-sheet.tsx` (full stop details: who's going, cost, notes, comments) has no design in this range.
- Motion: native UIContextMenu choreography (preview lifts and scales, menu grows from the preview's edge, backdrop blurs in); dismiss reverses. Haptic: medium on open.

## 4. Components

### 4a. Foundations components used
Ink pill CTA, text button, secondary (control) button, small pills (Set/Star/Nudge/Share), icon buttons (drawn 44), segmented control (3 variants), toggle, checkbox/status disc, slider (two variants), chips (filter, selectable), tags/status tints, stickers and stamps (4.06), critters, crew stack, progress bar (4.09 segments), "2 of 4" progress pill (4.16/4.17), guide note tinted by speaker, cards and rows on ground, centred title + subtitle header, sheet with grabber, full screen with ✕ (4.21), composer-like add bar (4.26), toast (4.28).

### 4b. New components (metrics in §3; reuse noted)

| Component | Spec | States / variants | Reused by |
|---|---|---|---|
| `GuideNoteGlass` | §3.0 guide glass note | speaker Tokek / Pon / any city guide (tint from the guide), with or without trailing action | 3, 5, 6 (every guide line on a page) |
| `TokekInlineNote` | §3.0 yellow note | with action word (Check, See, Ask), bold lead | 4.30–4.57 (plan check, Ideas), 6 |
| `SetupChecklist` + `ChecklistRow` | 4.08 card; row disc 26, title/sub, trailing slot (tag / small pill / avatars / chevron) | done, open (grey ring), your-turn (ink ring), disabled (.5), locked | 4.09, 4.40 solo setup, 3 (trip hub to-dos) |
| `ChecklistPill` | 4.10 h62 r20 "SETUP CHECKLIST · n OF 7" | per step | every setup step page |
| `DraftDayStrip` | 8 tiles h34 r9 gap 4, numeral 9.5/800 bottom | sketched (day colour), pending (grey), today ring (undrawn) | 4.09, trip hub 6 |
| `HeatCalendar` | 4.10 grid cells h44 r12 + fraction | heat 1–6, selected range, past/out-of-month | 4.14 bars, 4.13 mini |
| `BrushCalendar` | 4.12 runs that join | free / busy / maybe, painting, finger halo | free-days by hand only |
| `CrewSeesWeek` | 4.11 7 tiles h40 r10 | free / busy / maybe (dashed) | settings privacy (9) |
| `CalendarSourceRow` | 4.11 glyph 38 r11 + status + action pill | synced, not connected, error, denied | 9 (settings) |
| `WeekOptionCard` | 4.14 r24, 8 bars h26 r7 | selected (2 px ink ring), guide's pick, ask states | – |
| `SweetSpotSlider` | 4.15 rail 6, anonymous dots 14, ink knob 24 | dragging, warning past band | 7 (wallet budget) |
| `PrivateAmountSlider` | 4.17 white knob 28 | – | 7 |
| `OptionCardTrio` | 4.17 h104 r22, check badge 20 | selected / not | 4.39 add sheet options, 7 |
| `PersonStatusTile` | 4.16 h112 r24 | done (Max in), pending (Not yet) | 4.38 crew stances, 3 RSVP |
| `PersonWayRow` | 4.18 avatar 34, way, warning, price/Booked | yours (editable), others (read-only, Nudge) | 6 (arrivals) |
| `RouteStopCard` + `TravelDayConnector` | 4.19 | draggable, add-a-stop dashed slot | 6 (multi-city hub) |
| `ShowdownCard` + `VsDisc` | 4.05 | leading, trailing, your pick (undrawn) | 3 (Home board final) |
| `WinnerStamp` | 4.06 disc 250, ring 214, rotated −9° | crew name, score; Reduce Motion | 8 (stamps), 3 |
| `TallyRow` | 4.06 bar h10 r5 + avatars + count | winner / loser | 5.A poll results (`ui/vote/ResultTally.tsx` exists) |
| `SoloPassTicket` | 4.07 h118 r22, stub 86, perforation | dates open / set | 2 (pass), 3 |
| `DraftingStage` | 4.20 rays + float + task list + marquee | running, slow (4.21 ring), failed, offline | 4.48 redraft thinking |
| `TaskStepList` | 4.20 disc 22 / 4.21 disc 20 | done, running (+timer), queued, failed | link import (4.32), 6 |
| `DayStickerMarquee` | 4.20 | – | 4.32 (places ticking in) |
| `CoverageDonut` | 4.23 64 conic, inner 48 | percent | 4.43 plan check |
| `MissCard` | 4.23 pink-tint card with two actions | – | 4.43 issues |
| `KeptTriedCompare` | 4.24 two tinted cells | – | 4.48 redraft diff |
| `MapTopBar` | search pill h48 + 44 glass button; chips row h34 | peek (chips, ≡), half (count), full (hidden) | **4.30–4.39** |
| `PlanMapSheet` | map sheet material, detents peek 296 / half 544 / full top 196 | peek, half, full | **4.30–4.57**, 6 (trip hub map) |
| `DayChip` | 52×54 (peek) / 46×48 (half) r16, underline 18×3 | selected ink, today, drop target (undrawn) | 4.39, 6 |
| `TimelineStopRow` + `LegConnector` + `DropSlot` | 4.26 | idle, lifted, booked (refuses), drop slot | 6 (today view), 4.43 fixes |
| `AddBar` | 4.26 h54 r27 | – | **4.30**, 6 |
| `DayRowCompact` | 4.27 h47 with bar, tags, pace bars | – | 6 (whole trip) |
| `PaceBars` | 5×(7×12 r2) gap 2 | 0–5 | 4.28, 4.39 |
| `DayCardMini` | 4.28 h150, mini map 64 | glow fit / tight / no, lifted | 4.39 day picker with fit dots |
| `InkToast` | 4.28 h54 r27 + status dot + action | fit / undo / error | everywhere (Undo toasts 4.29) |
| `StopContextMenu` | 4.29 preview + glass menu w250 | organiser / member (Suggest), booked | 6 (stop on the day) |

Components 4.30–4.57 will likely share: `PlanMapSheet`, `MapTopBar`, `DayChip`, `TimelineStopRow`/`LegConnector`/`DropSlot`, `AddBar`, `TokekInlineNote`, `GuideNoteGlass`, `PaceBars`, `DayCardMini`, `InkToast`, `StopContextMenu`, `TaskStepList`/`DayStickerMarquee` (link import 4.32), `PersonStatusTile` (4.38), `CoverageDonut`/`MissCard` (4.43), `KeptTriedCompare` (4.48), the docked search field from 4.02 (4.30 Find), crew stack and status tags, the swipe card from Foundations 1.09 (4.42), and the map pins/route styles in §5.

## 5. Motion and transition inventory

Filmstrip rendering failed (`film.mjs` waits for `networkidle`, which the part file never reaches because of its map iframes; 2 attempts, 120 s timeouts). Evidence is the HTML keyframes and `doodles.js` presets (lines 343–346: `bob 2400`, `float 4200`, `ping 1800`, `spin 9000`, `marquee 16000`, `hop 2600`, `blink 1200`); map renders in `$SP/lane4a/maps/strip-maps.png` (light trip, night trip, day).

| Trigger | What moves | Properties | Spring / easing | Native or custom |
|---|---|---|---|---|
| Chat "+" → New poll (4.01) | "+" morphs into the sheet, chat steps back | frame, radius, scale .94 of page | Smooth | custom Reanimated (1.06) |
| Typing in 4.02 | result rows | opacity, y, reorder | Snappy | custom; field rides the keyboard with the system curve |
| Guest guide notes (4.03) | each note line | opacity 0→1, y 4→0; tail blink 1200 ms | Smooth | custom |
| Cast vote (4.05) | button press, bar fill, avatar into stack | scale .97, width, x/y | Snappy (press), Smooth (bar, avatar) | custom; medium haptic |
| Poll closes → 4.06 | stamp drop, squash, ink; tally rises; stickers pop | scale 1.4→1, rotate, squash y .9, ink opacity; y | Lively (stamp, stickers), Smooth (tally) | custom (1.07); heavy haptic on land |
| Tanuki on 4.06 | hop loop | ty 0→−14, sy .9/1.05/.94 | `hop` 2600 ms | custom loop |
| Solo sheet (4.07) | sheet up; ticket settles | y; rotate −4°→−1.5° | Smooth; Lively | native sheet (`formSheet` with detent) + custom ticket |
| Checklist row done (4.08/4.09) | disc fill + check; face joins stack | scale .6→1, opacity | Lively; Snappy | custom |
| Day sketched (4.08) | tile grey→colour | background, scale 1.08→1 | Lively, stagger 60 ms | custom |
| Range select (4.10) / paint (4.12) | cells; run radius | background, scale .92→1, radius | Snappy; selection haptic per day | custom gesture (`react-native-gesture-handler`) |
| Calendar connected (4.13) | confetti once; ping ring; check badge | particles; scale .6→1.5 opacity .8→0 (1800 ms); scale | Lively (badge) | custom; confetti also exists in `features/vote/final` |
| Week option select (4.14) | 2 px ink ring moves | ring | Snappy | custom |
| Sweet-spot knob (4.15) / private max (4.17) | knob; amount roll; bar segments | x; digits; flex | Snappy + tick haptic | exists (`sweet-spot-card.tsx`) |
| Option card / chip (4.17) | ring + badge; chip fill | border, scale | Snappy | custom |
| Max arrives (4.16) | tile pending→done | opacity .45→1, background | Lively | custom |
| Stop reorder (4.19) | card lift, settle, connector redraw | scale 1.03, shadow, y | Snappy lift, Smooth settle | custom |
| Drafting (4.20) | rays spin; tanuki float; marquee; step ticks | rotate 360 / 30 s linear; ty −9 rotate ±2° / 3600 ms; tx 0→−50% / 18 s linear; disc pop | linear loops; Lively ticks | exists (`drafting-view.tsx`, `day-marquee.tsx`); rays replace rings |
| Slow (4.21) | dashed ring spin | rotate / 9 s | linear | exists |
| Draft done → 4.22 | stage folds away, draft rows deal in | opacity, y | Smooth, stagger | exists (`onDone`) |
| Redraft result (4.24) | bubble, thinking beat, card rise | y, opacity | Smooth | exists (`redraft-thinking.tsx`) |
| Sheet peek↔half↔full (4.25–4.27) | sheet height; top chrome hand-off; camera | y; opacity of chips/search; camera padding | Smooth (no overshoot), fling to next detent | custom (`ui/sheet/map-sheet.tsx`, `use-map-sheet.ts`); camera via MapLibre `setCamera` with padding |
| Day chip tap (4.25/4.26) | route traces out from the villa | line-trim 0→1 | ~600 ms ease-out (not a spring) | exists (`ui/map/planning/route-trace.ts`) |
| Filter chip (4.25) | other pins fade | opacity 1→.2 | Snappy | custom |
| Hold stop (4.26) | lift; slot opens; neighbours shift; map redraws | scale 1.03, rotate −1.5°, shadow; height; y | Snappy (lift), Smooth (slot, settle) | custom (`motion/gestures/reorder.ts` exists) |
| Drop (4.26) | settle + Undo toast | y; toast y | Smooth | custom |
| Cross-day drag (4.28) | chip follows finger rotated −6°; card glow; toast | x/y; ring colour; y | Snappy; Smooth | custom (`use-cross-day-drag.ts`) |
| Long-press stop (4.29) | backdrop blur; preview lift; menu grow | blur, scale 1.03, scale from anchor | system | **native** UIContextMenu on iOS; Android needs a custom overlay (or `@expo/ui` ContextMenu, not installed) |
| Push/back between setup pages | page | x | system | native stack (`pushTransition` exists) |

Reduce Motion everywhere: 150 ms cross-fades, loops stop, stamp lands without falling (Foundations).

## 6. Native platform surfaces

- **Push notifications** (iOS + Android): draft ready (4.21 "Ping me when it's ready"; current push links `/trip/{id}/draft` via `app/(trip)/trip/[tripId]/draft.tsx`), setup nudges (4.08 Nudge, 4.16 Nudge Ray and Dev; `send_nudge` exists), private date ask (4.14 Ask Dev; N-05 with `cp.setup_ask` actions freed / not movable, N-46 answer), Tokek's private "ask Alex about the ferry" (4.18, new). Visual redesign of notification content belongs to the platform lane (`targets/notification-content`, `modules/cp-notifications`); this part adds one category (way-there ask) if §7 gap 3 is built.
- **Calendar access + OAuth** (4.11): device calendar through `modules/cp-calendar` (busy days only); Google/Outlook sign-in via the system auth session returning to `critterpass://setup/calendar/connected` (exists). Permission-denied state stays as today.
- **System share sheet**: 4.08 (trip invite link), 4.27 Share (link, PDF, calendar, driver: a custom chooser before the system sheet; calendar writer exists in `features/plan/views/data/calendar-export.ts`), 4.28 share, 4.29 Share.
- **Context menu** (4.29): iOS UIContextMenu would give the exact native lift/blur; there is no context-menu library in `apps/mobile/package.json` today. Decision needed (see §8).
- **Keyboard** (4.02): system keyboard with `returnKeyType="search"`; field docked above it (iOS 26 bottom-search pattern).
- **Haptics**: `modules/cp-haptics` (vote cast, stamp land, day paint ticks, knob ticks, lift/drop).
- No widgets, Live Activities or lock screen surfaces in this range.

## 7. Logic and backend gaps (real gaps only)

1. **Any-order setup checklist.** The domain is a sequential wizard: `TRIP_SETUP_STEPS = ['when','budget','rooms','must_dos','done']` (`packages/domain/src/enums/trip.ts:31`), `set_setup_step` only moves forward past a done step (`docs/api-contracts.md` §4.5, `STATE_INVALID{step_not_done}`), and must-dos open only after `lock_rooms`. The design needs per-row status synced to every member (dates locked; free days n/m; budget maxes n/m; must-dos n/m; getting there n/m; route set; rooms after a stay is booked) with Dates gating the rest, and the member's own part (4.09). App: `features/setup/shell/steps.ts`, `stepper.tsx`, `setup-shell.tsx`.
2. **Draft as you go.** "5 of 8 days sketched", the day strip, "Fri to Mon wait on…" and "Tokek redrafts as the rest come in" need a draft that updates on setup changes and reports sketched days plus what each pending day waits on. Today `start_draft` is an organiser-triggered one-off job (`docs/api-contracts.md` row `start_draft`; `ai.draft` in `docs/api-contracts-async.md:86`). Also needed: "Peek", the draft so far read-only on the plan map for every member.
3. **Getting there per member.** Each member's chosen way (flight/bus/train/car/boat) with an estimate from their `home_airport`, a booking replacing the estimate, the derived "Day 1 starts at" (the last arrival), a late-joiner line, and Tokek's private ask to switch. Today: `GET /v1/destinations/{id}/getting-there?from` (one origin) and `users.home_airport` exist; there is no per-member way-there row and no crew start time.
4. **Sleep preference.** 4.17 adds share / own room (+$35 a night) / don't mind and a "Ground floor" chip; `ROOM_CHIPS` (`packages/domain/src/setup/rooms.ts:10`) has early_bird, night_owl, light_sleeper, snorer, dont_care only, and there is no per-night own-room price.
5. **Route in setup (4.19).** `set_trip_stops` exists on the server (`services/api/src/planning/areas/set-trip-stops.ts`, behind `trip.areas`, off). No mobile UI calls it. App-only gap plus a flag decision.
6. **Missed must-do actions (4.23).** "Ask Ray to swap" (ask the owner to pick another must-do) and "Join the waitlist" (ticket waitlist) have no command; waitlists exist only for proposal seats (`docs/api-contracts-proposal.md`).

## 8. Open questions

**Contradictions inside the design**
1. Setup numbering: 4.10/4.15 say "SETUP CHECKLIST · n OF 7", 4.14 says "Step 1 · When", 4.16 says "Step 2 of 4", 4.17 says "2 of 4" (legacy wizard wording, or the member's 4-item part?).
2. Budget privacy: 4.15 says nobody sees anyone's max "including Pon"; 4.09 says "Only Tokek sees it" and 4.17 says "Just for Pon… Pon plans around them". The current product rule (`private-max-view.tsx`) is that not even the guide sees it.
3. The draft has two headers and two CTAs: 4.22 (large left title, ink "Only you see this" chip, **Build the proposal**) versus 4.23 (inline centred title, ⋯, **Send to the crew** + Redraft h52). Which is canonical?
4. Day colours are assigned differently: 4.08 strip (12 sun, 13 pink, 14 sky, 15 mint, 16 tangerine), 4.22 tiles (1 sun, 2 tangerine, 3 mint, 4 sky, 5 grey, 6 pink…), map routes (`DAYCOL` sun-dark `#e0a800`, pink, sky, mint-dark `#2fb886`, tangerine). Foundations says day colours never change: one assignment rule is needed, plus approval of the darker map variants.
5. Stop numerals: white on the map pins, `#17142a` on the sheet discs (same sky fill).
6. Done/running colours differ: 4.20 done mint `#54d6a4`, running tangerine ring; 4.21 done `#34c77b`, running sun ring.
7. 4.29 is labelled "long-press any stop" while 4.26 says "hold a stop, drag". Proposed resolution: long-press opens the menu and moving past a small threshold dismisses it and starts the drag (the iOS drag + context menu pattern). Also, 4.26's tap list sends a plain tap on a stop to 4.29: is a tap the menu too, or the stop's details (current `item-detail-sheet.tsx`, undesigned here)?
8. 4.13 "Other ways this can land" (Connecting / Not allowed / Didn't work) reads like a legend of states, but its tap list makes it interactive (mark by hand or disconnect). Ship it as UI, or render those states instead?

**Foundations rule breaks**
9. No way out is drawn on 4.06 (celebrate), 4.13 (celebrate) or 4.20 (whose tap list has "Close"). Foundations full screen = ✕ top-left on glass.
10. 4.25/4.26 have no back control. How does someone leave the plan map (edge swipe only, the trip hub, or a ‹ like the current `trip-map-top.tsx`)?
11. 4.01 uses an ✕ icon instead of "Cancel"; 4.11/4.12 sheets have no Cancel/verb header (bottom CTA only).
12. 4.03 has two right actions (share + heart); Push allows one. Over-photo buttons on 4.03/4.04 use white Regular-style glass, not Clear glass.
13. Materials: glass buttons `.62/blur 18/sat 1.8` and 44 drawn size versus Regular glass `.56/24/1.9` and 40 pt; modal sheets `.88` (4.07 `.84`) versus `.86`; the map sheet is its own material (r34, `.92`, blur 30).
14. Type off the scale: 26/700 (sheet titles), 28/700 and 30/700–800 (step h1s), 40/800, 52/800, 54/800, 60/800, 19/600 (pitch line), 17/600 (nav title; Headline is 16/600), 22/800 day title (Title is 22/700), Borel at 12/12.5/13 (Guide is 15), Mono at 9.5. A "Title L 28–30" token looks needed.
15. Off-token colours to approve or map: `#3d404c` (secondary ink), `#9a9daa` in light (tertiary), `#17142a` (sticker ink), `#34c77b` (success green on toggles/checks), `#2f5fc4` (link blue), `#b0306b` used as destructive text (Foundations `#d6337f`), `#fff6c9` (light Tokek tint), Pon tints `#ffe6d3`/`#ffe9d6`/`#fff1e6` and text `#a8501a`/`#8a4a12`/`#5a2c08`/`#3d2410`, "Too far" `#ffe9d6`/`#a8501a`, `#fff6f9` miss card, heat mints `#93e2c4`/`#c6eedc`/`#e2f4ea`/`#eef1ef`/`#f3f3f5`, stamp `#e07a2a`/`#c45f16`, neutrals `#dcdde3`/`#e3e4e9`/`#c4c6ce`/`#d0d1d8`/`#b9bbc4`/`#eeeef2`.
16. Segmented heights vary: Foundations U5 h40 r20; 4.01 h36 r18; 4.12 h42 r21.

**Ambiguous behaviour**
17. 4.05: which button is the ink one, the user's current pick or the leader? No "you voted" state is drawn.
18. 4.06 member variant (not the organiser): no exit drawn (current shows "Back home").
19. 4.17: slider only, or does a tap on the amount give a keypad (current is keypad-only)?
20. 4.18's "Next · budget" implies an order inside an any-order checklist. Should it be "next missing row"?
21. 4.27 drops the current MOVE STOPS / All days entry. Where does All days (4.28) open from?
22. 4.25 framing: the design file's map is mis-fitted (padding swapped in `bali-map.html` `S.trip.pad`). Confirm the intended camera: trip bounds between the chips and the peek sheet.

**Founder decisions**
23. Context menu implementation: native iOS UIContextMenu (needs a library: `@expo/ui` ContextMenu or similar; Android gets its own look) versus one custom Reanimated overlay drawn to 4.29 on both platforms.
24. The map style: replace the single purple "Critterpass dark" style with the light cream/blue style + night variant from `bali-map.html` (light: sea `#cfe3f1`, land `#f4f1e8`, coast `#e6e1d3`, green `#e4ecd6`, major roads `#e8d9a8` casing / `#fff6d8` fill, local `#e4dfd0`/`#fff`, labels 600 11 `#6e6a5c` with `#f4f1e8` halo, bold 700 12.5 `#4d4a40`, peaks `#b8b09a`; night: sea `#121b26`, land `#1d2026`, coast `#2b2f37`, green `#1c2620`, roads `#3b3f48`/`#4c505a`, local `#2a2d34`/`#353840`, labels `#9a9daa`/`#c3c5cf`, route casing `#0e0f13`). Routes: width 8 casing + 4.5 colour (thin 5 + 3), white casing in light; walk dashed `1 8`; boat a curved arc, `#2f6fe0` dashed `1 9` over white. Pins: numbered circles 26/24/18 with a 2.5 px white border and `0 3px 8px rgba(20,22,40,.25)` shadow; stay = ink flag with a yellow square. Is that the direction for every map in the app?
25. Rooms row in the checklist waits on a booked stay ("Once the villa is booked"): does the room step stay in setup or move to after booking (it is the third wizard step today)?

```
Status: DONE_WITH_CONCERNS
Summary: Wrote the build spec for 4.01–4.29: screen table mapped to current routes, per-screen px specs, 33 new components, a motion inventory, native surfaces, 6 real logic gaps and 25 open questions.
Concerns/Blockers: Filmstrips could not render (the part file never reaches networkidle), so motion evidence comes from HTML keyframes and doodles.js presets. The Days/Map/Calendar segmented control the brief names does not exist in 4.01–4.29. The biggest gaps are the sequential setup domain and progressive drafting, both of which need backend work.
```
