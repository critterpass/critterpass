# Review fixes: plan, chat and critters

Branch `fix/premium-review-plan-chat`, pushed. 14 commits, `fa7248ab5` to `6d087197b`. Paths are relative to `apps/mobile/src/`.

## Findings fixed

**HIGH**
- **Plan overlay sheets drag.** `plan/premium/sheets/overlay-sheet.tsx` and the new `use-sheet-drag.ts`:
  - The Modal opens with `animationType="none"`. The scrim fades in over 150 ms and the panel rises on Smooth.
  - The grabber band drags. Past 110 pt, or on a fast flick, the sheet goes away and keeps the flick's speed; a short drag springs back. The scrim tap and the system back play the same exit.
  - Reduce Motion gets a 150 ms fade.
  - All 12 users are covered: stop, move, share, export, version history, the three calendars, link paste, objection, why, and the guide offer claim sheet (converted to `OverlaySheet`).
  - These are still drawn sheets, not native `formSheet` routes. Each one is driven by state on its page.
- **Stop sheet dirty guard.** `OverlaySheet` takes `dirty` + `discard`. The stop sheet asks "Discard this change?" before the drag, scrim or back drops a new time or day. Tested in `plan/day/__tests__/item-sheet-dirty.test.tsx`.
- **Chat sheets drag.** The attach, mic-off, who-reacted and report sheets (`crew/premium/chat/chat-sheets.tsx` + `use-chat-sheet-drag.ts`):
  - They drag, move on Smooth, and fade out on exit.
  - Android back closes the sheet, not the chat (`BackHandler`).
  - The grabber now uses the theme colour in dark mode.
  - The who-reacted list scrolls.
- **Long message menu.** The lifted preview is capped at 40% of the screen height and clipped, and the menu position is worked out from the capped height (`menuPlacement`). It now pops in from 0.9 on Snappy, with a Light haptic when it opens.
- **Guide follow-bottom.** `guide/premium/use-follow-bottom.ts`:
  - The thread follows new lines only while the reader is at the bottom.
  - "Earlier messages" keeps the reader's place.
  - The viewport shrinking (keyboard up) keeps the last line in view.
  - Authors are a memoised Map, so the saved rows stay memoised while an answer streams.
- **Chat keyboard.** The tray height lives in a shared value. React state is set only once the keyboard has settled (`progress >= 1`), so there is one render per keyboard, not one per frame. `runOnJS` is replaced by `scheduleOnRN`.
- **shortName adoption.** Every split-on-space site in my area now calls `shortName` from `@/lib/people/member-name`:
  - setup, draft, proposal, ideas, day trips, tie line, organiser name, split, place savers, idea toast, guide meter, guide hello, chat typing, chat reply strip, quoted reply, report mute.

**MEDIUM**
- **Swipe page.**
  - The deck keeps the order cards first showed in (`use-deck-cards.ts`, tested). The `key` that remounted it is gone.
  - ♥ opens Ideas at any stage (`onIdeas` on the view).
  - The summary scrolls, has a no-match line, and hides "See them in Ideas" when there are no matches.
- **Winner reveal.** The sticker tilt is kept: the rotation moved inside the rise. The stamp now has an explicit squash (impact scale), a disc jolt, an ink ripple and confetti.
- **Chat accessibility and haptics.**
  - The header renders first for VoiceOver.
  - Reaction labels read "name · count".
  - Hit slop on `+`, sticker, send, mic and the strip ✕; the mic shows a pressed scale.
  - Haptics on send, mic hold, reacting and the report choices.
- **Report.** Sends show a toast (done or error). The reasons are a radio mark, and the whole mute row toggles.
- **Reaction chips.** Only reactions added after the row mounted pop in (0.6, Lively), and Reduce Motion is honoured.
- **Media clamps.** Photo shape is clamped to 0.75–1.5, with at most 4 tiles and "+N" on the last.
- **Timeline.** The lifted card is placed at `clock + gap8`. The slot crossing is worked out in the worklet and reaches React only when it changes, and the gestures are memoised. `timeline-stop-card.tsx` was split out to stay under 300 lines.
- **Plan check alignment.** check, changes and balance-gap all use one `gutter` edge.
- **Guide starters.** Starter cards use `minHeight` instead of a fixed height, and the thread stays at the bottom while the keyboard shrinks it.

**LOW**
- Hand-tuned springs and scale-0 entrances now use the premium springs, via a per-feature `premium/entrances.ts` (`popIn` / `riseIn`). This covers recap ×4, critters ×2, proposal ×3, vote pitch, the plan glass menu and the guide plan card.
- The fix panel enters and exits through the kit transitions.
- The new-messages pill uses the kit transitions.
- Typing line for exactly two people: "An and Bình are typing".
- Dex count fits on one line. The dex and postcard separators are module-level components.
- Whole-trip detent: with two days or fewer, the full sheet stops at its content plus 24 pt, never below half plus a grab. Tested in `premium-map.test.ts`.
- Drop a pin asks before dropping a typed name.

**Coordinator items**
- The double reveal after lock-in was real. When the close synced onto a focused Home before the `close_poll` answer came back, the reveal opened twice. Both paths now go through `openRevealOnce` (`vote/data/use-final.ts`). The regression test in `vote/premium/board/__tests__/board.test.tsx` fails without the fix.
- The proposal board had two ✕. Its view now hides the cover's header, and `board-close` is the one left. `slide-track.tsx` was split out of `board-view.tsx`, which was already over 300 lines.

## Restored
- **Pending bubble.** Photos and voice notes that have not uploaded yet show on the sender's side at the foot of the timeline (`pending-uploads.tsx`): waiting, sending with a percentage, or failed with Retry and Delete. Covered in `crew/chat/media/__tests__/media.test.tsx`.
- **Tickets and tours** on the place page (`further.offers`, `place-extras.tsx`).
- **Report a problem** on the place page, shown when there is a guide summary. Tested in `explore/premium/place/__tests__/report-profile.test.tsx`.
- All of these are logged in `docs/undesigned-states.md`.

## Not fixed
- **Native `formSheet` routes for the plan and chat sheets.** These sheets hold page state and callbacks, so I used the review's fallback instead: drawn sheets with drag and Smooth motion.
- **Chat spacer still animates `height`.** It is on the UI thread now, but it still lays out each frame. A `KeyboardStickyView`/inset rewrite needs a device check.
- **Remote chat photos still use core `Image`.** `expo-image` is not a dependency.
- **The 4.28 all-days near-empty case.** Only the detent is fitted.
- **`popIn`/`riseIn` are copied in six features.** Boundaries forbid sharing them across features. They belong in the kit (`ui/premium/motion/springs.ts`), which is the shell lane's.

## testIDs (for the e2e lane)
- **Added:**
  - `chat-upload-<id>`, `chat-upload-retry-<id>`, `chat-upload-delete-<id>`
  - `chat-report-mute`
  - `swipe-summary-none`
  - `explore-offers`, `explore-offers-open`, `explore-offers-offline`
  - `place-detail-profile-report`, `place-detail-profile-reported`, `place-detail-profile-report-failed`
- **Changed:**
  - `guide-offer-confirm` is now the `OverlaySheet` root.
  - The chat sheets' scrim and the plan sheets' scrim close after an exit animation of about 300 ms.
  - The swipe summary has no `swipe-see-ideas` when there are 0 matches.
- **Removed:** none.

## Checks
- `tsc --noEmit -p .` clean.
- eslint and prettier clean on every changed file.
- `no-plan-ids` passes.
- Jest suites touched, all passing: crew-chat-view, message-list-follow, media, item-sheet-dirty, item-sheet-read-only, premium-map, deck-cards, board, winner-reveal, hatch-screen, summary-screen, crew-mention, report-profile.
- Lingui extract and compile ran, with Vietnamese for the new ids.

## Unresolved questions
- Should the drawn plan and chat sheets become native `formSheet` routes later? That would mean moving their state into routes.
- Should the shell lane add `popTransition` / `riseTransition` to the kit, so the six copies of `entrances.ts` can go?

Status: DONE_WITH_CONCERNS
Summary: Fixed every HIGH and MEDIUM finding in plan, chat and critters, and most of the LOW ones; restored the pending-upload bubble, tickets and tours, and report a problem; stopped the double reveal; removed the second ✕ on the proposal board.
Concerns/Blockers: The sheets are drawn with drag rather than native formSheet routes, the chat spacer still animates height, and nothing has been checked on a device.
