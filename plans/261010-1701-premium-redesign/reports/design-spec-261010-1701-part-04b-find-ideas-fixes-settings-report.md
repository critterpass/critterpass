# Design spec: Part 4b, Decide and Plan, screens 4.30–4.57

Scope: 4.E find and add (4.30–4.39), 4.F Ideas and swiping (4.40–4.42), 4.G Tokek's fixes (4.43–4.48), 4.H day trips (4.49–4.50), 4.I proposal and trip settings (4.51–4.55), 4.J empty and offline (4.56–4.57). Screens 4.01–4.29 belong to the other lane. Shared plan-map pieces (the plan map, the edge-attached plan sheet, day chips, the stop sheet 4.29) are named here but specced there.

Sources: `$Z/CritterPass 04 Decide and Plan.dc.html` lines 435–703 (inline styles), `$SP/txt-04-Decide-and-Plan.txt` lines 734–1570, shots `$SP/shots/04/4.30–4.57.png`, filmstrips `$SP/film/04b/`, current app `$R` at `fc1a78d21` (origin/main, 9 Oct).

## 1. Summary

- **28 screens.** Most of the planning logic is already built. Each design screen maps onto an existing route and feature: search, link import, the places map and carousel, the place page, split, add sheet, Ideas, placing, swipe, the plan check plus its gap, less-driving, rain and balance screens, review changes, day-trip area, the proposal tracker and board, and the empty-trip sheet. The work is mostly a new visual layer over that logic, plus five structural changes:
  1. **One map.** The places layer (4.34/4.35) draws on the plan map, not on a second map. Today it is a separate route (`places/index.tsx`, `PlacesMapScreen`) beside `plan/map.tsx` (`TripMapScreen`).
  2. **Fixes open in place** (4.43). A problem chip expands its fix inside the whole-trip sheet row. Today the plan check is its own screen (`check/index.tsx`).
  3. **Ideas is a sheet over the plan map** (4.40). Today it is a pushed screen.
  4. **New trip settings** (4.53) and **change dates with an impact preview** (4.54). Neither exists. Cancel exists only as a confirm sheet in the trip hub foot; the design makes it a full consequences page with hold-to-cancel (4.55).
  5. **Day trips list** (4.49) becomes its own pushed screen. Today it is a row on Explore.
- **No tab bar on any of these 28 phones.** All are pushes, sheets or full screens over the trip, so neither tab-bar rendering appears.
- **Hardest to build well:**
  1. The Find field transition: a glass pill on the map morphs into the focused white field with Cancel. The keyboard rises, and results switch between list and map layer without a second map (4.30/4.31/4.34).
  2. The place page: a photo hero under glass buttons that collapses into the slim bar (4.36→4.37), plus the "when it fits" hour-bar chart and the shared-element grow from the carousel card.
  3. Swipe together: the drag deck, the MATCH stamp (1.07), and the card flying into the heart count (1.09 variant; filmstrip `film/04b/strip37.png`).
  4. Fix-in-place inside the plan sheet (4.43): a row expands to a pink fix panel. Undo applies to organisers; members get Suggest.
  5. Hold-to-cancel (4.55): a 1.5 s pink fill bar with retract, haptics and a screen-reader fallback (filmstrip `film/04b/strip50-hold.png`).

## 2. Screen table

| code | title | screen type | header left / right | primary action | current route file(s) in `$R/apps/mobile/src/app` | logic |
|---|---|---|---|---|---|---|
| 4.30 | Find | Push-as-overlay search (focused field, iOS search pattern) | – / text "Cancel" | type; Add (copied link) | `(trip)/[tripId]/search/index.tsx` → `features/explore/search/search-screen.tsx`; tiles from `(trip)/[tripId]/explore/index.tsx` (`TripExploreScreen`) | partial (crew-plans tile, live swipers' names) |
| 4.31 | Plain words | same screen, results state | – / Cancel | `+` on a row | same; `plain-section.tsx`, `chip-row.tsx`, `plain-results.tsx` | exists |
| 4.32 | Add from a link | Sheet with grabber, near full (top 86) | grabber only | Save 3 to Ideas | `(trip)/[tripId]/search/link.tsx` (sheet in `sheet-routes.ts`) → `link-screen.tsx` | exists |
| 4.33 | No results | same screen, empty state | – / Cancel | a way out row; Ask | `search/index.tsx` → `no-results.tsx`, `drop-pin-sheet.tsx` | exists |
| 4.34 | The plan · places layer | Root of the trip map (map + edge sheet at peek) | – / glass "9" (Ideas count) | a pin | `(trip)/[tripId]/places/index.tsx` (`PlacesMapScreen`) + `plan/map.tsx` (`TripMapScreen`) | partial (two maps → one) |
| 4.35 | Place picked | same map, carousel state | – / glass list (≡) | a card → 4.36; `+` | `places/index.tsx?placeId=` → `places-carousel.tsx` | exists |
| 4.36 | A place | Push, photo hero | glass ‹ / glass share + glass ♥ | Add to Sat 17 · 08:00 | `explore/place/[placeId].tsx` → `features/explore/place-detail/place-detail-screen.tsx` | exists |
| 4.37 | Further down | same screen, scrolled (collapsed bar) | glass ‹, inline title / glass ♥ | `+` on a nearby card | same; `collapsing-header.tsx`, `know-before.tsx`, `next-nearby.tsx`, `if-you-like.tsx` | exists |
| 4.38 | Crew can't agree | Push, inline centred title | glass ‹ / – | Suggest the first one | `(trip)/[tripId]/split/[placeId].tsx` → `features/explore/split/split-screen.tsx` | exists |
| 4.39 | Add to plan | Sheet (top 176 over map) | – / grey ✕ 32 | Add to Sat 17 · 08:00 | `(trip)/[tripId]/add/[placeId].tsx` → `features/plan/add/add-sheet.tsx` | exists |
| 4.40 | Ideas | Sheet over dimmed plan map (top 150) | – / "On map" pill | Place them for me | `(trip)/[tripId]/ideas/index.tsx` → `features/plan/ideas/ideas-screen.tsx` | exists (presentation push → sheet) |
| 4.41 | Tokek is placing them | Push without header buttons (way out at the foot) | – / – | Keep browsing | `(trip)/[tripId]/ideas/placing/[jobId].tsx` → `placing/placing-screen.tsx` | exists |
| 4.42 | Swipe together | Full screen with ✕ | glass ✕ / glass ♥ 10 | ✓ / swipe right | `(trip)/[tripId]/swipe/[sessionId].tsx` → `SwipeScreen` (`features/explore`) | exists |
| 4.43 | Problem chip, fix in place | Plan sheet at full (whole trip) | – / ink count chip "2 to fix · 2 to know" | Fix it | today `(trip)/[tripId]/check/index.tsx` (`CheckScreen`) + `plan/map.tsx` sheet=trip | partial (in-place panel) |
| 4.44 | Fill a gap | Sheet over map (top 318) | grabber only | Add coffee + market | `(trip)/[tripId]/check/gap.tsx` (sheet) → `GapSheet` | exists |
| 4.45 | Less driving | Push, centred privacy chip | glass ‹ / – | Use this order | `check/less-driving/[dayId].tsx` → `less-driving-screen.tsx` | exists |
| 4.46 | Rain and crowds | Push, centred source chip | glass ‹ / – | Use both swaps | `check/rain/[dayId].tsx` → `rain-crowds/rain-screen.tsx` | exists |
| 4.47 | Balance the crew | Push, centred privacy chip (organisers only) | glass ‹ / – | Add both (inline) | `check/balance.tsx` → `balance/balance-screen.tsx` | exists |
| 4.48 | Tokek's changes | Push, centred privacy chip | glass ‹ / – | Send to crew · one vote | `(trip)/[tripId]/review/[changesetId].tsx` → `ChangesReviewScreen` | exists |
| 4.49 | Day trips from Ubud | Push, inline title | glass ‹ / – | Put on a day | none (a row on Explore: `features/explore/day-trips/day-trips-row.tsx`) | partial (new list route) |
| 4.50 | A day-trip day | Push, centred title + subtitle | glass ‹ / glass share | a stop | `(trip)/[tripId]/day/[day]/index.tsx` (day plan, `stop-timeline.tsx` way-there rows) + `day-trip/[destinationId].tsx` (area) | exists / partial (banner + mini-map layout) |
| 4.51 | Who's in | Push | glass ‹ / mint chip "Rooms held" | Resend / Offer | `(trip)/proposal/[id]/tracker.tsx` → `features/proposal/tracker/tracker-screen.tsx` | exists |
| 4.52 | Slide to board | Full screen (no visible ✕; see Q7) | – / avatars + "5/6" | Slide to board | `(trip)/proposal/[id]/board.tsx` → `features/proposal/board/board-screen.tsx` | exists |
| 4.53 | Trip settings | Push, inline title | glass ‹ / – | rows; Cancel the trip | none | missing (screen); rows link to existing flows |
| 4.54 | Change dates | Modal with glass ✕ (see Q5) | glass ✕ / – | Ask the crew first | none (`lock_trip_dates` exists) | missing (impact preview) |
| 4.55 | Cancel the trip | Push (consequences page) | glass ‹ / – | Hold to cancel Kyoto | `features/trip/hub/trip-menu.tsx` (ConfirmSheet in the hub foot) | partial |
| 4.56 | Nothing saved yet | Trip map, empty sheet (top 420) | glass ‹ / – (centre trip chip) | Let Tokek draft it | `plan/map.tsx` → `features/plan/trip-map/empty-trip-sheet.tsx` | exists |
| 4.57 | Offline search | Find, offline state | – / Cancel | a result | `search/index.tsx` → `offline-banner.tsx`, `offline-results.tsx`, `works-offline-chips.tsx`, `use-queued-plain-question.ts` | exists |

## 3. Per-screen spec

### Shared metrics (referenced by name below)

- **Frame**: 390×844. The header row sits at top 56 (58 on 4.53–4.55, 60 on 4.51). Nav buttons are inset 20 from the sides; cards and fields 16; titles and section labels 24 (26–28 on 4.53/4.54).
- **GlassNavButton**: 44×44 circle (44 pt hit), Regular glass. As drawn: `rgba(255,255,255,.62)`, blur 18, saturate 1.8, inset top 1px white .95, inset .5px white .6, ring .5px `rgba(20,22,40,.07)`, shadow `0 8 20 −6 rgba(20,22,40,.16)`. Glyph 17–18, stroke 2.2–2.4, ink. Build to the Regular glass token (.56, blur 24, saturate 1.9); see Q1.
- **Card**: white, radius 22. Shadow `0 0 0 .5 rgba(20,22,40,.05), 0 1 2 rgba(20,22,40,.04), 0 14 34 −12 rgba(20,22,40,.16)`. Row dividers .5px `rgba(28,29,36,.07)`. Card padding 12–14, or rows at padding 9–12 × 12–14.
- **SectionLabel**: 13/600 muted, 22 px above its card.
- **CTA block**: ink pill 56 high, radius 28, 17/600 −0.01em (Foundations ink pill). Under it, a text button at 15/600 muted, padding 6 0, gap 4–8. The block sits at bottom 28, inset 24 (or 16 inside sheets). Only one ink pill per screen.
- **SmallPill**: 36 high, radius 18, padding 0 14, 13.5/600. Either *dark* (ink fill, white) or *control* (`#f1f1f4`, ink).
- **Tag**: 24 high (20–22 variants), radius 12, padding 0 9, 11.5/700, in Foundations status tints (booked, maybe, vote open, rain, unopened). Extra tint used here: tangerine `#ffe9d6/#a8501a` (OFF-TOKEN, see Q3).
- **TokekNote (inline)**: radius 16, bg `#fff6c9`, padding 8 10 8 6, gap 8. A 28 white circle holds a 28 gecko bottom-aligned. Text 12.5/1.35 `#3d3210`. Optional trailing bold 12.5 action ("Show").
- **TokekDock (glass note)**: left/right 16, bottom 28–30, radius 22, `rgba(255,255,255,.66)` blur 20 saturate 1.8, inset top 1px white, ring .5 hairline, shadow `0 10 24 −14 rgba(20,22,40,.25)`. Avatar is a 36 circle in Tokek tint `#fff3c4` (Pon: `#ffe9d6`). Text 13/1.38 `#3d404c`, bold speaker name in ink. Optional trailing dark SmallPill ("Ask").
- **EdgeSheet** (map sheets): left/right 0, radius 34 top, `rgba(248,248,250,.92)` blur 30 saturate 1.8, inset top 1px white .9, shadow `0 −14 40 −14 rgba(20,22,40,.3)`, padding 8 16 0. Grabber 36×5 radius 3 `rgba(60,60,67,.28)`. This differs from the Foundations sheet (.86, blur 34, radius 46, inset 8; see Q2).
- **OptionCard** (radio): radius 20 white, padding 12 14, gap 12. Selected: 2.5px ink ring, and the radio is a 22 circle drawn as ink with an 11 white ring inside. Unselected: .5 ring plus shadow `0 10 24 −14 rgba(20,22,40,.2)`, radio 2px `#c4c6ce`. Title 15/700, body 12.5/1.35 muted, and a meta tag row (control tags) with margin-top 6, gap 5.
- **CrewFace**: crew colour circle at 20 / 24 / 28 / 30 / 32 px, 2px border in the surface colour, overlap −8, initial in `#17142a` 700 at about 0.4× size. Each person keeps one colour.
- **Ink colours used but not in the vocabulary**: `#3d404c` (secondary ink, 300+ uses, also in Foundations HTML), `#9a9daa` (tertiary / placeholder), `#c4c6ce` (empty ring, dashed border), `#34c77b` (system green for checks and toggles), `#e3e4e9` / `#dcdde3` / `#e9eaee` (bar tracks). Name these as tokens; see Q3.

### 4.30 Find (empty, focused)

- **Header**: the field row sits at top 56, inset 16, gap 10.
  - Field: flex 1, height 48, radius 24, white, with a 2px ink ring as the focus state. Magnifier 17 (stroke 2.4), placeholder "Find anything, or ask Tokek" 15.5 `#9a9daa`, padding 0 14, gap 8.
  - "Cancel" is 15/600 ink plain text with no button chrome. It replaces the current back arrow on the left (`search-header.tsx` has back left + sticker in the field), so remove both.
- **Body, top → bottom** (absolute positions as drawn; build as a scroll stack with gap 16 from 118):
  1. **Clipboard card** (Card, top 118, padding 12, gap 12). Thumb 48 radius 12; eyebrow "TIKTOK YOU COPIED" 11/800 .06em muted; title 14/600, one line with ellipsis; dark SmallPill "Add" (36 high, padding 0 14).
  2. **Gap card** (top 198), radius 22, rain tint bg `#e6eeff`, padding 12 14. Eyebrow "FOR YOUR GAP · WED 16:00–19:00" 11/800 .06em `#2f5fc4`. Title 15/700, margin-top 2. Chip row: white chips 28 high, radius 14, padding 0 12, 13/700, gap 6, wrapping.
  3. **Three tiles** (top 320, gap 8, flex 1 each): radius 20, padding 12, gap 6. Doodle 34; title 14/700; sub 11.5/1.3 `#3d404c`. Tints: Swipe together = vote-open bg `#ffe4f0`, Day trips = maybe bg `#fff3c4`, Crew plans = booked bg `#e3f6ec`.
  4. SectionLabel "Try asking" at top 470, then two example rows (top 492, gap 6). Each row: padding 10 14, radius 16, white, ring .5 `rgba(20,22,40,.06)`, 13.5 `#3d404c`.
  5. SectionLabel "Or browse" at top 604, then a 6-column grid (gap 6). Each tile: 50×50 white, radius 16, ring .5, doodle 40; label 11/600 `#3d404c` gap 4.
  6. Hint at bottom 34, centred, inset 24, Caption 12.5 muted: "Typing a name searches; a sentence asks Tokek; a link reads the post."
- **Keyboard** (not drawn; set from 4.02 and Foundations):
  - The field autofocuses on open and the keyboard rises with it (about 336 pt with the suggestion bar). Above the keyboard you can still see the field, the clipboard card, the gap card and the three tiles, which fit inside y 56–508. "Try asking" and "Or browse" scroll under.
  - The hint line is not docked above the keyboard; it is the last item in the scroll (see Q4).
  - Return key "Search" (`returnKeyType="search"`, as today). On submit, a sentence goes to plain words (4.31), a URL goes to the link sheet (4.32), and a name runs the search. Each drops the keyboard.
  - Dismissal: dragging the content dismisses the keyboard (`keyboardDismissMode` interactive on iOS, on-drag on Android; today `KeyboardScrollView` sets only `keyboardShouldPersistTaps="handled"`). Tapping a result or tile also dismisses.
  - Cancel clears the query and returns to the plan, nothing typed kept. Typed text survives backgrounding.
- **Taps**:
  - Add → 4.32
  - Gap chip → 4.36 preset to the gap
  - Swipe together → joins the session (4.42)
  - Day trips → 4.49
  - Crew plans → published plans for Bali (`features/community/browse`)
  - An example → 4.31
  - A category → the places layer on the map, filtered (4.34)
  - Typing → names live; a sentence becomes plain words; nothing found → 4.33
  - Cancel → back to the plan
- **Motion**:
  - In: the map's glass search pill (4.25/4.34, top 56) morphs into this field in place. Fill goes from glass to white, the 2px ink ring fades in, the trailing sticker fades out. "Cancel" slides in from the right as the field shrinks by its width. The map fades to ground. Cards stagger up 8 pt / opacity 0→1, 30 ms apart. Smooth.
  - Out: the reverse.
  - Reduce Motion: 150 ms cross-fade.

### 4.31 Plain words (results)

- **Field**: as 4.30, with the typed query at 15.5/500, one line with ellipsis, and a 2×20 caret `#4f86ff`. The field shadow adds `0 10 24 −12 rgba(20,22,40,.3)`. z-index above content.
- **Below the field**:
  - "Tokek read it as" (13/600 muted) at top 116.
  - Chip row at top 138, wrap, gap 6. Each chip: ink, 30 high, radius 15, padding 0 6 0 12, 12.5/600 white, with an 18 circle × (white .18) holding 11 ×.
  - TokekNote at top 212: "Wednesday's already Locavore…".
  - Results header row at top 278, inset 24/16: "6 places" 18/700, plus a segmented control 32 high, radius 16, track control `rgba(118,118,128,.12)`, padding 3. The thumb is white radius 13 with shadow `0 2 6 rgba(20,22,40,.12)`; labels 12.5/600, unselected `#3d404c`.
  - Results Card at top 322. Rows padding 9 12, gap 12: thumb 48 r12; name 15/600; meta 12 muted; fit line 12/600 booked-green `#1f7a55`; `+` control circle 34.
  - Under the card, at top 620 inset 24: "3 more, louder or further" 13.5 muted and "Show ›" bold.
- **Foot**: TokekDock at bottom 28.
- **Keyboard**: submitting the query dropped the keyboard. Tapping the field brings it back with the text selected at the end. Removing a chip (×) reruns the search without raising the keyboard.
- **Taps**:
  - × on a chip → reruns without that part
  - List · Map → Map shows these six as the places layer (4.34 in results mode; today `places/index.tsx?results=…&chips=…`)
  - Row → 4.36
  - `+` → 4.39 on the night it fits
  - Show → results breaking one soft part, labelled
  - Cancel → 4.30
- **Motion**:
  - Chips pop in left to right, scale .8→1, 40 ms apart (Snappy).
  - × collapses the chip width with a layout spring (Snappy). The list cross-fades during the rerun with skeleton rows.
  - List ↔ Map: the thumb slides (Snappy). The list fades out while the map layer draws, with the same field kept on top.

### 4.32 Add from a link (sheet)

- **Dim**: `rgba(20,22,40,.35)` over the caller.
- **Sheet**: EdgeSheet with top 86 (near full).
- **Head row** (margin-top 14, gap 12): thumb 72×96 radius 14; eyebrow "FROM A TIKTOK · @BALIBUCKETLIST" 11/800 .06em muted; title 19/700 −0.02em lh 1.2; line 12.5 muted "I read the post and found 5 places."
- **Places Card** (margin-top 12, padding 0 14). Rows padding 9 0 with a top divider.
  - Leading status 22: green check `#34c77b`; `?` on tangerine `#ff9a4d` (13/800 `#17142a`); dashed 2px `#c4c6ce` ring for not found.
  - Title 14.5/600 (`#9a9daa` when not found, quoted); sub 12 muted.
  - Trailing: toggle 44×26 (knob 22, on `#34c77b`), "Pick one" control SmallPill, or "Search" 13/700 `#2f5fc4`.
- TokekNote, margin-top 10.
- CTA block (margin-top 14, gap 6): "Save 3 to Ideas" and text button "Or put them on Sat 17".
- **Foot row**: 11.5/600 `#9a9daa` "Works with TikTok, YouTube, Maps and screenshots", plus "Screenshot" in ink.
- **States**: the "ticking in" import progress. Rows appear one by one and their checks pop (`import.progress`). Pick one opens a chooser sheet of up to three (`pick-one-sheet.tsx`).
- **Taps**:
  - Toggle → leaves that place out
  - Pick one → chooser
  - Search → 4.30 with the name filled in
  - Save → saves to Ideas; the Ideas count hops
  - Put them on Sat 17 → adds on the best shared day (members: suggest)
  - Screenshot → photo picker; OCR runs on the phone (`modules/cp-ocr`)
  - Swipe down → closes, nothing saved
- **Motion**:
  - Sheet rises (Smooth).
  - Rows enter with height 0→auto and opacity, 120 ms apart; each check pops with scale 0→1 (Lively).
  - Save: the sheet drops (Smooth); the count badge on the plan's Ideas button hops (Lively, one wobble).

### 4.33 No results

- Field as 4.31 ("late-night ramen near Ubud").
- **Hero**: a 120 white circle at top 128, shadow `0 20 40 −16 rgba(20,22,40,.3)`, holding gecko 100 in the think pose, bobbing (2400 ms loop).
- **Title** at top 270, inset 28, centred: "Nothing like that near Ubud" 24/800 −0.03em (map to Title, see Q8). Line 14/1.45 muted, margin-top 6.
- **Ways out** (top 382, gap 8): three rows, radius 20 white Card shadow, padding 12 14, gap 12.
  - Icon tile 40 radius 12 on ground `#f5f5f7` with doodle 36.
  - Title 14.5/700; "what it finds" 12.5 muted; chevron.
- TokekDock with a dark "Ask" SmallPill.
- **Taps**:
  - Widen to 1 h 30 → those 3 results
  - Try Japanese → those 4
  - Drop a pin → pin-drop sheet, then saves to Ideas
  - Ask → guide chat with the question filled in (counts as a question)
  - Cancel → 4.30
- **Motion**: the gecko bob is static under Reduce Motion. Rows stagger in (Smooth).

### 4.34 The plan · places as a layer

- **Map** full bleed. Top scrim 170 high: `linear-gradient(180deg, ground .92 at 40% → 0)`.
- **Top row** (top 56, inset 16, gap 8):
  - Search pill: flex 1, 48 high, radius 24, Regular glass, padding 0 6 0 16, gap 10. Magnifier, placeholder 15 `#3d404c` "Find anything, or ask Tokek", and a 36 Tokek-tint circle holding gecko 34 on the right.
  - Ideas button: 44 glass circle showing "9" 13/800.
- **Layer chips** (top 114, from 16, bleeding off the right edge, horizontal scroll, gap 6). Chips are 34 high, radius 17, padding 0 13, 13/600, with an 8 dot. Active: ink fill, white text. Inactive: Regular glass, ink.
  - Plan: dot sky `#4f86ff`, active.
  - Saved 9: dot pink, active.
  - Tokek's picks: dot `#a9d08c` (OFF-TOKEN).
  - Food: no dot.
- **Map content**: stop numbers in day colours, photo pins for saves with the saver's face, small Tokek-pick dots (labels only at street zoom).
- **Peek sheet**: EdgeSheet at top 672. Eyebrow "WED 14 · SLOW UBUD" 12/700 .06em `#2f5fc4`, title 16/700 "38 places in view · best fit first", and a control SmallPill with list icon "List".
- **Taps**:
  - Plan chip → toggles stop numbers
  - Saved → the crew's saves with faces
  - Tokek's picks → dots
  - Pin → 4.35
  - List → the same layer as a list sorted by fit, swipe to save or hide (`places/list.tsx`)
  - Sheet → back to the day; the layer stays on
- **Motion**:
  - Chip toggles: Snappy fill. Pins scale in/out 0.6→1 with opacity (Snappy), 15 ms stagger capped at 300 ms.
  - Sheet drag snaps peek / half / full (Smooth; `ui/sheet/map-sheet-snap.ts` today).
- **Build note**: draw this layer inside `TripMapScreen` (`features/plan/trip-map/trip-map-layers.tsx`). Retire `PlacesMapScreen` as a second map, but keep its data hooks (`use-places-data`, `use-places-in-view`, `place-clusters`).

### 4.35 Place picked

- Same map. The search pill placeholder reads "Search Bali, or ask Tokek" (copy mismatch, Q9). The right glass button shows ≡ (list).
- **Chips**: "All 214" active ink; then "Saved 9" (pink dot), "In the plan 22" (sky dot), "Temples".
- **Picked pin**: carries a dark label "Tirta Empul · saved by Alex + Rin" (ink pill, white 2px border).
- **Carousel caption** at bottom 184, left 24: "1 OF 6 IN VIEW · NEAREST FIRST" 12/700 .04em `#3d404c` on white .85, radius 10, padding 5 10.
- **Carousel** (bottom 36, from 16, gap 10, horizontal paging). Cards are 300 wide, radius 24, padding 10, gap 12.
  - Photo 96×112 radius 16.
  - Optional tag "Next door" (20 high booked tint).
  - Name 16/700 −0.01em. Faces at 20 plus "Saved by Alex + Rin" 11.5 muted.
  - Meta 12 `#3d404c`, two lines.
  - Foot: "Fits Sat · 08:00" booked Tag (24) and a `+` control circle 34.
- **Taps**:
  - Card → grows into 4.36
  - `+` → 4.39 preset Sat 08:00
  - Swipe cards → the label moves to the next nearest pin
  - Faces → who saved it
  - Empty map → closes the cards
- **Motion**:
  - Cards rise 40 pt + fade (Smooth). Paging snaps per card (Snappy); the map label cross-fades pin to pin.
  - Card → place: shared-element grow. The photo goes from 96×112 r16 to a full-width 330 hero, and the card body becomes the ground sheet (Smooth). Back shrinks into the card (`ui/transitions/SharedGrow.tsx` exists today).

### 4.36 A place (top)

- **Hero**: photo 0–330 full width, cover. Top scrim 130: `rgba(10,15,25,.35)→0`.
- **Header** (top 56, inset 20): GlassNavButton ‹ on the left; share (17, stroke 2.2) and ♥ (18, filled pink when saved) on the right, gap 8. These are drawn as white .62 glass over the photo; Foundations says Clear glass over photos (Q1). There are also two right actions where Push allows one (Q6).
- **Content sheet**: top 296, ground `#f5f5f7`, radius 32 top, padding 20 20 0. It overlaps the photo by 34.
  1. Row (gap 6): category Tag "Temple" (tangerine tint, OFF-TOKEN); faces 20 (border ground) + "Saved by Alex + Rin" 12/600 `#3d404c`.
  2. Name 32/800 −0.04em, margin-top 8 (Display, Q8). Line 13 muted "Tampaksiring · 25 min from the villa".
  3. Fact tiles (margin-top 14, 4 × flex 1, gap 6): radius 16, padding 9 10, bg `#f5f5f7` (the same as the ground, so no visible tile; keep it borderless). Label 10.5/700 .06em muted; value 14/700, no wrap. Today: `fact-tiles.tsx`.
  4. **When it fits** Card (margin-top 12, padding 14):
     - Head (gap 10): 34 Tokek-tint circle with gecko; eyebrow "WHEN IT FITS" 11/800 .06em muted; value "Sat 17 at 08:00" 17/800; "Other days ›" 13/700.
     - Body 13/1.4 `#3d404c`, margin-top 8.
     - **Hour bars**: 14 bars, flex 1, gap 3, max height 38, radius 3, bottom-aligned. Slot bar `#34c77b`; open hours `#dcdde3`; closed hours 3 px stubs in `#f1f1f4`.
     - Axis "06 10 14 18" 10.5/600 `#9a9daa`, margin-top 4.
     - Data comes from `GET /v1/places/{id}/context` → `when_it_fits.bars{from,to,hourly[],lit}` (exists).
- **Bottom dock** (bottom 28, inset 16, gap 10): ink CTA "Add to Sat 17 · 08:00" (flex 1, 56), plus a 56 glass circle with gecko 30 on Tokek tint (opens guide chat about this place).
- **States**: place in the plan (leads with where it is); offline (device data only, CTA still works through the queue); unavailable (`place-unavailable.tsx`).
- **Taps**:
  - Back → wherever it opened from; the card shrinks back
  - ♥ → saves to Ideas; toast "Saved. It's in Ideas."
  - Share → system share sheet
  - Other days → 4.39 on the day picker
  - Hour bars → the busy curve and its source
  - Add → 4.39 preset
  - Tokek → guide chat
  - Scroll → 4.37
- **Motion**:
  - Pull down stretches the hero (scale ≥1 from the top edge).
  - Scrolling up parallaxes the hero at 0.5×. At 48 pt past the photo, the slim bar fades in (4.37).
  - ♥ pops 1→1.25→1 (Lively) and the Ideas count hops.

### 4.37 Further down (same page, scrolled)

- **Slim bar**: 0–108, ground .9, blur 20, bottom hairline .5 `rgba(20,22,40,.1)`. Row at top 56: glass ‹, title 17/700 flex 1 left-aligned (an inline title, not centred), glass ♥. Share is dropped in this state (Q6).
- **Content**:
  - TokekDock-style note (top 124), not docked: the tip text.
  - SectionLabel "Know before you go". Card rows padding 11 14, gap 12: 6 tangerine dot (margin-top 7), title 14.5/600, detail 12 muted.
  - "Next, nearby": a horizontal row (gap 10, bleeding right) of 156-wide cards, radius 20. Photo 84 high; eyebrow "10 MIN ON" 10.5/800 .06em `#2f5fc4`; name 14/700; kind 11.5 muted; `+` 28 control circle.
  - "If you like this": a one-row Card (padding 10 12): thumb 46 r12, name 15/600, meta 12 muted, `+` 34.
  - Crew quote: radius 20, bg `#fff6c9`, padding 12 14. Borel 14/1.4 `#6b5a24` (the Guide voice, here used for a crew quote; OFF-TOKEN colour). Attribution 11.5/600 maybe-text `#8a6a0c`.
- **Taps**:
  - Back → top of the place
  - ♥ → saves
  - Know-before row → expands
  - Nearby card → that place
  - `+` on a nearby card → 4.39 right after this stop
  - If you like this → that place; `+` adds it
  - Quote → that crew's published plan

### 4.38 Crew can't agree

- **Header**: GlassNavButton ‹; centred title 17/600 "Tegenungan swim"; a 44 spacer.
- **Title** "The crew is split 2–2" at top 116, 28/800 −0.035em.
- **Stance bar** (top 162, inset 16):
  - Labels 11.5/800 .06em: "WANT IT" `#b0306b`, "RATHER NOT" `#2f5fc4`.
  - Track 14 high radius 7 `#e9eaee` with a pink fill from the left and a sky fill from the right (33% each).
  - Faces 28 under each end, with "Rin and you haven't said" 12 muted centred. Today: `ui/planning/stance-bar.tsx`.
- **Quotes Card** (top 254, padding 12 14, gap 9): face 30; name line 12/700 coloured by side; quote 14/1.38.
- SectionLabel "Two ways nobody loses" (top 500), then two OptionCards (gap 8) with meta tags ("4 going", "Rp 20k each").
- CTA block: "Suggest the first one" / "Put it to a vote instead".
- **Missing in the drawing**: "Your side (Want it / Rather not with a line)" is in the taps but not drawn. Use `stance-picker.tsx` as a row at the top of the quotes card for a viewer who hasn't said (Q10).
- **Taps**:
  - Option → picks it
  - Suggest → posts a vote in chat (this way, or leave it out)
  - Vote → posts both ways
  - Face → member 3.14

### 4.39 Add to plan (sheet)

- **Behind**: map 0–420 showing the new leg (yellow `+` pin).
- **Sheet**: EdgeSheet at top 176. Head row (margin-top 10): "Add Tirta Empul" 22/800 −0.03em (Title), plus a ✕ 32 circle `rgba(118,118,128,.14)` on the right. This deviates from Sheet grammar (Q5).
- **Day chips** (margin-top 12, gap 6, horizontal scroll): 48×50, radius 16, white, shadow `0 0 0 .5, 0 4 10 −6 rgba(20,22,40,.2)`. Day 10.5/700 at .7 opacity; date 17/800 −0.02em. Fit dot 8 at top 5 / right 5, with a 1.5 ring in white (ink when selected): green `#34c77b` good, tangerine `#ff9a4d` possible, grey `#c4c6ce` no. Selected chip: ink, white text. Shared with the 4.26/4.28 day chips (`ui/planning/day-chips.tsx` today).
- **Day header** "SAT 17 · FREE DAY" 12/700 .06em in the day's dark text (sun day → `#8a6a0c`), margin-top 14.
- **Timeline**:
  - Time column 44, right-aligned, bold. Lead row "07:15 Leave the villa · car 45 min" 12.5 muted.
  - New block at "08:00": radius 18, bg `#fff6c9`, 2px ring sun `#ffd84a`, padding 10 12; title 15/700 "Tirta Empul · 1 h 30"; line 12 `#8a6a0c`.
  - Suggestion row: margin 8 0 0 54, padding 8 10, radius 14, 1.5 dashed `#c4c6ce`, 12.5 `#3d404c`, with a `+` 28 control.
- **"Why 08:00"**: 12/700 muted, then a 2×2 grid (gap 6). Tiles radius 14 ground, padding 9 11; label 10.5/700 .06em muted; value 13/700. Today: `ui/planning/reason-grid.tsx`.
- **Who's going** (margin-top 12): faces 24 (border `#f8f8fa`), "Everyone · Rp 75k each" 13 `#3d404c`, "Change ›" 13 bold.
- CTA block (margin-top 12, gap 2): "Add to Sat 17 · 08:00" / "Just save it for later".
- **Keyboard**: none. The time opens a native time picker (no keyboard).
- **Role**: members see "Suggest for Sat · 08:00" in place of Add.
- **States**: fit loading → CTA in loading state; no day fits → saves to Ideas until a day is picked (already handled in `add-sheet.tsx`).
- **Taps**:
  - Day chip → moves the block and redoes the reasons
  - 08:00 → time field; reasons recompute
  - `+` Gunung Kawi → adds it right after
  - Change → who's going; the split follows
  - Add → drops in; the map draws the new leg; toast with Undo
  - Save for later → Ideas; toast; the count hops
  - × → closes, nothing added
- **Motion**:
  - In: when opened from a `+`, the + morphs into the sheet (1.06, Smooth) and the page steps back.
  - Day change: the block slides to the new day context; reasons cross-fade (Snappy).
  - Add: the sheet drops (Smooth); the stop lands on the day with a squash bounce (Lively); the route leg draws (300 ms stroke).

### 4.40 Ideas (sheet over the plan map)

- **Behind**: map 0–300 at saturate .7, dim `rgba(20,22,40,.2)`.
- **Sheet**: EdgeSheet at top 150.
- **Head**: "Ideas · 9" 22/800 −0.03em, sub 12.5 muted "Saved, not on a day yet"; a control SmallPill with map icon "On map".
- **Must-do banner** (margin-top 12): radius 18, bg `#fff6c9`, padding 10 12, gap 10. Gold star 20 `#e0a800` (OFF-TOKEN). Text 13/1.35 `#3d3210`, with the bold lead "Must-dos: star one each." and the count "4 of 6 starred".
- **List Card** (margin-top 10). Rows padding 9 12, gap 12:
  - Thumb 44 r12; name 15/600.
  - Line 12/600, coloured by state: must-do `#8a6a0c`, split `#b0306b`, fits `#1f7a55`.
  - Saver faces 20.
  - **Star button** 36 circle: starred = `#fff3c4` with a filled `#e0a800` star 20; not starred = ground with an outline star `#9a9daa`.
- Hint "Hold any row and drop it on a day" 12 muted, centred, margin-top 10.
- CTA "Place them for me" (margin-top 10).
- **Roles**: one star per person. A member's star shows as "Dev's must-do". Before a crew plan exists, a member reads "still being put together" (`use-ideas-plan.ts`).
- **Taps**:
  - Star → your must-do; tapping another moves it
  - Row → 4.36
  - Hold a row → day chips appear with fit dots; drop opens 4.39
  - "Crew split" line → 4.38
  - On map → the Saved layer on the plan map (4.34)
  - Place them for me → 4.41
  - Swipe down → back to the plan
- **Motion**:
  - Star: when you move your star, the old one empties (Snappy) and the new one fills with a pop 1→1.3→1 (Lively).
  - Hold (long-press 350 ms): the row lifts (scale 1.03, shadow up, Snappy) and the sheet drops to peek so the day chips show over the map (Smooth). Drop on a chip opens 4.39 (`use-drag-to-day.ts` today).

### 4.41 Tokek is placing them

- **No header buttons**. "Ideas · 8" 13/600 muted at top 70; title "Tokek is placing them" 28/800 −0.035em.
- **Map card**: top 150, inset 16, height 300, radius 28, shadow `0 0 0 .5, 0 20 40 −20 rgba(20,22,40,.4)`. Gecko 80 hops in the centre (1800 ms loop). Pins pop into numbered day-colour stops (`placing-map.tsx` today draws a dark panel; the design shows the real map).
- **Steps Card** (top 470, padding 6 16). Rows padding 8 0, gap 10:
  - Done: green check circle 22, text 14.5/500.
  - Running: a spinner ring 22 (2.5 `#e3e4e9`, ink top arc, 1000 ms) with the text at 700.
  - Waiting: empty ring 2px `#e3e4e9` with `#9a9daa` text.
- **Foot** (bottom 28): Caption 12.5 muted "Leaving doesn't cancel it. The review waits on the trip." and text button "Keep browsing" 15/600 in ink (not muted).
- **Taps**: Keep browsing → back to Ideas; a quiet ping and a card on the trip when done. When done, the screen replaces itself with 4.48.
- **Motion**: steps tick with scale-pop checks (Lively). Done → cross-fade replace into 4.48 (Smooth; a navigation `replace`, not a push).

### 4.42 Swipe together

- **Header** (top 56, inset 20): glass ✕ 44; centred title 16/600 "Swipe together" and sub 12 muted "12 of 30 · 4 swiping"; glass pill 44 high, padding 0 16, with pink ♥ 18 and "10" 15/600 (the Ideas count).
- **Card stack**:
  - Next card: at left/right 36, top 136, height 470, radius 34, white, scale .94, translateY 16.
  - Top card: left/right 24, top 126, height 480, radius 36, white frame padding 8, shadow `0 30 50 −24 rgba(20,22,40,.45)`. Photo radius 29. Bottom gradient from 45% to `rgba(10,10,20,.6)`.
  - Text on the photo: name 30/800 −0.035em white, line 13.5 at .9.
  - **MATCH stamp**: left 22, top 24, rotate −14°, padding 6 14, radius 12, inset ring 3.5 mint `#54d6a4`, text 34/900 .04em mint, bg white .14.
  - Yes faces at top-right: 28 faces + "4 SAID YES" 11/800 white with text-shadow.
- **Match toast** (top 620, inset 16): 54 high, radius 27, ink, shadow `0 14 30 rgba(28,29,36,.3)`. Mint 36 check circle; text 13.5/600; "Ideas" chip 38 high, radius 19, white .14. This is the Foundations toast at 54/27 instead of 58/29 (Q11).
- **Controls** (bottom 34, centred, gap 20):
  - No: 62 glass circle with ✕ 22 in `#d93a62` (OFF-TOKEN; use destructive `#d6337f`).
  - "Why this?": glass 46 high, radius 23, padding 0 16, 14/600 `#3d404c`.
  - Yes: 62 ink-gradient circle with mint ✓ 24.
- **Taps**:
  - ✓ / swipe right → yes; enough yeses stamp MATCH and drop it into Ideas
  - × / swipe left → no; never shown to anyone
  - Why this? → Tokek's reason from the crew's saves
  - Toast Ideas or ♥ count → 4.40
  - ✕ → leave; the session keeps going for the others
  - End of deck → summary, "See them in Ideas"
- **Motion** (filmstrip `$SP/film/04b/strip37.png`, `tg-kf` dur 4400):
  - The card follows the finger with rotation (≈ x/20 degrees). Release past the threshold flings it off (velocity-driven decay); otherwise it springs back (Snappy).
  - On a match, the stamp drops and squashes (1.07, Lively). The card holds about 0.45 s, then shrinks and flies into the ♥ count: `translate(110px,−470px) scale(.18) rotate(18deg)`, opacity .9, easing `cubic-bezier(.5,0,.75,0)` over about 1.1 s (45%→70% of 4400), then hides.
  - The count increments with a hop (Lively). The next card springs from .94/+16 to 1/0 (Snappy). The toast rises (Smooth).
  - This is the 1.09 signature motion with an "into Ideas" target. Today: `motion/gestures/swipe-deck.ts`, `motion/patterns/stamp.ts`.

### 4.43 A problem chip · the fix opens in place

- **Behind**: map strip at top 50, height 170.
- **Plan sheet at full**: EdgeSheet at top 176. Head: "The whole trip" 24/800 −0.035em; ink chip 28 high "2 to fix · 2 to know" 13/700.
- **Days Card** (margin-top 10). Rows are 44 high, padding 0 12, gap 10:
  - Day colour bar 6×26 radius 3; day 12/700 muted, width 48; title 14.5/600 one line.
  - Optional problem Tag: "Too far" tangerine tint; "Clash" ink-filled; "Booked" booked tint; "Day trip" maybe tint; "2 ideas fit" control.
  - Pace bars: 5 × 7×12 radius 2, gap 2, day colour vs `#e3e4e9`.
- **Expanded row** (Wed): row bg `#fbfbfc`. The fix panel sits at margin 0 12 12, radius 18, vote-open tint `#ffe4f0`, padding 12.
  - Title 14.5/700 `#5a1634` and line 12.5 `#7a1f48` (both OFF-TOKEN, darker pinks).
  - White fix row (radius 14, padding 8 10): green check 18, "Start Jatiluwih at 06:40" 13/600, "Made's ok" 11.5 muted.
  - Pills (gap 6, margin-top 10): dark "Fix it", control "Other ways", control "Leave it".
- **Roles**: members see "Suggest" in place of Fix it, which posts a card to chat.
- **Taps**:
  - A chip → opens its fix in place under that day
  - Fix it → applies with Undo
  - Other ways → 4.45 or 4.46
  - Leave it → marks it known; the chip goes grey
  - Count chip → steps through the problems one by one
  - Day row → that day at half (4.26)
- **Motion**:
  - The panel expands with height + opacity while rows below shift (Smooth). The sheet scrolls so the panel is fully visible.
  - Fix it collapses the panel. The chip morphs to "Booked"/none and pace bars recount (Snappy); toast with Undo.
  - Leave it fades the chip to control grey (150 ms).
- **Build note**: the issue data and fixes exist (`features/plan/check/issue-card.tsx`, `use-fix.ts`, `plan-ops.ts`). Move the card into the trip sheet rows (`features/plan/trip-map/trip-sheet.tsx`). Keep `check/index.tsx` only as the "step through" list behind the count chip, or retire it (Q12).

### 4.44 Fill a gap (sheet)

- **Behind**: map 0–440 with the route of the picked idea.
- **Sheet**: EdgeSheet at top 318.
  - Eyebrow "WED 14 · 16:00–19:00" 12/800 .06em `#2f5fc4`. Title row: "Four of you are free" 24/800 −0.03em plus faces 24.
  - Line 13 muted.
  - "Tokek has three ideas" 12/700 muted (margin 14 0 8).
  - Three OptionCards (gap 8). The tag row wraps; a person tag uses maybe tint ("Dev's").
  - CTA block (margin-top 14): "Add coffee + market" / "Something else".
- **Taps**:
  - Idea → picks it; the map draws its route behind
  - Add → adds both with the four as going (members suggest)
  - Something else → 4.30 scoped to this gap
  - Dev's tag → Dev's save and note
  - Swipe down → 4.26
- **Motion**: radio select (Snappy); the route behind redraws (stroke draw 300 ms) as the selection changes.

### 4.45 Less driving

- **Header**: glass ‹; centred **PrivacyChip** "Only you see this" (28 high, radius 14, white, ring .5, lock glyph, 13/700 `#3d404c`); 44 spacer.
- **Title block** (top 112, inset 24):
  - Eyebrow "TUE 13 · SAME DAY, LESS DRIVING" 12/800 .06em `#b0306b`.
  - Big "3 h 50 → 2 h 40" 34/800 −0.045em, margin-top 4 (Display weight off-token).
  - Line 13 muted "in the car, nothing booked moves".
- **Before / After** (top 212, 2-col grid, gap 10): Cards padding 10. Label 11/800 (Before `#9a9daa`, After `#b0306b`). Map 110 high, radius 12, bg `#eef0f3`. After has a 2px pink ring and a pink route; Before has a grey route.
- **Order Card** (top 368). Rows padding 10 14, gap 10: pink 24 number disc (2px white ring); time 13 bold, width 42; name 14.5/600; trailing "was 2nd" 11.5/600 `#9a9daa` or a "Booked" tag.
- TokekNote with "Show" at top 640.
- CTA block: "Use this order" / "Send it to the crew first".
- **Taps**:
  - Back → 4.43
  - Row → that stop on the day
  - Show → 4.49 with Tirta Gangga
  - Use → applies with Undo (members suggest)
  - Send → a change for the crew to vote on
- **Motion**: none drawn. Suggest the After route draws on appear (stroke 600 ms) and the numbers in the big title count (CountUp, 400 ms).

### 4.46 Rain and crowds

- **Header**: glass ‹; centred chip "Rechecks Oct 11" (white, 13/700 muted, no ring).
- **Title block**: eyebrow "WED 14" `#2f5fc4`; title "Rain at 1, buses at 10" 30/800 −0.04em; source line 12.5/1.4 muted.
- **Timeline Card** (top 226, padding 10 12 8, gap 8). This is new; see the components section.
  - Grid lines every 2 h at `rgba(28,29,36,.06)`. The rain window is highlighted `rgba(79,134,255,.07)` radius 8.
  - Row labels 10/800 .06em muted: RAIN, CROWDS, NOW, SWAPPED.
  - RAIN: a 12-high bar, radius 9, gradient `#9cc0ff → #4f86ff → #9cc0ff`.
  - CROWDS: 7 hourly columns, gap 4, radius 4; busy `#ff9a4d`, quiet `#e3e4e9`.
  - NOW / SWAPPED: 28-high blocks, radius 9, 10/700. Unchanged: rain tint `#e6eeff` / `#2f5fc4`. Clashing: pink fill, white text. Swapped: mint fill, `#17142a` text.
  - Axis labels 10/700 `#9a9daa`.
- **Swaps Card** (top 490): rows padding 12 14 with an ink check 22; title 14.5/600 "Ridge walk 13:00 → 17:00"; reason 12 muted.
- CTA block: "Use both swaps" / "Send to the crew first".
- **Taps**:
  - Tick → keeps that block where it is
  - Pink block → the clash on the day
  - Source line → where each number comes from
  - Use / Send → as 4.45
- **Motion**: suggest that unticking a swap slides its SWAPPED block back to its NOW x (Smooth) and that the CTA label recounts.

### 4.47 Balance the crew (organisers only)

- **Header**: as 4.45 (PrivacyChip).
- **Title** "Whose picks made it" 30/800 −0.04em; line 13.5/1.4 muted.
- **Members Card** (top 196). Rows padding 10 14, gap 10:
  - Face 32; name 14.5/600; must-do line 11.5 muted with a 13 green check.
  - Right column: squares 12×12 radius 3, gap 3, in the member's crew colour vs `#e9eaee`; caption "3 OF 4 SAVES IN" 10.5/800 muted.
- **Flagged member** block: vote-open tint `#ffe4f0`, padding 10 14 14. Caption in `#b0306b`; body 13/1.4 `#7a1f48`; pills (gap 8, margin-top 10): dark "Add both", control "Ask Dev first".
- TokekDock: "The change notes name the places, never this list. Nobody else sees it."
- **Taps**:
  - Back → 4.43
  - Member → their saves
  - Add both → adds them; the change reasons name places only
  - Ask Dev first → Tokek asks Dev privately; toast "Nobody else sees it."

### 4.48 Tokek's changes (one review)

- **Header**: PrivacyChip.
- **Title** "7 changes, nothing moved yet" 28/800 −0.035em; sub 13.5 muted "Untick anything. The totals follow."
  - **Layout bug in the source**: the title wraps to two lines and the subtitle collides with the card at top 184 (see shot). Build the title, sub and card in flow with a 16 gap.
- **Changes Card**:
  - Day group headers 11.5/800 .04em in the day's dark text (Wed `#2f5fc4`, Sat `#8a6a0c`), padding 8 12 2.
  - Rows padding 10 12, gap 10: check 20 (ink filled / 2px `#c4c6ce` empty); title 14.5/600 ("Jatiluwih 07:00 → 06:40", "+ Seniman Coffee 16:00"); reason 12 muted.
  - Source Tag (22 high) on the right: Clash = vote-open tint; Rain = rain tint; Ideas = maybe tint.
  - Unticked row: opacity .5 and a strike-through title.
- **Totals pill** (top 640, inset 16): 40 high, radius 20, white, ring .5. 13/600 `#3d404c` with 3 px dot separators: "+Rp 210k each · −20 min driving · 0 bookings moved" (the last in booked green). Today: `changes-totals.tsx`.
- CTA block: "Send to crew · one vote" / "Apply to my plan only".
- **Roles**: an organiser's primary is "Put it in the plan" (with Undo) or ask the crew per the crew rule. A member's is "Send to crew". Today's logic already splits these (`changes-review-screen.tsx`). The design shows the member/ask path as primary; see Q13.
- **Taps**:
  - Tick → keeps or drops that change; totals recount
  - Source chip → why Tokek suggested it
  - Row → that stop before and after
  - Send → one change card in chat (5.10)
  - Apply to mine → your copy, marked "Only you"
  - Back → where it came from; the set is kept
- **Motion**: tick (Snappy check scale); the row fades to .5 (150 ms); totals roll (odometer / CountUp, 300 ms).

### 4.49 Day trips from Ubud

- **Header**: glass ‹, centred title 17/600, 44 spacer.
- **Intro** (top 112, inset 24): 13.5/1.45 muted.
- **Cards** (top 176, gap 10). Each Card has padding 10, gap 12:
  - Photo 84×96 radius 14.
  - Length Tag 20 high in maybe tint ("Full day", "Half day"); name 16/700; route 12 muted.
  - Foot row: "About Rp 600k each" 12/600 `#3d404c`, then either a booked Tag "On Fri 16" or a control SmallPill "Put on a day".
- TokekDock: "Each one brings its own map and places, and downloads with the trip."
- **Taps**:
  - Back → 4.30
  - Card → its page (`day-trip/[destinationId].tsx`, `AreaScreen`)
  - Put on a day → day picker with fit dots (`day-picker-sheet.tsx`); it becomes a day-trip day (`set_day_area`)
  - On Fri 16 → 4.50
- **Build**: a new route `(trip)/[tripId]/day-trips/index.tsx` over the existing `day-trips-model.ts`.

### 4.50 A day-trip day

- **Header**: glass ‹; centred title 17/700 "Penida by boat" and sub 12 muted "Fri 16 Oct · Day 5"; glass share.
- **Banner** (top 112): radius 20, maybe tint `#fff3c4`, padding 10 14, gap 10. Boat doodle 34; eyebrow "DAY TRIP FROM UBUD" 11/800 .06em `#8a6a0c`; line 13.5/600 `#3d3210` "About 1 h 35 each way, car then boat · estimate".
- **Mini-map** (top 180): height 150, radius 24, shadow `0 0 0 .5, 0 14 30 −14 rgba(20,22,40,.3)`. The dotted sky crossing line runs from the "Sanur" ink label; the island stops show as tangerine numbers.
- **Timeline** (top 344):
  - Time column 44, right-aligned, 13/700 tabular (past = `#9a9daa`).
  - Stop cards: radius 18, padding 10 12, gap 10, Card shadow. A 24 disc is ink (leave), sky with boat glyph, or day-colour number. Title 15/600, line 12 muted; trailing Tag (control "50 min" or "Booked"). A past stop sits at opacity .55.
  - Legs: 26-high rows, padding-left 68, a 2×26 `#dcdde3` rail, label 11.5/600 muted ("Car · 50 min").
  - Shared with the day timeline in 4.26.
- **Taps**:
  - Back → 4.25 with the Fri chip
  - Banner → how to get there and the estimate's source
  - Mini-map → Penida's own map, opened
  - Stop → 4.29
  - Booked boat → booking 7.06
  - Share → share the day with Made
- **Motion**: mini-map → full map with a shared-element zoom (Smooth).

### 4.51 Who's in

- **Header** (top 60): glass ‹; on the right a "Rooms held" chip 30 high, radius 15, booked tint, 12/600.
- **Title** "Who's in?" 30/700 −0.03em at top 114.
- **Stat tiles** (top 162, inset 20, gap 8): radius 18 white, no shadow, padding 10 12. Number 26/800 −0.03em (unopened in `#9a9daa`); label 12 muted.
- **RSVP Card** (top 248, radius 24, inset 20). Rows padding 9 14, gap 12: face 32; name 14.5/600; status line 12 muted. Status Tag 24 high radius 12, 11/700: Organiser ink; In booked; Maybe maybe; Unopened unopened.
- **Pon nudges** (top 592, gap 8): radius 20, Pon tint `#fff1e6`, padding 10 12, gap 10. Tanuki 36; text 12.5/1.35; action SmallPill 32 high: dark "Resend", or white "Offer".
- **Taps**:
  - Back → the proposal
  - Person → member sheet 3.14
  - Resend → now or at 21:00
  - Offer → offers everyone the cheaper room
  - Rooms held → who sleeps where (7.08)

### 4.52 Slide to board

- **Top row** (top 66, inset 24): "Kyoto · Apr 2–9" 13/600 muted; faces 22 (overlap −6, border ground) + "5/6" 13/700.
- **Title** "Your seat's saved, Rin" 30/700 −0.03em at top 100.
- **Boarding card** (top 160, inset 20): radius 28, white, shadow `0 2 4 rgba(20,22,40,.06), 0 24 48 rgba(20,22,40,.14)`, rotate −1.5°. Stays light in dark mode.
  - Top panel 110 high, margin 8 8 0, radius 22, Pon tint `#fff1e6`. Tanuki 124 bleeds off the top right. Sticker "Gate: yes": rotate −5°, tangerine fill, 2.5 white border, 14/800 `#17142a`. "CRITTERPASS AIR" in mono 10.5 .08em `#a8501a`.
  - Route row (padding 14 18): "SIN" / "KIX" 42/800 −0.03em lh 1; city 12 muted; dashed 2px `#c4c6ce` between.
  - Perforation: a dashed line `#e3e4e9` with 20 notch circles in ground colour at both edges.
  - 2×2 grid (padding 14 18, gap 10): label 11.5 muted; value 16/700.
- **Egg line** at top 576: egg 40 + 13/600.
- **Slide track** (bottom 40, inset 20): 68 high, radius 34, ink, padding 6. Thumb 56 sun `#ffd84a` with a plane glyph. Label "Slide to board →" 16/600 white .75, centred. Today: `ui/inputs/SlideToConfirm.tsx`.
- **Taps**:
  - Slide → you're in; seat saved; the egg set for landing
  - Seat → change or swap
  - Your share → cost breakdown (4.B)
  - Close → back to crew chat (no close drawn, Q7)
- **Motion**: the thumb follows the finger. Release before the end → springs back (Snappy). At the end → the track fills sun and a stamp lands on the card (1.07, Lively), with a success haptic.

### 4.53 Trip settings (new)

- **Header** (top 58): glass ‹, centred "Trip settings" 17/600.
- **Hero** (top 112): height 112, radius 26, tangerine tint `#ffe9d6`, padding 18. Eyebrow "THE BALI SIX · VOTING" 11/800 .1em `#a8501a`; name 34/800 −0.045em lh 1; line 13 `#7a4a20` "Apr 2–9 · Pon guides". The guide sticker is 104, rotate 8°, at right 6 / top 4. The hero tint should follow the guide (Pon → tangerine).
- **"The trip"** SectionLabel (left 26) → SettingsGroup Card. Rows min-height 48, padding 0 16, gap 12: icon tile 34 radius 10 on ground with doodle 30; label 15/400; value 14 muted, right-aligned; chevron. Rows: Dates, Where, Guide, Who's coming.
- **"Rules"** group. Rows have a label + sub (12 muted):
  - Plan changes: "Anyone can suggest" / value "You approve".
  - Budget maxes: "Only the crew total shows" / control Tag "Private" (22 high, 11/700, no chevron).
  - Live crew map: "Off · boost Kyoto to turn on" / pink Tag "BOOST".
  - Save for offline: "Bookings, maps, phrases" / "84 MB".
- **Destructive row** (top 722): 48 high, radius 22, white Card, centred "Cancel the trip" 16/600 in `#d93a62` (OFF-TOKEN, use `#d6337f`).
- **Member view**: the same page read-only, with "Leave the trip" instead of Cancel.
- **Taps**:
  - Back → 4.25 (or the trip hub 6.01 once the trip starts)
  - Dates → 4.54
  - Where → places search (4.02); Pon reworks the days
  - Guide → pick a guide (5.B)
  - Who's coming → 4.51
  - Plan changes → a menu: You approve · Anyone · Only me
  - Budget maxes → explainer (4.16)
  - Live crew map → Boost (9.12; `(modal)/boost/[tripId].tsx`)
  - Save for offline → 9.05 (`(trip)/hub/offline-storage.tsx`)
  - Cancel → 4.55
- **Build**: a new route `(trip)/[tripId]/settings/index.tsx` using the `SettingsGroup` pattern. Rows link to existing flows. "Plan changes" needs new data (gaps section, G1).

### 4.54 Change dates (new)

- **Header** (top 58): glass ✕ on the left, centred "Change dates" 17/600 (Q5).
- **Date pills** (top 118, inset 20, gap 10): 44 high, radius 22, padding 0 16, 16/700. Old: control bg, `#9a9daa`, struck through. Arrow glyph. New: ink fill, white.
- **Free card** (top 182, Card, padding 12 14, gap 12): faces 28; "4 of 6 are free" 15/600; line 12 muted.
- **"What it changes"** SectionLabel, then a Card of 60-high rows (padding 0 14, gap 12):
  - Status bar 4×34 radius 2: mint = moves, sun = Pon asks, pink = lost, `#e3e4e9` = fine.
  - Title 15/600; line 12 muted.
  - Right label 12/700 `#3d404c` (Lost in `#b0306b`).
- TokekDock variant with Pon (tanuki on `#ffe9d6`).
- CTA block: "Ask the crew first" / "Change it now".
- **Taps**:
  - ✕ → back to 4.53, nothing changes
  - Date pills → calendar with the crew's free days (4.12)
  - 4 of 6 free → who marked what (4.11)
  - Booking row → that booking (7.06)
  - Ask the crew first → a quick vote in chat, closing in 24 h
  - Change it now → moves everything that can move; the crew is told
- **Motion**: changing the new range in the calendar re-sorts the impact rows with a layout spring (Smooth) and cross-fades their labels.

### 4.55 Cancel the trip

- **Header**: glass ‹ with centred "Trip settings" as the inline title (the parent's name, not this page's; Q14).
- **Title block** (top 116, inset 24): "Cancel Kyoto?" 34/800 −0.045em lh 1; line 14/1.45 muted, margin-top 8: "Here's exactly what happens. Nothing's gone until you hold the button."
- **Consequences Card** (top 224): five rows, 62 high, padding 0 14, gap 12. Icon tile 34 radius 10 ground with doodle 30; title 14.5/600; line 12 muted. Each row is tappable: booking 7.06, Balances 7.B, boost 9.17.
- **Foot** (bottom 28, inset 24, gap 8):
  - **HoldPill**: 56 high, radius 28, vote-open tint `#ffe4f0`, label 17/700 `#b0306b`. The fill layer `#ffc2dc` grows scaleX 0→1 from the left.
  - "Keep the trip" ink CTA. The safe action is the dark one.
- **Decision (alert vs hold)**: Foundations says "Can't undo it? Hold to confirm." `cancel_trip` has no reverse command, so hold applies. Five consequences don't fit an alert's single result line, so keep the page plus the hold. The screen-reader / Switch Control path falls back to a two-choice Alert ("Cancel Kyoto?" / result line / pink "Cancel trip" / Cancel), as `HoldRing` already does (`destructive` + `confirmMessage`).
- **Taps**:
  - Back → 4.53
  - Row → its detail
  - Hold 1.5 s → crew told; the trip moves to Past with a Cancelled stamp
  - Keep the trip → back to 4.53 (the source says "4.29", a typo; Q14)
- **Motion** (filmstrip `$SP/film/04b/strip50-hold.png`; `tg-kf` 3600 loop = fill 0→70%, hold, retract 80→100%):
  - The fill runs linearly over `HOLD_FILL_MS = 1500` (`motion/gestures/hold-fill.ts`, exists). Light haptic ticks at 1/3 and 2/3, success/heavy at completion.
  - Release early → the fill retracts (Smooth, about 250 ms), no haptic.
  - Completion → navigate to the trips list, where the trip card gets the Cancelled stamp (1.07, Lively).
  - Reduce Motion: the fill still shows progress (it is information); the stamp lands without falling.

### 4.56 Nothing saved yet

- **Map** full bleed at saturate .8, top scrim 150. Gecko 70 in the wave pose floats at left 166 / top 268 (3600 ms loop).
- **Header** (top 56): glass ‹; centred chip "Bali · Oct 12–19 · 6 going" (32 high, radius 16, white .85, 13/700); 44 spacer. Today `trip-map-top.tsx` shows back + the search pill; the design shows the trip chip and no search.
- **Sheet**: EdgeSheet at top 420. Title "Nothing saved yet" 26/800 −0.035em; sub 13.5 muted; four rows (gap 8, margin-top 14).
  - Each row: radius 20 white Card, padding 12, gap 12. Icon tile 42 radius 12.6 on ground with doodle 38. Title 15/700; sub 12.5 muted; chevron.
  - The first row is highlighted with a 2px ink ring.
- **Roles**: members see "Ask Winston to draft".
- **Taps**:
  - Let Tokek draft it → drafting (4.20)
  - Paste → 4.32
  - Swipe → 4.42
  - Copy a crew's plan → published plans for Bali
  - Back → trip hub 6.01
- Exists: `empty-trip-sheet.tsx`.

### 4.57 Offline · search what's saved

- **OfflineBanner** (Foundations 1.03): top 54, inset 12, 38 high, radius 19, ink. 8 tangerine dot; 12.5/600 white "No signal · working from what's saved". Foundations draws it at 40 / 20 / 13; build to Foundations.
- **Field** pushed to top 104 (as 4.30), with the query "coffee".
- **Header line** (top 166, inset 24): eyebrow "OFFLINE RESULTS · 3 NEAR UBUD" 12/800 .06em muted; sub 12 `#9a9daa`.
- **Results Card** (top 214). Rows padding 9 12: thumb 44; name 15/600; meta 12 muted; freshness 11.5/600 `#1f7a55` "Open, as of Oct 10" (dated).
- **Queued card** (top 430): radius 20, 1.5 dashed `#c4c6ce`, bg white .5, padding 12 14. Eyebrow "QUEUED · 1" 11/800 .06em `#a8501a` and "Edit" 12.5/700; question 14/600; line 12 muted.
- **"Works offline"** SectionLabel, then wrapping chips 30 high, radius 15, booked tint, 13/700 `#174a35` (OFF-TOKEN; booked text is `#1f7a55`), each with a 14 green check.
- **Keyboard**: as 4.30. Return on a sentence queues it; the queued card appears with a Smooth rise.
- **Taps**:
  - Result → the place from what's saved (4.36)
  - Edit → change the question before it sends
  - Cancel → back
  - Back online → the banner flips to "Tokek answered" and the answer opens
- **Motion**:
  - Banner slides down from the island (Smooth).
  - Back online: the banner cross-flips (rotateX 90° out/in, 300 ms; or a 150 ms cross-fade under Reduce Motion) to "Tokek answered", tinted booked. Tapping it opens the answer.
- Exists: `offline-banner.tsx`, `offline-results.tsx`, `works-offline-chips.tsx`, `use-queued-plain-question.ts`.

## 4. Components

### (a) Foundations components used

- **Buttons and controls**: ink pill CTA; text button; small pills (dark and control); icon buttons 44 glass; segmented control (4.31); toggle (4.32); checkbox / tick (4.46, 4.48); radio (OptionCard).
- **Tags and status**: Tags in status tints; stamps (MATCH; Cancelled after 4.55); crew stack / faces.
- **Cards and notes**: cards and rows on ground; stat tile (4.51, plus fact tiles in 4.36 and reason tiles in 4.39); guide note tinted by speaker (TokekNote, TokekDock, Pon nudges).
- **States**: toast with Undo (Foundations 1.03); offline banner (1.03).
- **Materials**: Regular glass (nav buttons, search pill, chips); sheet glass (EdgeSheet variant).
- **Signature motions**: tab lens (none here); 1.05 zoom (carousel card → place page, and the mini-map → map); 1.06 `+` → sheet (4.39); 1.07 stamp (MATCH, Cancelled, board); 1.09 swipe card leaves with stamp (4.42).

### (b) New components this part needs

| component | metrics / states / variants | reused by |
|---|---|---|
| **FindField** | Three states share one frame (48 high, radius 24, padding 0 14–16): **resting** (Regular glass, placeholder 15 `#3d404c`, trailing 36 Tokek circle, optional 44 glass companion button); **focused** (white, 2px ink ring, no sticker, trailing "Cancel" 15/600 outside the field, caret `#4f86ff` 2×20); **filled** (15.5/500 text, ellipsis, clear × when editing). Morph animation between resting and focused. Return "search". | 4.02 (other lane), 4.25/4.26 plan map, 4.57, Explore outside a trip |
| **LayerChipRow** | 34-high chips, radius 17, padding 0 13, 13/600, 8 dot; active ink / inactive Regular glass; horizontal scroll bleeding right; counts in the label. | 4.25 filters, 4.34, 4.35 |
| **PlaceCarouselCard** | 300 wide, radius 24, padding 10, photo 96×112 r16, optional tag, faces 20, fit Tag, `+` 34. Paging. Caption pill "1 OF n IN VIEW · NEAREST FIRST". | 4.35, trip-day map (part 6) |
| **PhotoHeroHeader** | Hero 330, scrim 130, glass ‹ + up to 2 glass actions; content sheet radius 32 overlapping 34; collapses into a slim bar (108, ground .9, blur 20, hairline) at 48 pt past the photo. | 4.36/4.37, 4.03/4.04 guides, booking pages (part 7) |
| **HourBars ("when it fits")** | 14 bars, gap 3, max 38, r3; lit slot `#34c77b`, open `#dcdde3`, closed 3-px stubs `#f1f1f4`; axis 10.5/600. Tap → source sheet. Exists as `ui/planning/hour-bars.tsx`; restyle. | 4.36, 4.39, 6.x day-of |
| **TokekNote / TokekDock** | See shared metrics. Speaker-tinted avatar (Tokek `#fff3c4`, Pon `#ffe9d6`). Dock variant takes a trailing action. Exists as `ui/planning/tokek-note.tsx` and `ui/people/GuideLine.tsx`. | all of part 4, 5, 6 |
| **OptionCard** | See shared metrics; selected ring 2.5 ink. | 4.38, 4.44, 4.14 (other lane), part 6 fixes |
| **DayChip (with fit dot)** | 48×50 r16; fit dot 8 green / tangerine / grey; selected ink. Shared with the other lane's 4.26/4.28. | 4.39, 4.40 drag, 4.49 picker |
| **DayTimelineBlock** | New block: r18, `#fff6c9`, 2px sun ring. Ghost "add too?" row dashed. Leg rail rows (26 high, 2 px rail). Time column 44. | 4.39, 4.50, 4.26 |
| **IdeaRow + StarToggle** | Row padding 9 12, thumb 44; state line colour by state; star 36 circle (on `#fff3c4` + `#e0a800`, off ground + `#9a9daa` outline); long-press lift. | 4.40, 4.48 Ideas rows |
| **SwipeDeckCard + MatchStamp** | Card 342×480 r36 with an 8 white frame; next card at .94/+16; stamp −14°, 3.5 mint ring, 34/900; yes faces; fly-to-target animation. | 4.42, 4.05 vote cards (other lane), 8.x |
| **FixPanel (in-place)** | Inside a 44-high day row: panel r18 pink tint, title / line, white fix row r14, three pills. Expand / collapse. | 4.43, 4.27 chips |
| **PaceBars** | 5 × 7×12 r2, day colour. Exists as `ui/planning/pace-bars.tsx`. | 4.27, 4.43 |
| **PrivacyChip** | 28 high, r14, white, ring .5, lock 12, 13/700 `#3d404c`; centred in the header slot. Source chip variant without the lock. | 4.45, 4.46, 4.47, 4.48 |
| **BeforeAfterMaps** | Two Cards in a 2-col grid; map 110 r12; After pink ring 2; labels 11/800. | 4.45, 6.x disruption swaps |
| **WeatherSwapTimeline** | 12:00–19:00 grid; RAIN gradient bar; CROWDS columns; NOW / SWAPPED block rows (28 high, r9). | 4.46, part 6 rain swaps |
| **SaveSquares** | 12×12 r3, gap 3, crew colour vs `#e9eaee`; caption 10.5/800. | 4.47 |
| **ChangeRow (review)** | Check 20 + title + reason + source Tag; unticked .5 with strike; day group header. **TotalsPill** 40 r20. Exists in `features/plan/review/`; restyle. | 4.48, 5.10 change card |
| **DayTripCard** | Card padding 10, photo 84×96 r14, length Tag, price, "Put on a day" / "On Fri 16". | 4.49, 4.30 tile |
| **ImpactRow** | 60 high, 4×34 status bar (mint / sun / pink / grey), title / line, right status label. | 4.54, 4.55 (icon variant), 7.x booking changes |
| **HoldPill** | 56 r28, track vote-open tint, fill `#ffc2dc` scaleX from the left, 17/700 `#b0306b` label; 1.5 s; haptics; accessible fallback to an Alert. Built on `useHoldFill`. | 4.55, 9.x delete account, 7.x refunds |
| **BoardingCard** | See 4.52; stays light in dark mode. | 4.52, 9.x pass |
| **SlideToConfirm** | 68 r34 ink track, 56 sun thumb. Exists `ui/inputs/SlideToConfirm.tsx`; restyle. | 4.52, 6.x |
| **SettingsGroup rows** | Min 48, icon tile 34 r10, label 15/400 + optional sub 12, value 14 muted, Tag or chevron. Exists `ui/inputs/SettingsGroup.tsx`; restyle. | 4.53, 9.x |
| **QueuedCard** | Dashed 1.5 `#c4c6ce`, bg white .5, eyebrow tangerine-dark `#a8501a`, Edit. | 4.57, 5.x chat offline |
| **EmptyStartRow** | Card r20 padding 12, 42 icon tile, title / sub, chevron; recommended row 2px ink ring. | 4.56, 2.x first run |

## 5. Motion and transition inventory

| trigger | what moves | properties | spring / easing + duration | evidence | native or custom |
|---|---|---|---|---|---|
| Tap the plan's search pill | Pill → focused field; Cancel slides in; map fades to ground; content staggers | x, width, bg colour, ring opacity, opacity, translateY 8 | Smooth; stagger 30 ms | 4.25 → 4.30 shots | Custom Reanimated (shared element across routes; iOS 26 search-in-toolbar is not this layout) |
| Submit a sentence | Chips pop; note fades in; list rises | scale .8→1, opacity | Snappy; 40 ms stagger | 4.31 shot | Custom |
| × on a chip | Chip collapses; list cross-fades | width, opacity | Snappy layout; 150 ms fade | 4.31 | Custom (Layout animations) |
| List ↔ Map | Segment thumb; list ↔ map layer | x; opacity | Snappy; Smooth | 4.31 / 4.34 | Custom |
| Link sheet open / save | Sheet rise; rows tick in; Ideas count hop | translateY; height, opacity; scale | Smooth; 120 ms stagger; Lively | 4.32 | Native sheet (`modalGroupOptions`) + custom row ticks |
| No-results gecko | Bob loop | translateY ±4 | 2400 ms loop (tg-motion bob); off under Reduce Motion | 4.33 HTML | Custom loop (`motion/use-loop.ts`) |
| Pin tap | Carousel rises; label moves between pins | translateY 40, opacity; label cross-fade | Smooth; Snappy paging | 4.35 | Custom |
| Card → place page | Photo grows into the hero; body → sheet | frame (x, y, w, h), radius 16→0 | Smooth (1.05 family) | 4.35 → 4.36 | Custom `SharedGrow` (exists) |
| Place scroll | Hero parallax / stretch; slim bar fades in at 48 pt | translateY, scale; opacity | Scroll-linked | 4.36 → 4.37 | Custom (`collapsing-header.tsx` exists) |
| ♥ save | Heart pop; toast; count hop | scale 1→1.25→1 | Lively | 4.36 taps | Custom + island toast (exists) |
| `+` → Add sheet | `+` morphs into the sheet; page steps back | frame, radius; scale .94 behind | Smooth (1.06) | 4.39 | Custom over a native-sheet route (needs a transparent modal) |
| Day chip change (add) | Block re-seats; reasons cross-fade | translateY, opacity | Snappy | 4.39 | Custom |
| Add confirm | Sheet drops; stop drops + squash; route leg draws | translateY; scaleY .85→1; stroke offset | Smooth; Lively; 300 ms | 4.39 taps ("drops in with a bounce") | Custom |
| Star a must-do | Old star empties; new fills | scale 1→1.3→1, fill | Snappy + Lively | 4.40 | Custom |
| Hold an idea | Row lifts; sheet to peek; day chips show | scale 1.03, shadow; sheet y | Snappy; Smooth | 4.40 taps | Custom (`use-drag-to-day.ts`, `motion/gestures/long-press.ts`) |
| Placing | Gecko hop; spinner; steps tick; pins → stops | translateY; rotate; scale | 1800 ms hop; 1000 ms spin; Lively ticks | 4.41 HTML | Custom (`placing-map.tsx`) |
| Placing done | Screen replaced by review | cross-fade | Smooth | 4.41 taps | Navigation `replace` + fade |
| Swipe drag / fling | Card x / rotate; fling; next card forward | x, rotate ≈x/20; scale .94→1, y 16→0 | Decay on fling; Snappy return | 4.42 | Custom (`swipe-deck.ts` exists) |
| Match | Stamp drops; card holds then flies into the ♥ count; count hops; toast | stamp scale / rotate; card `translate(110,−470) scale(.18) rotate(18°)` | Lively stamp; card `cubic-bezier(.5,0,.75,0)` ≈1.1 s after 0.45 s hold; Lively hop | `$SP/film/04b/strip37.png` (12 frames / 4400 ms) | Custom (1.07 + 1.09 variant) |
| Problem chip | Fix panel expands in the row; rows below shift | height, opacity | Smooth | 4.43 | Custom Layout |
| Fix it / Leave it | Panel collapses; chip morphs / greys; pace bars recount | height; colour; bar fill | Smooth; Snappy; 150 ms fade | 4.43 taps | Custom |
| Gap option | Radio + ring; route redraw behind | ring opacity; stroke | Snappy; 300 ms draw | 4.44 | Custom |
| Less-driving appear | After route draws; numbers count | stroke offset; text | 600 ms; 400 ms CountUp | 4.45 (suggested) | Custom (`ui/data/CountUp.tsx`) |
| Rain swap untick | Block slides back NOW ↔ SWAPPED | x | Smooth | 4.46 (suggested) | Custom |
| Review untick | Row dims + strike; totals roll | opacity; text | 150 ms; 300 ms odometer | 4.48 | Custom (`ui/data/Odometer.tsx`) |
| Mini-map tap | Mini-map zooms to the full map | frame | Smooth (1.05 family) | 4.50 | Custom |
| Slide to board | Thumb drag; track fills; stamp on the card | x; colour; stamp | Snappy return; Lively stamp | 4.52 | Custom (`slide-to-confirm.ts` exists) |
| Date range change | Impact rows re-sort / relabel | layout, opacity | Smooth | 4.54 (suggested) | Custom |
| Hold to cancel | Fill scaleX 0→1 over 1.5 s; retract on release; stamp after | scaleX; stamp | Linear 1500 ms; Smooth retract ~250 ms; Lively stamp | `$SP/film/04b/strip50-hold.png` (10 frames / 3600 ms) | Custom (`hold-fill.ts` exists) |
| Empty-trip gecko | Float loop | translateY | 3600 ms loop | 4.56 HTML | Custom loop |
| Offline banner | Slides from the island; flips to "Tokek answered" | translateY; rotateX or fade | Smooth; 300 ms flip | 4.57 taps | Custom |
| Push screens (4.38, 4.45–4.51, 4.53, 4.55) | Standard push, edge-swipe back | – | Native stack push (iOS) / shared-axis (Android) | – | Native (`pushTransition` today) |
| Sheets (4.32, 4.39, 4.40, 4.44) | Rise; swipe-down dismiss | – | Smooth | – | Native form sheet where possible; 4.40 / 4.44 need a map-attached detent sheet (custom, `map-sheet.tsx`) |

Haptics: none are stated in the part 4 text. Proposed: selection haptic on day-chip change and star toggle; light impact on a swipe verdict; success on MATCH, Add, slide-to-board and hold completion; the hold ticks above. Use `motion/feedback`.

## 6. Native platform surfaces

- **System share sheet**: 4.36 Share and 4.50 Share (share the day with Made). Use the existing `ui/share-image/share-actions.ts`.
- **Notifications** (iOS and Android):
  - "Tokek finished placing" quiet ping, plus a card on the trip (4.41).
  - "Tokek answered" when back online (4.57).
  - The crew is told on cancel (`trip_cancelled` push, contract exists) and on "Change it now" (`trip.dates_changed`).
  - Resend at 21:00 (4.51, a scheduled resend).
  - These ride the existing push pipeline. The redesign of notification visuals is owned by the native-surfaces lane, so nothing new is specced here.
- **Photo picker** (4.32 Screenshot) with on-device OCR (`modules/cp-ocr`): exists.
- **iOS paste control** for the clipboard card (4.30): exists as the undesigned system paste control in `clipboard-card.tsx`. Keep it; style the card around it.
- **System Alert**: only as the accessible fallback for HoldPill (4.55).
- No widgets, Live Activities or lock-screen surfaces in this range.

## 7. Logic and backend gaps (real gaps only)

- **G1. Plan-change rule per trip** (4.53, "Plan changes · You approve · Anyone · Only me"; 4.48 "organisers decide per the crew rule"). There is no column or command. `trips` (`docs/data-model.md:147`) has no such field. Today's behaviour is fixed: members propose change sets, organisers apply. "You approve" equals today. Needs a `trips.plan_change_rule` enum plus a `set_plan_change_rule` command, read by `apply_plan_ops` / `propose_plan_changes`. Founder decision on whether "Anyone" (direct edits by members) is wanted (Q15).
- **G2. Change-dates impact preview** (4.54 "What it changes": per booking moves / Pon asks / lost / fine, with free-cancel dates, plus "4 of 6 are free" for the new range). `lock_trip_dates` exists (`docs/api-contracts.md:242`) but returns `moved_stops` only after the fact. Needs a read such as `GET /v1/trips/{id}/dates-impact?start&end` returning bookings with their terms and the crew's availability, reusing setup windows (`GET /v1/setup/{trip_id}/windows`). "Ask the crew first" can post a `decision` poll via `create_poll` (exists).
- **G3. Cancel consequences list** (4.55: boost moves, the ryokan refunds in full, the tea ceremony keeps $84, money stays, chat stays). `cancel_trip` exists (`api-contracts.md:297`). The per-booking refund lines need a preview read of supplier cancellation terms for the trip's bookings. Booking terms exist per supplier (`(modal)/supplier/cancel.tsx`) but there is no trip-wide summary.
- **G4. Trip settings screen and entry**. There is no route and no "⋯" on the plan map today (cancel lives in the trip hub foot, `features/trip/hub/trip-menu.tsx`). The client needs the new route plus an entry point (Q16). It needs no new data except G1. The offline size ("84 MB") comes from `hub/offline-storage`.
- **G5. Live swipers on the Find tile** ("Maya and Alex are in it now", 4.30). `use-swipe-entry.ts` deliberately never joins the session's presence channel, because reading it shows the viewer as swiping. Needs a presence summary that doesn't join, for example the server exposing `swipe_sessions.active_user_ids` on the synced row, or a `GET` that reads Centrifugo presence. Small.
- **G6. Day trips list as its own route** (4.49): client-only (`features/explore/day-trips/day-trips-model.ts` has the data).
- **G7. Places layer on the plan map** (4.34) and **fix-in-place** (4.43): client-only restructuring. The data exists (`use-places-data`, the plan check issues on synced rows).

Everything else shown in 4.30–4.57 has data and commands today. Plain words (chips), link import with pick-one and not-found, drop pin, the queued offline question, when-it-fits bars, nearby / similar / quote, split stances and options, the add sheet fit and reasons, must-do stars, placing jobs, swipe sessions and matches, the gap / less-driving / rain / balance fixes, review changesets with totals, `set_day_area`, the RSVP tracker nudges, `set_rsvp` boarding, the empty-trip starts and `copy_shared_plan` are all covered by `docs/api-contracts-planning.md`, `api-contracts-explore.md`, `api-contracts-proposal.md` and `api-contracts.md`.

## 8. Open questions

1. **Glass over photos and the glass values.** 4.36 (and 4.42) draw white Regular-style glass (.62, blur 18, saturate 1.8) over a photo. Foundations says Clear glass (`rgba(18,20,28,.30)`, white glyphs) over photos and maps. All nav glass in the file is drawn at .62/18/1.8, against the token's .56/24/1.9. Recommendation: Clear glass on 4.36 while the photo is under the bar, cross-fading to Regular once the slim bar shows (4.37). Build all glass to the tokens.
2. **Two sheet renderings.** Map sheets here are edge-attached (radius 34, .92, blur 30). The Foundations sheet is inset 8, radius 46, .86, blur 34 (used on 4.01). Pick one for map-attached sheets; this probably needs a named "MapSheet" token set shared with the 4.25–4.29 lane.
3. **Off-token colours** to name or replace:
   - Tangerine tint `#ffe9d6/#a8501a` (category tags, Too far, the 4.53 hero, Pon avatar tint)
   - Gold star `#e0a800`
   - Tokek's-picks dot `#a9d08c`
   - Destructive `#d93a62` (4.42 No, 4.53 Cancel); Foundations says `#d6337f`
   - Dark pinks `#5a1634` / `#7a1f48`
   - Offline chip text `#174a35`
   - Quote ink `#6b5a24`
   - Note text `#3d3210`
   - The unnamed inks `#3d404c`, `#9a9daa`, `#c4c6ce`, `#34c77b` and track greys. These last ones are also in Foundations' own HTML and probably want token names.
4. **Find keyboard state is not drawn.** 4.30 shows the focused field without a keyboard. Proposed: autofocus, return "Search", interactive dismiss on drag, and the hint line scrolls rather than docking above the keyboard. Confirm, or dock the hint as 4.02 docks its field.
5. **Sheet grammar deviations.** 4.39 (✕ right, CTA at the foot) and 4.54 (glass ✕ left, no grabber, CTAs at the foot) differ from Foundations' Sheet (Cancel left, bold verb right). Keep the design's bottom CTA, since the verb carries a time ("Add to Sat 17 · 08:00")? If so, record it as an accepted Sheet variant. 4.54 should become a full-height sheet with a grabber, or a push.
6. **Push with two right actions.** 4.36 has share + ♥, but Foundations allows one. Option: ♥ stays and share moves into a ⋯ menu, or accept two on photo pages.
7. **4.52 has no visible close**, though its taps list "Close → back to crew chat". Add a glass ✕ top-left (Full screen type)?
8. **Type scale.** This range uses 800 weights at 24/26/28/30/32/34 with −0.03 to −0.045em tracking. Foundations has Display 34/700 −0.03 and Title 22/700 −0.02. Proposed mapping: page titles (4.38, 4.41, 4.46–4.48, 4.55, the 4.36 name) → Display; sheet titles (4.39, 4.40, 4.43, 4.44, 4.56) → Title; 4.45's big number → Hero-lite? A founder call: keep 800, or move to 700.
9. **Search placeholder copy.** 4.30/4.34 say "Find anything, or ask Tokek"; 4.35/4.25 say "Search Bali, or ask Tokek". The app today uses "Search {destination}, or ask {guide}".
10. **4.38 own stance.** "Your side: Want it / Rather not, with a line" is in the taps but not drawn. Where does it sit? Proposed: a row at the top of the quotes card while you haven't said.
11. **Toast size.** 4.42 draws 54/27 and Foundations 58/29. Build to Foundations?
12. **Plan check screen.** Is `check/index.tsx` retired once fixes open in place (4.43), or kept as the "2 to fix · 2 to know" stepper target?
13. **4.48 primary for organisers.** The drawing's primary is "Send to crew · one vote". For an organiser under "You approve", should the primary be "Put it in the plan" (with Undo), as `changes-review-screen.tsx` does today?
14. **4.55 header and copy.** The inline title reads "Trip settings" (the parent's name) over "Cancel Kyoto?". "Keep the trip" says "Back to 4.29" (typo for 4.53). The row "Their terms, shown on 7.06" puts a screen code in user copy; replace it with a tappable "See their terms".
15. **"Anyone" plan-change rule** (G1): do members' changes go straight in, with Undo for the organiser? This changes the permission model; a founder decision.
16. **Where the plan's ⋯ lives.** 4.53 says "from the plan's ⋯", but 4.25–4.27 draw no ⋯ (4.27 has "Share"). Options: a glass ⋯ next to the search pill on the plan map, or a row in the whole-trip sheet.
17. **4.56 header.** The design drops the search pill for a centred trip chip on the empty trip. Is that intended (no search until something is saved)? Today's empty state keeps the search pill.

```
Status: DONE_WITH_CONCERNS
Summary: The spec for 4.30–4.57 covers 28 screens with exact metrics, a route map onto existing features, new components, the motion inventory with two filmstrips, and 7 real gaps. Most logic exists; the real new work is one map with a places layer, fix-in-place, the Ideas sheet, and the new trip settings, change-dates and cancel-consequences pages.
Concerns/Blockers: Several off-token values (glass over photos, the 800-weight type scale, destructive #d93a62, two sheet renderings) and a plan-change rule that has no backend need founder calls (§8). The stock film.mjs timed out on networkidle; I used a load-based copy at $SP/lane04b/film2.mjs.
```
