---
phase: 7
title: App shell, navigation, component library, a11y
status: in_progress
depends_on: [5, 6]
wave: 4
features: [F-004, F-027]
screens: [3b-2, 3b-6, 3d-3, 3f-5, 3l-4, 3n-6, 4e-1, 3m-3, 3a-1…3a-6, 3c-3…3c-7, 3i-2, 3i-4, 3n-2, 3n-8, all (shell + components)]
tasks: 18
owns: [apps/mobile/src/ui/ (except ui/sticker/ owned by the sticker renderer phase), apps/mobile/src/app/_layout.tsx, apps/mobile/src/app/(tabs)/_layout.tsx, apps/mobile/src/app/(modal)/_layout.tsx, apps/mobile/src/app/(trip)/_layout.tsx, apps/mobile/src/app/+not-found.tsx, apps/mobile/src/app/(dev)/_layout.tsx, apps/mobile/src/app/(dev)/gallery/, apps/mobile/src/lib/navigation/, apps/mobile/src/lib/a11y/, apps/mobile/src/lib/theme/, tools/design-renders/extract-doodles.ts, tools/design-renders/extract-parents.ts, e2e/shell/, e2e/gallery/]
---
# Phase 7 — App shell, navigation, component library, a11y

## Context links

| Source | Section |
|---|---|
| `docs/design-system.md` | §1 tokens, §2 component inventory (2.1–2.10; 2.11 native surfaces are other phases), §3.3 transitions + gestures, §5 accessibility, §6 localisation typography, §7 undesigned states + Android adaptations |
| `docs/code-standards.md` | §4 feature-module structure, §6 styling (`makeStyles`), §7 motion, §9 a11y, §12 routing, §17 testing, §20 DoD |
| `docs/system-architecture.md` | import rules (`src/ui` → motion, design-tokens, critter-art, lib, i18n), performance budgets |
| `docs/product-decisions.md` | C-resolutions touching shell (tab set HOME · TRIPS · FAB · WALLET · PASS), entitlement badges (PASS+/BOOST), D11 undesigned flows |
| Reports | design-system-prototype report §1.6 scenarios / 12 state groups, §1.7 PARENT map + deep-link back stacks, component catalogue; mobile-framework report (expo-router, custom transitions, GH3, predictive back); master §2 F-004/F-027, risk R18 |
| Renders | `docs/design-renders/screens/3b-2_Home.png` (tab bar + FAB), `3d-3_Place_detail.png` (sheet + zoom), `4e-1_Paywall.png` (rise), `3f-5_Slide_to_board.png`, `3l-4_Encounter.png` (hold ring), `3a-6_Pass_issued.png` (document artefacts); `screens.json` MOTION captions |

## Overview

Goal: the navigable app skeleton (root providers, route groups, custom tab bar + guide FAB, the 10 transitions, sheets with detents and drag-dismiss, edge-swipe back, shared-element grow, back-stack synthesis) plus the full `src/ui` component library with every applicable state, an in-app gallery and the accessibility layer.
Done when: every §2.1–2.10 component (except `Sticker`, owned by the sticker renderer phase, and map components, owned by the map platform phase) renders in the dev gallery with state fixtures, passes RNTL a11y queries at default and AX3 font scale and under Reduce Motion; the shell navigates tabs, sheets, rises and zooms with the specified motion on iOS and Android; Maestro `e2e/shell` and `e2e/gallery` pass on both platforms.

## Requirements

### F-004 Nav shell
| Aspect | Requirement |
|---|---|
| Root | `_layout.tsx`: fonts ready (phase 3), `I18nRoot`, theme (dark + increase-contrast), GestureHandlerRootView, `OverlayHost` + `ScreenJoltProvider` + island toast host (phase 6), safe-area, error boundary with "three ways forward" sheet; auth/onboarding gates as layout redirects driven by a session hook supplied by the auth phase (`useSessionGate()` interface defined here, default = signed-out → onboarding route) |
| Groups | `(tabs)` (HOME · TRIPS · FAB · WALLET · PASS), `(modal)` (sheets + rises), `(trip)` (trip-day stack), `(dev)` (gallery + motion lab + sticker lab + spikes; excluded at build time by the phase-1 dev-route exclusion (phase 1: Metro `blockList` on `src/app/(dev)/**` for `APP_VARIANT=production` + `check-release-bundle` CI gate); `(dev)/_layout.tsx` is not a security guard) |
| Tab bar | Custom 5-slot bar (88 incl. safe area), active tab yellow, inactive ink.300, icon bounce on select (`tab` transition: fade 240 + children ty 12→0 420), badges; labels shrink to 9 pt then hide at largest text sizes with long-press large-content viewer; Android keeps design with 48 dp targets |
| Guide FAB | 66 pt, raised −30, 5 pt ink ring, shows the context guide sticker (guide of the current trip/destination; default Tokek). Tap → guide sheet route; long-press (320 ms) → Help hub route; a11y actions "Ask {guide}" / "Get help" |
| Transitions | push (480 / pop 420), sheet (540, presenter scale .93, scrim .45, dismiss 420), rise (620, delay 120), zoom (shared-element grow radius 22→54, 560, +200 ms hop pre-beat on stickers; unzoom 460), burst (s 1.2→1 + flash .55, 640), fold (560, AI-job handoff), flip (680, perspective 1600), tab, fade (300 / 260), unfade — all from motion tokens; reduced → 200 ms cross-fade, no flash |
| Sheets | Detents large (.87) / medium / fit; grabber; drag-dismiss grab zone top 110 (sheet) / 160 (rise), commit dy > 150 or v > .55; mandatory ✕; keyboard-aware; nested scroll hand-off; Android system back closes |
| Back | Edge-swipe from x < 28, commit dx > 110 or v > .55 pt/ms, settle 300; Android predictive back (system, default on targetSdk 36) with same visual pop |
| Edge-to-edge (Android) | targetSdk 36 enforces edge-to-edge: tab bar, FAB, sheets, rise modals and island-toast banner pad by `useSafeAreaInsets()` (bottom = nav-bar inset, top = status bar); tab bar keeps its design height above the inset; sheet grab zone and ✕ stay clear of the status bar; scroll content ends above tab bar + inset. Fixtures cover gesture navigation and 3-button navigation |
| Shared element | Teleport overlay: measure source card, render clone in `OverlayHost`, animate to destination layout, hand off; works across push and sheet |
| Back-stack synthesis | Prototype `PARENT` map (extracted from `design/Critterpass Prototype.dc.html`) → `parentOf(screenId)`; `synthesizeStack(targetHref)` builds the stack when entered cold (deep link, push, widget, LA) e.g. 3c-9→3c-7→3c-6→3c-5→3c-3→3c-2→Home, 3k-10→3g-4→3g-1→Home, 4e-1→Home. The link router phase calls it |
| State restoration | Navigation state persisted (MMKV) and restored on cold start when < 30 min old and not a deep-link launch |
| State groups | The prototype's 12 state groups become gallery/state fixtures (`__states__`) so each designed state is reviewable |

### F-027 Accessibility layer
| Aspect | Requirement |
|---|---|
| Dynamic Type | Body/rows/captions scale to AX3 (Android 200 %); display/h1 scale at 0.5× with auto-fit (min .7, max 3 lines); mega numerals decorative with accessible text twin; chips wrap; buttons wrap to 2 lines, never truncate primary actions |
| Doodle labels | Doodle icons (`design/doodles.js`) extracted to vector components with a label registry: decorative → hidden; meaningful → localised label; guide "{name}, {pose}", critter "{name}, {form} form", locked "Undiscovered local, found by being in {city}" |
| Gesture alternatives | Every gesture component wires phase-6 `accessibilityActions`: slide-to-board → "Board", hold ring → action (destructive → confirm), drag-reorder → move up/down, timeline → time stepper, swipe/rate stacks → buttons, hold-to-talk → mic tap, every sheet ✕ |
| Live regions | Countdown (interval announcements), streaming text (on completion), toasts, SOS |
| Contrast / colour-only | Tier glyph + word; overspend label; countdown label change with colour; toggles announce On/Off; increase-contrast token variants |
| Focus | Declared reading order helper; `ring.focus` for keyboard/switch focus; grouped composites (passport, stamps, tickets, charts with text summary); MRZ hidden |
| Settings | "Plain text for guide" (Caveat → Geist italic) and in-app Motion setting consumed; the You phase renders the toggles |

### Component library (`src/ui`, design-system §2)
All components: token-only styling via `makeStyles`, localised strings (Lingui `common`), press/gesture kit from phase 6, `accessibilityRole` + labels + state, RTL-safe `start`/`end`, each applicable §7 state (empty, loading skeleton with `tex.hatch`, error, offline `NO SIGNAL` + `OutboxList`, stale, permission denied, paywall-locked, quota exhausted, pending sync, destructive confirm) as reusable pieces. Feature phases compose these; data wiring stays in `src/features/<area>`.

Undesigned states/flows to design in code here: web-style 404 in app (`+not-found` → safe home with guide line), gallery screen itself, error "three ways forward" generic sheet, offline banner behaviour on shell, tab bar with 0 trips (TRIPS shows empty state), FAB when no guide context.

## Architecture & contracts

| Item | Delta |
|---|---|
| DB / sync / commands / channels / jobs / push | None. Shell reads session + active trip through hooks defined as interfaces here (`useSessionGate`, `useActiveGuide`) and implemented by the auth and trip phases; defaults are real (signed-out gate, Tokek) not fakes |
| Navigation lib | `src/lib/navigation/{parents.ts (generated),screen-registry.ts,synthesize-stack.ts,transitions.ts,restore.ts}`; `screen-registry` maps design screen ids → typed hrefs; area phases add their entries in their own `src/features/<area>/routes.ts` registered via `registerScreens()` (no edits to shared files) |
| Theme | `src/lib/theme/{make-styles.ts,theme-provider.tsx,use-contrast.ts}` |
| Doc delta | code-standards §12 lists `(tabs)`, `(modal)`, `(trip)`; this phase adds `(dev)` (dev builds only). Map components (`MapView`, `MapPin`, `RouteLine`, `PlaceCarousel`) are owned by the map platform phase; `Sticker` family by the sticker renderer phase — design-system §2 lists them under `src/ui` (record owner split) |

## Tasks

### T1 — Theme, Text, primitives, gallery registry
- Goal: foundation every component uses, and the gallery skeleton.
- Files: `apps/mobile/src/lib/theme/*`, `apps/mobile/src/ui/{index.ts,text/Text.tsx,text/auto-fit.ts,layout/{Stack,Row,Spacer}.tsx,surface/Scaffold.tsx}`, `apps/mobile/src/ui/gallery/{registry.ts,types.ts}`, `apps/mobile/src/app/(dev)/_layout.tsx`, `apps/mobile/src/app/(dev)/gallery/{index.tsx,[component].tsx}`, `apps/mobile/src/ui/__tests__/text.test.tsx`.
- Steps: 1. `makeStyles((t) => …)` with theme + increase-contrast. 2. `<Text variant>` uses `fontFor(variant, locale)`, upper-at-render, tabular numerals, Dynamic Type caps, auto-fit. 3. `Scaffold` variants dark/paper/colourHero/scene/map with status-bar style. 4. Gallery registry: `registerFixture(component, stateName, render)`; list + detail screens with locale, font-scale, motion-mode and contrast switchers. 5. `(dev)` group guarded by `__DEV__`/build profile.
- Tests: `pnpm --filter @cp/mobile jest src/ui/__tests__/text`.
- Done when: h1 auto-fits in en-XA pseudo-locale at AX3 within 3 lines; gallery lists Text fixtures.
- Status: done — fd124c3, 99f1fb8

### T2 — Doodle icons, textures, rings, surfaces
- Goal: vector doodle icon set with label registry; Skia textures; cards/surfaces.
- Files: `tools/design-renders/extract-doodles.ts`, `apps/mobile/src/ui/icons/{generated/*.tsx,labels.ts,Icon.tsx}`, `apps/mobile/src/ui/textures/{halftone,guilloche,hatch,engraving,barcode,rays,holo,sheen}.tsx`, `apps/mobile/src/ui/cards/{Card,ListCard,TileGrid,HeroPanel,CountdownCard,ActionCard,SuggestionCard,DashedAddCard,CrewCard}.tsx`, fixtures, `__tests__/icons.test.tsx`.
- Steps: 1. Extract paths from `design/doodles.js` (read-only) into `react-native-svg` components; mirror-aware flag. 2. Label registry (decorative vs labelled, Lingui ids). 3. Texture shaders from `texture` tokens (Skia `RuntimeEffect` / patterns). 4. Cards with `slideOff` for `ActionCard`.
- Tests: `pnpm tsx tools/design-renders/extract-doodles.ts --check`; `pnpm --filter @cp/mobile jest src/ui/__tests__/icons`.
- Done when: every doodle has a registry entry; decorative icons hidden from a11y tree.
- Status: done — 747e33c (extractor ships as tools/design-renders/extract-doodles.mjs)

### T3 — Root layout, route groups, tab bar, guide FAB
- Goal: navigable skeleton with the custom tab bar.
- Files: `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/app/(tabs)/_layout.tsx`, `apps/mobile/src/app/(modal)/_layout.tsx`, `apps/mobile/src/app/(trip)/_layout.tsx`, `apps/mobile/src/app/+not-found.tsx`, `apps/mobile/src/ui/shell/{TabBar,GuideFab,TabIcon}.tsx`, `apps/mobile/src/lib/navigation/{gates.ts,active-guide.ts}`, `__tests__/tab-bar.test.tsx`, `e2e/shell/tabs.yaml`, `e2e/shell/edge-to-edge.yaml`.
- Steps: 1. Providers order per Requirements. 2. Gate interfaces with real defaults. 3. TabBar: 5 slots, FAB centre, badges, bounce, large-content viewer. 4. FAB tap/long-press resolve the guide sheet and Help hub hrefs through the screen registry (routes owned by the guide and help phases); while a route is unregistered the action is hidden from the FAB, never pointed at a stub screen. 5. Tab screens themselves belong to area phases; this task ships the layout plus registry lookups.
- Tests: `pnpm --filter @cp/mobile jest src/ui/shell` (inset fixtures: gesture nav, 3-button nav); `maestro test e2e/shell/tabs.yaml e2e/shell/edge-to-edge.yaml` (Android emulator in gesture and 3-button modes).
- Done when: tabs switch with `tab` transition; FAB long-press fires help route lookup; tab labels hide at max text size; tab bar and FAB clear the Android nav bar in both navigation modes.
- Status: done — 74f537e

### T4 — Transitions, sheets, rise, edge-swipe, predictive back
- Goal: the 10 transitions and sheet system.
- Files: `apps/mobile/src/lib/navigation/transitions.ts`, `apps/mobile/src/ui/sheet/{Sheet,RiseModal,Grabber,CloseButton,SheetScrollView}.tsx`, `apps/mobile/src/ui/shell/{BackEyebrow,LargeTitle,HeaderPills,HomeHeader}.tsx`, `__tests__/sheet.test.tsx`, `e2e/shell/sheets.yaml`.
- Steps: 1. expo-router Stack `screenOptions` + custom interpolators per transition using motion tokens. 2. Sheet with detents, presenter scale .93, scrim, drag-dismiss thresholds (phase-6 `dragDismiss`), nested scroll hand-off, keyboard avoidance. 3. Edge-swipe back via phase-6 `edgeSwipe` on iOS; Android predictive back enabled (`enableOnBackInvokedCallback`). 4. Reduced → cross-fade.
- Tests: `pnpm --filter @cp/mobile jest src/ui/sheet`; `maestro test e2e/shell/sheets.yaml` (iOS + Android).
- Done when: detent snap, drag-dismiss commit/cancel and ✕ verified; Android back closes sheet.
- Status: done — 13a22d0

### T5 — Shared-element grow (teleport overlay), burst, fold, flip
- Goal: zoom card→detail and remaining special transitions.
- Files: `apps/mobile/src/ui/transitions/{SharedGrow.tsx,use-shared-source.ts,Burst.tsx,Fold.tsx,Flip.tsx}`, `__tests__/shared-grow.test.tsx`, `e2e/shell/zoom.yaml`.
- Steps: 1. `useSharedSource(id)` registers card layout; destination `SharedTarget id` measures; clone animates in `OverlayHost` (radius 22→54, fade first 35 %, sticker hop pre-beat). 2. Unzoom on back using stored source rect (fallback: fade if source unmounted). 3. Burst flash, fold, flip per tokens.
- Tests: `pnpm --filter @cp/mobile jest src/ui/transitions`; `maestro test e2e/shell/zoom.yaml`.
- Done when: gallery demo card → detail → back animates both ways at 60 fps on mid Android (Perf monitor note in PR).
- Status: done — 0b05930

### T6 — Back-stack synthesis, screen registry, state restoration
- Goal: cold entries build the right back stack.
- Files: `tools/design-renders/extract-parents.ts`, `apps/mobile/src/lib/navigation/{parents.ts,screen-registry.ts,synthesize-stack.ts,restore.ts}`, `__tests__/synthesize-stack.test.ts`.
- Steps: 1. Extract `PARENT` map from `design/Critterpass Prototype.dc.html` into generated `parents.ts`. 2. `registerScreens({ '3c-9': href, … })` API for area phases. 3. `synthesizeStack(screenId, params)` walks parents to Home, skipping unregistered ids. 4. Navigation state persistence rules.
- Tests: `pnpm --filter @cp/mobile jest src/lib/navigation`.
- Done when: tests reproduce the report's example chains (3c-9…Home, 3k-10…Home, 3m-3…3m-1, 4e-1→Home).
- Status: done — 7550403

### T7 — Buttons & inputs
- Goal: §2.2 family.
- Files: `apps/mobile/src/ui/buttons/{PillButton,SplitCtaRow,InlineAction,IconButton}.tsx`, `apps/mobile/src/ui/inputs/{TextField,SearchField,CodeBoxes,Keypad,Toggle,Segmented,RadioCard,Slider,RangePrivateMarkers,SegmentBudget,SlideToConfirm,HoldRing,SettingsGroup,LanguageRow}.tsx`, fixtures, `__tests__/inputs.test.tsx`.
- Steps: 1. PillButton variants incl. sheen, label flap, loading, disabled. 2. CodeBoxes (drop digits, valid green, shake + `error` on invalid, 4-4-4 gift code). 3. Keypad with odometer amount. 4. SlideToConfirm/HoldRing via phase-6 hooks + a11y actions. 5. Toggle squash knob, On/Off value.
- Tests: `pnpm --filter @cp/mobile jest src/ui/__tests__/inputs`.
- Done when: RNTL `getByRole` finds each control with state; a11y actions trigger commit paths.
- Status: done — 3ddb694

### T8a — Chips, badges, people, LiveSticker
- Goal: §2.3 and §2.4 (minus Sticker rendering) plus the motion-wired sticker.
- Files: `apps/mobile/src/ui/chips/*.tsx` (ChoiceChip, FilterChip, QuickActionChip, InfoPill, StatusChip, CountBadge, TierLabel, StatChipRow, TiltedSticker), `apps/mobile/src/ui/people/{Avatar,AvatarStack,CritterAvatar,EmptySeat,GuideLine,SilhouetteSlot,LiveSticker}.tsx`, `apps/mobile/src/ui/people/use-blink.ts`, fixtures, `__tests__/chips-people.test.tsx`.
- Steps: 1. Member colour + ring pattern for members 7–16. 2. TierLabel glyph + word. 3. GuideLine Caveat in guide colour; plain-text setting. 4. `LiveSticker` = sticker-phase `<Sticker>` + motion `draw` pattern (`drawGate`, ≤ 2 concurrent, 1500/700 ms, delay, tap replay) + `use-blink` on the shared idle clock (150 ms swap every 2.6–6.2 s; paused off-screen, background, Reduce Motion).
- Tests: `pnpm --filter @cp/mobile jest src/ui/__tests__/chips-people`.
- Done when: fixtures + a11y labels for every listed component; LiveSticker tests: 3rd draw-on queued, blink paused under Reduce Motion and off-screen.
- Status: done — 11668ea

### T8b — State components
- Goal: every design-system §7 state as a reusable component.
- Files: `apps/mobile/src/ui/states/{EmptyState,Skeleton,ErrorSheet,OfflinePill,OutboxList,StaleCaption,PermissionCard,LockedTeaser,LimitMeter,PendingSync,ConfirmSheet,ChecklistProgress}.tsx`, fixtures, `__tests__/states.test.tsx`.
- Steps: 1. State components per §7 table. 2. Skeleton with `tex.hatch`. 3. ErrorSheet "three ways forward".
- Tests: `pnpm --filter @cp/mobile jest src/ui/__tests__/states`.
- Done when: every §7 state has a component + gallery fixture.
- Status: done — aeb0a09

### T9 — Document artefacts
- Goal: §2.6 family.
- Files: `apps/mobile/src/ui/documents/{PassportCover,PassportPage,PaperChrome,Stamp,Ticket,Visa,Receipt,Postcard,ManifestCard,GiftCard,WalletStack,SignatureLayer}.tsx`, fixtures, `__tests__/documents.test.tsx`.
- Steps: 1. Guilloche/engraving/barcode textures. 2. Stamp round/rect/dashed pending with `stamp` pattern; ink per context (C7). 3. Ticket notch + tear line; Postcard flip; Receipt zig-zag with highlighted OCR lines prop. 4. MRZ decorative and hidden from a11y; composites grouped with one label.
- Tests: `pnpm --filter @cp/mobile jest src/ui/__tests__/documents`.
- Done when: fixtures render in all locales incl. vi/ja; screen reader reads one grouped label per artefact.
- Status: done — fd298bb

### T10 — Data & numbers
- Goal: §2.7 family with text summaries.
- Files: `apps/mobile/src/ui/data/{SegmentedProgress,LinearBar,ProgressRing,Donut,MonthBars,HourlyCrowd,BalanceBars,DayBarsVsPlan,WeatherStrip,CalendarHeatmap,PollBars,Countdown,Odometer,SplitFlap,CountUp,StreamText}.tsx`, fixtures, `__tests__/data.test.tsx`.
- Steps: 1. Skia or SVG charts with `barGrow`. 2. `accessibilityLabel` summaries generated per chart. 3. Countdown dhms/hms/ms with localised units + live region interval. 4. StreamText word-buffered, reserves final box, announces on completion.
- Tests: `pnpm --filter @cp/mobile jest src/ui/__tests__/data`.
- Done when: every chart exposes a text summary; countdown label changes with its colour state.
- Status: done — c72c948

### T11a — Planning and voting
- Goal: §2.8 plan + vote families.
- Files: `apps/mobile/src/ui/plan/{DayRow,DayTimeline,DiffRow,MustDoRow,RoomAssign}.tsx`, `apps/mobile/src/ui/vote/{VoteBoard,SplitShowdown,ResultTally,SwipeStack,RateStack,LiveOptionCards,IdeaVoteBox,MoodPicker}.tsx`, fixtures, `__tests__/plan-vote.test.tsx`.
- Steps: 1. DayTimeline 07–19 grid, 15-min snap (`snap` cue), rain band, ghost suggestion, time-stepper alternative. 2. DiffRow ✓/✕. 3. SwipeStack/RateStack with buttons. 4. Presence cursor on LiveOptionCards.
- Tests: `pnpm --filter @cp/mobile jest src/ui/__tests__/plan-vote`.
- Done when: every gesture component has its button/stepper alternative tested.
- Status: done — 644fa82

### T11b — Chat and story
- Goal: §2.8 chat family plus `StoryPlayer`, `StepTabs`, `PageDots`, `Composer`.
- Files: `apps/mobile/src/ui/chat/{ChatMessage,ChatRichCard,ReactionFloats,FormatPicker,AttachmentThumb,Composer}.tsx`, `apps/mobile/src/ui/story/{StoryPlayer,StepTabs,PageDots}.tsx`, fixtures, `__tests__/chat-story.test.tsx`.
- Steps: 1. Chat bubbles radius spec, reaction floats, composer. 2. StoryPlayer 5 s segments, tap zones, hold-to-pause, visible pause, captions, reduced (no push-in, announced advance).
- Tests: `pnpm --filter @cp/mobile jest src/ui/__tests__/chat-story`.
- Done when: fixtures + a11y for each component; story hold-to-pause has a pause-button alternative tested.
- Status: done — 997e0e6

### T12a — Trip-day, money, camera presentational components
- Goal: §2.9 (excluding map family) trip/money/camera components.
- Files: `apps/mobile/src/ui/trip/{EtaList,CrewRail,LeaveByHero,PackingChips,TimelineList,PhraseCard,EmergencyTiles,WatchRow,ImportTiles,ParsedBookingCard,SupplierCard}.tsx`, `apps/mobile/src/ui/money/{SettleRow,PayMethodChips}.tsx`, `apps/mobile/src/ui/camera/{Viewfinder,ScanOverlay,ArLabels,VoiceOrb}.tsx`, fixtures, `__tests__/trip-money-camera.test.tsx`.
- Steps: 1. Presentational props only (feature phases bind data). 2. `SupplierCard` renders verbatim supplier fields + attribution + affiliate disclosure slot; no caching props. 3. `Viewfinder`/`ScanOverlay` accept a camera child (vision-camera wired by feature phases). 4. `VoiceOrb`/`waveform` take an audio-level shared value.
- Tests: `pnpm --filter @cp/mobile jest src/ui/__tests__/trip-money-camera`.
- Done when: all listed components have fixtures and a11y labels; no feature data imports in `src/ui`.
- Status: done — 6792244

### T12b — Critter presentational components
- Goal: §2.10 critter family.
- Files: `apps/mobile/src/ui/critters/{DexHeader,HereNowForms,LegendaryBanner,SetGrid,CritterDetail,FormSelector,EncounterCard,WanderFootprints,BefriendReveal,MonthStrip,QuestCard,Egg,StickerShelf}.tsx`, fixtures, `__tests__/critters.test.tsx`.
- Steps: 1. Presentational props only; stickers via `LiveSticker` / `<Sticker>`. 2. Locked/legendary states with tier glyph + word.
- Tests: `pnpm --filter @cp/mobile jest src/ui/__tests__/critters`.
- Done when: all listed components have fixtures and a11y labels (locked label per F-027).
- Status: done — febcab3

### T12c — Recap and monetisation presentational components
- Goal: §2.10 recap + monetise families.
- Files: `apps/mobile/src/ui/recap/{RecapStatTiles,AwardsGrid,RouteRider,GotAway,StampSpread,MemoryHero}.tsx`, `apps/mobile/src/ui/monetize/{VisaPaywall,ComparisonTable,PlanRadioRows,BillingToggle,PerksChecklist,SeatsRow,TeaserPreview,PauseBars,KeptPausedChips}.tsx`, fixtures, `__tests__/recap-monetize.test.tsx`.
- Steps: 1. Presentational props only. 2. `PerksChecklist` renders server-driven perk list prop. 3. Prices passed in as store-localised strings (no literals).
- Tests: `pnpm --filter @cp/mobile jest src/ui/__tests__/recap-monetize`.
- Done when: all listed components have fixtures and a11y labels; no feature data imports in `src/ui`.
- Status: done — 6553cf5

### T13 — Accessibility layer + audits
- Goal: cross-cutting a11y utilities and automated checks.
- Files: `apps/mobile/src/lib/a11y/{labels.ts,live-region.ts,focus-order.ts,large-content.ts,use-font-scale.ts,announce.ts}`, `apps/mobile/src/ui/__tests__/a11y-audit.test.tsx`, `e2e/gallery/a11y-smoke.yaml`.
- Steps: 1. Label generators (guide, critter, locked). 2. Live region helper (iOS announcement / Android `accessibilityLiveRegion`). 3. Audit test iterates every gallery fixture: role present, label present for interactive, hit target ≥ 44/48, renders at font scale 2.0 without overflow of primary action, reduced-motion render. 4. Contrast checker on fixture props against token pairs.
- Tests: `pnpm --filter @cp/mobile jest src/ui/__tests__/a11y-audit`; `maestro test e2e/gallery/a11y-smoke.yaml`.
- Done when: audit passes for 100 % of fixtures.

### T14 — Gallery completion + Maestro visual sweep
- Goal: founder-reviewable gallery and regression screenshots.
- Files: `apps/mobile/src/app/(dev)/gallery/{states.tsx,shell-demo.tsx}`, `e2e/gallery/{sweep.yaml,states.yaml}`, `e2e/shell/deep-cold-entry.yaml`.
- Steps: 1. State-group view: the 12 prototype state groups as fixture sets. 2. Shell demo exercising every transition. 3. Maestro sweep in motion-freeze mode with `assertScreenshot` per fixture on iOS + Android (baselines committed). 4. Cold-entry flow: open a registered screen via dev deep link → back walks synthesized stack.
- Tests: `maestro test e2e/gallery/ e2e/shell/`.
- Done when: sweeps pass on both platforms; baselines committed.

## Phase acceptance criteria

- [ ] Shell: tabs, FAB tap/hold, push/sheet/rise/zoom/burst/fold/flip/tab/fade transitions work on iOS + Android; reduced motion cross-fades
- [ ] Sheets: detents, drag-dismiss, ✕, Android system back
- [ ] Back-stack synthesis tests reproduce PARENT chains
- [ ] Every design-system §2.1–2.10 component (minus Sticker and map family) exists with gallery fixtures and §7 states
- [ ] a11y audit green for all fixtures at font scale 1.0 and 2.0; gesture alternatives present
- [ ] No hex/number style literals, no unlocalised strings in `src/ui` (lint)
- [ ] `(dev)` routes absent from release bundle (`check-release-bundle` green)
- [ ] Android edge-to-edge: shell clears nav bar in gesture and 3-button modes
- [ ] Maestro `e2e/shell`, `e2e/gallery` green on both platforms

## Risks & rollback

| Risk | Mitigation / rollback |
|---|---|
| expo-router custom transitions limited for presenter scale/zoom | Implement sheet/rise as in-screen overlays over a transparent modal; shared grow via overlay (independent of native stack) |
| Component volume exceeds session size | Tasks pre-split by family (T8a/b, T11a/b, T12a/b/c), ≤ ~15 components each |
| Screenshot flakiness across devices | Motion-freeze mode, fixed simulator models, tolerance threshold |
| Predictive back conflicts with custom sheet gestures | Sheet registers `BackHandler` first; fallback to non-predictive for sheets |

## Non-code dependencies

| Dependency | If not ready |
|---|---|
| Founder review of gallery (D11) | Components ship as designed; review feedback lands as follow-up tasks in the owning phase |
| Designer sign-off C5 colours | Tokens as specified |

## Open questions

1. Doc delta: `(dev)` route group (build-time excluded via Metro blockList) — add to code-standards §12.
2. Doc delta: owner split — `Sticker` family (sticker renderer phase) and map family (map platform phase) live outside this phase though listed in design-system §2.
3. Navigation restore window — default 30 min, skipped on deep-link launches.
4. FAB guide when no trip context — default Tokek (brand default guide); confirm.
5. iPad — not a target (portrait phone layout only); confirm.
