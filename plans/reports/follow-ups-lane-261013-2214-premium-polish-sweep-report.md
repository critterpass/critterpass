# Follow-ups lane report: premium polish sweep

Branch `fix/premium-polish-sweep` (worktree `premium-polish`). JS only, no native build needed. `origin/fix/premium-polish-ci` merged in (116db0f49, no conflicts).

## Commits

| sha | what |
|---|---|
| 881393cad | Monetize `(modal)` screens on native presentation (boost a `SheetScreen`, compare a native push, `DrawnPage` slide removed) |
| 95a00a693 | Discard prompts: new poll, the guide's ask sheet |
| ba3175ecd | Premium session wait under `SessionGate` |
| 98fbc67d4 | Kit `PhotoViewer` + `PhotoLayer`; viewer gesture engine moved to `lib/media/viewer` |
| 7c8f349ef | Founder A: kit `PasteButton` everywhere + Settings hint |
| c3568b4d0 | Founder B: covers → tall sheets |
| d00d8859a | Founder C: camera permission asked after presenting |
| ef71efabe | vote, places, money layouts use `PremiumStack navigator` |

## What changed

1. **Monetize.** In `lib/navigation/presentation.ts`, boost is now `FULL`, stamped `COVER`, paywall/index + welcome `FULL` (founder B), and compare is listed in `PUSHED_IN_MODAL` (`presentationOf` returns undefined, so it is a push with `<`). `boost-premium.tsx` uses `SheetScreen`, and `SheetScreen` gained `subtitle` (`ui/premium/shell/screens/sheet-screen.tsx`). `components/drawn-page.tsx`: the JS slide is gone, the leading control follows the placement, and the top inset is measured so the page sits right when pushed inside a sheet. `ModalSheet` stays only for the seat-cap presenter (an overlay, not a route). The paywall visa drop, stamp slams, confetti and welcome visa motions are unchanged.
2. **Discard prompts.** `vote/premium/poll/new-poll-sheet.tsx` now passes `discardPrompt`. `setup/premium/ask/ask-sheet.tsx` gets `dirty` (words typed, not sent) plus a prompt. I left `plan/premium/draft/change-day-view.tsx` alone: its redraft `router.replace`s after an async send, outside the guard's commit, so it would ask after a successful send. Other unguarded `SheetScreen`s with inputs only hold search queries.
3. **Session wait.** `ui/states/SessionGate.tsx` adds `SessionWaitingProvider` (a render function, default the current skeleton). Under premium, `app/_layout.tsx` provides `renderPremiumSessionWaiting` (`ui/premium/states/SessionWaiting.tsx`). The premium root moved to `ui/premium/shell/navigation/premium-root.tsx` so `_layout.tsx` stays at or under 300 lines.
4. **Kit gaps.** `ui/premium/media/photo-viewer.tsx` is inline in its cover: ✕ top-left on clear glass, a centred counter, swipe, drag down, pinch/double-tap via `ZoomPage`. `ui/premium/media/photo-layer.tsx` shows the photo in full colour, fades it in, saves it for offline, and puts the credit on a dark plate. `lib/media/viewer/{lightbox-model,zoom-page,lightbox-video}` were moved from `ui/media/lightbox` because the kit may not import the legacy kit; `ZoomPage` now takes `settleMs`. `creditFor` is now `lib/media/credit-line.ts`. Switched callers: album premium viewer, explore swipe page, vote guest guide. The reanimated test stand-in gained `get`/`set`. Test: `ui/premium/media/__tests__/photo-viewer.test.tsx`.
   - **Shared story player: not extracted.** Both players need `@/motion/patterns/story-progress`, and the recap one also needs `@/ui/story/story-clock`. The kit lint bans both, so a shared player first needs those two moved into the kit. The trailer could then wrap `PremiumStoryPlayer`, though its track colour differs.
5. **Layouts.** `app/{vote,places,money,crew}/_layout.tsx` are now `<PremiumStack navigator=…>`. Wallet, bookings, explore, pass and you keep their own options: their routes are not in the list, or their options differ.

### Founder decisions

- **A. Paste.** `ui/premium/buttons/PasteButton.tsx` with `paste-read.ts` (tested). On iOS it calls `hasStringAsync`, then `getStringAsync`. If the read comes back empty while the clipboard holds text, that is a refusal. After any refusal, and once per install after an iOS paste (`lib/permissions/paste-hint.ts`, MMKV), it shows an inline caption with "Open Settings" (`Linking.openSettings`). The hint is inline rather than a toast because the root toast host draws behind native sheets. The pill is new `onEmpty`. The four system controls are replaced. The onboarding offer still shows only where `isPasteButtonAvailable` (iOS 16+).
- **B. Tall sheets.** The `(modal)/guide/{dietary,phrase,camera,voice,practice}`, `(modal)/bookings/pass/[id]`, `memory/[memoryId]`, `crew/new` and paywall/welcome rows are now `FULL`, and the wallet stack's `pass/[id]` uses `sheetRouteOptions('full')`. The following stay covers: `boost/stamped`, hatch, encounter, SOS, stories/trailer, album photo, `money/add`/`scan`, `places/search`. New `ui/premium/shell/navigation/screen-insets.ts` (`useShownAsSheet`, `useScreenInsets`): in a sheet the top inset becomes the grabber band. `FullScreen` and the 13 affected screens use it. None of these screens has its own pan or map; their ScrollViews hand off to the sheet natively.
- **C. Camera.** Cause: `features/guide/camera/menu-camera.tsx` and `critters/encounter/live-camera.tsx` called `requestPermission()` in a mount effect, during the modal's presentation.
  - New `lib/permissions/camera-access.ts` (step machine, tested) and `lib/navigation/use-presented.ts` (`transitionEnd`, or a 600 ms fallback).
  - Premium point-and-ask now shows `features/guide/premium/camera/camera-ask.tsx` ("Allow camera" raises the ask; the preview fades in; a refusal shows the existing "camera is off" state with Open Settings).
  - Legacy and the encounter ask by themselves, but only once presented.
  - Chat camera (`device-media`) and the receipt/booking scanners already ask on tap, through system UI.

## Still legacy on the premium path (final grep, `features/*/premium`)

The remaining `@/ui/…` imports outside the kit are non-visual, or visual but listed:

- **Non-visual:**
  - `avatar/guides` (60): the guide catalogue
  - `qa/back-affordance` (6)
  - `story/story-clock` (3): a context
  - `documents/mrz` (3): text
  - `share-image/share-actions` (2) and `ShareSheet` (`SHARE_SIZE` constant)
  - `states/StaleCaption` (`relativeAge` function)
  - `people/member-name`
  - `map/region-pack`
  - `inputs/SettingsGroup` (type)
  - `shell/RootErrorBoundary` (logic)
- **Visual, listed:** `documents/SignatureLayer` (recap signature sheet) and `icons/generated` (explore doodles). Both left as briefed.

## Checks

- **Jest:**
  - presentation: 11 passed
  - photo-viewer: 3 passed
  - lightbox: 5 passed
  - media-layer + lightbox-model: 19 passed
  - paste-read: 4 passed
  - camera-access: 2 passed
  - live-camera: 10 passed
- **Typecheck and lint:** `tsc --noEmit -p .` clean. ESLint is clean on all 88 changed TS files, prettier is clean, and `no-plan-ids` is green. Catalogs were extracted and compiled, with Vietnamese filled.
- **Docs:** undesigned states logged in `docs/undesigned-states.md`.

## For the controller / unresolved

- Device check needed (iOS e2e-test build), covering four things:
  1. Tall sheets: that the `useScreenInsets` top looks right, the guide camera's swipe-down, and the paywall → compare push inside the sheet.
  2. Boost opened from a trip and then replaced by `stamped`. The group was presented as a sheet, and a presented screen can't change to a cover, so stamped probably shows in the full sheet.
  3. The camera ask flow.
  4. The paste hint.
- The once-per-install paste hint is marked shown even when the paste moves straight to another screen, so the person may never see it.
- `change-day` has no discard guard (see above).
- The boost sheet keeps Cancel, where 9.12 draws a ✕.

Status: DONE_WITH_CONCERNS
Summary: All brief tasks and founder decisions A–C are done and pushed except the shared story player, which can't be extracted cleanly under the kit's import rules and is listed instead. tsc and lint are clean.
Concerns/Blockers: Native presentation changes (tall sheets, boost→stamped replace, camera ask) are not device-checked; the change-day sheet has no discard guard.
