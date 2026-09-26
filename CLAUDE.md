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
- **Test ladder.** Narrowest first: `pnpm --filter @cp/<pkg> test -- <file>` → the package → `pnpm turbo run lint typecheck test --filter=...[origin/main]`. Database suites: `pnpm --filter <pkg> test:db` (Docker).
- **Real behaviour only.** Test doubles only at network boundaries with recorded fixtures; never mock the database; never weaken a test.
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

## Status

Tick the task in the phase file with `- Status: done — <short sha>` (or `blocked — <reason>`); set phase `status` and the `plan.md` row when all tasks are done. End every pass with:

```
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Summary: one or two sentences
Concerns/Blockers: optional
```
