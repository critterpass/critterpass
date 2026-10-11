# Premium kit lane report

Branch `feat/premium-kit` (from `feat/premium-redesign`). Everything below is pushed; journey lanes merge `origin/feat/premium-kit`.

## What was built

| # | Item | Where |
|---|---|---|
| 1 | `premium` token group, light + dark: colours (incl. shell values: guide circle radial + ring, hold-to-confirm fill, sheet scrim, guide circle 56 / Tokek 46, material bar 80; locked masks `#e3e4ea` / `#efe2b4`), type, radius, space, size, opacity, tilt, elevation, materials, the three springs (physical + SwiftUI forms), reduce-motion fade, 1.07 stamp and 1.09 swipe keyframes. Codegen writes `generated/ts/premium.ts`, `generated/swift/CPPremium.swift`, `generated/kotlin/CpPremium.kt`. Legacy tokens untouched. | `packages/design-tokens/src/premium/*`, `codegen/premium-*.ts`, `test/premium.test.ts` |
| 2 | `PremiumThemeProvider` (root sets the OS interface style + status bar; `scheme` pins a subtree), `usePremiumTheme`, `makePremiumStyles`, appearance setting `system \| light \| dark` in MMKV (`useAppearance`, `setAppearance`, `readAppearance`, `resolveScheme`) | `apps/mobile/src/ui/premium/theme/*` |
| 3 | Kit: Text, Icon, Button (5 variants, 3 sizes, loading verb), TextButton, IconButton, GlassSurface (`expo-glass-effect` on iOS 26, translucent fill elsewhere), GlassIconButton, GlassPill, SegmentedControl, Toggle, Stepper, Checkbox, TextField, ProgressBar, StepProgress, WizardStepper, Composer, Tag, EmptySlot, RoundStamp, RectStamp, TierLabel, CritterSticker (white edge; `variant: 'mask'` + `maskColor`, default the mode's `lockedMask`), Card, ListCard, Row, DayBadge, StatusTag, GuideNote, StatTile, PhotoCard, Avatar, CrewStack, Toast + ToastHost/useToast, Banner, OfflinePill, Spinner, EmptyState, Skeleton, LoadingCritter | `apps/mobile/src/ui/premium/**` (barrel `index.ts`) |
| 4 | Motion: `SPRINGS`, reduced-motion hook (OS or in-app setting), `PressableScale`/`hitSlopFor`, layout/enter/exit transitions, `CrossFade`, `NumberRoll`, `StampMoment` (1.07: fall, squash, page jolt, ripple, confetti, result rise, `onImpact`), `Confetti`, `SwipeDeck` (1.09: drag/fling, stamp, fly-off, next card rises, `ref.vote()`), `swipeVerdict` | `apps/mobile/src/ui/premium/motion/*` |
| 5 | Gallery `/(dev)/premium-kit` with a Light / Dark switch; list entry "Premium kit" (`dev-nav-premium-kit`) | `apps/mobile/src/app/(dev)/premium-kit.tsx`, `apps/mobile/src/ui/premium/gallery/*`, `apps/mobile/src/lib/dev-tools/dev-screens.ts` |
| 6 | Lint boundary: a `no-restricted-imports` guard by path. Premium files may not import `@/ui…` outside `premium`, `sticker` (critter renderer) and `transitions` (zoom engine), nor `@/motion…`; legacy `src/ui/**` and `src/motion/**` may not import `@/ui/premium…`. Also a `mobile-ui-premium` element for the boundaries plugin; that plugin does not resolve the `@/` alias here, so the path guard is the one that bites (checked with probe files). | `tools/lint/boundaries.js` |
| 7 | Contract doc | `docs/design-system-premium.md` |

Tests that protect behaviour: scheme resolution (`appearance.test.ts`), stepper / segmented logic (`control-logic.test.ts`), toast queue (`toast-queue.test.ts`), swipe commit rule (`swipe-verdict.test.ts`), token values and codegen output (`premium.test.ts`).

## Decisions worth knowing

- The dev list lives in `lib/dev-tools/dev-screens.ts`, not in `(dev)/index.tsx`, so the entry went there.
- Gallery sections sit in `ui/premium/gallery/` because any extra file under `app/` becomes a route; they are not in the barrel, so only the (dev) route (blocked from production bundles) pulls them. Their sample text opts out of the Lingui literal rule per file.
- Lingui catalogs and the `ui-reviewed` gate already cover the kit: `src/ui/**` maps to `common`, and `UI_ROOTS` includes `apps/mobile/src/ui/`. No path lists needed changing.
- Haptics and sounds stay with screens (the feedback bus is legacy motion): `StampMoment.onImpact` and `SwipeDeck.onVote` mark the moment.
- Confetti uses one Smooth spring per burst over the design's fan, sizes and accent colours, instead of the prototype's per-frame physics.
- Ripple stroke corrected to 3 (design inline `inset 0 0 0 3px`); ripple size 220 and start opacity .7 added.
- Swipe "out" flies left without a stamp (the design shows only "I'M IN").

## Not covered / open

- The `[ui-qa]` runtime guards (`TEXT_TRUNCATED`, `TEXT_WORD_BROKEN`) hook the legacy `Text`; premium `Text` does not report to them yet. `CritterSticker` wraps the legacy `Sticker`, so its guard still runs.
- `SCREEN_FRAME` reads the legacy dark background; light premium screens will need the check to use the dominant colour (QA tooling, not this lane).
- Tab bar rendering (foundations §8) awaits the founder; not in the kit.
- No device capture of the gallery yet (no device runs from this lane): `gh workflow run device.yml … -f flows=…` against the gallery entry `dev-nav-premium-kit`.

## Local checks

The Mac was swapping (load 80–260), so checks covered only the changed files: prettier --check on every changed file (clean); `swipe-verdict.test.ts` passed (5 tests); `premium.test.ts` passed (11 tests); a plan-id pattern scan of the changed files was clean (the `no-plan-ids` vitest worker timed out under load); ESLint on the changed files found a parse error in `SwipeDeck.tsx`, unresolved jest globals, an unused disable and a Lingui literal, all fixed in 328638e57 / dbe8b7d52. The probe files confirmed the import guard. Typecheck was not run locally (lane rule), so CI is the first typecheck.
