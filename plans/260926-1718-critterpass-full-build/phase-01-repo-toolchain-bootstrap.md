---
phase: 1
title: Repo & toolchain bootstrap
status: pending
depends_on: []
wave: 1
features: []
screens: []
tasks: 10
owns:
  - package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, eslint.config.js, .prettierrc, vitest.workspace.ts, renovate.json, .gitignore, .nvmrc, .npmrc, .env.example
  - README.md, CLAUDE.md, docs/README.md (one-line path update only)
  - .github/**
  - .eas/workflows/**
  - apps/mobile/{package.json,app.config.ts,eas.json,tsconfig.json,babel.config.js,metro.config.js,jest.config.ts,.env.example}, apps/mobile/src/app/_layout.tsx, apps/mobile/src/app/index.tsx
  - apps/web/{package.json,astro.config.mjs,wrangler.jsonc,tsconfig.json}, apps/web/src/pages/index.astro
  - apps/admin/{package.json,vite.config.ts,wrangler.jsonc,tsconfig.json,index.html}, apps/admin/src/main.tsx
  - services/api/{package.json,tsconfig.json,Dockerfile,railway.json,.env.example}, services/api/src/{index.ts,app.ts,env.ts,routes/health.ts}
  - services/worker/{package.json,tsconfig.json,Dockerfile,railway.json,.env.example}, services/worker/src/{index.ts,env.ts,health.ts}
  - services/media-worker/** (skeleton + signed-read handler)
  - packages/domain/src/media-signature.ts (HMAC sign/verify helper)
  - packages/*/{package.json,tsconfig.json,src/index.ts} (manifests only; each later phase owns its package src)
  - infra/docker-compose.yml, infra/docker/**, infra/railway/**, infra/cloudflare/**, infra/centrifugo/config.local.json, infra/powersync/service.local.yaml
  - tools/design-renders/**, tools/scripts/env-check.ts, tools/scripts/check-release-bundle.ts
---
# Phase 1 — Repo & toolchain bootstrap

## Context links
| Source | Section |
|---|---|
| `docs/system-architecture.md` | §2 topology, §3 repo layout + import rules, §6 envs & secrets, §8 pinned versions, §10 ops, §14 domains |
| `docs/code-standards.md` | §1 agent rules, §2 TS conventions, §13 DB, §17 testing, §18 security, §19 git, §20 DoD |
| `docs/product-decisions.md` | D3, D4, D16, D17, D20 |
| `plans/reports/researcher-260926-1649-custom-hono-backend-report.md` | Railway/PlanetScale topology, env, egress, backups |
| `plans/reports/researcher-260926-1143-web-links-ops-report.md` + fact-check | EAS (fingerprint runtimeVersion, channels), Sentry, CI |
| `plans/reports/researcher-260926-1143-mobile-framework-report.md` + fact-check | Expo SDK 58 / RN 0.88 setup, dev client |
| `docs/design-renders/scripts/*.mjs` | scripts to move into `tools/design-renders/` |

## Overview
Goal: a private GitHub monorepo (pnpm + Turborepo) that every later agent session can clone, install, run locally (`docker compose up` + `pnpm dev`), test and deploy to staging, with cloud accounts provisioned and secrets stored outside git.
Done when: `pnpm i && pnpm turbo run lint typecheck test build` is green locally and in CI; `docker compose -f infra/docker-compose.yml up` gives Postgres 18 (logical replication + pgvector/pg_trgm/unaccent), Redis 8, Centrifugo v6 and PowerSync healthy; api/worker `/health` answer on Railway staging (Singapore) through fixed outbound IPs against PlanetScale staging; web/admin/media-worker deploy to Cloudflare staging; the Expo dev client builds on EAS for iOS and Android.

## Accounts already provisioned by the founder (2026-09-26) — reuse, never create duplicates
| Account | Identifier | Notes |
|---|---|---|
| GitHub | `https://github.com/critterpass/critterpass.git` (org `critterpass`, repo `critterpass`, empty) | add as `origin`; do not `gh repo create` |
| Railway | project `15372b45-8aeb-4a74-87d9-67b860e910a0`, existing environment `d94cb6e4-bba7-4182-9836-d83a09811434` (empty project) | region Southeast Asia (Singapore) for every service; use the `use-railway` skill / Railway MCP; confirm which env the existing id is and add the other of staging/production |
| Sentry | org `critterpass`, project `critterpass` (DSN given by founder; stored in Claude memory `critterpass-accounts`, else ask) | use the existing project for `mobile`; create the other service projects in the same org |
| Expo EAS | project id `c06dadf1-1916-4cf8-8189-f650eaf560ee` | `eas init --id c06dadf1-1916-4cf8-8189-f650eaf560ee` inside `apps/mobile` |
| PlanetScale | no database yet; `pscale` CLI + hosted MCP (`planetscale`, project scope) + PlanetScale skills installed on the dev machine | founder runs `pscale auth login`; agents use skills `planetscale-pscale-cli-automation` (always `--format json`) and `planetscale-change-gates-and-approval-contract`: creating the billed HA database needs explicit founder approval |

## Requirements
| Area | Requirement | Decision |
|---|---|---|
| Repo | `git init`, `origin` = existing private repo `critterpass/critterpass`; `main` protected (PR + green CI, squash merge) | D17, code-standards §19 |
| Monorepo | pnpm (current stable major at bootstrap, pinned exactly via `packageManager`; research cited 12) workspaces `apps/*`, `services/*`, `packages/*`, `tools/*`; Turborepo 2.11 tasks `build, lint, typecheck, test, dev` with correct `dependsOn` | D17 |
| TypeScript | `tsconfig.base.json`: strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, ESM; TS 7 native where supported, Expo-supported TS in `apps/mobile` | code-standards §2, arch §8 |
| Lint/format | ESLint flat + `eslint-plugin-boundaries` encoding arch §3 import rules (server-only `db`/`ai`/`suppliers` blocked in apps), Prettier; `no-restricted-syntax` bans default exports outside route files/Astro pages | arch §3 |
| Tests | Vitest 5 workspace (packages/services), Jest 30 + RNTL 14 (mobile), Testcontainers 12 helper wiring (Postgres image = same as compose) | D17 |
| Mobile | Expo SDK 58 / RN 0.88 New Arch, Hermes, expo-router, TS strict, dev client; `app.config.ts` variants `development/staging/production` (bundle ids `app.critterpass.dev/.staging/` + prod `app.critterpass`), iOS 26 min, Android target/compile 36; `runtimeVersion: {policy: "fingerprint"}`; EAS channels `development, preview, staging, production` | D2, D3 |
| Web/admin | Astro 7 + `@astrojs/cloudflare` on Workers; admin Vite + React SPA on Cloudflare (Workers static assets) | D16 |
| Services | Hono 4.13 on Node 26 (`@hono/node-server`), `@hono/zod-openapi`; `GET /health` (liveness, no deps) + `GET /ready` (DB `select 1`, Redis ping); pino JSON logs; zod env validation at boot (`env.ts`) | D4 |
| media-worker | Real behaviour: verify HMAC-SHA256 signature `(key, exp, variant)` with key id rotation, reject expired/tampered (403), stream object from R2 binding with cache headers; signing helper in `packages/domain/src/media-signature.ts` (Web Crypto, no Node APIs) | D4, code-standards §18 |
| Local infra | compose: `postgres:18` + pgvector image with `wal_level=logical`, `max_replication_slots≥4`, extensions `vector, pg_trgm, unaccent, pgcrypto`, empty publication `powersync`; `redis:8`; `centrifugo/centrifugo:v6` (JWKS URL → local api, proxy endpoints → api); `journeyapps/powersync-service` + its storage Postgres; healthchecks on all | arch §6 |
| Cloud | Existing Railway project `15372b45-…e910a0` region Singapore, envs `staging`, `production`, services `api, worker, redis, centrifugo, powersync-repl, powersync-api, powersync-storage` (valhalla added by routing phase), static outbound IPs on api + worker; PlanetScale Postgres HA `ap-southeast-1` (staging branch + production 1 primary + 2 replicas, PgBouncer, PITR); Cloudflare: R2 buckets `cp-media-{dev,staging,prod}`, `cp-tiles`, `cp-backups`, `cp-og`; Workers for web, admin, media-worker; DNS for hosts in arch §14 | D4, D16, D20 |
| Secrets | Only `.env.example` committed (root + per service/app); real values in Railway variables, Wrangler secrets, GitHub Actions secrets, EAS environment variables (`eas env:create --visibility secret`); `pnpm env:check` validates each service's zod schema | code-standards §18 |
| CI | GitHub Actions: `turbo run lint typecheck test build --filter=...[origin/main]`, Node matrix 24 + 26, pnpm store cache, Turbo remote cache off (local cache via actions/cache), Docker available for Testcontainers, OSV scanner, Renovate weekly grouped PRs | D17 |
| Deploy | Railway deploy from `main` (staging) via GitHub integration; production via manual promote; migrations as api pre-deploy command over `DATABASE_DIRECT_URL` (no-op until `packages/db` lands); EAS Workflows file for dev-client builds | arch §2 |
| Error tracking accounts | Existing Sentry org `critterpass`; existing project `critterpass` serves `mobile`; add projects `api, worker, web, admin, media-worker` (DSNs into secret stores; wiring is phase 19) | D17 |
| Agent docs | root `README.md` (setup, commands, layout) + `CLAUDE.md` (agent contract: read order from `docs/README.md`, tasks are checkpoints (run as many tasks or phases per pass as the harness allows; commit and verify at each task boundary), owns list, test commands, no ids in code, status protocol) | code-standards §1 |
| Tools | move `docs/design-renders/scripts/*.mjs` → `tools/design-renders/` (outputs stay in `docs/design-renders/`); fix relative paths; `pnpm renders` script | task scope |

Undesigned states: none (no UI beyond a placeholder route that shows the app name and build variant, for dev-client verification).

## Architecture & contracts
| Delta | Detail |
|---|---|
| Health contract | `GET /health` → `200 {status:"ok", service, version, commit}`; `GET /ready` → `200` or `503 {checks:{db,redis}}`. Doc delta: add both to `docs/api-contracts.md` HTTP routes if absent |
| Env schema | per service `src/env.ts` (zod): `DATABASE_URL` (PgBouncer 6432), `DATABASE_DIRECT_URL` (5432; worker + the api pre-deploy migrate step only. Migrations always use the direct connection: DDL, advisory-lock migrators and `CREATE INDEX CONCURRENTLY` break under PgBouncer transaction pooling), `REDIS_URL`, `PUBLIC_BASE_URL`, `SENTRY_DSN?`, `OTEL_EXPORTER_OTLP_ENDPOINT?`, `COMMIT_SHA`; media-worker: `MEDIA_HMAC_KEYS` (JSON `{kid: secret}`), R2 binding `MEDIA` |
| Media URL | `https://media.critterpass.app/<object_key>?v=<variant>&exp=<unix>&kid=<id>&sig=<base64url>`; sig = HMAC-SHA256(key, `object_key|variant|exp`). Doc delta if api-contracts lacks it |
| Railway | config-as-code `services/*/railway.json` (build: Dockerfile, healthcheck `/health`, pre-deploy `DATABASE_URL=$DATABASE_DIRECT_URL pnpm --filter @cp/db migrate` guarded to no-op; `DATABASE_DIRECT_URL` is a reference variable on api used only by this step); private networking between services; `infra/railway/README.md` lists services, regions, IPs, variable references |
| Package names | `@cp/<dir>` for every workspace package (e.g. `@cp/domain`, `@cp/db`, `@cp/api`, `@cp/mobile`); all phases filter with `--filter @cp/<dir>`. Doc delta: code-standards §6 still says `@critterpass/*` — update to `@cp/*` |
| Dev routes | `apps/mobile/src/app/(dev)/**` is the only dev-only route folder (no `__dev/`). Excluded at build time: `metro.config.js` adds `resolver.blockList` for `src/app/(dev)/` when `APP_VARIANT=production`, so expo-router's `require.context` never bundles them; every `(dev)` screen exports marker `__CP_DEV_ROUTE__`. `tools/scripts/check-release-bundle.ts` runs `expo export` for ios + android with `APP_VARIANT=production` and fails if the bundle contains the marker or a `(dev)` path; required CI job on every PR touching `apps/mobile` |
| No tables, commands, channels, jobs | this phase creates none |

## Tasks
### T1 — Monorepo root, TypeScript, lint, test harness
- Goal: installable monorepo with enforced conventions.
- Files: root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `vitest.workspace.ts`, `.gitignore`, `.nvmrc` (26), `.npmrc`, `renovate.json`; `packages/{domain,db,design-tokens,critter-art,critter-bake,cost-engine,planner,entitlements,ai,suppliers,i18n,content}/{package.json,tsconfig.json,src/index.ts}`.
- Steps: 1. `git init -b main`; `git remote add origin https://github.com/critterpass/critterpass.git`; write `.gitignore` (step 5) BEFORE the first `git add`; push after the first commit. 2. Write root configs per Requirements. 3. Create package manifests (`@cp/*`, `type: module`, `exports`), `src/index.ts` = `export {};` (each owning phase fills its package). 4. Boundaries rules for arch §3 (element types app/service/package-pure/package-server). 5. Add `.gitignore` covering `.env*` except `.env.example`, `ios/`, `android/` (CNG), `dist`, `.turbo`.
- Tests: `pnpm i && pnpm turbo run lint typecheck` ; add `tools/scripts/boundaries.test.ts` asserting a fixture import from an app into `@cp/db` fails lint (`pnpm vitest run tools/scripts`).
- Done when: clean install; lint + typecheck green; boundary violation fixture is rejected; repo exists on GitHub as private.

### T2 — Hono api + worker skeletons (Node 26)
- Goal: deployable services with health, readiness, env validation, logs.
- Files: `services/api/**`, `services/worker/**` (paths in owns), `tools/scripts/env-check.ts`.
- Steps: 1. api: `OpenAPIHono` app in `app.ts`, `/health`, `/ready`, `/openapi.json`, request id middleware (`X-Request-Id` echo), body limit, pino. 2. worker: process that opens `pg` pool (direct URL) + Redis, exposes `/health` on `PORT` via node-server, graceful shutdown (SIGTERM drains). 3. `env.ts` zod schemas; `pnpm env:check` runs every service schema against current env. 4. Multi-stage Dockerfiles (pnpm deploy, Node 26 slim, non-root). 5. `.env.example` per service.
- Tests: `pnpm --filter @cp/api test` (Vitest `app.request('/health')`, `/ready` returns 503 when DB unreachable, 200 against Testcontainers Postgres); same for worker.
- Done when: tests green; `docker build` of both images succeeds; `/openapi.json` validates as OpenAPI 3.1.

### T3 — Local infra (docker-compose)
- Goal: one-command local backend matching staging topology.
- Files: `infra/docker-compose.yml`, `infra/docker/postgres/{Dockerfile,init.sql,postgresql.conf}`, `infra/centrifugo/config.local.json`, `infra/powersync/service.local.yaml`, root `.env.example`.
- Steps: 1. Postgres 18 image with pgvector; `init.sql` creates extensions + `create publication powersync;` (tables added by schema phases). 2. Redis 8. 3. Centrifugo v6: `token_jwks_public_endpoint` → `http://host.docker.internal:8787/api/auth/jwks`, proxy endpoints → api, namespaces are added by the realtime phase. 4. PowerSync service + storage Postgres, JWKS from api, replication from compose Postgres. 5. Healthchecks; `pnpm infra:up`/`infra:down` scripts.
- Tests: `pnpm infra:up && pnpm tsx tools/scripts/infra-smoke.ts` (checks `select extname from pg_extension` contains vector/pg_trgm/unaccent, `show wal_level`=logical, Redis PING, Centrifugo `/health`, PowerSync `/probes/liveness`).
- Done when: smoke script exits 0 on a clean machine; api `/ready` is 200 against compose.

### T4 — Expo SDK 58 app skeleton + EAS
- Goal: dev client builds for both platforms with variant config.
- Files: `apps/mobile/{package.json,app.config.ts,eas.json,tsconfig.json,babel.config.js,metro.config.js,jest.config.ts,.env.example}`, `apps/mobile/src/app/{_layout.tsx,index.tsx}`, `.eas/workflows/dev-client.yml`.
- Steps: 1. `create-expo-app` SDK 58 template, strip sample code; pin versions per arch §8. 2. `app.config.ts` reads `APP_VARIANT` → name/bundle id/scheme/icon badge; `ios.deploymentTarget 26.0`, Android `targetSdk/compileSdk 36`, New Arch, Hermes, `runtimeVersion` fingerprint, `updates.url`. 3. `eas.json` profiles development (dev client, internal), preview, staging, production with channels. 4. `eas init --id c06dadf1-1916-4cf8-8189-f650eaf560ee` (project id into config via env), variant values via `eas env:create --visibility secret|sensitive|plaintext` per EAS environment. 5. Placeholder route renders app name + variant. 6. Dev-route exclusion per Architecture (`metro.config.js` blockList + `tools/scripts/check-release-bundle.ts`) with a fixture `(dev)/_probe.tsx`.
- Tests: `pnpm --filter @cp/mobile test` (RNTL renders index route); `pnpm --filter @cp/mobile exec expo-doctor`; `pnpm tsx tools/scripts/check-release-bundle.ts` (passes; fails when blockList is removed); `eas build -p all --profile development --non-interactive` via workflow.
- Done when: expo-doctor clean; both dev-client builds succeed on EAS; Jest green.

### T5 — Web, admin and media-worker skeletons
- Goal: Cloudflare-deployable web/admin and a working signed-media reader.
- Files: `apps/web/**` (owns list), `apps/admin/**` (owns list), `services/media-worker/**`, `packages/domain/src/media-signature.ts`, `infra/cloudflare/README.md`.
- Steps: 1. Astro 7 + Cloudflare adapter, one index page, `wrangler.jsonc` envs staging/production. 2. Vite React admin, static assets Worker config. 3. media-worker: parse query, `verifyMediaSignature` (constant-time compare, kid lookup, expiry), `env.MEDIA.get(key)`, `Cache-Control: private, max-age` ≤ remaining exp, 403/404 mapping. 4. `signMediaUrl` in domain for api use.
- Tests: `pnpm --filter @cp/media-worker test` (Vitest + `@cloudflare/vitest-pool-workers` with Miniflare R2: valid, expired, tampered, unknown kid, missing object); `pnpm --filter @cp/domain test -- media-signature`; `pnpm --filter @cp/web build`; `pnpm --filter @cp/admin build`.
- Done when: all tests/builds green; `wrangler deploy --dry-run` succeeds for all three.

### T6 — CI pipeline
- Goal: every PR runs affected lint/typecheck/test/build.
- Files: `.github/workflows/{ci.yml,osv.yml}`, `.github/pull_request_template.md`, `.github/CODEOWNERS`.
- Steps: 1. `ci.yml`: checkout (fetch-depth 0), pnpm setup, Node matrix 24/26, cache pnpm store + `.turbo`, `pnpm turbo run lint typecheck test build --filter=...[origin/main]`. 2. Docker-enabled job for Testcontainers suites (`test:db` task). 2a. `release-bundle` job runs `check-release-bundle.ts` when `apps/mobile/**` changes. 3. `osv.yml` weekly + on lockfile change. 4. PR template carries DoD checklist (code-standards §20). 5. Branch protection via `gh api` requiring `ci`.
- Tests: open a PR with a deliberate lint error → CI fails; fix → green.
- Done when: CI green on `main`; branch protection active (`gh api repos/:owner/critterpass/branches/main/protection` shows required check).

### T7 — Railway (Singapore) + PlanetScale Postgres HA
- Goal: staging + production service shells reachable and wired to the database.
- Files: `services/api/railway.json`, `services/worker/railway.json`, `infra/railway/{README.md,centrifugo.Dockerfile,powersync.Dockerfile}`.
- Steps: 1. Link the existing Railway project `15372b45-8aeb-4a74-87d9-67b860e910a0` (Railway MCP/CLI, `use-railway` skill), region Singapore; ensure envs `staging` + `production` exist (one already exists: `d94cb6e4-…`). 2. Services api, worker (GitHub source, root `services/*`), redis (Redis 8), centrifugo, powersync-repl, powersync-api, powersync-storage (Railway Postgres 18); private networking. 3. Enable static outbound IPs on api + worker; record IPs in `infra/railway/README.md`. 4. PlanetScale Postgres via `pscale --format json` / PlanetScale MCP (skills `planetscale-pscale-cli-automation` + `planetscale-change-gates-and-approval-contract`; stop for founder approval before any billed create): database `critterpass` in `aws ap-southeast-1`, production HA (1 primary + 2 replicas), staging branch, PgBouncer, PITR on; enable extensions; allow-list Railway IPs; DB roles are created by the schema phase; here only the owner login. 5. Reference variables (`DATABASE_URL` etc.) in Railway; domains `api.`/`rt.`/`sync.` for staging (`*.staging.critterpass.app`).
- Tests: `curl https://api.staging.critterpass.app/ready` → 200; `railway run pnpm env:check` per service.
- Done when: staging api + worker healthy and `/ready` proves DB + Redis; production services exist (scaled to 0 or idle) with variables set; IPs documented.

### T8 — Cloudflare accounts, R2, DNS, deploy jobs
- Goal: edge resources live for staging.
- Files: `infra/cloudflare/{README.md,r2-cors.json}`, `.github/workflows/deploy-edge.yml`.
- Steps: 1. R2 buckets (owns list) with CORS for presigned PUT from app origins; lifecycle rule on `cp-backups` 35 d. 2. DNS zone `critterpass.app` (+ `go.`), records for api/rt/sync (Railway), media/admin/web (Workers). 3. Wrangler secrets for `MEDIA_HMAC_KEYS`. 4. `deploy-edge.yml`: on `main` deploy web/admin/media-worker to staging; production on manual dispatch. 5. R2 API token for api presign stored in Railway variables.
- Tests: signed URL generated by `tools/scripts/sign-media-url.ts` for a test object returns 200; tampered returns 403.
- Done when: staging hosts resolve over HTTPS; signed read works end to end.

### T9 — Secrets inventory, Sentry projects, EAS Workflows
- Goal: every secret has a documented home; error-tracking projects exist.
- Files: root `.env.example`, `infra/README.md` (secret matrix: name → store → rotation → owner service), `.eas/workflows/{staging.yml,production.yml}`.
- Steps: 1. In existing Sentry org `critterpass`: reuse project `critterpass` for mobile; create api, worker, web, admin, media-worker; DSNs → Railway variables / Wrangler secrets / EAS environment variables (`eas env:create --visibility secret`). 2. Populate secret matrix from arch §6 (APNs, FCM, RevenueCat, Anthropic, suppliers, OTP providers listed with "provisioned by phase that integrates"). 3. EAS Workflows: staging build + submit to TestFlight/Play internal on tag `staging-*`; production on tag `v*`. 4. Add `gitleaks` step to `ci.yml`.
- Tests: `pnpm env:check` passes in CI with `.env.example` defaults for test env; gitleaks passes.
- Done when: no secret in git history (gitleaks clean); matrix covers every arch §6 row.

### T10 — Design-render tools move, README, CLAUDE.md
- Goal: agent-ready repo docs; render scripts runnable from `tools/`.
- Files: `tools/design-renders/{render-screens.mjs,render-pages.mjs,extract-screens.mjs,package.json}`, `README.md`, `CLAUDE.md`, `docs/README.md` (one-line path update only).
- Steps: 1. `git mv docs/design-renders/scripts/* tools/design-renders/`; update input (`design/`) and output (`docs/design-renders/`) paths to repo-root-relative. 2. `pnpm renders:screens` regenerates one screen identical to the committed PNG. 3. README: prerequisites (Node 26, pnpm per `packageManager`, Docker, Xcode 27 + current Command Line Tools, Android SDK 36), setup, commands, layout table. 4. CLAUDE.md: reading order, one-task rule, owns rule, test ladder, no ids/deferral (design screen ids such as `3c-9` are allowed as product data keys — screen registry, parents map, fixtures; plan, phase, task, feature and finding ids stay banned from code, comments, test names and commits), status protocol, secrets rule, where undesigned states are logged.
- Tests: `pnpm --filter @cp/design-renders run render:screens -- --only "3c-9 Pon's draft"` and byte/pixel compare to existing PNG.
- Done when: rerender matches; README + CLAUDE.md present and linked from `docs/README.md`.

## Phase acceptance criteria
- [ ] Private GitHub repo with protected `main`, CI required
- [ ] `pnpm i && pnpm turbo run lint typecheck test build` green locally and in CI (Node 24 + 26)
- [ ] `pnpm infra:up` + infra smoke script pass
- [ ] api/worker `/health` + `/ready` pass on Railway staging (Singapore) against PlanetScale staging; static IPs recorded
- [ ] PlanetScale production HA (1+2) with PITR exists; extensions vector/pg_trgm/unaccent enabled
- [ ] web/admin/media-worker deployed to Cloudflare staging; signed media read 200, tampered 403
- [ ] EAS dev-client builds succeed for iOS + Android
- [ ] Only `.env.example` files in git; gitleaks clean
- [ ] `tools/design-renders` reproduces a committed render
- [ ] README.md + CLAUDE.md present

## Risks & rollback
| Risk | Mitigation / rollback |
|---|---|
| TS 7 native compiler incompatible with Metro/Babel | per-package TS version (mobile uses Expo-supported TS) |
| PlanetScale Postgres unavailable/pricey in SG | continue on Railway Postgres HA staging; S-DB spike (phase 2) decides |
| Railway static IP not on plan tier | upgrade plan; record in README |
| Expo SDK 58 template drift | pin exact versions; `expo-doctor` in CI |
| Node 26 LTS date (2026-10-28) | CI matrix 24 + 26; images on 26 |

## Non-code dependencies
| Item | Needed for | If not ready |
|---|---|---|
| GitHub repo, Railway project, Sentry org/project, EAS project: provisioned (see Accounts table). Still needed: Railway plan with static outbound IPs, PlanetScale login (`pscale auth login`) + billing approval, Cloudflare account | T1, T7–T9 | tasks stop at local/CI scope and report `BLOCKED` with the missing account |
| Dev machine: Xcode 27 + current Command Line Tools (CLT were outdated on 2026-09-26, which blocked `brew install pscale`) | T4 iOS builds, pscale via brew | EAS cloud builds still work; install pscale from the GitHub release binary |
| Domain `critterpass.app` ownership (D20) | T8 DNS | use `*.workers.dev` / `*.up.railway.app` hosts in staging variables |
| Apple Developer + Google Play Console accounts | T4 signed dev builds | simulator/emulator builds only |
| Billing for PlanetScale HA | T7 production | staging only until founder approves |

## Open questions
1. Package scope `@cp/*` — default: yes.
2. Bundle id `app.critterpass` — default: yes (confirm before first store upload).
3. Turbo remote cache (Vercel) — default: off; local cache only.
4. Doc delta: add `/health`, `/ready` and the media URL signature format to `docs/api-contracts.md`.
