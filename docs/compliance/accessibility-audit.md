# Accessibility audit

Launch gate for accessibility (docs/code-standards.md §9): no automated violation on any journey
screen, and the manual VoiceOver and TalkBack checklist signed. State on 2026-10-07: the scanner
exists and the colour check passes; **no screen has been scanned yet and the manual pass has not
been done**, so the gate is open.

## Automated checks

Run: `pnpm tsx tools/scripts/perf/a11y-scan.ts [--density <px per dp>] [hierarchy.json ...]`

| Check | Source | Result on 2026-10-07 |
|---|---|---|
| Colour contrast of the declared text and control pairs | `contrastPairs` in `packages/design-tokens/src/validate.ts`, also asserted by `packages/design-tokens/test/contrast.test.ts` | 26 pairs, 0 below their minimum |
| Tappable controls have a name (text, accessibility label or hint, on the node or inside it) | view hierarchies saved by a device run (`maestro hierarchy`) | not run: no hierarchy files exist yet |
| Tappable controls are at least 44 pt on each side | same hierarchies; listed for review, because a hierarchy shows the frame without `hitSlop` | not run |

What the scanner cannot see: iOS hierarchies carry no tappable flag, so the screen checks are
Android only; focus order, announcements, Dynamic Type and reduced motion are manual (below).

To produce the inputs, a device run must save `maestro hierarchy > <screen>.json` after each
journey screen and upload the files; that step belongs to the device workflow
(`.github/workflows/device.yml`) and is not in place.

## Known gaps

| # | Gap | Evidence | Status |
|---|---|---|---|
| 1 | `border.control` (#5b5487) on the base background measures 2.62:1, short of the 3:1 the design system states for control borders | pinned in `packages/design-tokens/test/contrast.test.ts` ("flags that border.control…") | open: a token change needs the founder's sign-off |
| 2 | Six places switch font scaling off (`allowFontScaling={false}`): `apps/mobile/src/ui/sticker/SilhouetteSlot.tsx`, `ui/text/Text.tsx`, `ui/inputs/TextField.tsx`, `ui/inputs/CodeBoxes.tsx`, `features/explore/search/search-header.tsx` (and the input font hook's note in `ui/inputs/use-input-font.ts`) | `grep -rn "allowFontScaling={false}" apps/mobile/src` | unknown: each needs a look at the largest text size to confirm the text still scales another way or is decorative |

## Manual checklist (unsigned)

One pass per screen family (onboarding, crew, vote, setup, draft, proposal, bookings, money, trip
day, live map, critters, recap and album, community, paywall, You and account deletion), on one
iPhone with VoiceOver and one Android phone with TalkBack.

| Check | iOS | Android |
|---|---|---|
| Every control is reachable by swipe and announces a name, role and state | not done | not done |
| Reading order follows the visual order; sheets and dialogs trap focus and return it on close | not done | not done |
| Text at the largest system size: nothing clipped, no overlap, every action still reachable | not done | not done |
| Reduce Motion on: no parallax, draw-on or bounce; content still appears | not done | not done |
| Colour is never the only signal (vote state, balances, errors) | not done | not done |
| Targets are at least 44 pt, measured on the device for anything the scanner listed | not done | not done |
| Live regions: toasts, guide stream and timers are announced without stealing focus | not done | not done |
| Maps: the list alternative reaches every place the map shows | not done | not done |

Signed by: (founder or tester name, date, devices and OS versions).

Defects found by either pass are filed against the owning feature folder and fixed there; this
document keeps the list and its status.
