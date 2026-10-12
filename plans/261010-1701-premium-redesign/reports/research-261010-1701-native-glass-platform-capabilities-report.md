# Native glass platform capabilities (installed versions)

Research lane, 10 Oct 2026. Read-only against `$R` = `/Users/quocs/Projects/critterpass-worktrees/deploy` (HEAD `fc1a78d21`).
Type paths below are relative to each package root in `$R/node_modules/.pnpm/<pkg>/node_modules/<pkg>/`. Docs are the SDK 58 pages (`docs.expo.dev/versions/v58.0.0/...`) or the router guides (`docs.expo.dev/router/advanced/...`).

## Five findings that change the plan

1. **Most of the native redesign needs no new native build.** `expo-router` 58.0.9 ships its own native code (ExpoRouter pod: zoom transitions, link previews, toolbar). `react-native-screens` 4.28 is already linked. `expo-glass-effect` 58.0.2 is a direct dependency of `expo-router`, and `expo-modules-autolinking search -p apple` already lists it as linked. NativeTabs, the native Stack, `formSheet`, iOS `Stack.Toolbar`, `Link.AppleZoom`, `Link.Preview`/`Menu` and `GlassView` are therefore JS-only changes that can ship over the air. To import `GlassView`, add `expo-glass-effect@58.0.2` to `apps/mobile/package.json` at the same version, then confirm with a fingerprint compare that the runtime version did not change.
2. **Today the app runs entirely on JS navigators.** Every layout imports `expo-router/js-stack` or `expo-router/js-tabs`: the root `_layout.tsx`, ShellTabs and about 20 area layouts. The JS sheets are `ui/sheet/*` presented as `transparentModal`. Large titles, glass bar buttons, the zoom transition and form sheets only exist on the **native** `Stack` from `expo-router`. Moving to it is the main engineering item. It also removes `lib/navigation/transitions.ts`'s custom card interpolators.
3. **The ADR finding on `Link.AppleZoom` is stale and wrong for 58.0.9.** The ADR is `docs/decisions/20260927-motion-transitions-and-startup.md`. It read the non-iOS `ZoomTransitionEnabler.js`, where the flag is `false`. The iOS file `link/zoom/ZoomTransitionEnabler.ios.js` sets `_isZoomTransitionEnabled = process.env.EXPO_OS === 'ios'`. AppleZoom is a **tap** push transition (UIKit `preferredTransition = .zoom`, see `ios/LinkPreview/LinkZoomTransition.swift`), not the long-press preview. The spike failed for two reasons: it used `Link.Trigger withAppleZoom` (the preview API), and it ran under a JS root stack. The docs say AppleZoom "is only supported within router's Stack navigator".
4. **The iOS minimum is already 26.0.** `app.config.ts:255` has `deploymentTarget: '26.0'`, and builds use Xcode 26.6 on `macos-26`. Liquid Glass is always present on iOS, so no pre-iOS-26 fallbacks are needed. Only Android needs a fallback design.
5. **Hiding the tab bar is not animated.** `ios/tabs/host/RNSTabsHostComponentView.mm:247` calls `setTabBarHidden:… animated:NO`, so toggling `NativeTabs hidden` per screen snaps. To get "tab bar hides on details", details must be pushed on the **root** Stack above `(tabs)`, which covers the bar inside the push animation. Most areas already are (`/places`, `/crew`, `/money`…). `(tabs)/trips/[tripId]` (the trip hub) is not, and must move to the root stack.

---

## 1. Tab bar: Expo Router NativeTabs (`expo-router/native-tabs`)

Source: `native-tabs/types.d.ts`, `native-tabs/common/elements.d.ts`, `router/advanced/native-tabs` (iOS 26 features, Known limitations).

| Need | Installed support | Android | Limits |
|---|---|---|---|
| iOS 26 Liquid Glass bar with the sliding lens (stretch, drag) | System-drawn when built with the iOS 26 SDK. `backgroundColor`, `blurEffect` and `shadowColor` are ignored on 26 | Material `BottomNavigationView` with an active-indicator pill (`indicatorColor`), ripple and `labelVisibilityMode`. No lens or stretch | The colour comes from the content behind the bar, not from JS colour schemes. Wrap the app in `ThemeProvider` with `DarkTheme`, or tabs flash white and glass buttons flicker |
| Minimise on scroll | `minimizeBehavior="onScrollDown"` (iOS 26+). The minimised bar shows the active tab icon, with the search circle kept on the right | None | Needs a `ScrollView` as the **first child** of the screen (or wrappers with `collapsable={false}`). FlatList is documented as "limited: minimize-on-scroll not supported". **Unverified for LegendList and FlashList**, which the app uses: spike on device |
| Guide as a separate circle on the right | `role="search"` renders `UITabBarSystemItemSearch`, the separate circle on iOS 26 | `role` is iOS-only. On Android the trigger is a plain fifth item (Android caps tabs at 5) | `role` replaces the title with the system "Search" text. The circle shows the icon only |
| Search circle opens a **sheet**, not a tab | `tabPress` has `canPreventDefault: false`. The workaround is `disabled` on the trigger: `RNSTabBarController.mm` `shouldSelectViewController` returns NO and still emits `tabPress` with `isPrevented: true`. A `listeners={{ tabPress }}` handler then calls `router.push('/guide')` with `presentation: 'formSheet'` | `disabled` works on Android (SDK 56+). Better: `hidden` on Android plus a Material FAB (the existing `ui/shell/GuideFab.tsx`) | `disabled` only blocks taps, so JS navigation still works. Needs a device check that the iOS 26 search circle keeps its pressed or lens animation when selection is refused |
| Custom icons vs SF Symbols | `sf` (SF Symbols, system tinted and animated), `xcasset` (image or symbol sets), `src` (image source, `renderingMode` template or original), `md` (Material Symbols, **needs `expo-symbols`**), `drawable` | `src`, `drawable`, or `md` with `expo-symbols` | The tab doodles are Skia-drawn (`ui/shell/tab-icon-art.ts`), so they must be rasterised to template PNGs, which are JS assets and ship OTA. The per-trip guide critter needs a coloured `src` with `renderingMode="original"`, swapped at runtime (icon changes are allowed, adding or removing tabs is not) |
| Badges | `NativeTabs.Trigger.Badge` / `badgeValue` (string) | Yes | — |
| Hide the bar on pushed details | `hidden` exists but is not animated (finding 5) | Same | Push details on the root Stack |
| Bottom accessory | `NativeTabs.BottomAccessory` (iOS 26), for example a live-ride mini bar | None | Two instances are mounted, so state must live outside the accessory |
| A JS tab bar instead | The current `ui/shell/TabBar.tsx`. On iOS it could use `GlassView` for the real material | Identical on both platforms | It loses the system lens and its gestures, system minimise, accessibility (Large Content Viewer) and the accessory. Scroll tracking must be rebuilt on every screen. Only a JS bar can draw the `Tabs.dc.html` variant (ink active pill, raised Tokek). The rubric says not to resolve the two variants, so this is a **founder call** |

**Recommendation: native API.** Use `NativeTabs` with four labelled tabs, a search-role guide trigger (`disabled` plus a `tabPress` handler that opens the guide sheet), `minimizeBehavior="onScrollDown"`, and template PNG icons. On Android, use the Material bottom nav with the guide as the existing FAB.

## 2. Native stack headers on iOS 26

Source: `react-navigation/native-stack/types.d.ts:223,281,326,411,790,864–900`, `layouts/stack-utils/toolbar/*`, `router/advanced/stack-toolbar`, `router/advanced/stack`.

| Need | Installed support | Android | Limits |
|---|---|---|---|
| Large title that collapses into the bar | `headerLargeTitleEnabled` / `<Stack.Title large>` | None: the native Android toolbar has no large title | The ScrollView must be the first child, with `contentInsetAdjustmentBehavior="automatic"`. `headerLargeTitleStyle` accepts only fontFamily, size, weight and colour (no `letterSpacing`), so Display −0.03em cannot be set on the native title |
| Transparent or glass bar | The iOS 26 bar is glass by default. `scrollEdgeEffects` (soft or hard edge blur per edge). `headerTransparent` for screens over photos or maps | `headerTransparent` gives a plain transparent bar | Don't combine `headerBlurEffect` and `scrollEdgeEffects` (they overlap) |
| Glass bar buttons, ≤ 2 on the right, `+` is the ink one | `Stack.Toolbar placement="right"` with `Stack.Toolbar.Button`/`Menu`/`View`/`Badge`. `variant: 'prominent'` with `tintColor` gives the tinted prominent glass (the "ink pill"). `hidesSharedBackground` and `separateBackground` split the capsules. `sharesBackground` and an `identifier` match items across transitions | **`Stack.Toolbar` on Android requires `@expo/ui`** (`toolbar/native.android.js` throws without it, so it needs a native build). Alternative: plain `headerRight` React elements | A prominent item is tinted glass, not the design's solid gradient. An exact gradient needs `Stack.Toolbar.View` with a custom RN pill and `hidesSharedBackground` |
| Back button | System glass chevron with an edge swipe. Hide the back title with `headerBackButtonDisplayMode: 'minimal'`. `fullScreenSwipeEnabled` turns on a full-width swipe | Material up arrow plus system and predictive back | — |
| Search bar | `Stack.SearchBar` / `headerSearchBarOptions` with `placement` (`integrated`, `integratedButton` on 26). `Stack.Toolbar.SearchBarSlot` puts search in the bottom toolbar (iOS 26) | `Stack.SearchBar` works. `SearchBarSlot` renders nothing | — |

**Recommendation: native API on iOS, custom on Android.** iOS uses the native header with large titles, `Stack.Toolbar` and the system back button. On Android, set `headerShown: false` and keep the JS `ui/shell/LargeTitle.tsx`/`HeaderPills.tsx`, with the collapse driven by a Reanimated scroll handler. Wrap both in one `ScreenHeader` API so screens declare a title and actions once.

## 3. Sheets

Source: `react-native-screens/src/types.tsx:410–560`, `router/advanced/modals` (Form sheet, Android limitations), the SwiftUI and universal `BottomSheet` pages.

| Need | Native `formSheet` route | `@expo/ui` BottomSheet | JS sheet (current `ui/sheet`) |
|---|---|---|---|
| Half or full detents | `sheetAllowedDetents: [0.5, 1]` or `'fitToContents'`, plus `sheetInitialDetentIndex` | SwiftUI `presentationDetents`. Compose has half and full only | Yes |
| Grabber | `sheetGrabberVisible` (iOS). Android needs its own | iOS `presentationDragIndicator`. Material drag handle | Own `Grabber.tsx` |
| Glass background on iOS 26 | The system sheet is Liquid Glass at partial detents when the content background is clear (`contentStyle: { backgroundColor: 'transparent' }`). **Needs device verification.** Keep the system corner radius rather than forcing 46 | System default | `GlassView` behind the content |
| `+` morphing into the sheet (iOS 26) | Wrap the `+` in `Link.AppleZoom` and link to a route with `presentation: 'formSheet'`. expo-router sets `.zoom` on the presented `RNSScreen`, and iOS 26 morphs sheets out of their source. **Unverified spike**: the source must be an RN view (`Stack.Toolbar.View`, not a `Toolbar.Button`), and the transition is set asynchronously after mount | No | Custom overlay (`ui/transitions/SharedGrow.tsx` technique) |
| Page steps back | System scale-back only at the **full** detent. Half height only dims | No | Already present (`PRESENTER_SCALE = 0.93`, `ui/sheet/presenter.ts`), driven by Smooth |
| Keyboard | iOS: UIKit lifts and resizes the sheet. Android: `SheetDelegate` handles the IME | System | Own listeners (`use-modal-presentation.ts`), a source of device bugs |
| Confirm before swipe-dismiss when edited | `usePreventRemove`, or `preventNativeDismiss`/`onNativeDismissCancelled` | `interactiveDismissDisabled` | Own |
| Android | Material `BottomSheetBehavior`, at most 3 detents, **no native header inside**: Cancel, title and verb must be drawn in the content | Compose `ModalBottomSheet` | Identical |

**Recommendation: native routes.** Make every Sheet screen type a `presentation: 'formSheet'` route with an in-content header row (Cancel left, bold verb right), drawn the same on both platforms. On iOS, accept the system scale-back at full height and plain dimming at half height. Keep `ui/sheet/map-sheet.tsx` custom, since it is a persistent, non-modal map sheet. Skip `@expo/ui` BottomSheet: its content goes through `RNHostView`, it is not a route, and Android only has two states. Spike the `+` morph and fall back to a plain sheet rise.

## 4. Trip card zooming into the trip hub

Source: `link/zoom/*`, `ios/LinkPreview/LinkZoomTransition.swift`, `router/advanced/zoom-transition`, Reanimated `src/featureFlags/staticFlags.json`.

| Item | Finding |
|---|---|
| iOS support | `<Link href asChild><Link.AppleZoom><Pressable>card</Pressable></Link.AppleZoom></Link>` with `Link.AppleZoomTarget` on the hub, iOS 18+ (always available here). The zoom swipe-down dismisses interactively. `usePreventZoomTransitionDismissal` limits where that gesture starts |
| Known glitches (docs) | "Avoid zoom transitions between screens that have a header". There is also a delay of about 1 s on rapid open, close and reopen, upstream in react-native-screens (expo/expo#42797). Each of `AppleZoom` and `AppleZoomTarget` takes a single child. It needs the native Stack. Combined with `Link.Preview`, the target must be modal |
| Hub with a header | Give the hub `headerShown: false` (or a transparent header without native items) and draw its glass chevron and action as `GlassView` buttons over the hero. That avoids the header glitch |
| Android | No native zoom. Options: (a) the existing custom overlay technique (`ui/transitions/SharedGrow.tsx`, measured at 60 fps in the ADR), playing over a native `fade` push; (b) Reanimated 4.7 shared element transitions, which in C++ recognise `RNSScreen` but sit behind the static flag `ENABLE_SHARED_ELEMENT_TRANSITIONS: false` (experimental, needs a native rebuild) |

**Recommendation: native on iOS, custom on Android.** Use `Link.AppleZoom` on iOS and the custom overlay on Android. Only enable the Reanimated flag if the same build carries a spike to try it.

## 5. `expo-glass-effect` 58.0.2 (already linked)

Source: `src/GlassView.types.ts`, `src/GlassContainer.types.ts`, `src/isLiquidGlassAvailable.ios.ts`, `CHANGELOG.md`, `v58.0.0/sdk/glass-effect`.

| Item | Finding |
|---|---|
| API | `GlassView`: `glassEffectStyle` is `'clear'`, `'regular'` or `'none'`, or `{style, animate, animationDuration}`; also `tintColor` (ColorValue), `isInteractive` and `colorScheme`. `GlassContainer` has `spacing`, which merges nearby glass. `isLiquidGlassAvailable()` and `isGlassEffectAPIAvailable()` exist |
| Morphing between shapes | Not in `expo-glass-effect`: there are no glass IDs. True morphing needs `@expo/ui/swift-ui` `GlassEffectContainer` with the `glassEffectId(id, namespaceId)` modifier and `Namespace`, inside a SwiftUI `Host` |
| Opacity | Never animate opacity below 1 on glass or its parents: the glass stops rendering. Animate `glassEffectStyle` to `'none'` with `animate: true`, or fade a wrapper while toggling the style. 58.0.2 fixed fade-in from low opacity |
| Reduce Transparency | System glass turns frosted by itself. Check `AccessibilityInfo.isReduceTransparencyEnabled()` for custom fallbacks |
| Cost | Each `GlassView` is a `UIVisualEffectView` with a backdrop sampling pass. Use glass only on chrome (bars, nav buttons, pills, banners, sheet surface). Group neighbours in `GlassContainer`. **No glass inside list cells or scrolling cards**, and no glass inside glass. `isInteractive` only on tappable controls |
| Before iOS 26 | Not needed (target 26.0) |
| Android | `GlassView` renders as a plain `View`. Fallback tokens: solid translucent surfaces (dark glass 72% plus a 7% top highlight and a hairline). Use `expo-blur` `BlurView` with `BlurTargetView` (RenderNode, `dimezisBlurViewSdk31Plus`, Android 12+) only over photos. Over MapLibre's GL surface, blur is unverified, so use a solid tint. Skia `BackdropBlur` only blurs what Skia draws inside its own canvas, so it only suits Skia scenes such as critters and the passport |

**Recommendation: native plus custom.** On iOS, a `Glass` primitive wraps `GlassView`/`GlassContainer`. On Android, the same primitive renders a token-tinted surface, with optional `expo-blur` over photos.

## 6. `@expo/ui` in SDK 58 (not installed, needs a native build)

Source: `v58.0.0/sdk/ui` (component tables), `ui/swift-ui/button` and `modifiers`, the drop-in Menu page. expo-router's peer range is `^58.0.8`; Expo bundles `~58.0.7`, so install 58.0.8 or later.

| Control | iOS (SwiftUI) | Android (Compose) | Use? |
|---|---|---|---|
| Segmented control | `Picker` segmented, or the drop-in `SegmentedControl` | `SegmentedButton` | Yes |
| Switch / toggle | `Toggle` | `Switch` | Yes |
| Slider, date picker | `Slider`, `DatePicker` | `Slider`, `DateTimePicker` | Yes, where the design has them |
| Context menu | `ContextMenu`, `Menu`; drop-in `MenuView` with `shouldOpenOnLongPress` | `DropdownMenu` | Yes, for the Android long-press fallback |
| Buttons | `buttonStyle('glass' \| 'glassProminent' \| …)` (iOS 26 with Xcode 26) | Material3 `Button` / `IconButton` | Only for SwiftUI-hosted bits. The app's own ink pill stays RN |
| Glass modifiers | `glassEffect({glass:{variant,interactive,tint},shape})`, `glassEffectId` with `Namespace`, `GlassEffectContainer` | — | Only for glass morphs |
| BottomSheet | SwiftUI `.sheet` | `ModalBottomSheet` (2 states) | No, use formSheet routes |
| Stack.Toolbar on Android | — | Required by expo-router | Yes, if Android uses native header items |

On production readiness, the docs call the package "production-ready … SDK 56 and later". Mixing works through `Host` (layout inside is SwiftUI or Compose, not Yoga) and `RNHostView`. Keep `Host` islands small and self-contained: controls, menus and glass morphs, never whole screens.

## 7. Context menus and link previews

| Item | iOS | Android |
|---|---|---|
| `Link.Preview` (peek and pop) and `Link.Menu`/`Link.MenuAction` (SF Symbol icons, `destructive`, nested menus) | Yes. Needs `Link.Trigger`, a single child, no `replace`. Feels "clunky" under JS tabs, so use NativeTabs | **iOS-only**: no preview, and the long press does nothing |
| Fallback | — | `@expo/ui` `MenuView` with `shouldOpenOnLongPress` (Compose `DropdownMenu`), plus a haptic |

**Recommendation: native on both platforms.** iOS uses `Link.Preview` with `Link.Menu` on trip, place and vote cards. Android uses an `@expo/ui` long-press menu with the same actions, defined once and rendered per platform.

## 8. Keyboard

The app today has no keyboard-controller. It uses Reanimated `useAnimatedKeyboard` plus RN `Keyboard` listeners (`ui/layout/KeyboardFooter.tsx`, `ui/sheet/use-modal-presentation.ts`, `features/trip/day-of/day-of-view.tsx`). `KeyboardFooter` carries several Android workarounds, and the founder memory names it as a real-device blind spot.

| Surface | Recommendation |
|---|---|
| Chat composers (crew chat, guide chat) | `react-native-keyboard-controller` 1.22.4, the version Expo bundles for SDK 58: `KeyboardChatScrollView` (supports `inverted`, a custom `ScrollViewComponent` for LegendList, `keyboardLiftBehavior`, and `freeze` for opening a sheet from chat) plus `KeyboardStickyView` for the composer. Interactive dismissal: iOS `keyboardDismissMode="interactive"`, Android `KeyboardGestureArea` |
| Sheet forms | Native formSheet on iOS moves with the keyboard by itself, so don't add a second avoider. On Android, check `SheetDelegate` and add `KeyboardAwareScrollView` only if a field is still hidden |
| Full-screen forms | `KeyboardAwareScrollView` plus `KeyboardToolbar` (prev, next, done) |
| Search fields | Native `Stack.SearchBar` on iOS (the system handles it). In-content fields use the same sticky approach |
| Keyboard-synchronised motion | `useKeyboardHandler` / `useReanimatedKeyboardAnimation` (frame-accurate on both platforms) to replace the custom `KeyboardFooter` logic |
| Tab bar over the keyboard (Android) | `NativeTabs tabBarRespectsIMEInsets` (Android 11+, `adjustResize`) |

This needs a native build.

## 9. Springs

Source: Reanimated `src/animation/spring/springConfigs.ts` and `springUtils.ts`; `apps/mobile/src/motion/easing.ts` (`springConfig()` already maps `{stiffness, damping, mass}` tokens).

SwiftUI's `response`/`dampingFraction` maps exactly to physics with mass 1: stiffness = (2π/response)², damping = 4π·ζ/response.

| Design spring | Reanimated `withSpring` (use this form) | SwiftUI / UIKit (widgets, Live Activity, native code) |
|---|---|---|
| Snappy (.30 / .86): tabs, toggles, chips, lens | `{ stiffness: 438.6, damping: 36.02, mass: 1 }` | `.spring(response: 0.30, dampingFraction: 0.86)` = `.spring(duration: 0.30, bounce: 0.14)`; `UIView.animate(springDuration: 0.30, bounce: 0.14)` |
| Smooth (.45 / 1.0): sheets, zooms, page step-back | `{ stiffness: 195.0, damping: 27.93, mass: 1 }` (or `overshootClamping: true`) | `.spring(duration: 0.45, bounce: 0)` |
| Lively (.50 / .68): stamps, stickers, island, confetti | `{ stiffness: 157.9, damping: 17.09, mass: 1 }` | `.spring(duration: 0.50, bounce: 0.32)` |

- **Do not use Reanimated's `{duration, dampingRatio}` form for these.** There `duration` is "perceptual": the real settle time is 1.5× and stiffness is solved to an energy threshold, so it is not SwiftUI's `response`.
- Reduce Motion: replace springs with a 150 ms cross-fade. `REDUCED_CROSS_FADE_MS` is 200 today in `lib/navigation/transitions.ts`; change it to 150. Pass `reduceMotion: ReduceMotion.System` or use the app's `motion-mode`.
- Native transitions keep their system springs and cannot be retuned: tab lens, push, formSheet, zoom and minimise.
- Reanimated 4.7 CSS transitions and animations are available, but their timing functions are only `cubic-bezier`, `linear()` and `steps()`, with no spring. Use them for simple declarative state morphs (colour, opacity, size). A spring can be approximated with a generated `linear()` curve.
- Use `withSpring` for anything gesture-driven or interruptible.
- Layout animations take springs (`LinearTransition.springify().stiffness(438.6).damping(36.02).mass(1)`) for in-screen morphs such as chips reflowing or cards expanding.

**Recommendation:** put the three springs into `@cp/design-tokens` as physical tokens (and the Swift codegen as `duration`/`bounce`). Everything custom uses only those.

## 10. Haptics and fonts

| Item | Finding / recommendation |
|---|---|
| Haptics | `expo-haptics` 58.0.2 is installed: `impactAsync`, `selectionAsync`, `notificationAsync`, and Android `performAndroidHapticsAsync(AndroidHaptics.*)`. The local `cp-haptics` module adds Core Haptics and `VibrationEffect.Composition` patterns (sos, holdRamp). Suggested mapping: lens or segment or toggle → `selection`; stamp landing → `impact(Rigid)` then `notification(Success)`; swipe-vote commit → `impact(Medium)`; hold-to-confirm → `cp-haptics` ramp; island arrival → `impact(Soft)`. The native tab bar and UISwitch don't add haptics themselves. No new package needed |
| SF Pro on iOS | Leave `fontFamily` unset (system), and UIKit picks SF Pro Text or Display by size. Convert tracking from em to pt: Hero 66 × −0.05 = −3.3, Display −1.02, Title −0.44, Mono +1.44. The native large title ignores tracking (§2) |
| Android | The system `sans-serif` is Roboto, which covers Vietnamese and renders weights 100–900. Use it rather than shipping a pseudo-SF font; that is the Material-native choice |
| Borel | Already embedded through the `expo-font` config plugin (`assets/fonts/Borel-400.ttf`, 154 KB). It covers all of Latin and all 103 Vietnamese letters, but is missing 107 of 128 Latin Extended-A letters and Thai. `lib/fonts/resolve.ts` already falls back. No change needed |
| Mono (MRZ) | Keep the embedded `GeistMono-500` |
| Dropping Archivo and Geist | Removing them from the `expo-font` plugin list changes native code (fingerprint), so it rides the native build. `lib/fonts/load.ts` and its test change with it |

## 11. Platform minimums and the native build

| Item | Value |
|---|---|
| iOS minimum | 26.0 (`app.config.ts:255`, `expo-build-properties`) |
| Xcode / SDK | Xcode 26.6 on the `macos-26` runner (`.github/workflows/native-build-job.yml:55–87`). That SDK is enough for every iOS 26 API above. `UIDesignRequiresCompatibility` is not set, so Liquid Glass is on. `expo-glass-effect` 58.0.0 already treats iOS 27 SDK builds as glass-only |
| Android | compileSdk 37, targetSdk 36. Material bottom nav and sheets come from react-native-screens |

**JS-only, OTA-able (already linked):** NativeTabs, the native Stack and headers, iOS `Stack.Toolbar`, `formSheet`, `Link.AppleZoom`, `Link.Preview`/`Menu`, `GlassView`/`GlassContainer` (after adding the dependency, verify the fingerprint), Reanimated springs, CSS and layout animations.

**Needs one native build. Put all of these on the same build:**

- `@expo/ui` ≥ 58.0.8: Android `Stack.Toolbar`, segmented control, switch, menus, glass morphs.
- `react-native-keyboard-controller` 1.22.4.
- `expo-symbols` ~58.0.2, only if `md` tab icons or `SymbolView` are used.
- `expo-blur` ~58.0.1, only for Android photo blur.
- Reanimated `ENABLE_SHARED_ELEMENT_TRANSITIONS`, only if the Android zoom spike runs.
- The trimmed `expo-font` embed list.
- Redesigned app icon (iOS 26 layered, dark and tinted) and splash.
- Restyled widgets, Live Activity and Dynamic Island (`targets/widgets`, `modules/cp-live-activity`, where the ride Live Activity lives).
- Restyled notification content extension and App Clip (`targets/*`).
- Any custom SF Symbol asset catalog.
- Android theme and night colours for the native tab bar and system bars.

The in-app "ride grows out of the island" stays custom (the existing `motion/island-toast`); the system Dynamic Island can't be animated from the app.

---

## Recommended stack

1. **Add to `apps/mobile/package.json`:** `expo-glass-effect@58.0.2` (no build), `@expo/ui@^58.0.8`, `react-native-keyboard-controller@1.22.4`, plus `expo-symbols@~58.0.2` only if `md` icons are chosen. Do not add `expo-blur` unless Android photo blur proves necessary.
2. **Navigation:** move the root and area layouts from `expo-router/js-stack` to the native `Stack` from `expo-router`. Replace `ShellTabs` (JS Tabs) with `NativeTabs`. Detail routes, including the trip hub, are pushed on the root stack.
3. **Native on iOS:** Liquid Glass tab bar with the lens and `minimizeBehavior`, search-role guide circle (`disabled` plus `tabPress` → guide sheet), large titles, `Stack.Toolbar` glass items (`prominent` + ink tint for `+`), glass back chevron, `formSheet` routes with grabber and detents, `Link.AppleZoom` trip card → hub (hub without a native header), `Link.Preview`/`Menu` on cards.
4. **Native on Android:** Material bottom nav, guide as a FAB, `formSheet` with in-content headers, `@expo/ui` menus and controls.
5. **Custom Reanimated (both platforms unless noted):**
   - Android: large-title collapse, header glass fallback, trip card → hub overlay zoom.
   - Page step-back at half height (if the founder insists).
   - `+` → sheet morph, as a fallback if the iOS spike fails.
   - Passport stamp drop (Lively plus haptics), swipe-vote card exit with stamp (Gesture Handler plus Lively), ride growing from the island (`motion/island-toast`), the Tabs.dc.html bar variant if chosen, and any glass shape morph outside SwiftUI.
6. **Springs:** three physical tokens (438.6/36.02, 195.0/27.93, 157.9/17.09, mass 1). Reduce Motion means a 150 ms cross-fade.
7. **Spikes before building screens (one dev route each, on device):**
   - Minimise and large-title collapse with LegendList and FlashList.
   - The search-circle `disabled` trick.
   - Glass formSheet with a transparent `contentStyle`.
   - AppleZoom `+` → formSheet morph.
   - Trip card → hub zoom on a headerless hub.

Status: DONE_WITH_CONCERNS
Summary: The installed SDK 58 stack can do the iOS 26 design natively (NativeTabs with a search-role circle and minimise, glass headers and toolbar, formSheet, AppleZoom, GlassView). The core of it is JS-only and can ship over the air because the native code is already linked. Android needs a Material fallback, and `@expo/ui` plus keyboard-controller need one native build.
Concerns/Blockers: Five behaviours still need a device spike: minimise and large-title collapse with LegendList/FlashList, the search-tab `disabled`-to-sheet trick, the glass formSheet background, the `+` → sheet zoom, and zoom on a hub with a header. Moving from the JS stack to the native Stack is a large cross-cutting change that replaces the custom sheets and transitions. The ADR `20260927-motion-transitions-and-startup.md` wrongly records `Link.AppleZoom` as inert and should be corrected. The tab bar variant (native 1.04 vs `Tabs.dc.html`) is a founder decision: only a JS bar can draw the latter.
