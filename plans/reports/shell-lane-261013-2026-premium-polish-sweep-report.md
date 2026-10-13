# Shell + brand lane report: premium polish sweep

Branch `fix/premium-polish-shell` (worktree `polish-shell`), with `fix/premium-polish-sweep` merged in three times (trip-wallet, plan-chat, start-home lanes). JS only: no native build needed.

## Findings → fixes

| Founder issue / finding | Cause | Fix |
|---|---|---|
| Sheets missing swipe-down, cross-area sheet shown as a page | Premium root presented `(modal)` and every sheet group as `transparentModal` + `animation: 'none'` (built for the JS `Sheet`); a native stack never presents its first screen as a sheet, so New poll / pitch / appearance opened from another area showed as a full page | `lib/navigation/presentation.ts`: one list of every premium sheet/modal route → `sheet` (detents), `modal` (page sheet), `cover` / reveal, `drawn`. Root stack (`premium-root-stack.tsx`) presents a group by the route it was opened on (first-child chain, any depth); `(modal)` premium is a native stack (`app/(modal)/_layout.tsx`). On Android a sheet group rises as a page (the native sheet can't hold a stack) |
| `SheetScreen` "shown as page" | Was "first screen of its stack" | `sheet-screen.tsx` `useShownAsPage` reads the placement: a real sheet when its own stack or its group (iOS) presented it as a sheet |
| `(modal)` lost its entrance animation | `animation: 'none'` on the group | Covers slide up natively, reveals fade, the guide thread is a page sheet with swipe-down |
| `<` vs `x` | First page of a pushed group got no back (nested native stack has none); presented first pages showed a back | `use-screen-placement.ts` + `PushScreen`: native back only when pushed on its own stack; drawn glass `<` (iOS toolbar item `chevron.left`) on a group's first page; `x` on the first page of a sheet/modal; a cold link with nothing under it gets a back to Home |
| Blue rectangle on "Got a code?" top right | `Clipboard.ClipboardPasteButton`: under Fabric its `backgroundColor` prop paints the host view (a rectangle) and the paste control keeps the system tint | Kit `PasteButton` (the design's floating pill, reads the clipboard on tap). Toolbar items now always carry the ink tint and `selected={false}` (`header-actions.tsx`) |
| Add-booking sheet weird transition | `toolbar-plus-morph.tsx` grew a drawn half-sheet, then the native sheet rose under it and the shape faded | Deleted; the native `+` opens its form sheet directly (`root-screen.tsx`). `PlusSheetMorph` stays for drawn roots |
| Splash still the old one | Native splash assets already match 10.01/10.03 (in the 12–13 Oct iOS builds); the root mounted the legacy `LaunchHatch`, whose "Tokek waves" beat played over every premium cold start | `_layout.tsx` `LaunchAndIsland`: premium → `PremiumLaunch` (stamp on first launch only, nothing later), hatch with `play={false}` only records the reveal. iOS caches launch screens: a phone may need a restart to show the new native one |
| Legacy island toast on premium ("icon back to Passport") | Root always drew `IslandToast` | Root premium `ToastHost` + kit `ExternalToasts` takes the island queue's toasts and shows premium ones; island not drawn on premium. Found and fixed a crash: dismissing inside the queue's notify broke its `scheduleNext` (now taken in a microtask) |
| Motion audit | Press scale, springs, CrossFade, NumberRoll, ToastHost, reduced motion all match §7 | Reduce Motion now also fades sheet/modal rises (root + `PremiumStack`), self-drawn screens keep `none` |

## API for area lanes

- Presentation: add the route to `lib/navigation/presentation.ts` (shell-owned); in the area layout either keep per-screen options or use `<PremiumStack navigator="crew">` (every listed screen gets its options) or `presentedScreenOptions('crew/[crewId]/invite')`.
- Back/close: `PushScreen` decides (`leading="auto"`); override with `leading="back" | "close" | "none"`, pass `closeLabel` for the `x` label. `SheetScreen` = Cancel, `FullScreen` = `x`. `useScreenPlacement()` / `leadingControlFor()` for screens drawing their own header.
- Kit additions (exported from `@/ui/premium` / `@/ui/premium/shell`): `PasteButton`, `paste` glyph, `ExternalToasts`, Toast `actionLabel`, `presentationOptions`, `presentedScreenOptions`, `SELF_ANIMATED_SHEET`, `useScreenPlacement`, `leadingControlFor`, `PremiumStack navigator`.

## Changes the controller must apply (area files)

1. Replace every `Clipboard.ClipboardPasteButton` on the premium path with `PasteButton`: `onboarding/premium/invite/PremiumCodePage.tsx:77` (the blue rectangle), `onboarding/premium/paste-offer/PremiumPasteOffer.tsx:225`, `explore/premium/search/find-clipboard.tsx:50`, `explore/premium/search/link-paste.tsx:74`.
2. Monetize `(modal)` screens still draw their own entrance (`components/drawn-page.tsx`, `components/modal-sheet.tsx`): paywall/index, paywall/compare, paywall/welcome, boost/[tripId], boost/stamped. Drop the JS slide/rise, then flip their rows in `presentation.ts` from `DRAWN` (suggest paywall/welcome/stamped `COVER`, compare pushed inside the cover, boost `FULL` sheet with `SheetScreen`).
3. `vote/premium/poll/new-poll-sheet.tsx:84` passes `dirty` without `discardPrompt`, so the guard is off (needs both). The guard itself works with native form sheets, also group-presented (prevention propagates to the group route and `removePrevented` reaches the sheet).
4. Premium loading under `SessionGate` (`ui/states/SessionGate.tsx`, not in my owns): add a waiting-component context in `ui/states` (default `SessionWaiting`) and provide `LoadingCritter` from the premium branch of `RootNavigator` in `_layout.tsx`.
5. Area layouts may drop now-duplicate per-screen options for `SELF_ANIMATED_SHEET` routes (crew `index` only remains `DRAWN`).

## Not done / follow-ups

- "Sheet dismissed" signal for `sheet-handoff.ts`: no reliable JS event (the sheet unmounts with its route; a form sheet's presenter gets no appear callback). Timed hand-off stays.
- Kit gaps still on the premium path (visual): `ui/media/lightbox/Lightbox` (album photo viewer; plan-chat asked for a premium one with `x` top-left), `ui/media/MediaLayer` (photo with credits), `ui/documents/SignatureLayer`, `ui/icons/generated` doodles; one shared story player. Non-visual helpers that may stay: `ui/avatar/guides` (60 uses), `story-clock`, `mrz`, `share-actions`, `ShareSheet` constants, `member-name`, `region-pack`, `StaleCaption.relativeAge`, `SettingsRow` type, `RootErrorBoundary`.
- Lane-made kit candidates (not moved): `CodeTiles`, `sheet-handoff.ts`, `money/premium/receipt/scan-sheet.tsx`, `page-sheet.tsx`, `OtpTiles`, `SearchBox`, `volume-slider`.
- `_layout.tsx` is over 300 lines already (lint counts code lines, passes at 300).

## Checks

Jest: `presentation.test.ts` (10), `launch-hatch.test.tsx` (5), `launch-hatch-routing` (2), `premium-external-toasts.test.tsx` (1), `chat-message-kinds` (2), all green. ESLint + prettier on every changed file; `no-plan-ids` green. Device run (iOS, run 38415271991, flows `e2e/premium/first-run.yaml wallet.yaml plan-vote.yaml`, `build_url` = latest iOS e2e-test build 7e927bb5): this branch's bundle installed and launched on the current UI (the `js-commit` check passed), but all three premium flows stopped at their first step, `dev-premium-ui-source-(flag|override)`: that build has no premium native modules, so the switch stays off (`binary`). No iOS e2e-test build matches this fingerprint (489c8961…), and lanes don't start builds. Premium sheet/modal presentation and the launch are therefore not yet device-checked: run `native-build.yml` (profile `e2e-test`, ios) on the integration branch, then the same three flows.

## Unresolved questions

- Covers: native `fullScreenModal` has no swipe-down; covers that should swipe (boarding pass, phrase) would need the page sheet instead. Kept full screen with `x` per foundations; say if you want swipe.
- `PasteButton` makes iOS show its "Allow Paste" prompt on each tap until the person picks Allow in Settings (the system paste control never asked). Reversible.
