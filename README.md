# Critterpass

Group-travel planner with collectible critter guides: a crew votes on a destination, a Claude-powered guide drafts the trip, and everyone travels with a local-first trip hub, money ledger, wallet, live map and Live Activities. iOS + Android (Expo), own backend (Hono, Postgres, PowerSync, Centrifugo), web on Cloudflare.

Start with [docs/README.md](docs/README.md) (reading order, decisions, architecture) and the build plan in [plans/260926-1718-critterpass-full-build/plan.md](plans/260926-1718-critterpass-full-build/plan.md). Agents also read [CLAUDE.md](CLAUDE.md).

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 24 (26 in Docker/CI) | `.nvmrc` says 26 |
| pnpm | 12.6.0 | pinned by `packageManager`; any pnpm ≥ 10 switches to it |
| Docker | OrbStack or Docker Desktop | local infra + Testcontainers |
| Xcode | 27 + current Command Line Tools | iOS 26+ simulators |
| Android SDK | platform 36, emulator | `~/Library/Android/sdk` |
| CLIs | `eas`, `wrangler`, `railway`, `pscale`, `gh` | logged in for deploy tasks only |

## Setup

```sh
pnpm install
cp .env.example .env            # local defaults; add the third-party keys you have
pnpm infra:up                   # Postgres 18, Redis 8, Centrifugo, PowerSync (docker compose)
pnpm infra:smoke                # checks extensions, replication, publication, probes
pnpm dev                        # api :8787, worker :8788, web, admin, mobile dev server
```

Local infra host ports: Postgres `54320`, Redis `63790`, Centrifugo `8000`, PowerSync `8080` (chosen to avoid a locally installed Postgres/Redis).

## Commands

| Command | What it does |
|---|---|
| `pnpm check` | lint + typecheck + test + build for the whole workspace (Turborepo) |
| `pnpm turbo run lint typecheck test --filter=...[origin/main]` | only what changed |
| `pnpm --filter @cp/<pkg> test -- <file>` | narrowest test first |
| `pnpm test:db` | Testcontainers suites (Docker required) |
| `pnpm env:check [--service api] [--env-file <file>]` | validate service env schemas (never prints values) |
| `pnpm infra:up` / `infra:down` / `infra:smoke` | local backend stack |
| `pnpm renders:screens -- --only "<label>"` | re-render design screens into `docs/design-renders` |
| `pnpm format` | Prettier |

## Layout

| Path | What lives there |
|---|---|
| `apps/mobile` | Expo SDK 58 app (expo-router, native targets via config plugins) |
| `apps/web`, `apps/admin` | Astro site + link routes on Workers; back-office SPA |
| `services/api`, `services/worker` | Hono API; pg-boss jobs + cron (Railway, Singapore) |
| `services/media-worker` | signed media reads from R2 (Cloudflare Worker) |
| `packages/*` | `@cp/domain`, `db`, `design-tokens`, `critter-art`, `critter-bake`, `cost-engine`, `planner`, `entitlements`, `ai`, `suppliers`, `i18n`, `content` |
| `infra/` | docker compose, Postgres image, Centrifugo/PowerSync config, Railway/Cloudflare notes |
| `tools/` | repo scripts, lint rules, design-render tooling |
| `design/` | read-only design sources (`*.dc.html`) |
| `docs/`, `plans/` | contracts and the build plan |

Import rules between these (e.g. `db`, `ai`, `suppliers` are server-only) are enforced by ESLint; see `tools/lint/boundaries.js`.
