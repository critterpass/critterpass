# Critterpass: agent contract

Binding for every coding agent. Details: [docs/code-standards.md](docs/code-standards.md) §1 and §20.

## Read before coding

1. [docs/README.md](docs/README.md) reading order: `product-decisions.md` §1 → `code-standards.md` §1 → `system-architecture.md` §1–5.
2. Your phase file in `plans/260926-1718-critterpass-full-build/` (context links, requirements, architecture & contracts), then the task.
3. Only the `data-model*.md` / `api-contracts*.md` sections the task names; `design-system.md` + the task's renders (`docs/design-renders/screens/<label>.png`, `screens.json`) for UI.

Precedence: product-decisions §1 > §2 > contracts > older reports > design files. The plan wins over docs on ownership; the owning task writes the doc delta.

## How to work

- **Tasks are checkpoints, not session limits.** Run as many tasks or phases per pass as you can; finish each task's tests and done-when, commit, then start the next. Stop at founder gates, failing tests or missing accounts.
- **Owns list.** Change only files in the phase `owns` list and the task's `Files`. Needing anything else → stop and report `NEEDS_CONTEXT`.
- **Test ladder.** Locally, run only the tests for what you changed: `pnpm --filter @cp/<pkg> test -- <file>`, and at most the one database file you touched (`pnpm --filter <pkg> test:db -- <file>`, Docker). CI runs the package, database and turbo suites on every PR; don't repeat them on this Mac.
- **Real behaviour only, and only tests that matter.** Test doubles only at network boundaries with recorded fixtures; never mock the database. Write a test only where it protects behaviour (money, auth, permissions, sync, data, external contracts, logic with branches); no snapshot tests and no tests that restate markup or copy: the design|device sheets are the UI check ([code-standards.md](docs/code-standards.md) §17). Never weaken a test to make it pass: fix the code, or delete a test that protects nothing.
- **No ids in code.** No plan, phase, task, feature or finding ids (F-xxx, C12, P28) in code, comments, test names, migration names or commits. Design screen ids such as `3c-9` are allowed as product data keys (screen registry, fixtures). No deferral language (`TODO later`, `v2`, `MVP`) for designed behaviour.
- **Undesigned states** are built from existing components and tokens and logged in `docs/undesigned-states.md` (screen, state, rationale) for founder review.
- **Secrets.** Only `.env.example` files are committed. Real values live in `.env` (git-ignored), Railway variables, Wrangler secrets, EAS env vars and GitHub secrets. `certs/` is git-ignored. Never print secret values.
- **Commits.** Branch `feat/<area>-<behaviour>`, one commit per task, conventional commits (`feat(money): split expense by shares`), no AI references. One PR per phase, squash-merged when CI is green.

## Repo conventions

- Workspace packages are `@cp/<dir>`, ESM, and export TypeScript source directly (`"exports": {".": "./src/index.ts"}`); services bundle them with tsdown for Docker.
- Shared dependency versions live in the `catalog:` of `pnpm-workspace.yaml`; pnpm 12 blocks install scripts unless listed under `allowBuilds` (decide `true`/`false`).
- TypeScript 6.0 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`); named exports except route files, Astro pages, the Worker entry and `*.config.*`; files ≤ 300 lines.
- Wire errors: `{error: {code, message, retryable, detail?}}` with codes from `docs/api-contracts.md` §3.
- Local infra: `pnpm infra:up` (Postgres `54320`, Redis `63790`, Centrifugo `8000`, PowerSync `8080`); Testcontainers use the same Postgres image via `@cp/db/testing`.
- The brand is written **CritterPass** in user-facing text (app name, copy, web, store listings); identifiers, packages, bundle ids and domains stay lowercase (`critterpass`).
- Property-based (fast-check) and golden/render suites set an explicit budget (`describe(name, { timeout: 60_000 }, ...)`): CI runners are about 3× slower than this Mac.
- After changing the Drizzle schema of a synced table (or the powersync publication), regenerate the mobile schema: `pnpm --filter @cp/mobile exec tsx src/data/powersync/test-support/synced-schema-source.ts --write`.
- Relative imports are extensionless (`./load`, never `./load.js`): Metro cannot map `.js` to `.ts`, and lint rejects it in the app and packages.
- Run `pnpm exec prettier --write` on what you changed before committing; CI runs `pnpm format:check`. Generated output (catalogs, generated CSS) is listed in `.prettierignore` instead of being hand-formatted.
- `tools/scripts/no-plan-ids.test.ts` fails CI when feature, decision, question, phase or task ids appear in tracked source; privacy classes `C0`–`C5` are fine.
- Migrations: hand-written SQL named `<UTC timestamp>_<what>.sql`, applied by `runMigrations` (tracked by filename in `public._migrations`); every user-data table gets forced RLS, grants, a privacy class and a permission test. Staging check: `railway run --service api --environment staging -- pnpm --filter @cp/db migrate`.
- Mobile checks beyond Jest: `pnpm tsx tools/scripts/check-release-bundle.ts` (production export must bundle), `pnpm tsx tools/scripts/check-audio-assets.ts --mode=release` (every SFX cue and music guide has a bundled `@cp/sound-art` asset) and `pnpm --filter @cp/mobile exec expo-doctor`. Default verification is unit tests plus manual checks; Maestro flows run only when a change needs them.
- Device runs (Maestro flows, screenshots, design|device sheets) run on GitHub Actions, never on this Mac: `gh workflow run device.yml --ref <branch> -f platform=android -f build_url=<e2e-test APK> -f flows="e2e/<area>" [-f mode=capture|compare -f pr=<n>] [-f shards=N]`. **Android is the default** (Linux runners, plenty of capacity): the Android fingerprint has no matching `e2e-test` build, so pass `build_url` with the latest x86_64 `e2e-test` APK artifact, and don't dispatch Android runs from a branch that changes native code. **Use `platform=ios` only for iOS-specific behaviour:** keyboard, modal/sheet presentation, safe areas and the Dynamic Island, iOS-only native modules and extensions, or a bug the founder saw only on iPhone. GitHub gives five macOS runners to everything, CI's macOS jobs included. Keep runs small: `shards=1` for up to four flow files, one dispatch per flow set, never re-dispatch a set still queued, and no separate "before" runs (the founder's photos or a main capture are the before). Each shard installs the `e2e-test` build with this commit's Hermes bundle swapped in and expo-updates off, so runs never share the `e2e-test` channel; the Developer tools marker shows `js:<commit>` as proof. Shard artifacts hold JUnit, Maestro output, failure screens and screenshots, and `[ui-qa]` reports fail the shard. See `e2e/README.md`. EAS builds cost money: never trigger one for a JS-only change. A flow reaches a `(dev)` screen by tapping through the home screen's "Developer tools" entry and `apps/mobile/src/app/(dev)/index.tsx`'s list, never `openLink`. UI changes ship with real screenshots: `mode=capture` or `compare` with `pr=<n>` posts them to the PR.
- **UI review gate.** A PR that changes `apps/mobile/src/app/**`, `features/**` or `ui/**` (tests aside) needs the `ui-reviewed` label before it can merge (a required check); the controller applies it only after reading the PR's design | device sheets (`device.yml`, `mode: compare`, or `preset: sweep` for broad changes), and a later UI push removes it. Every device shard fails on `[ui-qa]` reports and on the screenshot checks (SCREEN_FRAME, KEYBOARD_BAND, EMPTY_SCREEN); a label the design sets on two lines opts out of the wrap check with `singleLine={false}` on its `Text`. The nightly sweep on main posts to the "Nightly UI sweep" issue.
- Disk is shared and small: build Android for `arm64-v8a` only, delete `ios/`/`android/` build output, simulators and emulators you create when done, and check `df -h /` before large builds.

## Status

Tick the task in the phase file with `- Status: done — <short sha>` (or `blocked — <reason>`); set phase `status` and the `plan.md` row when all tasks are done. End every pass with:

```
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Summary: one or two sentences
Concerns/Blockers: optional
```
