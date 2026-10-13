# Drop the legacy UI: shell lane

Branch `feat/drop-legacy-shell`, pushed. The tip has `origin/feat/drop-legacy-ui` 218cedad9 merged in.

## Part A (pushed first)

- `ef54bfaa1` feat(people): `shortName` in `lib/people/member-name.ts`. It now reads name order through `@cp/domain` (the integration version). Family-name-first names give the given name ("Đặng Thị Ngọc Hân" → "Hân", "Dang Thi Ngoc Han" → "Han"); Western names give the first name. A stored given name wins. Emoji are skipped, and an empty name reads "Former member". `memberFirstName` delegates to it, so existing callers are fixed without edits.
- `c4b16e952` fix(premium): `ToastHost` now lives inside `SheetScreen` and `FullScreen`, and `useToast({ outer: true })` sends a toast to the page underneath. Covered by tests.
- `04a4d2a4d` perf(premium):
  - Memoised `PushScreen` and `RootScreen` options.
  - Android push pages draw their own bar: one glass `<`, the title and the action. This fixes the double back on 3.12, 4.43 and 4.28.
  - `RootScrollProps` carries `keyboardShouldPersistTaps` and the dismiss mode.
  - Pages two or more under the top of a stack freeze, through react-native-screens' `shouldFreeze`. The native stack ignores `freezeOnBlur`. Pages under see-through presentations stay live. `freeze-behind.ts` has tests.

## Part B: removed and moved

- **Switch:** `lib/premium-ui/**` is gone, along with every `usePremiumUi`/`premiumRoute`/`premiumUiThisRun` and the Developer tools override. The legacy branches of the root, `(tabs)`, `(modal)` and `(tabs)/trips` layouts are gone, as are `LaunchHatch`'s `play`, `lib/navigation/transitions.ts` and the legacy half of `sheet-routes.ts`. The server flag is untouched.
- **Kit:** 359 files under `src/ui` (all except `ui/premium`) and 36 `(dev)` files deleted; 635 files changed, −45k lines.
  - Moved to `lib`: `qa/`, `maps/region-pack`, `story/story-clock`, `documents/mrz`, `share-image/{share-actions,bundled-typefaces,share-format}`, `permissions/primer-copy`, `time/relative-age`, the test helpers (`render-ui`, the skia doubles, `memory-file-system`) and `router-internals`. `data/money/amount-edit` sits next to `amount-digits`.
  - Moved into the kit: the critter renderer (`ui/premium/stickers/art`), `stickers/guides`, the zoom engine (`shell/zoom/shared-grow`, `use-shared-source`), the doodle icons (`icons/doodles`, generator path updated), `people/member-face`, `cards/card-tone`, `cards/settings-row`, `planning/planning-shapes`, `shell/session-gate` (premium wait only), `shell/screens/modal-sheet` and `motion/entrances` (`popIn`/`riseIn`, replacing the six copies).
  - Type-only pieces were rehomed next to their users (KeypadKey, CodeStatus, PauseMonth, ReceiptLine, RouteStop, MapSheetSnap, CritterFact, ActionPillTone, HubNext).
- **Rebuilt on the kit (undesigned, logged in `docs/undesigned-states.md`):**
  - The permission primer and visit consent, as a native page sheet in `features/permissions`.
  - Share with your driver: a new `(trip)/[tripId]/drivers/share` sheet. The plan share slot now holds several entries, so "A driver or guide" shows again.
  - The driver reply and confirm cards, the trip-missing page, the NEAR ME map (on the premium spot map), the signing pad and the last-resort recovery page.
  - The Developer tools screens, on `features/dev-tools/dev-kit.tsx`.
- **Chat:** the legacy card registry and its cards are gone, and every kind draws a premium card or "unknown". Premium message bodies were not masked in problem-report screenshots; they now are, and the test is repointed. The BOOSTED pill now shows under the crew name in the premium chat header.
- **Deleted legacy leftovers:** the critters dex view and its parts, the sticker shelf, the legacy poll/changeset/proposal chat cards, Disclosure, CountryPicker, the save/merge sheets, the post-trip card, the hub tile and next-row views, DriverLegCard and late-entry.
- **Lint:** nothing may import `@/ui…` outside `@/ui/premium` (a no-restricted-imports regex app-wide plus boundaries), and the `mobile-ui` element is removed. Covered by a test in `tools/scripts/boundaries.test.ts`.
- **Vote:** one mechanical commit, `aa55ff000`: import paths plus removal of the legacy poll card.

## Part C: review findings

**Fixed:**
- The Android drawn bar.
- `Text` attaches `onTextLayout` only for UI QA or a caller.
- `NumberRoll` uses one strip node per column, with tabular digits.
- `Composer` grows to 5 lines; `+` and send sit on the last line.
- `SwipeDeck` hands the flick's velocity to the fly-off and snap-back.
- `Button`: loading keeps its variant, the pressed primary keeps its shadow, and there is a new `chevron`.
- `SheetScreen` centres the title between equal sides, and the verb keeps its width under the spinner.
- Zoom cards press in.
- The dark toggle knob is white.
- `RootScrollProps` keyboard taps.
- LOW rows: inactive tab icons use `inkSecondary`; glass buttons don't double-press on native glass; the drawn root title has a minHeight; Reduce Motion stops the layout slide; the skeleton sweeps linearly and only a shimmering block measures itself; an empty-name avatar shows the people glyph; the private router imports are pinned in `router-internals` with a test.

**Added on request:**
- `PushScreen largeTitle`.
- The `presentation.ts` and `sheet-routes` row for `(trip)/hub/[tripId]/alarm`.

**Not fixed:**
- The Android root bar glass fade (small; needs a device check).

## (dev) routes kept

`index`, `accounts`, `start-fresh`, `start-as`, `motion-lab`, `premium-kit`, `premium-shell/**`, `drivers-lab`, `supplier-lab`, `permissions`, `permissions-primer` (now the premium 2.13 page), `location-engine`, `live-activities`, `updates`, `spikes/auth`, `spikes/map`, `_probe`.

## Checks

- `tsc` is clean, eslint package-wide has no errors, and prettier is clean.
- Jest passes in the touched areas: ui/premium, lib, app, critters, crew, drivers, money, onboarding, permissions, plan-chat areas, recap, trip/hub and you.
- `no-plan-ids`, `boundaries` and the design-tokens tests pass, as does `check-release-bundle`.
- Lingui extract and compile ran.

## Risks and follow-ups

- **e2e:**
  - `e2e/gallery/**` has nothing to open now.
  - `e2e/permissions/primer.yaml` expects the legacy `primer-<kind>-toggle` ids.
  - The `dev-premium-ui-*` ids are gone.
  - Deleted labs and spikes: sticker, type, go, help, planning-map, and every spike except auth and map.
  - The visit consent ids are kept.
- **Docs that still name the old paths:** `e2e/README.md`, `docs/code-standards.md` §runtime guards, `docs/design-system-premium.md` (now `lib/qa`, `ui/premium/stickers/art`, `ui/premium/shell/zoom`).
- **Commits:** `8b98653a9` alone does not export `popIn`/`riseIn` from the kit index; the next commit (`29b89494d`) does. Intermediate commits before that are not each tsc-green.
- **Premium gaps found, not built:** the premium `Avatar` doesn't read member faces (`MemberFacesRoot` still provides them), and the sticker shelf and Settings permission section have no premium screen. `motion/island-toast`'s `IslandToast` view is now unused.
- `src/expo-types.d.ts` references `expo/types/metro-require`. The deleted gallery used to pull it in, and eslint needs it for `process.env` types.

## Unresolved questions

1. Should the sticker shelf and the Settings permissions list get premium screens?
2. Should the premium `Avatar` draw the member's chosen face (photo or critter) from `useMemberFace`?

Status: DONE_WITH_CONCERNS
Summary: The premium switch and the legacy kit are gone, the shell and kit review fixes and the added asks are in, and every check passes on the merged branch.
Concerns/Blockers: The e2e lane must retire or repoint the gallery, legacy primer and premium-switch flows, and three docs still name the old kit paths.
