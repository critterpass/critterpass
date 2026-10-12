# Current mobile app inventory: how to keep the old UI as legacy

Source: `origin/main` at `fc1a78d21` (polish batch two, #885), read-only worktree `/Users/quocs/Projects/critterpass-worktrees/deploy` (`$R`). Paths below are under `$R/apps/mobile/src` unless they start with `$R`. Counts come from grep/find/wc and leave out tests and `__tests__` unless a line says otherwise.

## 1. Routes, shell, presentation, transitions

**Route files are thin.** There are 310 `.ts/.tsx` files under `app/`. 93 of them are `(dev)` files (7,518 LOC). The other 190 route `.tsx` files hold 3,151 LOC, about 17 lines each. 164 files are 15 lines or fewer, 99 are 16–40 lines, and only 11 non-dev routes go over 30 lines. Each of those is a small composition: `explore/map.tsx` (45, switches between the map and list screens), the guide modals `(modal)/guide/{voice,camera,practice,[threadId]}` (33–52), and `+not-found.tsx` (80). A typical route reads params and renders one feature screen, for example `(tabs)/index.tsx` → `HomeScreen` and `(trip)/[tripId]/plan/map.tsx` → `TripMapScreen`. Code standards §4 sets the rule: "Route files … only compose feature screens (≤40 lines, no logic)". There are 29 `_layout.tsx` files.

**Root `_layout.tsx` (316 LOC)** wraps the app in this order: GestureHandlerRootView, `I18nRoot`, font prewarm, `ThemeProvider`, `AnalyticsProvider`, `AppSessionRoot`, `TravelDataReaderProvider`, `MemberFacesRoot`, `ScreenJoltProvider`, `TouchQuietRoot`, `RootNavigator`. Hosts sit above the screens: `DeferredLinkGate`, `SessionBridges` (8 runtimes), `PassSync`, `OverlayHost` (Skia), `PrimerSheetHost`, `SharedGrowHost`, `IslandToast`, `DevToolsShake`, `ShakeToReport`, `LaunchHatch`.
- It imports about 30 feature `register`/`routes` modules for their side effects, and `features/planning-register.ts` comes last. Those modules fill the screen registry (see §7).
- The navigator is `Stack` from **`expo-router/js-stack`**, the JS stack, not native-stack. Its options are `pushTransition(motion, reduced)`, `(modal)` uses `modalGroupOptions()`, and `SHEET_GROUPS` use `sheetGroupOptions`. The navigation theme is DarkTheme with ink colours.
- `useNavigationPersistence` restores navigation keyed by build and update id (`lib/navigation/restore.ts`, 270 LOC; `restore-filter.ts` skips sheets).

**Tabs.** `(tabs)/_layout.tsx` (14 LOC) renders `ui/shell/ShellTabs.tsx` (38 LOC), which is `Tabs` from **`expo-router/js-tabs`** with a custom `tabBar`. It handles the session gate redirect (`lib/navigation/gates.ts`) and the `tabTransition` fade. The bar itself is `ui/shell/TabBar.tsx` (251 LOC) with `TAB_ROUTES = index | trips | wallet | pass`, and `GuideFab.tsx` (159 LOC) is mounted inside it. Related files: `tab-bar-metrics.ts`, `TabIcon.tsx`, `tab-icon-art.ts`. `useTabBarInset()` is exported from TabBar. The shell also owns `HomeHeader` (306), `LargeTitle`, `BackButton`, `BackEyebrow`, `HeaderPills` and `RootErrorBoundary`.

**Sheets and modals are all custom JS. Nothing uses native presentation.** No file uses `formSheet`, native-stack or NativeTabs.
- `(modal)/_layout.tsx` is a `SessionGate` around a js-stack with `presentation: 'transparentModal'`, a transparent card, gestures off and `forSelfAnimated` (`lib/navigation/transitions.ts`, 178 LOC). The 21 `(modal)` routes animate themselves through `ui/sheet/Sheet.tsx` / `RiseModal.tsx` and `use-modal-presentation.ts`. That hook owns the grabber, the nested-scroll hand-off, the 0.93 scale of the screen behind (`presenter.ts`), the scrim, the keyboard inset and Android back.
- Sheets outside `(modal)` are listed once in `lib/navigation/sheet-routes.ts` (`SHEET_SCREENS`, 8 navigators, about 15 routes). That list drives the per-group transparent card and the restore filter.
- Usage: 104 files render `<Sheet>`, 5 render `<RiseModal>`, 8 use the map sheet (`map-sheet.tsx`, `use-map-sheet.ts`). 117 feature/app files import `@/ui/sheet`.

**Custom transitions.**
- `lib/navigation/transitions.ts` has `forPush` and `forCrossFade` (reduced motion), `tabTransition` (fade, 200 ms when reduced), `EDGE_SWIPE_START_PT = 28` and `modalGroupOptions`.
- `ui/transitions/` (605 LOC) has `SharedGrow` with a root-mounted host plus `use-shared-source`, `Burst` and `Fold`.
- `src/motion/` (380 importer files outside motion) has the `feedback` bus (haptic, sound, animation), `overlay/OverlayHost` (Skia fly-to), `island-toast`, `patterns/` (23 patterns: thud/screen jolt, stamp, confetti, odometer, split-flap…), `gestures/` (drag-dismiss, drag-snap, edge-swipe, swipe-deck, reorder, slide-to-confirm…), a `dsl/` compiler, `music`, `motion-mode` and `device-tier`.

## 2. Logic versus presentation in `src/features/*`

**Layering is clean.** `data/**` and `lib/**` never import `@/ui` or `@/features` (0 files). `ui/**` never imports `@/features` (0 files). Features import each other 143 times. `tools/lint/boundaries.js` enforces the layer rules. A new UI can therefore reuse all of `src/data` (powersync, commands/`use-command`, plan model, money, places, travel-data…) and `src/lib` (navigation, i18n, permissions, analytics/flags, location, fonts, theme settings) without change.

**How features are split.** There are 159 `*screen.tsx` and 132 `*view.tsx` files.
- `*-screen.tsx` is usually the container: hooks, `useCommand`, `useLiveRows` SQL, `useLocalFirst`. An example is `you/account/delete-screen.tsx`, which holds SQL, a command and services.
- `*-view.tsx` is usually props-only presentation.
- Pure logic sits in `.ts` modules named `use-*.ts`, `*-model.ts`, `queries.ts`, `commands.ts`, `data/`, `routes.ts` and `register.ts`.

Per feature, excluding tests and `dev/`: `ts` = logic modules (.ts), `hooks` = `use-*`, `tsx` = presentation files, `tsx+data` = tsx files that touch data directly (`@/data`, `useCommand`, SQL, `useLocalFirst`), and `…of them screens` = how many of those are named `*screen*`.

| feature | ts | hooks | tsx | tsx+data | …of them screens | dev scenes | tsx LOC | ts LOC | presentation share |
|---|---|---|---|---|---|---|---|---|---|
| plan | 163 | 33 | 112 | 42 | 14 | 13 | 19,429 | 16,709 | 53% |
| explore | 118 | 35 | 100 | 32 | 12 | 12 | 15,917 | 11,641 | 57% |
| crew | 61 | 22 | 74 | 13 | 5 | 1 | 9,076 | 4,996 | 64% |
| bookings | 59 | 10 | 57 | 15 | 8 | 8 | 9,212 | 4,757 | 65% |
| trip | 61 | 7 | 54 | 18 | 10 | 10 | 9,264 | 7,408 | 55% |
| setup | 53 | 8 | 52 | 9 | 2 | 0 | 8,776 | 4,549 | 65% |
| you | 62 | 7 | 49 | 14 | 8 | 7 | 7,509 | 3,811 | 66% |
| money | 43 | 8 | 42 | 16 | 9 | 5 | 7,359 | 4,440 | 62% |
| critters | 53 | 9 | 45 | 12 | 6 | 7 | 6,211 | 5,323 | 53% |
| guide | 41 | 11 | 34 | 8 | 4 | 11 | 6,994 | 3,885 | 64% |
| onboarding | 41 | 6 | 39 | 7 | 4 | 0 | 5,995 | 3,194 | 65% |
| drivers | 31 | 5 | 40 | 11 | 6 | 2 | 5,745 | 2,285 | 71% |
| vote | 27 | 11 | 35 | 11 | 1 | 0 | 5,494 | 1,892 | 74% |
| recap | 35 | 9 | 32 | 3 | 3 | 3 | 4,848 | 3,692 | 56% |
| proposal | 30 | 2 | 29 | 9 | 6 | 4 | 4,824 | 3,142 | 60% |
| monetize | 23 | 8 | 25 | 10 | 7 | 3 | 4,194 | 2,152 | 66% |
| home | 33 | 9 | 27 | 8 | 2 | 0 | 3,399 | 2,478 | 57% |
| album | 22 | 4 | 20 | 7 | 5 | 1 | 3,028 | 2,282 | 57% |
| help | 25 | 4 | 15 | 5 | 3 | 2 | 2,747 | 1,474 | 65% |
| safety | 28 | 8 | 16 | 5 | 4 | 1 | 2,416 | 1,982 | 54% |
| community | 11 | 2 | 12 | 6 | 2 | 0 | 1,870 | 813 | 69% |
| go | 12 | 2 | 4 | 0 | 0 | 1 | 607 | 971 | 38% |
| **total** | **~1,033** | **220** | **~916** | **~262** | **~121** | **91** | **145,182** | **93,897** | **~61%** |

The LOC columns include `dev/` scenes, which come to 91 tsx files and about 17.8k LOC in `features/*/dev/`. Those scenes feed the sweep's lab scenes.

**Estimate.** About 60% of feature code by lines is presentation, and that includes about 18k LOC of dev scenes. About 40% is logic in `.ts` modules that a new UI reuses directly.

**Where logic is tangled into components.** About 262 tsx files reach data directly. About 121 of them are `*screen*` containers, which is the expected pattern: the new UI keeps the hook calls and swaps the view. About **140 are non-screen components with their own data access**, so a new view cannot reuse their logic without first extracting a hook:
- vote: 10 of 11 data-touching files are components. Examples are `board/destination-board.tsx`, `board/pitch-sheet.tsx`, `poll/create-poll-sheet.tsx`, `places/search-sheet.tsx` and `final/winner-reveal.tsx`.
- home: the strips and cards query themselves (`next-up-card.tsx`, `today-strip.tsx`, `tip-strip.tsx`, `first-run-grid.tsx`, `join-trip-card.tsx`, `offline-line.tsx`).
- plan: 28 components, for example `day/item-sheet-host.tsx`, `views/export-sheet.tsx`, `check/fill-gap/gap-sheet.tsx` and `trip-map/draft-note.tsx`.
- explore: 20 components, for example `search/drop-pin-sheet.tsx` and `place-detail/report-profile.tsx`.
- crew: 8 components (`crews-sheet/CrewsSheet.tsx`, `waitlist/WaitlistCards.tsx`).
- community, monetize, money and trip also have high counts.

Heavy containers include `plan/day-plan/day-map-view.tsx`, `plan/trip-map/trip-map-view.tsx`, `plan/add/add-sheet.tsx`, `explore/places/places-map-view.tsx` and `setup/budget/budget-step.tsx`. Each has 7–9 `useState`/`useEffect`, so a "view" here is not always pure.

Navigation calls are also spread through presentation: 505 direct `router.push/replace/navigate` calls and 154 `hrefFor`/`useScreenHref` calls in features, app, ui and lib. Each feature's `routes.ts` path builders are reusable.

## 3. Kit consumers

- **`@/ui`**: 979 non-test files outside `src/ui` import it (1,018 with tests). Deep imports dominate (`@/ui/<dir>/…` in 956 files, the barrel `@/ui` in 171). Only 3 files use a relative `../ui`. The alias is `@/*` → `./src/*` (`apps/mobile/tsconfig.json`).
- **Top kit dirs by import count**: theme 596, text 512, layout 478, buttons 469, states 252, avatar 212, people 207, surface 197, sticker 182, cards 180, shell 164, inputs 153, sheet 149, icons 120, press 117, chips 83.
- **Kit size**: 265 tsx files, 34.6k LOC in 40 dirs. The biggest are map 3.1k, inputs 2.4k, planning 2.3k, text 1.5k, shell 1.5k, critters 1.5k, permission-primer 1.5k, sheet 1.4k, documents 1.4k, icons 1.3k. Several dirs are domain-shaped presentation: `planning`, `plan`, `money`, `vote`, `trip`, `recap`, `monetize`, `pass-card`.
- **`@/motion`**: 380 files outside `src/motion` import it. The top entry points are patterns 183, the barrel 124, island-toast 90 and motion-mode 59.
- **`ui/index.ts` (25 LOC)** exports only `KeyboardFooter`, `KeyboardScrollView`, `FooterFade`/`FOOTER_FADE_PT`, `Row`, `Stack`, `Scaffold` (+ `SurfaceToneProvider`, `useSurfaceBackground`, `useSurfaceTone`), `Text`/`TEXT_VARIANTS`, `degrees`, `makeStyles`, `MIN_TOUCH_TARGET`, `sizeToken`, `useTheme` and `bundledTypeface`. The gallery registry is kept out on purpose.
- **`ui/theme.ts` (76 LOC)**:
  - `Theme = Tokens & { contrast }`, with two frozen themes: standard and high contrast.
  - `useTheme()` reads only contrast from `lib/theme` (`ThemeProvider`: contrast, fontScale clamped to 2, plainGuideText).
  - Other exports: `makeStyles` (`createMakeStyles`), `sizeToken`, `MIN_TOUCH_TARGET` (44/48), `touchSlop`, `degrees`.
  - **There is no light/dark scheme.** `app.config.ts` says `userInterfaceStyle: 'automatic'`, but nothing reads `useColorScheme`/`Appearance`. The app is dark ink only.
  - `Scaffold` variants are `dark | paper | colourHero | scene | map`, used in 216 files.
- **Styling**: features have 537 `makeStyles` files and 11 raw `StyleSheet.create` files. They reference raw palette `color.*` about 605 times against about 1,435 `semantic.*` references (ui: 225 vs 412), so features are tied to the palette as well as to semantics. 26 files hard-code `ink['950'|'850']`.

## 4. Tokens pipeline and who would break

- **Source**: `$R/packages/design-tokens/src/*.tokens.json` (DTCG: color, semantic, guide, member, motion, opacity, radius, ring, shadow, size, sound, space, texture, tier, type), validated by `validate.ts` with zod. `semantic.*` holds **one value per token with no modes**: `bg.base = color.ink.850`, `text.primary = paper.base`, `action.primary = yellow`…
- **TS**: `@cp/design-tokens` exports `./src/index.ts` (the resolved tree) directly. The mobile app consumes it through `ui/theme.ts`, and 220 mobile files import the package.
- **Codegen** (`codegen/index.ts`, `pnpm --filter @cp/design-tokens build`) writes:
  - `generated/ts/tokens.ts`, `generated/swift/CPTokens.swift`, `CPFont.swift` and `generated/kotlin/CpTokens.kt`, all git-ignored. **Nothing consumes the Swift or Kotlin files.** The widgets, Live Activities, notification content and App Clip (`targets/widgets/LiveActivities/LiveActivityStyle.swift`, `targets/app-clip/TicketView.swift`…) and `modules/cp-android-surfaces/…/WidgetUi.kt` and `ProgressSpec.kt` hand-copy token colours, as their comments say. There is no `targets/_shared/Tokens.swift`.
  - The **committed** web CSS `$R/apps/web/src/styles/tokens.css` and `fonts.css`.
  - Android font resources.
- **Other consumers of the same tokens**:
  - `$R/apps/web`: `tokens.css` variables used across site and coming-soon CSS; `tokens` TS in `site/tips/tips-data.ts` and `lib/og/templates/shared.ts`; `join-button-contrast.test.ts`.
  - `$R/apps/admin/src/app/theme.ts`, which publishes `tokens` as CSS variables for `styles.css`, `shell.css`…
  - `apps/mobile/app.config.ts`, which reads `color.ink` and `semantic.bg.base` for the window and splash background.
  - `packages/critter-art`, `packages/critter-bake` (app icons), `packages/sound-art`.
  - `tools/maps/build-style.ts` and `build-sprites.ts` (map style).
  - `tools/scripts` (readme banner, a11y scan, audio check).
  - `tools/scripts/ci-device/screen-scan.ts`, which reads `semantic.bg.base` for SCREEN_FRAME.
  - The lint rule `design-tokens/eslint/no-literal-style.js`, which bans literal colours and sizes in `apps/mobile/src`.
- **Would a new token set break web and admin?** Only if it replaces existing names or values in place. Changing `semantic.*` or `color.ink.*` would restyle the web site and OG images, the admin console, app icons and art, the splash and window background, and the pixel checks, and would fail `join-button-contrast.test.ts` and the token schema and contrast tests. Adding the new design as a **separate namespace or files** (for example a new group with light and dark values, plus scheme-aware resolution in a new theme hook) leaves web, admin and native surfaces untouched. The TS export is the whole tree, so new keys reach the app with no codegen step. The schema (`schema.ts`) has no mode concept today, so light/dark pairs need either a schema addition or two parallel groups.

## 5. Flags, per-phone override and the earlier old/new switch

There are two flag channels today.
1. **`useFlag(key)`** (`lib/analytics/flags.ts`, `server-flags.ts`). Values come from `FLAG_CATALOG` in `@cp/domain`. The order is: the api's per-account value (`GET /v1/config/bootstrap`, which the api evaluates through PostHog per account and caches in MMKV `cp-server-flags`, so offline launches keep the last answer), then PostHog on the client after consent, then the catalog default. A per-account rollout, such as the founder's account only, belongs here.
2. **`client_config`**: a synced public table, global and not per-user. Today it is read by `lib/navigation/plan-hub-setting.ts` (`plan.hub`: `map | day`). `data/plan/plan-hub-feed.ts` feeds every synced change into an MMKV store (`cp-planning-switch`) read through `useSyncExternalStore`. The value is kept for offline launches and forgotten on sign-out. Other readers: `safety/data/ops-desk-flag.ts`, `lib/location/app-wiring.ts`, `active-guide.ts`, `data/areas`, `data/guides/feed.ts`.

**The old/new planning switch has been removed. The pattern is recoverable from history:**
- #615 `078b286fb` added a Developer tools override. #691 made the redesign read as on until the config said off. #724 `573ac9a9f` removed the earlier screens and the switch (579 files, −26,979 lines). #739 cleaned up the leftovers.
- `lib/navigation/planning-switch.ts` (at `573ac9a9f^`) held `PLANNING_SWITCH_KEYS = ['planning.redesign','plan.hub']` with default `{redesign: true, hub: 'map'}`. It used the same MMKV store with a separate `override` key. The **per-phone override won over `client_config` in both directions**, outlived sign-out and was cleared by "Start fresh". It exposed the source (`override | config | default`) for the Developer tools row. There was a Maestro helper, `e2e/_shared/planning-redesign-on.yaml`.
- **The switch ran at navigation time, not render time.** New screens lived on new routes. Their `register.ts` re-pointed the old screen ids with switch-aware builders, for example `'3d-4': (p) => planningRedesign() ? placesMap(p) : exploreRoutes.map(...)`, plus `trip/hub/hub-next.ts` and `explore/trip-explore/register.ts`. Only 6 call sites read the switch. Old and new screens coexisted as separate routes until the deletion PR.
- **Developer tools are in every variant except production** (`lib/dev-tools/variant.ts`). Staging hides the Home link, and a shake opens them. A production TestFlight phone cannot use a Developer tools override, so it would need the per-account server flag.

## 6. Fonts, splash, icons

- **Fonts**:
  - 26 TTFs are embedded natively by the `expo-font` config plugin (`app.config.ts`): Archivo in 5 widths × 3 weights, Geist (5), GeistMono (3), Borel (1) and NotoSansThai (2).
  - `lib/fonts/load.ts` lists `BUNDLED_FONT_FAMILIES`, and `useFontsReady()` returns `true` because there is no JS loading. The root layout renders one hidden glyph per family to prewarm them before hiding the splash.
  - Glyph coverage, including Vietnamese, lives in `$R/packages/design-tokens/fonts/manifest.json`, and `lib/fonts/resolve.ts` maps text by locale script.
  - **Adding or removing a bundled font changes the native fingerprint** (`runtimeVersion: { policy: 'fingerprint' }`). The foundations spec's SF Pro is the system font and needs no native change. Borel stays.
- **Splash**: `expo-splash-screen` uses `assets/splash-launch.png` on the `semantic.bg.base` background. `plugins/with-splash-wobble.ts` copies the Android 12 wobble frames (`assets/splash-android-wobble/` + `.xml`, under 1 s) into `res/drawable-xxxhdpi` and sets the splash theme's animation duration. Assets are rendered by `tools/design-renders/export-app-icons.mjs` and `splash-renders.mjs`. JS keeps the splash up until fonts, i18n, prewarm and the deferred link check are ready. `features/onboarding/hatch/LaunchHatch` continues the egg in-app. Any splash change is native: a new build is needed.
- **App icons**: `assets/icon{,-development,-staging}{,-dark,-tinted}.png` and Android adaptive foregrounds, background and monochrome. `modules/cp-app-icon` provides iOS `setAlternateIconName` and Android activity-alias switching (`AppIconAliases.kt`), with the config plugin `modules/cp-app-icon/plugin/with-app-icons.ts`, the catalogue in `lib/app-icon`, and UI in `features/you/app-icon/app-icon-view.tsx`. Icon art is generated by `packages/critter-bake` from tokens.
- **In-app icons**: `ui/icons/Icon.tsx` draws Skia paths from `ui/icons/generated/*.ts`, which are extracted from the design by `tools/design-renders/extract-doodles.mjs`. 97 files import them. **None of these native-UI packages is installed**: `expo-symbols`, `expo-glass-effect`, `expo-blur`, `@expo/ui`, `react-native-keyboard-controller`, `@gorhom/bottom-sheet`, `expo-image`. Adding any of them changes the fingerprint, so it means one native build and no OTA.

## 7. Test and QA coupling to the UI

- **Jest**: 686 test files in `src` (251 `.tsx`).
  - 254 import RNTL. 75 call `render(` directly, and about 179 use `renderHook` or helpers only. 212 use a `render*` helper.
  - **96 `.tsx` tests mount a `*Screen/*View/*Sheet/*Page` element** (77 in features). 119 tests press or fire events.
  - Queries: `ByTestId` 1,528, `ByText` 587, `ByRole` 147, `ByLabelText` 130.
  - Per-area harnesses live in `features/{home,onboarding,recap,setup,vote,…}/test-support/`.
  - Open PR #891 deletes and rewrites render-only tests and adds a CI guard, so this number is about to fall.
- **Maestro**: 635 flow YAMLs under `$R/e2e` in 44 dirs: `screens/` 106 (of which `screens/sweep/` 50, generated), `happy/` 61, `spikes/` 56, `plan/` 38, `explore/` 34, `journeys/` 32…
  - **Elements are found by testID**: 9,582 `id:` selectors against 517 `text:`. The source has 3,697 `testID=` props.
  - 2,023 `takeScreenshot` steps, each named with a design id (`en-3a-2-name`).
  - Flows reach `(dev)` screens through the Home "Developer tools" link and `app/(dev)/index.tsx`.
- **Screen registry**: `lib/navigation/screen-registry.ts` maps design ids (`ScreenId` from `docs/design-renders/screens.json`, which has **195 entries**) to hrefs. 37 `registerScreens` call sites register about 137 ids.
- **Sweep**: `tools/scripts/ci-device/sweep-coverage.ts` lists the registered ids and the `app/` routes that no sweep shot covers (`ROUTE_SHOTS`). It globs `apps/mobile/src/features/**` and `apps/mobile/src/app`.
- **Design | device sheets**: `pnpm screens:compare` (`$R/tools/scripts/compare-app-screens.ts`, `RENDERS_DIR = docs/design-renders/screens`, 195 PNGs) pairs each device shot with the old render by design id. **This assumes the old design and the old id scheme.**
- **`[ui-qa]` runtime guards** (`ui/qa`, in dev and e2e builds only): `TEXT_TRUNCATED`, `TEXT_WORD_BROKEN`, `STICKER_NO_OUTLINE` (the sticker paper edge is old-design specific), Home header overlap (`header-overlap.ts`), no back or close on a pushed screen (`back-affordance.ts`), empty icons (`icon-check.ts`) and toast title cut (`toast-title-check.ts`). They only fire for the shared `Text` and `Sticker`, so a new kit that does not route text through them loses the guards.
- **Pixel checks** (`tools/scripts/ci-device/screen-checks.ts`, `screen-scan.ts`):
  - `SCREEN_FRAME` compares the side edges against **one background read from `semantic.bg.base` (dark ink)**. Light screens, or light and dark mixed, will false-flag unless the background comes from the shell or scheme, or the check uses the dominant colour.
  - `KEYBOARD_BAND` uses the screen's own background.
  - `EMPTY_SCREEN` uses the dominant colour. Its opt-out `sparse-by-design.ts` is keyed by shot-name endings.
- **`ui-reviewed` gate**: `.github/workflows/ui-review.yml` runs `tools/scripts/ci-device/ui-review-gate.ts`, where `UI_ROOTS = ['apps/mobile/src/app/','apps/mobile/src/features/','apps/mobile/src/ui/']`. **Code under a new root (for example `src/legacy/**` or `src/kit/**`) skips the gate unless it is added there**, and to `ui-review-gate.test.ts`.
- **Assume the old design**:
  - `screens:compare` with the `docs/design-renders` renders and `screens.json` ids
  - screenshot names
  - `SCREEN_FRAME`'s background
  - `STICKER_NO_OUTLINE`
  - the Home header-overlap guard
  - `sparse-by-design.ts` entries
  - the 91 dev lab scenes under `features/*/dev`
- **Survive a restyle if the new UI keeps the testIDs**: Maestro flows, the testID-based Jest tests, the screen registry and route paths.

## 8. i18n

- **Catalogs**: `$R/packages/i18n/locales/<locale>/<area>.po`, with 78 `.po` files per locale and sub-catalogs `plan/`, `planning/`, `explore/`, `crew/`… The shared one is `common.po`, which collects everything under `src/ui/**`.
- **Locales**: 17, including `en-XA` pseudo.
- **Extraction is path-bound.** `$R/packages/i18n/lingui.config.ts` has 33 `apps/mobile/src/...` globs (one area catalog per `src/features/<area>/**`, `src/ui/**` → common, `ui/permission-primer` → permissions, plus route globs for trip/hub, (modal)/supplier…). `lingui-sub-areas.ts` has 7 more. **Moving files to `src/legacy/**` re-routes or orphans catalogs unless both configs move with them.**
- **Strings in components**: about 7,267 `t({ id, message })`/`` t`…` `` macros, 13 `<Trans>`, and 422 `msg`/`defineMessage`. There are 7,686 explicit ids such as `home.devTools`. Lingui is used in 1,026 files (`@lingui/react/macro` 542, `@lingui/core/macro` 510). Lint `lingui/no-unlocalized-strings` blocks literals. Because ids are explicit, **a new view can reuse an existing id and its translations** when the copy is unchanged.
- **Vietnamese**: 8,382 messages, 2 empty, so effectively 100%. English is 100%. th, ja and de are about 6–8%.

## 9. Keyboard and safe areas

- **Keyboard**: no library, only React Native built-ins.
  - The kit's `ui/layout/KeyboardFooter.tsx` (120 uses) is a footer that rides the keyboard. It counts the keyboard frame only while a field has focus, which fixes stale Android frames. It uses `SafeAreaInsetsContext`, `BottomTabBarHeightContext` and `FooterFade`.
  - `ui/layout/KeyboardScrollView.tsx` has 87 uses.
  - Sheets apply a keyboard inset in `use-modal-presentation.ts`.
  - Elsewhere: `keyboardShouldPersistTaps` ×36, `useAnimatedKeyboard` ×5, `Keyboard.addListener` ×5, `automaticallyAdjustKeyboardInsets` ×1.
  - The e2e flow `screens/keyboard-footer.yaml` and the `KEYBOARD_BAND` check guard this.
- **Safe areas**: `react-native-safe-area-context` 5.9.1. There are 144 `useSafeAreaInsets` calls in total, and 59 files outside the kit call it. `Scaffold` pads its edges (`edges` prop, 216 users), the tab bar pads its own bottom, and `useTabBarInset()` / `TAB_BAR_CLEARANCE` are used for clearance. No `SafeAreaView`.

## 10. In-flight PRs (open, 10 Oct 17:20)

| # | branch | touches mobile `app`/`features`/`ui`? |
|---|---|---|
| 893 | fix/ai-recap-spend | no (7 files, api) |
| 891 | test/jest-deletes-rewrites-and-reachability-guards | **yes**: 86 files, app 3, features 32, ui 15. All tests except 1 file. Mergeable. |
| 888 | perf/chat-history-window | **yes, heavily for now**: 568 files, app 39, features 95, ui 95, about 201 non-test UI files. Its body says it is stacked on `polish/batch-two`, which merged as #885 (squash), so most of the diff is that batch until it is rebased. Its own change is the chat window (crew chat timeline, migration, api route, streams). |
| 887 | test/e2e-generated-sweep-from-one-manifest | no (e2e and tools only, 89 files). It changes the sweep the redesign QA will lean on. |
| 722 | spike/ai-place-content (draft, not for merge) | no |
| 653, 652, 651, 650 | test/live-walk-* (drafts) | no (e2e only) |
| 590 | test/android-photo-pick (draft) | no |

Main churn: 138 commits in the last 7 days touched `app`/`features`/`ui`, from area polish lanes on 8–9 Oct.

## Recommendation: B, and delete the legacy code at the end instead of moving it

**Choose (B)**: build the new kit and the new presentation beside the old code, behind one runtime switch, and switch the shell and each flow over one by one.
- **Merge conflicts.** (A)'s codemod moves about 916 feature tsx files and the 265-file kit, and rewrites about 980 importers. It collides with #888 (about 201 UI files), #891 and the polish lanes that are still landing (138 UI commits in 7 days). (B) adds files and only touches the thin route files and two layouts.
- **Path-bound tooling would all need to change in (A)'s one PR**: Lingui (40 globs), `boundaries.js`, `ui-review-gate.ts` `UI_ROOTS`, sweep-coverage globs and `ci-suite-gates.json`. Put the new screens under `src/features/<area>/…` so Lingui, boundaries and the gate apply unchanged. Only the new kit root needs to be added to those three lists.
- **The switch.** Use one value, for example a `ui.shell` catalog flag through `useFlag` (per-account, so it can target the founder's account), plus an MMKV per-phone override in Developer tools, which is #615's planning-switch pattern. Route files are about 17 lines each, so each picks the legacy or new screen at render time on the same URL. That keeps deep links, `restore.ts`, the screen registry and Maestro routes intact. `(tabs)/_layout` and the root layout pick the navigator: ShellTabs/js-stack or the new tabs and native sheets. Key the root navigator on the switch value so a flip remounts it and clears the restored state.
- **OTA safety.** `runtimeVersion` is the fingerprint, and glass, SF Symbols and native sheets need packages that are not installed today. Ship one native build that carries both shells with the switch off, then iterate the new UI over OTA. A bad update only reaches phones that have the switch on.
- **Founder comparison.** He can flip between the two shells on the same phone with the same data: through the Developer tools override on staging, or the account flag on production builds.
- **Tests and QA.** The legacy code stays green as it is. The new views reuse the existing `testID`s and Lingui ids where the flows still apply. The new design needs its own renders directory and id map for `screens:compare`. `SCREEN_FRAME` needs the background per shell or scheme rather than `semantic.bg.base`.
- **Tokens.** Add the new tokens as a separate namespace with light and dark values. Do not change `semantic.*` or `color.*` in place, because web, admin, the splash, app icons and the pixel checks all read them.
- **Cost of (B).** Two kits live in one bundle for a while. Add a lint boundary so new presentation cannot import the legacy kit, and the reverse. Extract hooks from the about 140 non-screen components that query data before rebuilding them; vote, home, plan and explore come first.
- **At the end**, run one deletion PR for the legacy kit, views and switch, as #724 did (579 files, −26,979 lines). No move to `src/legacy` is needed at any point.

Unresolved questions:
1. Should the switch be one global `ui.shell` value, or one value per flow on top of a shell switch? The question is whether a new shell with legacy dark screens inside it is acceptable on the founder's phone.
2. Will the founder test on production or staging builds? On production only the per-account server flag works, because Developer tools are not there.
3. Where does the new kit live (`src/kit`?), and what name is free of the banned deferral words (`v2`)?

Status: DONE
Summary: Inventoried routes (about 17-line wrappers over feature screens; JS stack, JS tabs and self-animated JS sheets), features (~61% presentation by LOC; about 140 non-screen components query data), kit and motion consumers (979 and 380 files), tokens (one dark mode; web, admin and splash read them; the generated Swift and Kotlin are unused), flags (`useFlag` per account and global `client_config`; the removed planning switch was a navigation-time switch with a Developer tools override), and QA coupling (testID-driven Maestro; `screens:compare`, `SCREEN_FRAME` and the gate roots assume the old design and paths). Recommends option B with a render-time switch per route and a final deletion PR.
Concerns/Blockers: Most of PR #888's 568-file diff is the merged polish batch until it is rebased, so its real overlap with UI files is smaller than it looks.
