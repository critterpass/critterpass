# Premium design system

The native redesign's tokens, kit and motion. Exact values live in [foundations-spec.md](../plans/261010-1701-premium-redesign/foundations-spec.md) and the Foundations source (`design/premium/CritterPass 01 Foundations.dc.html`); this page is the contract for using them. The legacy system ([design-system.md](design-system.md)) stays as it is for the web site, the admin console and the legacy app UI.

## 1. Tokens (`@cp/design-tokens`, `premium`)

A separate group from the legacy `tokens` tree, so nothing that reads the legacy values changes.

| Group | What it holds | Modes |
|---|---|---|
| `premium.modes.{light,dark}.color` | ink, ground, card, control, muted text, hairline, status / banner tints, field rings, locked masks, guide circle, hold fill, sheet scrim | light + dark |
| `premium.modes.*.elevation` | `card`, `raised`, `float`, `toast`, `sticker`, `ink`… as shadow layers | light + dark |
| `premium.modes.*.material` | glass `clear`, `regular`, `nav`, `sheet`: tint, blur, saturation, the solid fill where there is no blur, shadow stack, foreground | light + dark |
| `premium.accent` | crew colours (sun, pink, sky, mint, tangerine), paper, sticker edge | one value |
| `premium.stamp`, `premium.signal` | stamp inks (ring + text), success check, offline dot, error disc | one value |
| `premium.type` | every type style: size, weight, tracking, Dynamic Type cap, family (SF Pro, Borel for the guide) | one value |
| `premium.radius`, `space`, `size`, `opacity`, `tilt` | shape, spacing, component sizes (44 hit, 56 pill…), sticker and stamp rotations | one value |
| `premium.spring` | Snappy 438.6 / 36.02, Smooth 195 / 27.93, Lively 157.9 / 17.09 (mass 1), with SwiftUI response / damping | one value |
| `premium.motion` | reduce-motion fade (150 ms), stamp (1.07) and swipe (1.09) keyframe values, toast hold, shimmer, bob | one value |

Codegen (`pnpm --filter @cp/design-tokens build`) also writes `generated/swift/CPPremium.swift` and `generated/kotlin/CpPremium.kt` for the widgets, Live Activities and other native surfaces. Never hard-code a premium value in app or native code; add it to the group.

## 2. Theme

| API | Use |
|---|---|
| `PremiumThemeProvider` | Root provider resolves the appearance setting against the phone, sets the OS interface style (native glass, alerts, keyboard follow it) and the status bar. `scheme` pins a subtree (boarding passes, the kit gallery). |
| `usePremiumTheme()` | The resolved theme: `color`, `accent`, `type`, `radius`, `space`, `size`, `shadow` (`boxShadow` text), `material`, `materialShadow`, `spring`, `motion`. |
| `makePremiumStyles((t) => …)` | A style sheet built once per scheme. |
| `useAppearance()`, `setAppearance()`, `readAppearance()`, `resolveScheme()` | The stored `system \| light \| dark` setting (Edit profile writes it). |

## 3. Kit (`@/ui/premium`)

Import from the barrel. Every control is at least 44 pt to tap, carries a label, caps Dynamic Type per its type style and presses on Snappy.

| Area | Components |
|---|---|
| Text and icons | `Text` (type tokens, tones), `Icon` |
| Buttons | `Button` (primary ink pill, secondary, control, floating, destructive; 56 / 40 / 34; loading with the progressive verb), `TextButton`, `IconButton` (white, ink, control, disabled) |
| Glass | `GlassSurface` (clear, regular, nav, sheet: `expo-glass-effect` on iOS 26, translucent fill elsewhere), `GlassIconButton` (44), `GlassPill` (title + subtitle) |
| Controls | `SegmentedControl`, `Toggle`, `Stepper`, `Checkbox`, `TextField` (default, focused, error + helper), `ProgressBar`, `StepProgress`, `WizardStepper`, `Composer` |
| Stickers and stamps | `Tag`, `EmptySlot`, `RoundStamp`, `RectStamp`, `TierLabel`, `CritterSticker` (the one critter renderer with the white edge; `variant="mask"` for locked silhouettes) |
| Cards and people | `Card`, `ListCard`, `Row` (item, person), `DayBadge`, `StatusTag`, `GuideNote` (Tokek or Pon tint), `StatTile`, `PhotoCard`, `Avatar`, `CrewStack` |
| Feedback and states | `Toast` + `ToastHost` / `useToast` (done, critter, error, person; above the tab bar), `Banner` (guide, info, success, error), `OfflinePill`, `Spinner`, `EmptyState`, `Skeleton`, `LoadingCritter` |

Rules:

- Glass is for chrome over content (headers, the tab bar, sheets, floating controls). Never put glass inside a card.
- The kit never imports the legacy kit (`@/ui/*` outside `premium`, `@/motion`), and the legacy kit never imports the premium kit; lint enforces both (`tools/lint/boundaries.js`). The shared engines are the critter renderer (`@/ui/sticker`), the shared-element zoom (`@/ui/transitions`) and the `[ui-qa]` checks (`@/ui/qa`): premium `Text` reports truncated, word-broken and wrapped labels like the legacy `Text`, and `singleLine={false}` opts a two-line label out of the wrap check.
- The kit holds no copy: screens pass translated labels.
- The gallery `app/(dev)/premium-kit.tsx` shows every component in light and dark for device captures.

## 4. Motion (`@/ui/premium`, `motion/`)

Three springs, nothing else animates. Under Reduce Motion (the phone's setting, or the in-app motion setting at reduced or off) every move becomes a 150 ms cross-fade; stamps still land, without falling.

| Piece | Spring | Use |
|---|---|---|
| `SPRINGS.snappy` | Snappy | Tabs, toggles, chips, press feedback; done before the finger lifts |
| `SPRINGS.smooth` | Smooth | Sheets, zooms, rows entering and leaving, number rolls; no overshoot |
| `SPRINGS.lively` | Lively | Stamps, stickers, the island, confetti; one wobble |
| `PressableScale`, `hitSlopFor` | Snappy | Press scale (.97) and the 44 pt hit area |
| `layoutTransition`, `enterTransition`, `exitTransition` | Smooth | Reflow, insert and remove |
| `CrossFade` | Smooth | A value or label swapping in place |
| `NumberRoll` | Smooth | Amounts roll digit by digit; separators stay still |
| `StampMoment` | Lively | 1.07: fall, squash, page jolt, ink ripple, confetti, result card rising; `onImpact` plays the haptic and sound |
| `SwipeDeck` | Snappy, Smooth, Lively | 1.09: drag and fling (a third of the card or a fast flick commits), stamp lands, card flies off, next card rises; `ref.vote()` for the ✕ / ✓ buttons |
| `usePremiumReducedMotion()` | | Whether motion runs reduced |

Haptics and sounds stay with the screen (the feedback bus); kit motion exposes the moment (`onImpact`, `onVote`) instead of firing them itself.
