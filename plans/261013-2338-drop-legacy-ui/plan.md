# Drop the legacy UI

Status: in progress · started 13 Oct 2026 · integration branch `feat/drop-legacy-ui` (off `fix/premium-polish-sweep`)

Founder, 13 Oct 23:38: "can drop the old UI code entirely."

The premium UI becomes the only UI: no `ui.premium` switch, no phone override, no `premiumRoute`, no legacy screens, navigators, kit or tests. OTA safety: `runtimeVersion` is the fingerprint policy, so an update only reaches binaries built with the premium native modules.

## Rules

- Route files render their premium screen directly (keep the URL; deep links, registry and restore keep working). Layouts keep only the premium navigator branch.
- Delete legacy screens and components once nothing on the premium path imports them. Keep non-visual logic (data hooks, models, formatters, services, permission/state machines) and its tests; move a non-visual helper that lives in a legacy UI folder next to its user (or `lib/`), never into the premium kit if it is not visual.
- Tests: delete tests that only cover deleted legacy UI; keep and repoint tests that protect behaviour (money, sync, permissions, links, logic with branches) to the premium screen or the extracted logic. Never weaken a test to pass.
- No new legacy imports: the lint boundary ends up as "nothing imports `@/ui/**` except `@/ui/premium/**`".
- e2e: the release gate (`e2e/happy`), the screens sweep (`e2e/screens`) and area flows run on the premium UI; legacy-only flows and spikes are deleted or rewritten. The PR merges only when CI, the Android happy gate and the premium compare sweep pass.

## Lanes

| Lane | Area | Branch |
|---|---|---|
| Start, home, account | onboarding, home, crew (not live-map), you, help, monetize, community, go, inbox | `feat/drop-legacy-start-home` |
| Plan, chat, critters | setup, plan, vote, proposal, explore, places, guide, chat, critters, album, recap, memory | `feat/drop-legacy-plan-chat` |
| Trip + wallet | trip, trip-day, safety, drivers, bookings, money, crew live-map, suppliers | `feat/drop-legacy-trip-wallet` |
| e2e + docs | `e2e/**`, `tools/scripts/ci-device/**`, `docs/design-system.md`, screen registry + renders mapping, CLAUDE.md UI notes | `feat/drop-legacy-e2e` |
| Shell (last) | switch infra, root/(tabs)/(modal) layouts, `lib/navigation` legacy transitions, legacy kit `src/ui/**`, dev tools override, lint boundary | after the area lanes |
