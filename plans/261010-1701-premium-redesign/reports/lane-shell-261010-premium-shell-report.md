# Lane report: premium shell

Branch `feat/premium-shell` (from `feat/premium-redesign`, kit `0e5ee5a13` merged in). Pushed.

| Commit | What |
|---|---|
| `47eeee38f` | `ui.premium` switch, phone override, native-module check, `premiumRoute`, deps |
| `05523f265` | premium navigators: native root stack, system tab bar, guide circle, tab stacks, hub at `/hub/<tripId>` |
| `993a738e9` | merge `origin/feat/premium-kit` |
| `6ad5df490` | screen scaffolds, keyboard plumbing, zoom link, `+` morph |
| `f63d005f4` | Developer tools: Premium UI override + Premium shell demo, iOS spike flow |
| `e173b0c87` | ADR correction on `Link.AppleZoom` |

## What was built

**Switch** (`apps/mobile/src/lib/premium-ui/`, neutral: both UIs may import it)
- `ui.premium` in `@cp/domain` `FLAG_CATALOG` (boolean, default off, owner `app`): reaches the app per account through `/v1/config/bootstrap` like every catalog flag (PostHog key `ui-premium`).
- Resolution (`resolvePremiumUi`): **binary first** (no `ExpoUI` + `KeyboardController` native modules → current UI, whatever is asked), then the phone override (beats the flag both ways), then the flag. Tested (`lib/premium-ui/__tests__/premium-switch.test.ts`).
- The value is **fixed per launch** (`usePremiumUi`): a flag that changes while the app runs, or a sign-out, applies at the next launch, so navigators never swap under the person. Saved navigation is keyed per UI.
- Override: default MMKV store, key `cp.ui.premium.override`; survives sign-out, cleared by "Start as a new user". Developer tools → **Premium UI**: "on here" / "off here" / "Follow the account flag" (testIDs `dev-premium-ui-on|off|follow`; state `dev-premium-ui-state-on|off`, next-launch source `dev-premium-ui-source-binary|override|flag`). Each restarts the JS.
- Deps in `apps/mobile/package.json`: `expo-glass-effect` `58.0.2` (same line as the kit), `@expo/ui` `58.0.8` (released with `expo-router` 58.0.9; satisfies its `^58.0.8` peer), `react-native-keyboard-controller` `1.22.4` (Expo's SDK 58 pin). No install scripts, so no `allowBuilds` change. **These change the fingerprint: they ride the next native build.**

**Navigators** (premium path only; current navigators untouched when off)
- Root `_layout.tsx`: premium → `PremiumThemeProvider` (the one root instance, no `scheme`) → `PremiumKeyboardProvider` → native `Stack` (`ui/premium/shell/navigation/premium-root-stack.tsx`). `(modal)` and sheet groups of the current UI present see-through with no animation so their self-animated sheets still work inside premium.
- `(tabs)/_layout.tsx`: premium → `PremiumTabs` (`NativeTabs`): Home, Trips, Wallet, Pass with template PNG icons drawn from `Tabs.dc.html` (1.9 stroke, `test-support/render-tab-icons.ts --write` regenerates them); `minimizeBehavior="onScrollDown"`; Tokek as a `role="search"`, `disabled` trigger whose `tabPress` opens the guide sheet (`3j-1` via the screen registry, trip-aware); the trigger's route is `(tabs)/guide-circle.tsx` (redirects Home if reached). Android: Material bar, the trigger hidden, Tokek as a floating 56 button above the bar (long-press → Help).
- `(tabs)/trips/_layout.tsx`, `(tabs)/wallet/_layout.tsx`, `(trip)/_layout.tsx`, `(trip)/hub/_layout.tsx`, `(trip)/hub/[tripId]/_layout.tsx` use `PremiumStack` (native, no header by default, Reduce Motion fade 150 ms) when premium.
- **Trip hub over the tabs**: new `(trip)/hub/[tripId]/index.tsx` (`/hub/<tripId>`, access gate + local-first gate + today's `TripHubScreen` until Journeys D swaps in the premium hub). In premium, `/trips/<tripId>` redirects there; with the switch off `/hub/<tripId>` redirects back to the tab route.

**Scaffolds** (`apps/mobile/src/ui/premium/shell/`, barrel `@/ui/premium/shell`), built on the kit (`Text`, `GlassSurface`, `GlassIconButton`, `IconButton`, `PressableScale`, `SPRINGS`, `usePremiumTheme`):
- `RootScreen`: iOS native large title collapsing into the glass bar, `Stack.Toolbar` items (≤ 2, `+` = `prominent` ink, last); `header="drawn"` draws title + collapsing glass bar (Android default; iOS tabs without a stack). Children get `{ scrollProps, largeTitle }`; the list must be the first child (minimise).
- `PushScreen`: native bar with centred title + subtitle, system glass back (minimal), one action (toolbar on iOS, `headerRight` on Android); `headerless` draws clear-glass back/action over a hero (zoom destinations).
- `SheetScreen` + `sheetRouteOptions('half'|'full'|'fit')`: native `formSheet`, grabber, transparent content (iOS 26 glass), in-content Cancel / title / bold verb; dirty sheets ask before swipe-down, Cancel or back (`useDirtySheetGuard`, tested in `screens/__tests__/dirty-sheet.test.ts`); verb resolves `false` to stay open; footer rides the keyboard.
- `FullScreen` + `FULL_SCREEN_ROUTE_OPTIONS`: ✕ top-left on clear glass, optional full brightness.
- `confirmAlert` (two choices, Cancel always, system destructive style) and `HoldToConfirm` (4.55: 1.5 s linear fill from the left, light ticks at ⅓ and ⅔, success at the end, Smooth retract, screen readers get the alert).
- Keyboard: `PremiumKeyboardProvider`, `KeyboardStickyFooter`, `KeyboardAwareScroll` (interactive dismissal), `KeyboardDismissArea` (Android gesture area). The library is `require`d only when its native module exists; old builds get RN fallbacks.
- `ZoomLink` / `ZoomTarget` / `ZOOM_DESTINATION_OPTIONS`: `Link.AppleZoom` on iOS, the existing grow engine (`ui/transitions`) on Android over a fade push.
- `PlusSheetMorph`: the drawn 1.06 morph on Smooth (plus turns 45° and grows while fading, sheet glass grows from the button to inset 8 / radius 46, page scales .92, drops 14, dims, rounds 40, content rises 16 after landing; drag the grabber or back to close).

**Demo** `(dev)/premium-shell/*` (list entry "Premium shell", `dev-nav-premium-shell`, first under Labs): renders the shell directly, so it works on builds without the new native modules.

## Route-switch pattern for journey lanes

A route file keeps its URL and renders the premium or current screen. The current body moves into a local component unchanged:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { premiumRoute } from '@/lib/premium-ui';
import { WalletScreen } from '@/features/money/wallet-screen';
import { PremiumWalletScreen } from '@/features/money/premium/wallet-screen';

function CurrentWalletRoute() {
  return <WalletScreen />; // exactly what the route rendered before
}
export default premiumRoute({ premium: PremiumWalletScreen, legacy: CurrentWalletRoute });
```

- Screens use `RootScreen` / `PushScreen` / `SheetScreen` / `FullScreen` from `@/ui/premium/shell`. A sheet or full-screen route gets its presentation in its layout: `if (usePremiumUi()) return <PremiumStack><PremiumStackScreen name="add" options={sheetRouteOptions('half')} /></PremiumStack>;` (presentation can't be set from inside the screen).
- An area layout still on `expo-router/js-stack` works inside premium (its group pushes natively), but native large titles, toolbars, form sheets and `Link.AppleZoom` need that layout to render `PremiumStack` when premium (as the trip group does now).
- Trip hub links: in premium, link to `/hub/<tripId>`.
- Never import `react-native-keyboard-controller` or `@expo/ui` directly in screens; use the shell's keyboard pieces (they guard old builds).

## iOS spike

Dispatched `device.yml` run **38049046725** (`platform=ios`, `flows=e2e/spikes/premium-shell-ios.yaml`, `shards=1`, `build_url` = the 7 Oct iOS e2e-test release, since this branch's native fingerprint has no build). Not waited on. Screenshots `premium-shell-01…22` in the shard artifact answer: minimise + large-title collapse with LegendList (02) and FlashList (17); guide circle → sheet (03/04); `+` toolbar view → formSheet zoom morph (05–07); dirty sheet asks (09); card zoom into headerless page (10/11); push, alert, hold (12–14); full screen (15); drawn header and drawn morph (18–22). Optional steps keep it capturing past any failure.

## Open questions and follow-ups

1. Values not in the premium tokens yet, held in `ui/premium/shell/shell-theme.ts` for the kit to promote: guide-circle yellow radial and ring, hold fill `#ffc2dc` (dark `#5a2440`, my derivation), sheet scrim, guide circle 56 / Tokek 46, Material bar 80.
2. The guide circle draws Tokek from a bundled PNG; the per-city guide critter (the current FAB follows the active guide) needs a runtime-rendered icon (`NativeTabs.Trigger.Icon` accepts a promise source), Journeys C's call.
3. Native alerts draw the destructive choice in system red, not the design's pink (native first).
4. Android sheets use Material's 28 corner, not 46.
5. `useNoBackAffordanceGuard` and the other `[ui-qa]` guards look at the current kit; they may false-flag or miss premium screens.
6. `PlusSheetMorph` steps back only the page it wraps (a native large-title bar or the tab bar stay put); use it on drawn-header screens, or the native morph if the spike shows it works.
7. The zoom/grow import from `@/ui/transitions` is the one legacy-kit import in premium code (by design: the task names that engine); a future lint boundary should allow it or move the engine.
8. Not run locally (lane rules): `tsc`, package lint and suites. Types and lint were checked file by file with eslint; CI's typecheck is the first full type pass.

Status: DONE_WITH_CONCERNS
Summary: The premium switch, native navigators, screen scaffolds, keyboard plumbing, zoom and morph, the demo route and the ADR fix are pushed on `feat/premium-shell`; the iOS spike run 38049046725 is dispatched, not awaited.
Concerns/Blockers: Full typecheck has not run (lane rule); the spike's results decide whether the native `+` morph and list minimise hold. The new deps need the next native build before premium can turn on anywhere.
