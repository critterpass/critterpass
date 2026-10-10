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
