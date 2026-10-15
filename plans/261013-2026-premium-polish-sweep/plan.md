# Premium UI clean sweep

Status: in progress · started 13 Oct 2026 · integration branch `fix/premium-polish-sweep`

Founder, 13 Oct 20:26: "review the new flow code, from start to finish, as many sections screens are still use the old components, some screens are missing native behavior like gesture to dismiss, or navigation show incorrect back button (< vs x), splash still the old one, this or that lost the animations, got a code top right have weird blue rectangle, add a booking sheet weird transition, and many many more… need a clean sweep on the new premium UI polished"

Baseline: [premium redesign plan](../261010-1701-premium-redesign/plan.md) (decisions 1–7 still hold), [foundations-spec](../261010-1701-premium-redesign/foundations-spec.md), journey specs `../261010-1701-premium-redesign/reports/design-spec-261010-1701-part-*-report.md`, design `design/premium/*.dc.html`, renders `docs/design-renders/premium/<code>.png` + `screens.json`.

## Rules every lane applies (the screen grammar)

1. **No legacy UI on the premium path.** With `ui.premium` on, no screen renders a legacy kit component (`@/ui/**` outside `@/ui/premium`) or a legacy feature screen. Every route reachable on the premium path renders a premium screen (`premiumRoute`) built from `@/ui/premium` + the design renders. Shared non-visual helpers (`@/ui/qa`, data hooks) are fine; visual pieces that have a premium equivalent move to it; a visual legacy piece with no equivalent gets a premium version in the kit (shell lane) or in the area's `premium/` folder.
2. **One presentation per screen type** (foundations §1):
   - *Push* (detail, list): native stack push, glass back chevron `<` top left, edge swipe back; never an `x`.
   - *Sheet* (pick, add, edit, short form): native `formSheet` (`sheetRouteOptions`), grabber, swipe down to dismiss (asks first when dirty), Cancel left + bold verb right inside `SheetScreen`; never a chevron.
   - *Full-screen modal* (camera, pass, paywall, reveal, flows that cover the app): native modal presentation, close `x` top left (or the design's place), swipe down where the design allows it; never a chevron.
   - A screen's own first screen inside a sheet/modal stack shows `x`/Cancel; screens pushed inside that stack show `<`.
   - `gestureEnabled: false` only where the design forbids leaving (reveal moments, hold-to-confirm in progress), and then the screen has a visible way out.
3. **Native first, motion kept.** Native stack transitions, form sheets and `Link.AppleZoom`; no JS-animated legacy `Sheet`/`RiseModal`/transparent-card presentation on the premium path. Every designed motion (springs Snappy/Smooth/Lively, press scale, number roll, list entrance, stamp, confetti, cross-fade) plays; Reduce Motion = 150 ms cross-fade.
4. **Header actions** are glass circles / native toolbar items with the premium ink tint: no system-blue tint, no rectangular highlight, no default `Button` chrome.
5. **Exact metrics** from the design HTML inline styles (spacing, type, radius, colours, light + dark). Undesigned states built from the kit and logged in `docs/undesigned-states.md`.

## Lanes

| Lane | Area | Branch / worktree |
|---|---|---|
| Shell + brand | navigators (root, `(tabs)`, `(modal)`, sheet groups), `lib/navigation/**`, `lib/premium-ui/**`, `ui/premium/**` (kit + shell + motion), splash + launch + hatch, header actions, transitions, keyboard | `fix/premium-polish-shell` · `polish-shell` |
| Start, home, account | parts 2, 3, 9: onboarding, joining, home, trips list, crews, inbox, pass, you/account, help, paywall/Pass+, community | `fix/premium-polish-start-home` · `polish-start-home` |
| Plan, chat, critters | parts 4, 5, 8: setup, draft, decide/vote, proposal, plan, places, explore, map, guide, chat, critters, album, recap, memories | `fix/premium-polish-plan-chat` · `polish-plan-chat` |
| Trip + wallet | parts 6, 7: trip hub, trip day, safety/SOS, drivers/rides, suppliers, crew live map, money, bookings, passes | `fix/premium-polish-trip-wallet` · `polish-trip-wallet` |

Area lanes own their area's `features/<area>/**`, route files and area `_layout.tsx` files. The shell lane owns the root, `(tabs)` and `(modal)` layouts and `lib/navigation/sheet-routes.ts`; when it changes how a group is presented it lists the area layouts that must follow in its report and the controller applies them at merge.

## Done when

- Every premium-path route listed in each lane's report with: premium screen, presentation type, back control, motions; no legacy visual imports left on the premium path (a lane-run grep in the report).
- Founder's named issues fixed: old components, swipe-to-dismiss, `<` vs `x`, splash, lost animations, the blue rectangle by "Got a code" top right, the add-booking sheet transition.
- One CI run + one device sweep (`mode: compare`, light + dark) on the integration branch; one PR to main.
