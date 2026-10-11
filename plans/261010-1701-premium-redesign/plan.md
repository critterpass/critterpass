# CritterPass premium redesign

Status: in progress · started 10 Oct 2026 · integration branch `feat/premium-redesign`

Founder ask (10 Oct): rebuild the whole mobile UI to the premium native design (iOS 26 glass, light + dark), current UI kept as legacy, icons → splash → navigation → components → motion → flows → native surfaces. All eyes on craft: alignment, spacing, type, colour, transitions, header buttons, keyboard states. Logic is reused; backend only for real gaps. Founder on how to run it: few big lanes, no waiting on CI/merge/conflicts, get it done.

## Sources

- Design (committed): `design/premium/` (Foundations is the baseline), renders `docs/design-renders/premium/<code>.png` + `screens.json` (`pnpm --filter @cp/design-renders run render:premium`).
- Baseline: [foundations-spec.md](foundations-spec.md). Journey specs: `reports/design-spec-261010-1701-part-*-report.md`. Platform: `reports/research-261010-1701-native-glass-platform-capabilities-report.md`. Current app: `reports/inventory-261010-1701-current-app-legacy-split-report.md`.

## Decisions (made by the controller; reversible; founder may overrule)

1. **Legacy = runtime switch, not a move.** New UI is built beside the old one. Flag `ui.premium` (account-targetable) + per-phone override in Developer tools; each route file picks the premium or legacy screen at render time on the same URL; root and tab layouts pick the premium or legacy navigators. Legacy is deleted in one PR when every flow is rebuilt.
2. **Names.** Premium kit `apps/mobile/src/ui/premium/**` (motion in `ui/premium/motion`, shell in `ui/premium/shell`); premium screens `apps/mobile/src/features/<area>/premium/**`; tokens group `premium` in `packages/design-tokens` (light + dark modes; legacy tokens untouched so web/admin keep working). Lint: premium code never imports the legacy kit, legacy never imports premium.
3. **Native first.** Native `Stack` (large titles, glass toolbar items, glass back), `NativeTabs` (iOS 26 lens + minimise on scroll, Tokek as the search-role circle opening the guide; Android Material bottom bar + guide FAB), `formSheet` for sheets, `Link.AppleZoom` for card → detail (Android overlay), `expo-glass-effect` for glass surfaces. Custom Reanimated only for stamp, swipe card, island toast, `+` → sheet fallback, Android fallbacks. Springs: Snappy 438.6/36.02, Smooth 195/27.93, Lively 157.9/17.09 (mass 1); Reduce Motion = 150 ms cross-fade.
4. **Tab bar = the native iOS 26 bar (phone 1.04).** `Tabs.dc.html`'s raised-centre pill would need a hand-drawn JS bar.
5. **Design conflicts:** Foundations > the newest frame of a screen > happy path > edge case; off-token values snap to the nearest token; product rules beat design copy (never name members who haven't joined, Tokek disclosed as AI guide where contracts say so, the real invite-code alphabet, no clipboard read before a tap, store purchase rules); a missing way out is added per the screen grammar. Undesigned states are built from the kit and logged in `docs/undesigned-states.md`.
6. **Trip hub** = 1.05 hero + Today / Plan / Map / Money; part 6's tiles fill Today. **Pass tab** = the pass/profile (9.01) as a root; Critterdex reached from it. **Map** = the new light + night style everywhere.
7. **Backend:** a lane adds small server pieces its screens need (fields, commands, payload fields) in its own area. Large new features (Wallet passes signing, flight-number lookup, peer room swap, meet-up compass camera, driver live status) go to the founder follow-up list below; no dead buttons meanwhile.

## Lanes (big, area-owned; each works in its own worktree and branch)

| Lane | Owns | Branch | Starts |
|---|---|---|---|
| Kit | `packages/design-tokens` premium group + codegen, `src/ui/premium/**` except `shell/`, `src/ui/premium/motion/**`, theme + appearance store, kit gallery `(dev)/premium-kit`, lint boundary | `feat/premium-kit` | now |
| Shell | `ui.premium` switch + override, `src/app/_layout.tsx`, `(tabs)/_layout.tsx`, premium navigators, `src/ui/premium/shell/**` (screen-type scaffolds, headers, sheets, alerts, hold-to-confirm, zoom, guide circle), route-switch helper, `apps/mobile/package.json` deps (`@expo/ui`, `react-native-keyboard-controller`, `expo-glass-effect`) | `feat/premium-shell` | now |
| Brand + native | icons (all variants), splash + launch into 2.01, `app.config.ts`, `plugins/**`, `assets/**`, `targets/**`, native modules for live activity / widgets / notifications / android surfaces / app icon, push payload fields, store shot tooling | `feat/premium-brand-native` | now |
| Journeys A | parts 2, 3, 9 (first run, joining, home, trips, crews, inbox, pass, account, Pass+) | `feat/premium-journeys-start-home-account` | after kit + shell base |
| Journeys B | part 4 (decide and plan, map) | `feat/premium-journeys-plan` | after kit + shell base |
| Journeys C | parts 5, 8 (chat, guide, critters, memories) | `feat/premium-journeys-chat-critters` | after kit + shell base |
| Journeys D | parts 6, 7 (on the trip, wallet) | `feat/premium-journeys-trip-wallet` | after kit + shell base |

## How lanes run

- No PRs, no CI waiting, no device runs from lanes (except the shell's one iOS spike run). Commit in logical chunks with conventional messages, push the branch, report. The controller merges lane heads into `feat/premium-redesign`, resolves conflicts, opens one PR to `main` per milestone, runs one CI + one device sweep, merges.
- Locally: prettier on changed files, Jest only `pnpm --filter @cp/mobile exec jest --maxWorkers=1 <file>` (≤ 2 files), no `tsc`/package-wide lint/suites, Docker off.
- UI work is judged against the design renders: every premium screen gets a design|device check at the milestone sweep.

## Milestones

1. Kit + shell base merged to main (switch off by default): founder can flip `ui.premium` on staging and see the new tabs and kit gallery.
2. Journeys A–D merged, flow by flow; native build with icons, splash, `@expo/ui`, keyboard controller and restyled native surfaces.
3. Full sweep light + dark, EN + VI; legacy deletion PR.

## Founder follow-up list

Filled as lanes hit large backend features or design contradictions they resolved by rule 5.

Larger features not built (no dead buttons meanwhile: the entry is hidden or shows what exists):
- Peer room swap (7.09): a member can only ask the organiser; a yes-from-the-other-member swap needs a backend.
- Gift and partner codes (9.17 `redeem_code`/`create_gift`): nothing mints codes yet; needs a peppered secret and the code-guessing limiter. Store offer codes work.
- Welcome back on Android (2.02): Android wipes app data on uninstall; needs Play Block Store (new native module). iOS is built.
- Recaps offline on 9.05: recaps keep no offline files today.
- Live-map replay and open count (9.19): positions are deliberately not stored and nothing counts opens.
- From the start: Wallet passes signing, flight-number lookup, meet-up compass camera (6.14), driver live status.

Calls I made (reversible; say if you want any changed):
- Tab bar = native iOS 26 bar with Tokek as the search-role circle (not the raised-centre pill).
- The ink `+` on root screens is a system toolbar button (VoiceOver and UI tests can't reach custom toolbar views on iOS 26); it still grows into its sheet and folds back.
- Pass tab = the passport page; the Critterdex is pushed from it (`/you/critterdex`).
- Splitting a stay by room is built server-side and re-splits when rooms change; someone who already settled sees a top-up or refund line instead of the ledger being rewritten.
- "Keep it to myself" for dietary needs added (not in the design); crew quests stay a push from the trip.
- Native surfaces: the meet-up Live Activity shows one late-member row (iOS 160 pt limit); the meet-up fill follows the furthest-out member; the Today widget keeps Done/Nudge and packing chips; the crew widget shows initials only; Tokek keeps the AI-guide sender label; Android Money and Critters notification settings reset once (new silent channels).
- Epic Tokek is pink (designed palette); the forms batches are updated. The published forms release is regenerated through the admin publish when this ships (it changes the live catalogue).
- Scan QR reads one photo (the camera library has no live scanner); resend's long press waits for the invitee's usual hour.

Small old-look pieces left for the polish pass after the device sweep: drag a stop onto another day in All days (long-press "Move a stop" works), the pins strip, the All-days share sheet, the rain and less-driving sketches, photo credits; other areas' chat cards until each registers a premium card.
