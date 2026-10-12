# Journey lane brief (premium redesign)

Shared contract for the four journey lanes. Your prompt names your parts, areas, worktree and branch.

## Read first

1. `plan.md` here (decisions 1–7 bind you) and the repo `CLAUDE.md`.
2. `foundations-spec.md` (the baseline: screen grammar, tokens, components, springs).
3. Your parts' spec reports in `reports/` (exact per-screen layout, header buttons, keyboard states, taps, motion, states, gaps, open questions) and the renders `docs/design-renders/premium/<code>.png` (+ `screens.json`). The design source `design/premium/CritterPass NN *.dc.html` has the exact inline values when the spec is unsure.
4. `reports/inventory-…-current-app-legacy-split-report.md` §1–2 (thin routes, containers versus views, tangled components).

## Phase 1: start now (no kit needed)

- **Backend gaps in your area** that your spec lists as small (a field, a command, a payload field, a read): build them with tests (server tests on GitHub through `pnpm test:remote` or push; never Docker locally). Large ones (plan decision 7) go to your report's follow-up list instead.
- **Logic out of views**: where a component in your area queries data or runs commands itself, pull that into a hook or container in the same feature so both the legacy view and your premium view use it. Legacy behaviour must not change.

## Phase 2: screens (when the kit and shell base exist)

Check `git log origin/feat/premium-kit` and `origin/feat/premium-shell`: when the kit has tokens + Text/Button/Glass pieces and the shell has the route switch and screen-type scaffolds (their lane reports `plans/261010-1701-premium-redesign/reports/lane-{kit,shell}-*.md` say so), `git merge origin/feat/premium-kit origin/feat/premium-shell` into your branch and build. If they are not there yet, keep going with phase 1; if phase 1 is done and they're still missing, end with `Status: BLOCKED` saying so (the controller resumes you).

- Every screen of your parts as a premium view in `apps/mobile/src/features/<area>/premium/**`, wired through the shell's route switch (the legacy screen stays when the switch is off). Use the kit (`src/ui/premium`) and shell scaffolds; never import the legacy kit. A component only your area needs lives in `features/<area>/premium/components/`; one that another lane will clearly need → build it there too and flag it in your report (the controller promotes it to the kit).
- **Craft is the job.** Exact spacing, alignment, type and colour tokens, radii and elevation from the spec; header buttons per screen type; keyboard states (what rises, what stays visible, return-key labels, dismissal); scroll behaviour (large-title collapse, sticky parts, tab bar minimise); every tap goes where the spec says; loading, empty, offline and error states; motion on the named spring (Snappy, Smooth, Lively), Reduce Motion as a 150 ms cross-fade; dark mode via the theme; Vietnamese strings (reuse existing message ids where the meaning holds; new strings get VI translations).
- Keep existing `testID`s on equivalent elements so Maestro flows keep working.
- Design conflicts: plan decision 5. Log each resolution in your report; undesigned states built from the kit go in `docs/undesigned-states.md`.

## Rules

- Change only your areas' files (your prompt lists them) plus their route files under `apps/mobile/src/app/**`. Anything else → note it in your report and continue; ask only if blocked.
- Locally: `pnpm exec prettier --write <changed files>`; Jest only `pnpm --filter @cp/mobile exec jest --maxWorkers=1 <file>` (≤ 2 files per command); never `tsc`, package-wide lint or suites; Docker off. Tests only where they protect behaviour (logic, permissions, money, sync, commands), no snapshot or markup tests.
- No PRs, no CI waiting, no device runs. Commit in logical chunks (conventional commits, no AI references, no plan/phase/finding ids; design screen codes are fine in data keys only), push your branch after each chunk. Never end your turn waiting on a background job.
- Report: `plans/261010-1701-premium-redesign/reports/lane-<name>-261010-<slug>-report.md` in your worktree (commit it): screens done (code → file), conflicts resolved, backend added, follow-ups for the founder, open questions. End your reply with the status block (`Status / Summary / Concerns`).
