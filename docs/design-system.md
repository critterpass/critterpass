# Critterpass: design system

Status: implementation contract for `packages/design-tokens`, `apps/mobile/src/ui`, `apps/mobile/src/motion`, extension targets and `apps/web`. Date 2026-09-26.
Source analysis: `plans/reports/design-analysis-260926-1143-design-system-prototype-report.md` (DS), `...-critter-render-engine-report.md` (RE), `...-off-app-native-surfaces-report.md`, native fact-check. Product rules: [product-decisions.md](product-decisions.md).

## 0. Where the design lives

| Asset | Path |
|---|---|
| Design source (read-only, never modify) | `design/` (`Critterpass.dc.html`, `Critterpass Prototype.dc.html`, `doodles.js`, `critters-draw-*.js`, `critters-data.js`) |
| Screen renders (149) | `docs/design-renders/screens/<label with non-alphanumerics → _>.png`, e.g. `3c-9_Pon_s_draft.png` |
| Screen text + motion caption | `docs/design-renders/screens.json` (`label`, `screenText`, `caption`, `doodles`, `motion`) |
| Page renders (site, icon, collection, store, social kit) | `docs/design-renders/pages/*.png`, text in `pages-text/` |
| Render engine probes | `docs/design-renders/engine-probe/` |

Rule: when a screen is ambiguous, open its PNG + `screens.json` caption; the caption's MOTION line is the motion spec.

---

## 1. Tokens

One DTCG source in `packages/design-tokens/src/*.tokens.json` → generated TS (`apps/mobile`, `apps/web`, `apps/admin`), Swift (`targets/_shared/Tokens.swift`), Kotlin (`modules/cp-android-surfaces`), CSS vars. Never hard-code hex, size or duration in feature code.

### 1.1 Colour: primitives

| Token | Hex | Role |
|---|---|---|
| `ink.950` | `#0b0a12` | Deepest shadow, key shadow |
| `ink.930` | `#0d0b18` | Scene backdrop (camera, night: 3f-4, 3i-4, 3l-10, 5b-3) |
| `ink.900` | `#120f22` | Tab bar, sunken |
| `ink.850` | `#17142a` | App background; ink text on accents |
| `ink.800` | `#1f1b38` | Cards, list groups, bubbles, keys |
| `ink.780` | `#241f3d` | Alt surface, stripes |
| `ink.700` | `#2c2750` | Chips, segmented track, secondary buttons, ring track |
| `ink.600` | `#3a3466` | Decorative outlines, grabber, locked silhouettes |
| `ink.400` | `#6f698c` | Decorative only (fails AA for text) |
| `ink.300` | `#8d87a8` | Inactive tab (5.5:1 on ink.900) |
| `ink.200` | `#a9a3c0` | Secondary text, eyebrows, tier common |
| `ink.100` | `#d8d3ee` | Unselected chip text |
| `paper` | `#f4efe4` | Primary text on dark, paper surface, sticker edge |
| `paper.bright` | `#fffdf6` | Sticker white, receipt |
| `paper.warm` | `#fff3c4` | Warm tints |
| `paper.ink` | `#211d18` | Ink on paper, doodle strokes |
| `paper.muted` | `#5d564b` | Paper secondary text (≥ 4.5:1; never `#8a7f6c` for information) |
| `rust` | `#c4623e` | Paper stamp ink; handwriting only ≥ 24 pt or darkened `#a44e2f` |
| `yellow` | `#ffd84a` | Accent |
| `orange` | `#ff9a4d` | Accent |
| `pink` | `#ff5fa8` | Accent |
| `red` | `#ff6b5b` | Accent (Chà Vá, Đà Nẵng) |
| `blue` | `#4f86ff` | Accent |
| `green` | `#54d6a4` | Accent |
| `green.deep` | `#2e9a74` | PAID stamp, spots |
| `gold` | `#e0a92a` / `gold.dark #3a2f14` / `gold.silhouette #6b5a24` | Legendary |
| `map.base` | `#172536` | Map background; parks/water `#1d3a38` |
| `divider` | `rgba(255,255,255,.07)` | Hairlines |
| `scrim` | `#07060e` @ .45–.5 | Modal scrim |
| `flash` | `#fffbe8` | Burst flash |

Increase-contrast variants (auto when OS Increase Contrast is on): `border.control` → `#6a63a3` (≥ 3:1), `text.tertiary` → `#a9a3c0`.

### 1.2 Colour: semantic layer

| Semantic token | Value | Use |
|---|---|---|
| `bg.base` / `bg.raised` / `bg.control` / `bg.sunken` | ink.850 / ink.800 / ink.700 / ink.900 | Surfaces |
| `surface.document` | paper + guilloche | Passport, stamps, receipts, visas (official moments) |
| `surface.celebrate` | accent flood + halftone | Wins, befriends, stamps |
| `surface.alert` | pink/orange hero + halftone | Delay, storm, SOS, leave-by |
| `text.primary` / `.secondary` / `.onAccent` | paper / ink.200 / ink.850 | Text |
| `text.tertiary` | ink.200 at 12 pt min (ink.400 never for information) | Footers, timestamps |
| `border.control` | `#5b5487` (3:1 on ink.850) | Interactive outlines, input idle ring, off toggle |
| `border.decorative` | ink.600 | Dashed placeholders, grabber |
| `action.primary` | yellow | Primary CTA, focus/selection ring, active tab |
| `state.success` | green | IN, PAID, online, valid, owed-to-you |
| `state.urgent` | pink | Urgent, badges, destructive, negative balance, clash |
| `state.warning` | orange | Owed money, card declined, last redraft |
| `state.info` | blue | Weather, planned, flights, "you" dot |
| `brand.passplus` | yellow | Pass+ visa, badges |
| `brand.boost` | pink | Boost stamp, badges |

**Guide / place colours (canonical, C5):** `guide.tokek` yellow (Bali), `guide.pon` orange (Kyoto), `guide.lundi` blue (Iceland), `guide.ajo` pink (Mexico City), `guide.sardi` green (Lisbon), `guide.paco` cream (Cusco), `guide.chava` red (Đà Nẵng; added after the design, outside the 3×2 guide-grid order). `place.color = guide.color`. Non-guide places get a colour from `critters-data` set order cycling the 6 accents; stamp ink = destination colour, home stamp = orange (C7). Guide voice lines (Borel) use the guide colour; on paper use darkened variants (`*.onPaper`, ≥ 4.5:1).

**Tier colours:** `tier.common #a9a3c0`, `tier.rare #4f86ff`, `tier.epic #ff5fa8`, `tier.legendary #ffd84a`. Rare = recolour + blue ring; epic = recolour + pose + 2 pt pink die-cut edge; legendary = gold recolour + 3 pt yellow edge + sparkles. Locked = `ink.600` silhouette (legendary: `gold.silhouette` on `gold.dark`) + "?" in tier colour. Tier is never colour-only: always paired with the tier word or a shape glyph (● common, ◆ rare, ★ epic, ✦ legendary) in dots and rings.

**Member colours:** per crew, assigned in join order from yellow, pink, blue, green, orange, cream; members 7–16 reuse the palette with a ring pattern (`solid`, `dashed`, `double`). Always paired with initial or avatar. On paper use `*.onPaper` variants.

### 1.3 Typography

Fonts bundled (subset): Archivo variable (`wdth 62–100`, `wght 700–900`), Geist 400–800, Geist Mono 400–700, Borel 400 (guide voice; Latin and full Vietnamese), Noto Sans Thai 400/900. Instrument Serif is web-only. Hand-drawn map place-name labels use Borel 400 too, served as SDF glyph ranges (`fonts/Borel-400 Regular/` on the tiles bucket), so Vietnamese names such as Đà Nẵng draw in full; the Caveat 600 ranges stay on the bucket only for installed builds with the older style. Fonts prewarmed before first hero paint.

**Archivo width steps (only these):** `w62` hero/mega, `w66` hero, `w70` h1/h2, `w78` titles, `w100` buttons. Design values 58/60/64/68/72/74/76/80/84 snap to the nearest step.

| Token | Spec | Where |
|---|---|---|
| `display.mega` | Archivo 900, 110–176, lh .8, w62, −.02em; auto-fit single line | KYOTO, BALI, 03:10, StandBy |
| `display.hero` | 900, 72–90, lh .82, w62–66 | Countdown, amounts, BOOSTED |
| `display.xl` | 900, 56–64, lh .86, w66–70, −.01em | DELAYED 2H 10M, BEFRIENDED! |
| `h1` | 900, 44 (auto-fit 40–52), lh .86, w70, −.01em, max 3 lines | Screen titles |
| `h2` | 900, 30–36, lh .9, w70 | Crew name, section heroes |
| `h3` | 900, 20–28, lh 1, w78, .02em | Card heroes, route codes |
| `title` | 900, 16, lh 1, w78, .02em | List/card item titles |
| `button.lg` | 900, 16, w100, .06em | Primary pill |
| `button.sm` | 800, 12–14, w100, .06em | Pills, inline actions |
| `eyebrow` | 700, 11, .16em, text.secondary | Section labels |
| `label` | 800, 11, .08em | Chips, status, tab labels |
| `body.lg` / `body` / `body.sm` | Geist 500, 15/1.45, 14/1.4, 12.5/1.35 | Body |
| `row.title` | Geist 600, 15 | Settings rows, names |
| `caption` | Geist 500, 11.5 | Captions (min 11) |
| `input` | Geist 600, 18; OTP Geist 700 24 | Inputs |
| `mono.data` | Geist Mono 500, 11–12.5, .06em; tabular | MRZ, times, codes, receipts |
| `voice` | Borel 400, 16/1.5 (postcard 21, signatures 18) | Guide voice, signatures |

Rules: uppercase applied at render (`textTransform` with locale rules), strings stored sentence case; tabular numerals on every countdown, amount, odometer and flap; minimum informational size 11 pt (design micro 7–9.5 px → 11); "plain text for guide" setting swaps Borel for Geist 500 italic.

### 1.4 Spacing, layout, sizes

Scale: `2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32`.

| Constant | Value |
|---|---|
| gutter | 20 (cards inner 14–16) |
| cta.bottom / cta.gap | 36 / 12 above home indicator |
| tabbar | 88 (includes safe area on 844 pt frame) |
| primary CTA | 58 h, radius 29 |
| header pill | 40 h (hit target 44) |
| chip | 32 h (hit target 44 via slop) |
| OTP box | 46 × 56 |
| toggle | 46 × 28, knob 22 |
| avatar | 18 / 26 / 32 / 44 |
| FAB | 66, raised −30, 5 pt ink ring |
| min touch target | 44 × 44 pt (48 dp Android) |

Layout: flow/stack only (the design's absolute positioning is not reproduced); frame reference 390 × 844; content adapts from 375 to 440 pt widths and Android 360–480 dp.

### 1.5 Radii

`xs 4` · `sm 9` · `md 14` · `lg 20` (cards) · `xl 24` · `card.big 22` · `sheet 32` (top) · `hero 40` (bottom corners of hero panels) · `pill h/2` · `circle`. Chat bubbles: `18 18 18 4` (theirs), mirrored for mine. Ticket stub `10 16 16 10`. App-icon squircle is system-provided.

### 1.6 Rings, shadows, elevation

Flat sticker language; rings over shadows.

| Token | Spec |
|---|---|
| `ring.cutout` | 2 pt in the underlying bg colour around avatars |
| `ring.selected` | 3 pt ink.850 + 2 pt accent outer (double ring) |
| `ring.focus` | inset 2 pt yellow (also keyboard/switch focus) |
| `ring.input.idle / valid / error` | inset 2 pt border.control / green / pink |
| `shadow.sheet` | 0 −12 30 rgba(0,0,0,.4) |
| `shadow.float` | 0 20 40 rgba(0,0,0,.4) |
| `shadow.paper` | 0 6 14 rgba(23,20,42,.12) |
| `shadow.hard` | 0 6 0 rgba(0,0,0,.25) (printed/offset) |
| `shadow.sticker` | rgba(0,0,0,.32) blur 5 y 2.5 (baked into art) |
| `glow.feedback` | yellow ring 0→16 pt, .75→0, 900 ms ×2 |

### 1.7 Textures (Skia shaders / baked tiles; CSS on web)

| Token | Spec | Use |
|---|---|---|
| `tex.halftone` | dots rgba(23,20,42,.13) r1.3 on 8 pt grid | Every colour hero, ticket, card |
| `tex.halftone.dark` | rgba(255,216,74,.2) 9 pt / rgba(244,239,228,.07) 9 pt | Splash, invite, voice orb |
| `tex.guilloche` | repeating radial rgba(23,20,42,.05) 1/7 pt from (50%,120%) | Passport pages |
| `tex.hatch` | 135° stripes rgba(255,255,255,.05) 8/16 on muted colour | Photo placeholders / loading photos |
| `tex.engraving` | 115° lines rgba(23,20,42,.055) 1/6 | Visa, gold cover |
| `tex.barcode` | 2/2 pt ink stripes | Tickets, receipts |
| `tex.rays` | conic cream .45 9° steps, spin 9 s | Wins, befriends |
| `tex.holo` | conic pink→yellow→green→blue, rotating | Pass+ visa seal |
| `tex.sheen` | skew −20°, 60 pt white .55 band | Primary CTA sweep |

---

## 2. Component inventory (`apps/mobile/src/ui`)

~160 families. Build primitives first; features compose them. Screen ids are examples.

### 2.1 Shell and navigation
| Component | Variants | Screens |
|---|---|---|
| `Scaffold` | dark / paper / colourHero / scene / map; optional halftone; status-bar style | all |
| `TabBar` + `GuideFab` | 5 slots HOME · TRIPS · FAB · WALLET · PASS; FAB = context guide sticker; tap → guide sheet, long-press → Help; icon bounce | 17 screens |
| `BackEyebrow` | "← SECTION" (mirrors in RTL, real icon) | pushed screens |
| `CloseButton` | 40 pt circle; mandatory on every sheet/rise | 3d-3, 3m-*, 4e-1 |
| `LargeTitle` | condensed h1, collapses on scroll | 3n-6, all |
| `HeaderPills` | action pill; status pill (ONLY YOU SEE THIS, LIVE, NO SIGNAL, BOOSTED, countdown) | 3c-9, 3f-6 |
| `HomeHeader` | greeting, crew switcher ▾, crew pill + badge, bell + badge | 3b-2, 3b-6 |
| `Sheet` | detents large (.87) / medium / fit; grabber; presenter scale .93; drag-dismiss | 22 screens |
| `RiseModal` | full-screen modal (checkout, paywall, story, slide-to-board, SOS) | 3f-5, 4e-1 |
| `StoryPlayer` | 8 segments, 5 s, tap zones, hold-to-pause, visible pause, captions | 3f-2, 3m-3…9 |
| `StepTabs` | 4-step wizard, done ✓ | 3c-3…3c-7 |
| `PageDots` | "PAGE n OF 4" | 3a-2…3a-5 |
| `IslandToast` | pill from top; sticker + 2 lines + optional OPEN; 2.8 s (6 s with action) | global |
| `Composer` | + attach, input, mic (tap or hold-to-talk) | 3g-1, 3j-1 |

### 2.2 Buttons and inputs
| Component | Variants | Screens |
|---|---|---|
| `PillButton` | primary yellow / green / pink / orange / ink / cream; secondary outline; tertiary link; destructive; sheen; label flap; loading; disabled | all |
| `SplitCtaRow` | primary + secondary / icon | 3d-3, 3l-3 |
| `InlineAction` | choice, approve, nudge, ghost (in cards) | 3b-4, 3k-5 |
| `IconButton` | 40–56 pt dark/cream/on-photo | 3d-3, 3h-3 |
| `TextField` / `SearchField` | focus ring, live mirror, clear, results | 3a-2, 3b-7 |
| `CodeBoxes` | 6-box OTP/join (drop digits, valid green, invalid shake); 4-4-4 gift code | 3a-8, 3a-11, 4d-4 |
| `Keypad` | 3×4 incl. 000, ⌫; amount odometer; ≈ line | 3i-2 |
| `Toggle` | squash knob; On/Off a11y value | 3a-9, 3n-2 |
| `Segmented` | 2–4 segments, badge | 3b-4, 3e-1, 4e-1 |
| `RadioCard` | outline + pick tag ("PON'S PICK") | 3c-4, 3k-8 |
| `Slider` / `RangePrivateMarkers` / `SegmentBudget` | music/effects; anonymous dots + sweet spot; 10-segment ping budget | 3n-7, 3c-5, 5b-4 |
| `SlideToConfirm` | 68 h track, critter knob; a11y action | 3f-5, 5b-3 |
| `HoldRing` | conic fill; green/gold/pink; value-driven (touch or dwell); a11y action | 3l-4, 3l-10, 3n-10 |
| `SettingsGroup` / `LanguageRow` | value ›, toggle, check, private, destructive | 3n-2, 3n-8 |

### 2.3 Chips and badges
`ChoiceChip` (tilt + double ring), `FilterChip`, `QuickActionChip`, `InfoPill`, `StatusChip` (BOOKED, VOTE, IN, MAYBE, UNOPENED, PLANNED, BUILDING, ENDED, FREE/BOOST/PASS+), `CountBadge`, `TierLabel` (word + glyph), `StatChipRow`, `TiltedSticker`.

### 2.4 People, critters, stickers
| Component | Variants | Screens |
|---|---|---|
| `Avatar` | initial / photo / critter; member colour; cut-out ring; pending bob | everywhere |
| `AvatarStack` | overlap −7, +n | 3b-2 |
| `CritterAvatar` | tier ring (+ glyph) | 3n-1, 3n-4 |
| `EmptySeat` | dashed, pulsing | 3a-13, 4f-1 |
| `Sticker` | baked bitmap by default; runtime Skia draw-on for heroes (≤ 2 concurrent); blink via 2 cached frames; locked silhouette; tier edge | everywhere |
| `GuideLine` | sticker + Borel line in guide colour (Noto Sans Thai italic for Thai, OS italic for CJK); optional bubble | most screens |
| `SilhouetteSlot` | grey/gold "?" breathing | 3l-2, 3l-8 |

### 2.5 Cards and surfaces
`Card`, `ListCard`, `TileGrid` (hub 2×2, help, stat), `HeroPanel` (colour + halftone + r40 bottom, sticker over edge), `CountdownCard`, `ActionCard` (slides off when handled), `SuggestionCard`, `DashedAddCard`, `CrewCard`, `EmptyState` (guide pose + title + line + action), `ChecklistProgress` (pending → ticked), `OutboxList` ("SENDS WHEN YOU'RE BACK").

### 2.6 Document artefacts
`PassportCover`, `PassportPage` (guilloche, photo, bilingual labels, MRZ decorative), `PaperChrome`, `Stamp` (round/rect/dashed pending; ink per context; slam), `Ticket` (notch, tear line, barcode; crew/flight/boost), `Visa` (Pass+ visa, Boost entry stamp), `Receipt` (zig-zag, highlighted OCR lines), `Postcard` (front/back flip), `ManifestCard`, `GiftCard`, `WalletStack` (fanned bookings), `SignatureLayer`.

### 2.7 Data and numbers
`SegmentedProgress`, `LinearBar`, `ProgressRing`, `Donut`, `MonthBars`, `HourlyCrowd`, `BalanceBars`, `DayBarsVsPlan`, `WeatherStrip`, `CalendarHeatmap`, `PollBars`, `Countdown` (dhms/hms/ms, localised units), `Odometer`, `SplitFlap`, `CountUp`, `StreamText` (reserves final box; word-buffered). Every chart has a text summary for screen readers.

### 2.8 Planning, voting, collaboration
`DayRow` (drag-reorder + move actions), `DayTimeline` (07–19 grid, 15-min snap, rain band, ghost suggestion, time stepper alt), `DiffRow` (old struck, new bold, reason, ✓/✕), `MustDoRow`, `RoomAssign`, `VoteBoard`, `SplitShowdown`, `ResultTally`, `SwipeStack` (+ buttons), `RateStack`, `LiveOptionCards` (presence cursor), `ChatMessage` (theirs/mine/guide/photo/divider; actions menu), `ChatRichCard` (poll, offer, expense, boost, settled, typing), `ReactionFloats`, `FormatPicker`, `IdeaVoteBox`, `MoodPicker`, `AttachmentThumb`.

### 2.8.1 Planning kit (section 7: `ui/planning`, `ui/map/planning`, `ui/sheet/map-sheet`)
Props-only pieces every section 7 screen composes (the reads behind them live in `data/plan`, `data/fit`, `data/ideas`, `data/checks`, `data/legs`); each shows in the planning kit lab (`(dev)/planning-map-lab`, scene `kit`, English and Vietnamese).

| Component | Variants / behaviour | Screens |
|---|---|---|
| `MapSheet` + `MapSheetScrollView` | Non-modal, no scrim; snaps peek (7a-1 sheet top, 300 of 844 pt, scaled to the screen) / half (452 of 844) / full (the map's top strip left showing); a release settles on the nearest snap, a fling (≥ .55 pt/ms) moves one snap past where it was let go; content scrolls only at full and hands a downward drag back once at its top; content shorter than a snap caps it; Android back lowers one snap before leaving; grabber carries Expand / Collapse a11y actions; a programmatic snap takes 420 `standard`, a release settles in 340 `gesture`; reduced motion fades out, moves, fades in (200) | 7a-1…7a-3, 7c-1 |
| `PlanningMapCanvas` | Region pack or world tiles (TextureView on Android), the stay marker (yellow diamond, bed), and the layers below; `usePlanningCamera` fits a day above the sheet, flies to a place so it sits above the cards (`padding.bottom`), opens a cluster at its split zoom | 7a, 7b, 7c |
| `PlaceDotsLayer` | Map layers, no view per place: saved places as paper discs with the category sprite and the saver's colour badge from town zoom (11), Tokek's suggestions as small dots that gather into count bubbles until street zoom (14); size by crew relevance (0–3); a filter dims what it leaves out to 20 % (never removes it, so nothing jumps) | 7a-1, 7c-1, 7c-2 |
| `StopRouteLayer` | Numbered stops in the day's colour joined by straight segments from the stay and back; other days at 50 %; choosing a day traces its line out from the stay (780 `extra`, ease out; instant under reduced motion) | 7a-1, 7a-2, 7b-1, 7b-2 |
| `MapLabel` | The only label on the map: paper for a place, the day's colour for a stop; pops in 340 ms `cubic-bezier(.3, 1.5, .5, 1)` (scale .6 → 1, rise 8 pt), reduced motion fades in 240; a live `Marker` on both platforms | 7c-2, 7a-2, 7b-2 |
| `EdgeIndicator` | "1 ← JATILUWIH": off-screen stops of the chosen day as pills on the edge they lie beyond, level with them, clear of the corners, the chips and the sheet | 7a-1, 7b-1 |
| `DayChips` | Number over weekday, short colour underline, chosen = filled in the day's colour (or paper on Add to plan) with a ring; corner fit dot green / orange / grey; drop target: every chip dashed, the one under the drag glows yellow; > 8 days scroll | 7a-1, 7b-1, 7f-1, 7f-2 |
| `PlaceRow`, `PlaceCard`, `PlaceThumb`, `AddButton` | Picture with category disc, name, meta, saver faces, the fit line in its tone (yellow fits, orange only if a stop moves, pink split, secondary none); card outlined when picked, yellow + | 7c-2, 7c-3, 7f-2 |
| `TimedStop` (`TimeColumn` + `StopCard`) + `LegConnector`, `GapSlot` | Time over length; numbered disc in the day's colour, outlined when it needs a look; dashed leg line with "CAR · 1H10"; dashed free-time slot with an optional time and + | 7a-2, 7b-1, 7f-1 |
| `TokekNote`, `PlanningDayRow`, `PaceBars`, `PlanningTag`, `MiniRouteSketch` | Guide line + one action (card form adds a plain line); whole-trip day row with tile, tag and five pace bars; status tags filled in their state colour; a day's route as plain views fitted to the card | 7a-1, 7a-3, 7b-1, 7b-3 |
| `FilterChipRow`, `ReasonGrid`, `StanceBar`, `HourBars`, `OptionRadioCard` | Scrolling chips with counts, chosen fill, removable ×; two-up reason tiles; WANT IT (pink) / RATHER NOT (blue) bar with faces; hourly bars with the fitted slot lit green; radio cards with tags, chosen outlined yellow | 7c-1, 7d-1, 7e-1, 7e-3, 7f-1 |

### 2.9 Map, trip-day, money, camera
`MapView` (MapLibre + custom style), `MapPin` (place, selected, person, meet-up, you, car, cluster, closed road), `RouteLine`, `PlaceCarousel`, `EtaList`, `CrewRail`, `LeaveByHero`, `PackingChips`, `TimelineList`, `PhraseCard` (TTS play), `EmergencyTiles`, `SettleRow`, `PayMethodChips`, `Viewfinder`, `ScanOverlay`, `ArLabels`, `VoiceOrb` (driven by audio levels), `WatchRow`, `ImportTiles`, `ParsedBookingCard`, `SupplierCard` (verbatim supplier data + attribution + disclosure; never cached).

### 2.10 Critters, recap, monetisation
Critters: `DexHeader`, `HereNowForms`, `LegendaryBanner`, `SetGrid`, `CritterDetail`, `FormSelector`, `EncounterCard`, `WanderFootprints`, `BefriendReveal`, `MonthStrip`, `QuestCard`, `Egg`, `StickerShelf`.
Recap: `RecapStatTiles`, `AwardsGrid`, `RouteRider`, `GotAway`, `StampSpread`, `MemoryHero`.
Monetisation (4e family only): `VisaPaywall`, `ComparisonTable`, `PlanRadioRows`, `BillingToggle`, `PerksChecklist` (server-driven), `LimitMeter`, `SeatsRow`, `TeaserPreview`, `PauseBars`, `KeptPausedChips`.

### 2.11 Native surfaces (Swift in `targets/`, Kotlin in `modules/cp-android-surfaces`)
Live Activity + Dynamic Island (leave-by, crew, flight→pickup, critter nearby, storm, SOS, vote closing); notification content (vote poster, rich roundup); notification service (avatars, communication notifications); AlarmKit presentation; widgets (countdown S, Critterdex S, vote M interactive, Today L, balances S + NUDGE, crew (Boost), next flight (Pass+), lock-screen inline/circular/rectangular, StandBy); alternate icons (FACE default, the founder's pick of the store-assets directions; PASSPORT, STAMP Pass+, STICKER × light/dark/tinted + earned critter icons). Android: Glance widgets, Live Updates (ProgressStyle/MetricStyle), full-screen alarm Activity, pinned widget request, adaptive/themed icons via activity-alias.

---

## 3. Motion system (`apps/mobile/src/motion`)

### 3.1 DSL → tokens
The design's `tg-motion` DSL (`kf` segments `offset: tx ty s sx sy r o e=`) compiles to Reanimated keyframes. Transform order translate → rotate → scale; easing per segment; unmentioned props carry forward. Design loops of 6–9 s with holds are **presentation artefacts: entrances play once**. Idle loops run on one shared clock (Reanimated frame clock) so stickers breathe in phase. `motion/presets.ts` exports the presets below; a `slowmo` multiplier (1×/2×/4×) is available in debug builds.

| Preset | Keyframes | ms | Meaning |
|---|---|---|---|
| bob | ty 0 → −6 → 0 | 2400 | Idle hover |
| float | ty0 r−2 → ty−9 r2 → back | 4200 | Sticker drift |
| wiggle | r −4 → 4 → −4 | 1600 | Rocking |
| pulse | s 1 → 1.07 → 1 | 1600 | Attention |
| ping | s .6 o .8 → s 1.5 o 0 (out) | 1800 | Radar ring (pairs offset ½) |
| spin | r 0 → 360 lin | 9000 | Rays, holo |
| marquee | tx 0 → −50% lin | 16000 | Ticker |
| blink | o 1 → .25 → 1 | 1200 | Live dot |
| hop | squash .9 → jump −14 stretch 1.05 → land .94 → rest | 2600 | Squash-and-stretch |
| grow | sx 0 → 1 (out) | 600–900 in app | Bar fill |

### 3.2 Durations, easings, springs

| Duration token | ms |
|---|---|
| `instant` | 130 |
| `fast` | 240 |
| `base` | 340 |
| `medium` | 460 |
| `slow` | 560 |
| `extra` | 780 |
| `story` | 5000 |
| stagger | tight 40, rows 80, cards 140, stamps 280 |

| Easing | Value | Use |
|---|---|---|
| `standard` | cubic-bezier(.32,.72,0,1) | Navigation, sheets, reveals |
| `enter` | (0,.55,.45,1) | Entrances |
| `exit` | (.5,0,.75,0) | Exits, slide-off |
| `inOut` | (.65,0,.35,1) | Default DSL |
| `slam` | (.5,0,.8,.4) | Stamp fall, fling |
| `gesture` | (.2,.8,.2,1) | Post-gesture settle |
| `press` | (.3,.7,.4,1) | Press-down |
| `back` | (.34,1.56,.64,1) | ~10% overshoot |
| `burst` | (.2,1.3,.35,1) | Burst in |
| `island` | (.2,1.25,.3,1) | Island toast |

| Spring | k / c (mass 1) | Overshoot | Use |
|---|---|---|---|
| `snappy` | 420 / 26 | 8% | Toggle, drop, spring-back |
| `bouncy` | 350 / 21 | 11% | Pins, pop-ins |
| `gentle` | 240 / 21 | 5% | Next card, VS punch |
| `soft` | 195 / 21 | 3% | Day block move, burst-in |
| `sheet` | standard 540 | 0% | Sheets |

### 3.3 Transitions (expo-router custom animations)

| Type | Spec | Use | Back |
|---|---|---|---|
| push | in tx 100%→0; out tx 0→−30% + scrim .5; 480 standard | drill-down | pop 420 |
| sheet | up to detent; presenter scale .93, scrim .45; 540 | modal sheet | dismiss 420 |
| rise | ty 100%→0, delay 120; presenter .93; 620 | full-screen modal | dismiss 420 |
| zoom | shared-element grow from tapped card, radius 22→54, fade first 35%; 560 (+200 ms hop pre-beat on stickers) | card → detail | unzoom 460 |
| burst | s 1.2→1 + flash `#fffbe8` .55 over 460; 640 burst easing | celebration | unfade 260 |
| fold | ty 70→0 + fade, delay 160; out scale .9 380; 560 | AI-job handoff | unfade |
| flip | rotateY −90→0 at perspective 1600; 680 total | card flip | flipback |
| tab | fade 240 + children ty 12→0 420 | tab switch | — |
| fade | 300 enter | same-slot state swap | unfade 260 |

Gestures: tap cancels over 8 pt; long-press 320 ms; edge-swipe back from x < 28, commit dx > 110 or v > .55 pt/ms, settle 300 gesture easing (Android: system predictive back); drag-dismiss grab zone top 110 (sheet) / 160 (rise), commit dy > 150 or v > .55; press scale .92 (< 120 pt wide) / .96 / .975 over 130 press, release overshoot 1.035 over 420.

### 3.4 Recurring patterns (`motion/patterns/*`)

| Pattern | Spec | Screens |
|---|---|---|
| `stamp` | fall s 2.2→.94 450 slam, overshoot 1.04, settle ~540; at impact: `thud` (screen ty 0→5→−2→0, 280) + haptic heavy + `sfx.thud` | 3a-6, 3c-2, 4b-5, 3m-8 |
| `slap` | s 0 r ±24 → 1 r ±8, 540 back; stagger 300; `sfx.slap` | 3m-3, 3l-6, 3b-3 |
| `settle` | ty −40 r −8 → 0 r −2, 630 back | 3a-6, 3a-10 |
| `deal` | rows ty −12→0 + fade, 400 standard, stagger 80 | 3e-3, 3c-9 |
| `fling` | drag translate(dx, dy·.3) rotate(dx/14°); commit |dx| > 110; out 400 slam; return spring; next card from ty 26 s .93 gentle | 3d-2, 3o-3 |
| `slideOff` | tx 110% r 4° fade 360 exit, then collapse 320 standard | inbox, handled cards |
| `flap` | rotateX 0→90→0, 340 inOut, text swaps at 170 | every label state change |
| `odometer` | per-digit rolling columns, 650 enter, digit stagger 30 | money, prices |
| `splitFlap` | 340 per flip | 4c-2, 5c-4 |
| `draw` | stroke trim 700 icons / 1500 creatures, easeInOutQuad; washes fade 25–80% | hero stickers, pen strokes |
| `confetti` | Skia particles; counts 40 / 70 / 90 / 140; gravity .33, drag .985, life ~1.8 s; ≤ 40 on low-end | celebrations |
| `squash` | sx 1.14 sy .86 → .94/1.06 → 1, 250–400 | egg, icon swap, vote half |
| `holdFill` | value-driven ring; touch fill 1500 (legendary 2400), drain 450; critter scale 1→1.3; complete → thud + confetti 40 | 3l-4, 3l-10, 3n-10 |
| `pageTurn` | 3D rotateY with shading, 650 | 3a-1, 3m-8 |
| `flyTo` | overlay clone arc (mid lifted 140, r −14°) to target, 780 (.4,0,.2,1), then pop + thud + toast | 3l-6→3l-2, 3b-3, 3c-10 |
| `slideToConfirm` | 282 pt track, commit > 70%, else spring back 280; then scripted 6 s choreography (ticket thump, stub tear, confetti, egg drop) | 3f-5 |
| `sheen` | 1080 sweep every 3600 on primary CTAs | primary CTAs |
| `pingRings`, `rays`, `typing` (dots 1200 stagger 160), `waveform` (real audio level), `petals`, `barGrow` (600–900, stagger 50), `storyProgress` (5000 lin) | as DS §4.3 | various |

**Choreography rules:** (1) entrances once; (2) shared idle clock; (3) impact = visual + jolt + haptic + SFX in the same frame via the feedback bus; (4) label state changes flap; (5) handled items slide off then collapse; (6) numbers never jump; (7) motion budget per screen — in chat only the guide's typing dots bounce; max 2 concurrent draw-ons; loops pause off-screen.

### 3.5 Native surfaces motion
iOS LA/widgets: no continuous or looping motion; per-update SwiftUI transitions/springs ≤ 2 s (`.contentTransition(.numericText())`, hop on position change); timers via `Text(timerInterval:)` / `ProgressView(timerInterval:)`. Android Glance/Live Updates: no custom animation; progress via ProgressStyle. Designer-intended loops (walking gecko, breathing StandBy, island pulse) become static poses swapped on update.

---

## 4. Sound and haptics (feedback bus `src/motion/feedback.ts`)

One `impact(cueId)` call fires visual + haptic + SFX. Settings (3n-7): music on/volume, effects volume + categories (stickers & stamps, critter voices), quiet on the road (22:00–07:00 + temple POI geofence mute), haptics toggle, "Talk out loud".

**Audio rules:** SFX respect the silent switch (iOS `ambient` session) and quiet hours; TTS/voice mode use `playback` with ducking of music by −12 dB; music crossfades 1.5 s on guide change (landing); alarms and SOS bypass quiet hours; no background audio except voice mode in use and AlarmKit/Android alarm channel. Custom notification sounds per guide (≤ 30 s, bundled `.caf`/`.ogg`); Android one channel per category.

| Cue id | Type | Haptic (iOS / Android) | Moments |
|---|---|---|---|
| `thud.heavy` | SFX stamp thud | heavy impact / `CONFIRM`+heavy | Stamp slam, ISSUED, BOOSTED, MATCH, EXIT |
| `thud.soft` | soft thump | light impact | Crew cards, reply segments, forms land, offline card |
| `slap` | sticker slap | medium impact | Sticker slap-in, befriend, special stickers |
| `peel` | rip/peel | light | Translation labels, delete peel, attachment × |
| `whoosh` | whoosh | none | Fling, fly-to, paper plane |
| `tick` | tick | selection | Checklist ticks, OTP digits, keypad, odometer roll |
| `snap` | click | selection | Slider detents, 15-min snaps, segmented |
| `success` | chime | notification success | Valid code, settled, sent |
| `warning` | soft buzz | notification warning | Clash, new warning, dietary clash |
| `error` | thunk | notification error | Wrong code shake, locked shake, card declined |
| `vote` | pop | medium impact | Ballot, VS punch, +1 float |
| `bell` | bell once | light | Something new needs you |
| `holdRamp` | none | continuous ramp (Core Haptics / `Vibrator` composition) | Hold ring, encounter |
| `sos` | none | long continuous pattern | SOS break-through |
| `alarm` | guide alarm | system alarm | Leave-by alarm |
| `crack` / `pop` / `chirp` | egg crack, pop, critter chirp | medium, success | Egg hatch |
| `flap` | split-flap clatter | selection | Departures digits |
| `printer`, `scanner`, `shutter`, `pen`, `page`, `envelope` | ambient SFX | none | Receipts, scan, photo, strokes, page turn, feedback sent |
| `music.<guide>` | theme loop | — | Recap story, landing, settings preview |
| `voice.<guide>` | TTS | — | Phrase cards, voice mode, samples, narration |

Earcons for voice mode start/stop listening. All SFX mapped in `packages/design-tokens/src/sound.tokens.json`; assets in `apps/mobile/assets/sfx/`.

---

## 5. Accessibility rules

| Area | Rule |
|---|---|
| Contrast | Text ≥ 4.5:1 (large ≥ 3:1); UI outlines ≥ 3:1 (`border.control`); never ink.400 or rust small text for information; never cream on pink/blue |
| Colour-only signals | Tier dots/rings get glyph + word; overspend bar gets "over by $X"; countdown turning orange also changes label; map "you" dot has label; toggles announce On/Off |
| Dynamic Type / font scale | Body, rows, captions scale to AX3 (Android 200%); display/h1 scale at 0.5× factor with auto-fit (min scale .7, max 3 lines); mega numerals decorative with an accessible text twin; chips wrap; tab labels hide at largest sizes with long-press large-content viewer |
| Touch targets | ≥ 44 pt / 48 dp via hit slop |
| Reduce Motion (OS or in-app "Motion: full / reduced / off") | Spatial transitions → 200 ms cross-fade; no burst flash; idle loops static; impacts fade 150 ms, no jolt/shake, confetti omitted, haptic + SFX kept; informational motion instant; draw-on/typewriter final frame; story no push-in, auto-advance announced + pause control; fling shorter, no rotation |
| Screen readers | Generated labels: guide "{name}, {pose}"; critter "{name}, {form} form"; locked "Undiscovered local, found by being in {city}"; decorative icons hidden; composites grouped (passport, stamps, tickets, charts with text summary); MRZ hidden; live regions for countdown (interval), streaming guide text (on completion), toasts |
| Gesture alternatives | Slide-to-board → "Board" action; hold ring → custom action (delete → confirm dialog); drag-reorder → move up/down; timeline → time stepper; swipe/rate stacks → buttons; hold-to-talk → mic tap; shake-to-report → tile; every sheet has ✕ |
| Media | Captions/transcripts for narrated recap and voice replies; SOS long buzz + visual + VoiceOver announcement |
| Script font | "Plain text for guide" swaps Borel for Geist |
| Focus order | Declared per screen in reading order; focus ring = `ring.focus` |

---

## 6. Localisation typography

| Topic | Rule |
|---|---|
| Casing | Strings stored sentence case in Lingui catalogs; uppercase at render via `Intl`-aware transform (Turkish İ, German ß→SS, Greek accents dropped); no-op for CJK, Thai, Korean |
| Line-height per script | Latin display .86; Vietnamese and Thai display ≥ 1.0; CJK ≥ 1.15; body 1.4 all |
| Fallback stacks | Display: Archivo → Noto Sans CJK / Noto Sans Thai (Black/Heavy, no width axis, own size table ~0.85×); body: Geist → Noto Sans (script); mono: Geist Mono → Noto Sans Mono; voice: Borel (Latin, Vietnamese) → Noto Sans Thai italic (Thai) / OS face italic (CJK) |
| Condensed style | Uppercase-condensed applies to Latin + Vietnamese (with lh ≥ 1.0); CJK/Thai use heavy non-condensed display |
| Expansion | +40% budget: h1 auto-fits (40–52, then wraps to 3 lines); hero words single-line auto-fit per string (exonyms: Kioto, 京都, 교토); buttons wrap to 2 lines rather than truncate; tab labels shrink to 9 pt min then hide |
| Numbers & currency | ICU via `Intl`; three currencies (home, local, crew settlement) + display mode HOME/LOCAL/BOTH; currency formatted in UI locale with unambiguous symbol (S$, US$, ¥, Rp); compact notation per locale; IDR/JPY no decimals; offline FX shows rate date |
| Dates & times | Interval formatting for ranges; 12/24 h and km/mi setting; countdown units localised ("17D" → per locale) |
| Mixed-language | Guide local words wrapped `<local lang="id">Terima kasih</local>` for TTS and translator lock |
| Plurals | ICU MessageFormat plural/select/ordinal; LLM copy generated in user language keeping local words |
| MRZ | ICAO 9303 A–Z 0–9 `<` with transliteration; decorative |
| Direction | LTR UI; icons are real vector assets (mirror-aware) so RTL can be added; RTL phrase text renders correctly inside LTR |

---

## 7. Designing undesigned states and flows (D11)

Agents design these in code with existing components; founder reviews in the running app. Every screen must implement each applicable state below; add them to the screen's Maestro flow and a Storybook-style `__states__` fixture.

| State | Pattern | Copy voice | Components |
|---|---|---|---|
| Empty | Context guide sleeping/idle pose + h3 + one line + one primary action; never a blank list | Guide speaks in the voice font: "Nothing here yet. Want me to find something?" | `EmptyState`, `GuideLine`, `PillButton` |
| Loading | Skeletons with `tex.hatch` blocks matching final layout; > 2 s: guide thinking pose + `typing`; AI jobs use `ChecklistProgress` (fold transition) with real progress from pg-boss | "Pon's on it" | `Card`, `StreamText`, `ChecklistProgress` |
| Error | "Three ways forward" sheet (3i-4 pattern): retry, alternative path, back; never raw error codes; `shake` + `error` haptic only on user-caused errors | Plain, blame-free | `Sheet`, `RadioCard`, `PillButton` |
| Offline | `NO SIGNAL` status pill; writes land in `OutboxList` with clock icon, tick when synced ("SENDS WHEN YOU'RE BACK"); read-only surfaces show last-synced time; online-only actions (AI, purchases, supplier) disabled with "Needs signal" | Calm | `HeaderPills`, `OutboxList` |
| Stale | Data older than threshold shows "Updated {time}" + pull-to-refresh; forecasts/prices always timestamped | — | `caption` |
| Permission denied | Inline card explaining what is lost + "Open Settings" + a working fallback (manual location, type instead of scan, pick photos) — never a dead end | Guide explains benefit, no guilt | `ActionCard`, `PillButton` |
| Paywall-locked | Locked chip (PASS+ / BOOST badge) + teaser; tap → governed offer; quiet exit always; never locks safety or on-time features | Server-driven perk text | `StatusChip`, `TeaserPreview`, `LimitMeter` |
| Quota exhausted | 4b-1 limit meter pattern; ask-at-midnight option | — | `LimitMeter` |
| Partial / pending sync | Pending item at .55 opacity with bob avatar; conflict → `DiffRow` choose-one | — | `AvatarStack`, `DiffRow` |
| Destructive confirm | Hold ring or confirm sheet with consequences listed | — | `HoldRing`, `Sheet` |

**Undesigned flows** (master §11.2 list, e.g. returning sign-in, account merge, phone entry, start-a-crew, invite composer, trip switcher, solo trip, member-side setup, SOS sender, Help checklists, split editors, booking detail, item detail/add item, Map/Calendar plan views, gift purchase, Your plan states, widget/LA variants, web 404/500): compose from the nearest designed sibling screen (same header pattern, transitions, CTA stack); reuse its motion and copy tone; one primary CTA; guide line only where the guide acts.

**Android adaptations:** Material predictive back replaces edge-swipe (same visual pop); system back closes sheets; bottom sheets keep our styling; status/navigation bars edge-to-edge with ink scrim; tab bar keeps design (not Material nav bar) with 48 dp targets; haptics via `HapticFeedbackConstants`/`VibrationEffect` composition; no Dynamic Island → island toast drops from top; Live Updates replace LAs (§ product-decisions 4); widgets in Glance with baked art; full-screen alarm Activity uses the designed 5b-3 UI; themed icon (monochrome critter) instead of tinted variants; system fonts never replace Archivo/Geist.

---

## Unresolved questions

1. Designer sign-off on C5 guide colours and non-guide place colour cycling.
2. Member colour patterns for 7–16 members: ring pattern acceptable, or extend the palette?
3. Music themes for Ajo, Sardi, Paco and the critter "chirp" content spec — **answered, pending founder
   listening approval**: all sound/music is now composed in-house and procedurally (`@cp/sound-art`,
   `docs/decisions/20260927-in-house-procedural-audio.md`), including the critter chirp. Proposed
   styles for the 3 unnamed guides, for founder approval via the listening gallery
   (`packages/sound-art/gallery/index.html`): **Ajo** (Mexico City) — marimba lo-fi; **Sardi** (Lisbon)
   — fado-style plucked guitar waltz; **Paco** (Cusco) — Andean pan flute + charango.
4. Per-guide custom notification sounds: approve (App Store allows ≤ 30 s bundled sounds).
5. CJK/Thai display face choice (Noto Sans CJK Black vs a licensed heavy face).
