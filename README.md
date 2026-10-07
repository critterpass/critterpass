<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/readme/banner-light.png">
    <img src="docs/assets/readme/banner.png" width="1280" alt="CritterPass: vote on where to go, let a critter guide draft the trip, then travel it together">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/critterpass/critterpass/actions/workflows/ci.yml"><img src="https://github.com/critterpass/critterpass/actions/workflows/ci.yml/badge.svg?branch=main" alt="ci"></a>
  <a href="https://github.com/critterpass/critterpass/actions/workflows/deploy-edge.yml"><img src="https://github.com/critterpass/critterpass/actions/workflows/deploy-edge.yml/badge.svg?branch=main" alt="deploy edge"></a>
  <a href="https://github.com/critterpass/critterpass/actions/workflows/device.yml"><img src="https://github.com/critterpass/critterpass/actions/workflows/device.yml/badge.svg?branch=main" alt="device"></a>
  <a href="https://github.com/critterpass/critterpass/actions/workflows/sync-e2e.yml"><img src="https://github.com/critterpass/critterpass/actions/workflows/sync-e2e.yml/badge.svg?branch=main" alt="sync-e2e"></a>
  <a href="https://github.com/critterpass/critterpass/actions/workflows/osv.yml"><img src="https://github.com/critterpass/critterpass/actions/workflows/osv.yml/badge.svg?branch=main" alt="osv"></a>
</p>

## What it is

CritterPass is a group-travel planner for iOS and Android. A crew votes on where to go, an AI guide (one of six critters, each with its own voice) drafts the trip, everyone reviews their own version, and then the crew travels with a local-first trip hub, a shared money ledger, a bookings wallet, a live crew map and Live Activities. Along the way you collect the local critters of every place you visit.

It runs on its own backend (Hono, Postgres, PowerSync, Centrifugo), with the website and back office on Cloudflare.

## Features

- **Pass and crew.** A passport-style onboarding in three taps, anonymous-first accounts, invite links and join codes, crews with a seat cap.
- **Decide together.** Pitch places, swipe together, run a destination vote with a live showdown, and settle dates, budget and rooms in trip setup.
- **A guide that drafts.** The guide builds a day-by-day plan from the crew's must-dos, budget, season and crowds, then redrafts a day on request and shows the diff.
- **Plan and chat.** Crew chat with live collaboration, plan views with per-person edits, proposals and RSVPs.
- **Money.** Expenses split by shares, receipt scan, multi-currency balances, settle up and a trip budget with a forecast.
- **Bookings and travel days.** A wallet of flights, stays and tickets (with import), boarding passes, leave-by alerts, disruptions and an offline trip hub.
- **Critters.** 150 local critters across 61 places, hatched from visits, with forms, quests, stickers and a CritterDex.
- **Native surfaces.** Live Activities, Dynamic Island, widgets and actionable notifications, with Android equivalents.

## Screens

A selection of the design renders, grouped by flow. All 172 screens and their captions are in [docs/design-renders](docs/design-renders/) (`screens/*.png`, `screens.json`).

<!-- screens:start -->

<table>
<tr><th colspan="4" align="left">Onboarding</th></tr>
<tr>
<td align="center"><img src="docs/assets/readme/screens/3a-1_Splash.jpg" width="190" alt="Splash"><br><sub>Splash</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3a-4_This_or_that.jpg" width="190" alt="This or that"><br><sub>This or that</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3a-6_Pass_issued.jpg" width="190" alt="Pass issued"><br><sub>Pass issued</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3a-10_Invite_a_seat_for_you.jpg" width="190" alt="Invite a seat for you"><br><sub>Invite a seat for you</sub></td>
</tr>
<tr><th colspan="4" align="left">Home</th></tr>
<tr>
<td align="center"><img src="docs/assets/readme/screens/3b-1_Home_first_run.jpg" width="190" alt="Home first run"><br><sub>Home first run</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3b-2_Home.jpg" width="190" alt="Home"><br><sub>Home</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3b-4_Inbox.jpg" width="190" alt="Inbox"><br><sub>Inbox</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3b-6_Home_final_vote.jpg" width="190" alt="Home final vote"><br><sub>Home final vote</sub></td>
</tr>
<tr><th colspan="4" align="left">Crew chat</th></tr>
<tr>
<td align="center"><img src="docs/assets/readme/screens/3g-1_Crew_chat.jpg" width="190" alt="Crew chat"><br><sub>Crew chat</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3g-2_Live_collab.jpg" width="190" alt="Live collab"><br><sub>Live collab</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3g-3_Crews.jpg" width="190" alt="Crews"><br><sub>Crews</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3g-4_Crew_map.jpg" width="190" alt="Crew map"><br><sub>Crew map</sub></td>
</tr>
<tr><th colspan="4" align="left">Vote</th></tr>
<tr>
<td align="center"><img src="docs/assets/readme/screens/3b-3_Pitch_a_place.jpg" width="190" alt="Pitch a place"><br><sub>Pitch a place</sub></td>
<td align="center"><img src="docs/assets/readme/screens/7g-2_Swipe_together.jpg" width="190" alt="Swipe together"><br><sub>Swipe together</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3c-1_Vote_showdown.jpg" width="190" alt="Vote showdown"><br><sub>Vote showdown</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3c-2_Kyoto_wins.jpg" width="190" alt="Kyoto wins"><br><sub>Kyoto wins</sub></td>
</tr>
<tr><th colspan="4" align="left">Trip setup</th></tr>
<tr>
<td align="center"><img src="docs/assets/readme/screens/3c-3_When.jpg" width="190" alt="When"><br><sub>When</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3c-5_Budget.jpg" width="190" alt="Budget"><br><sub>Budget</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3c-6_Rooms.jpg" width="190" alt="Rooms"><br><sub>Rooms</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3c-7_Must-dos.jpg" width="190" alt="Must-dos"><br><sub>Must-dos</sub></td>
</tr>
<tr><th colspan="4" align="left">Drafting</th></tr>
<tr>
<td align="center"><img src="docs/assets/readme/screens/3c-8_Pon_is_drafting.jpg" width="190" alt="Pon is drafting"><br><sub>Pon is drafting</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3c-9_Pon_s_draft.jpg" width="190" alt="Pon's draft"><br><sub>Pon's draft</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3c-11_Change_a_day.jpg" width="190" alt="Change a day"><br><sub>Change a day</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3c-12_Pon_s_redraft.jpg" width="190" alt="Pon's redraft"><br><sub>Pon's redraft</sub></td>
</tr>
<tr><th colspan="4" align="left">Money</th></tr>
<tr>
<td align="center"><img src="docs/assets/readme/screens/3i-1_Balances.jpg" width="190" alt="Balances"><br><sub>Balances</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3i-2_Add_an_expense.jpg" width="190" alt="Add an expense"><br><sub>Add an expense</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3i-3_Scan_a_receipt.jpg" width="190" alt="Scan a receipt"><br><sub>Scan a receipt</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3i-5_Settle_up.jpg" width="190" alt="Settle up"><br><sub>Settle up</sub></td>
</tr>
<tr><th colspan="4" align="left">Bookings</th></tr>
<tr>
<td align="center"><img src="docs/assets/readme/screens/3h-1_Bookings.jpg" width="190" alt="Bookings"><br><sub>Bookings</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3h-2_Add_a_booking.jpg" width="190" alt="Add a booking"><br><sub>Add a booking</sub></td>
<td align="center"><img src="docs/assets/readme/screens/4a-2_Boarding_pass.jpg" width="190" alt="Boarding pass"><br><sub>Boarding pass</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3h-3_Getting_around.jpg" width="190" alt="Getting around"><br><sub>Getting around</sub></td>
</tr>
<tr><th colspan="4" align="left">Plan</th></tr>
<tr>
<td align="center"><img src="docs/assets/readme/screens/7a-1_Trip_map.jpg" width="190" alt="Trip map"><br><sub>Trip map</sub></td>
<td align="center"><img src="docs/assets/readme/screens/7b-1_Day_plan.jpg" width="190" alt="Day plan"><br><sub>Day plan</sub></td>
<td align="center"><img src="docs/assets/readme/screens/7e-1_Place_detail.jpg" width="190" alt="Place detail"><br><sub>Place detail</sub></td>
<td align="center"><img src="docs/assets/readme/screens/3f-2_Proposal_trailer.jpg" width="190" alt="Proposal trailer"><br><sub>Proposal trailer</sub></td>
</tr>
</table>

<!-- screens:end -->

## How it works

```mermaid
flowchart LR
  subgraph Devices
    APP["Mobile app<br/>Expo, iOS + Android"]
    SURF["Widgets, Live Activities,<br/>notification actions"]
  end
  subgraph Cloudflare
    WEB["web<br/>Astro site, invite + share links"]
    ADMIN["admin<br/>back office"]
    MEDIA["media-worker<br/>signed reads"]
    R2[("R2 media")]
  end
  subgraph Railway["Railway, Singapore"]
    API["api<br/>Hono, Better Auth, commands"]
    WK["worker<br/>pg-boss jobs, cron, push"]
    RT["Centrifugo<br/>realtime"]
    PSY["PowerSync<br/>sync service"]
    RD[("Redis")]
  end
  PG[("Postgres 18<br/>PlanetScale HA")]
  AI["AI gateway<br/>packages/ai → DeepSeek"]
  PUSH["APNs, FCM"]

  APP -->|commands, guide stream| API
  APP <-->|sync streams| PSY
  APP <-->|WebSocket| RT
  APP -->|signed GET| MEDIA --> R2
  SURF -->|actions| API
  WEB & ADMIN --> API
  API --> PG
  WK --> PG
  PSY -->|logical replication| PG
  API & WK -->|publish| RT
  RT --- RD
  API & WK --> AI
  WK --> PUSH --> APP
```

Writes go through typed commands on the api, reads sync to an on-device database through PowerSync, and live updates arrive over Centrifugo. The full topology, sequences and import rules are in [docs/system-architecture.md](docs/system-architecture.md).

## Stack

| Area | Tools |
|---|---|
| Mobile | Expo SDK 58, expo-router, React Native Skia, PowerSync (SQLCipher), Lingui, SwiftUI and Kotlin targets for native surfaces |
| Backend | Hono, Better Auth, Drizzle, pg-boss, Centrifugo v6, self-hosted PowerSync, Redis 8 |
| Data | PlanetScale Postgres 18 (HA, PgBouncer), Cloudflare R2 |
| Web | Astro on Cloudflare Workers (site, links, previews), Vite SPA for the back office |
| AI | `@cp/ai` gateway: DeepSeek through an Anthropic-format Messages API, with evals in CI |
| Tooling | pnpm 12 workspaces, Turborepo, TypeScript 6 strict, Vitest, Jest, Maestro, Testcontainers, EAS |

## Repo map

| Path | What lives there |
|---|---|
| [`apps/`](apps/) | `mobile` (Expo app), `web` (Astro site on Workers), `admin` (back office) |
| [`services/`](services/) | `api` (Hono), `worker` (jobs and cron), `media-worker` (signed R2 reads on Cloudflare) |
| [`packages/`](packages/) | `@cp/domain`, `db`, `design-tokens`, `critter-art`, `critter-bake`, `cost-engine`, `planner`, `entitlements`, `ai`, `suppliers`, `i18n`, `content`, `sound-art` |
| [`infra/`](infra/) | docker compose, Postgres image, Centrifugo and PowerSync config, Railway and Cloudflare notes, monitoring |
| [`e2e/`](e2e/) | Maestro flows, one folder per area, and the UI sweep |
| [`docs/`](docs/) | product decisions, architecture, data model, API contracts, design system, design renders |
| [`plans/`](plans/) | the build plan and its phase files |
| [`tools/`](tools/) | repo scripts, lint rules, design-render and content tooling |
| [`design/`](design/) | read-only design sources |

Import rules between these (for example `db`, `ai` and `suppliers` are server-only) are enforced by ESLint; see [tools/lint/boundaries.js](tools/lint/boundaries.js).

## Getting started

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 24 (26 in Docker and CI) | `.nvmrc` says 26 |
| pnpm | 12.6.0 | pinned by `packageManager` |
| Docker | OrbStack or Docker Desktop | local infra and Testcontainers |
| Xcode | 27 and current Command Line Tools | iOS 26+ simulators |
| Android SDK | platform 36, emulator | `~/Library/Android/sdk` |
| CLIs | `eas`, `wrangler`, `railway`, `pscale`, `gh` | logged in for deploy tasks only |

```sh
pnpm install
cp .env.example .env    # local defaults; add the third-party keys you have
pnpm infra:up           # Postgres 18, Redis 8, Centrifugo, PowerSync (docker compose)
pnpm infra:smoke        # checks extensions, replication, publication, probes
pnpm dev                # api :8787, worker :8788, web, admin, mobile dev server
```

Local infra ports: Postgres `54320`, Redis `63790`, Centrifugo `8000`, PowerSync `8080` (chosen to avoid a locally installed Postgres or Redis).

## Commands

| Command | What it does |
|---|---|
| `pnpm check` | lint, typecheck, test and build for the whole workspace |
| `pnpm turbo run lint typecheck test --filter=...[origin/main]` | only what changed since `main` |
| `pnpm --filter @cp/<pkg> test -- <file>` | the narrowest test |
| `pnpm test:db` | Testcontainers database suites (Docker required) |
| `pnpm env:check [--service api] [--env-file <file>]` | validate service env schemas without printing values |
| `pnpm infra:up` / `infra:down` / `infra:smoke` | local backend stack |
| `pnpm renders:screens -- --only "<label>"` | re-render design screens into `docs/design-renders` |
| `pnpm screens:capture -- --flows e2e/screens/*.yaml --out <dir>` | real screenshots from the matching iOS e2e build |
| `pnpm e2e:cloud -- --platform ios [--flows e2e/<dir>]` | Maestro flows on EAS, reusing the last matching build |
| `pnpm readme:progress` | regenerate the progress section below |
| `pnpm format` / `format:check` | Prettier |

## Testing and device runs

- **Test ladder.** Narrowest first: one file, then the package, then everything changed since `main`. Database suites run against real Postgres in Docker (`pnpm --filter <pkg> test:db`); nothing mocks the database.
- **CI** ([ci.yml](.github/workflows/ci.yml)) runs lint, typecheck, tests and builds for affected packages, and calls [sync-e2e](.github/workflows/sync-e2e.yml) and [ai-evals](.github/workflows/ai-evals.yml) when the sync path or prompts change.
- **Device runs** ([device.yml](.github/workflows/device.yml)) run Maestro flows on GitHub-hosted simulators and emulators, in `flows`, `capture` or `compare` mode. Add the `device-run` label to a pull request, or dispatch it: `gh workflow run device.yml -f platform=ios -f flows="e2e/smoke e2e/home"`. A nightly sweep on `main` captures every screen in English and Vietnamese.
- **UI review gate** ([ui-review.yml](.github/workflows/ui-review.yml)). A pull request that changes app screens, features or UI components fails the `ui-reviewed` check until it carries the `ui-reviewed` label, applied after its design | device sheets were reviewed. Details in [e2e/README.md](e2e/README.md).

## Deploying (staging)

- **api, worker, Centrifugo, PowerSync** run on Railway (`staging` environment, Singapore); services deploy with `railway up --ci --service <s> --environment staging` from a clean checkout of `main`, and the api runs migrations before each deploy. See [infra/railway/README.md](infra/railway/README.md).
- **web, admin and media-worker** deploy to Cloudflare on pushes to `main` that touch them, through [deploy-edge.yml](.github/workflows/deploy-edge.yml) (`staging.critterpass.app`, `admin.staging.critterpass.app`); production is a manual dispatch. See [infra/cloudflare/README.md](infra/cloudflare/README.md).
- **Mobile** builds and updates go through EAS profiles in [apps/mobile/eas.json](apps/mobile/eas.json) (`staging` points at the Railway staging hosts).
- Secrets and where each one lives: [infra/README.md](infra/README.md).

## Docs

| Doc | What it holds |
|---|---|
| [docs/README.md](docs/README.md) | reading order and doc index |
| [product-decisions.md](docs/product-decisions.md) | final product decisions |
| [system-architecture.md](docs/system-architecture.md) | topology, patterns, authz, environments |
| [code-standards.md](docs/code-standards.md) | how code is written, tested and shipped |
| [data-model.md](docs/data-model.md), [data-model-sync-and-privacy.md](docs/data-model-sync-and-privacy.md) | tables, RLS, sync streams, privacy classes |
| [api-contracts.md](docs/api-contracts.md), [api-contracts-async.md](docs/api-contracts-async.md) | commands, errors, routes, channels, queues, push |
| [design-system.md](docs/design-system.md) | tokens, type, components, motion |
| [CLAUDE.md](CLAUDE.md) | the contract for coding agents |

## Progress

<!-- progress:start -->

<p align="center"><img src="docs/assets/readme/progress.svg" width="760" alt="541 of 593 tasks and 37 of 59 phases done"></p>

**541 of 593 tasks** (91%) and **37 of 59 phases** done, 22 in progress. Last updated 2026-10-07; regenerate with `pnpm readme:progress`. Narrative and next steps: [plan.md](plans/260926-1718-critterpass-full-build/plan.md).

<details open>
<summary>Phases by wave</summary>

| Wave | Phase | Status | Progress | Tasks |
|---|---|---|---|---|
| **1** | [1 · Repo & toolchain bootstrap](plans/260926-1718-critterpass-full-build/phase-01-repo-toolchain-bootstrap.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 10/10 |
| **2** | [2 · Platform go/no-go spikes](plans/260926-1718-critterpass-full-build/phase-02-platform-spikes.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 15/15 |
|  | [3 · Design tokens, fonts, i18n](plans/260926-1718-critterpass-full-build/phase-03-design-tokens-fonts-i18n.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 8/8 |
|  | [4 · Critter art core](plans/260926-1718-critterpass-full-build/phase-04-critter-art-core.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 8/8 |
|  | [8 · Core schema, authz + RLS, domain events](plans/260926-1718-critterpass-full-build/phase-08-core-schema-authz.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 9/9 |
| **3** | [5 · Sticker renderer, bake pipeline, share images](plans/260926-1718-critterpass-full-build/phase-05-critter-renderer-asset-pipeline.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 10/10 |
|  | [6 · Motion, feedback bus, gestures](plans/260926-1718-critterpass-full-build/phase-06-motion-feedback-gestures.md) | ◐ in progress | ▰▰▰▰▰▰▰▰▰▱ | 9/10 |
|  | [9 · Auth, anonymous-first, anti-abuse](plans/260926-1718-critterpass-full-build/phase-09-auth-anonymous-antiabuse.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 10/10 |
|  | [12 · Entitlements, money & FX primitives](plans/260926-1718-critterpass-full-build/phase-12-entitlements-money-fx.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 7/7 |
|  | [14 · POI data, maps, routing](plans/260926-1718-critterpass-full-build/phase-14-places-maps-routing.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 8/8 |
| **4** | [7 · App shell, components, a11y](plans/260926-1718-critterpass-full-build/phase-07-app-shell-component-library.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 18/18 |
|  | [10 · Offline sync, commands, realtime](plans/260926-1718-critterpass-full-build/phase-10-sync-realtime-outbox.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 11/11 |
| **5** | [11 · Jobs, notification router, push](plans/260926-1718-critterpass-full-build/phase-11-jobs-notifications-push.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 11/11 |
|  | [17 · Back-office & ops console](plans/260926-1718-critterpass-full-build/phase-17-back-office-admin.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 8/8 |
|  | [21 · Links & deferred deep links](plans/260926-1718-critterpass-full-build/phase-21-links-deferred-deeplinks.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 9/9 |
| **6** | [13 · LLM gateway, personas, autonomy](plans/260926-1718-critterpass-full-build/phase-13-llm-gateway-personas-autonomy.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 13/13 |
|  | [19 · Analytics, experiments, observability](plans/260926-1718-critterpass-full-build/phase-19-analytics-observability.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 10/10 |
|  | [20 · Permissions, location, POI visits](plans/260926-1718-critterpass-full-build/phase-20-permissions-location-visits.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 11/11 |
| **7** | [15 · Fares, weather, season & crowds](plans/260926-1718-critterpass-full-build/phase-15-flights-weather-season-data.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 8/8 |
|  | [18 · Content factory](plans/260926-1718-critterpass-full-build/phase-18-content-factory.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 13/13 |
|  | [39 · Crew live map](plans/260926-1718-critterpass-full-build/phase-39-crew-live-map.md) | ◐ in progress | ▰▰▰▰▰▰▰▰▱▱ | 5/6 |
|  | [58 · Ops console data capture and early contracts](plans/260926-1718-critterpass-full-build/phase-58-ops-console-early-contracts.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 7/7 |
| **8** | [16 · Cost & constraint engine](plans/260926-1718-critterpass-full-build/phase-16-cost-constraint-engine.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 7/7 |
|  | [22 · Onboarding: passport, taste, avatar](plans/260926-1718-critterpass-full-build/phase-22-onboarding-pass.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 11/11 |
| **9** | [23 · Invites, crews, referral, seat cap](plans/260926-1718-critterpass-full-build/phase-23-invites-crews-growth.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 10/10 |
| **10** | [24 · Crew chat](plans/260926-1718-critterpass-full-build/phase-24-crew-chat.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 8/8 |
|  | [51 · Web: site, invites, tips, legal, OG](plans/260926-1718-critterpass-full-build/phase-51-web-site-links-og.md) | ◐ in progress | ▰▰▰▰▰▰▱▱▱▱ | 7/11 |
| **11** | [25 · Home, inbox, nudges, tips](plans/260926-1718-critterpass-full-build/phase-25-home-inbox-nudges.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 9/9 |
| **12** | [26 · Polls & destination vote](plans/260926-1718-critterpass-full-build/phase-26-polls-destination-vote.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 12/12 |
| **13** | [27 · Trip setup](plans/260926-1718-critterpass-full-build/phase-27-trip-setup.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 12/12 |
| **14** | [28 · Drafting agent & redraft](plans/260926-1718-critterpass-full-build/phase-28-draft-redraft-agent.md) | ◐ in progress | ▰▰▰▰▰▰▰▰▰▱ | 10/11 |
|  | [33 · Money: ledger, receipts, settle up](plans/260926-1718-critterpass-full-build/phase-33-money.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 12/12 |
| **15** | [29 · Plan views, editing, collab](plans/260926-1718-critterpass-full-build/phase-29-plan-views-editing-collab.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 12/12 |
|  | [34 · Bookings wallet, imports, flights](plans/260926-1718-critterpass-full-build/phase-34-bookings-wallet-import.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 11/11 |
|  | [46 · Monetization](plans/260926-1718-critterpass-full-build/phase-46-monetization.md) | ◐ in progress | ▰▰▰▰▰▱▱▱▱▱ | 7/13 |
| **16** | [32 · Guide chat, metering, phrase cards](plans/260926-1718-critterpass-full-build/phase-32-guide-chat-metering.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 10/10 |
|  | [35 · Supplier layer, rides, ops desk](plans/260926-1718-critterpass-full-build/phase-35-supplier-layer-agency.md) | ◐ in progress | ▰▰▰▰▰▰▰▱▱▱ | 10/14 |
| **17** | [30 · Explore](plans/260926-1718-critterpass-full-build/phase-30-explore.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 10/10 |
|  | [31 · Proposal, RSVP, dropout re-split](plans/260926-1718-critterpass-full-build/phase-31-proposal-rsvp.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 10/10 |
|  | [36 · Trip hub, day-of, leave-by, offline](plans/260926-1718-critterpass-full-build/phase-36-trip-day-offline.md) | ◐ in progress | ▰▰▰▰▰▰▰▰▰▱ | 10/11 |
|  | [38 · Help hub & crew SOS](plans/260926-1718-critterpass-full-build/phase-38-safety-help-sos.md) | ◐ in progress | ▰▰▰▰▰▰▰▰▰▰ | 7/7 |
| **18** | [37 · Disruptions](plans/260926-1718-critterpass-full-build/phase-37-disruptions.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 11/11 |
|  | [40 · Critters: hatch, Critterdex, legendaries](plans/260926-1718-critterpass-full-build/phase-40-critters-collect.md) | ◐ in progress | ▰▰▰▰▰▰▰▰▰▱ | 10/11 |
|  | [55 · Find a driver: ask, capture, compare, pick, private tours](plans/260926-1718-critterpass-full-build/phase-55-find-a-driver.md) | ◐ in progress | ▰▰▰▰▰▰▰▰▱▱ | 10/12 |
| **19** | [41 · Quests, XP, stickers](plans/260926-1718-critterpass-full-build/phase-41-quests-stickers.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 7/7 |
|  | [43 · Recap, story, awards, stamps](plans/260926-1718-critterpass-full-build/phase-43-recap-stamps-memory.md) | ◐ in progress | ▰▰▰▰▰▰▰▰▰▰ | 9/9 |
|  | [48 · Live Activities & Dynamic Island](plans/260926-1718-critterpass-full-build/phase-48-live-activities.md) | ◐ in progress | ▰▰▰▰▰▰▰▰▰▱ | 9/10 |
| **20** | [42 · Voice, point-and-ask, phrases](plans/260926-1718-critterpass-full-build/phase-42-voice-camera-phrases.md) | ◐ in progress | ▰▰▰▰▰▰▱▱▱▱ | 5/9 |
|  | [44 · Album, postcards, print](plans/260926-1718-critterpass-full-build/phase-44-album-postcards.md) | ◐ in progress | ▰▰▰▰▰▰▰▰▰▱ | 8/9 |
|  | [47 · Help centre, feedback, rating](plans/260926-1718-critterpass-full-build/phase-47-help-feedback.md) | ◐ in progress | ▰▰▰▰▰▰▰▰▰▱ | 7/8 |
|  | [49 · Actionable notifs, widgets](plans/260926-1718-critterpass-full-build/phase-49-notification-surfaces-widgets.md) | ◐ in progress | ▰▰▰▰▰▰▰▰▱▱ | 8/10 |
| **21** | [45 · You: profile, settings, export, deletion](plans/260926-1718-critterpass-full-build/phase-45-you-profile-settings.md) | ◐ in progress | ▰▰▰▰▰▰▰▱▱▱ | 8/12 |
|  | [50 · Android parity layer](plans/260926-1718-critterpass-full-build/phase-50-android-parity.md) | ◐ in progress | ▰▰▰▰▰▰▰▰▰▱ | 9/10 |
|  | [52 · Community plans](plans/260926-1718-critterpass-full-build/phase-52-community.md) | ◐ in progress | ▰▰▰▰▰▰▰▰▰▱ | 11/12 |
| **22** | [53 · Store listing & social kit](plans/260926-1718-critterpass-full-build/phase-53-store-social-assets.md) | ◐ in progress | ▰▰▰▰▰▱▱▱▱▱ | 3/6 |
|  | [56 · Drivers our crews used: rating, invite, claim, directory](plans/260926-1718-critterpass-full-build/phase-56-crews-drivers-directory.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 8/8 |
|  | [57 · Share the plan with your driver: page, PDF, quote back](plans/260926-1718-critterpass-full-build/phase-57-share-plan-with-driver.md) | ◐ in progress | ▰▰▰▰▰▰▰▱▱▱ | 5/7 |
| **23** | [54 · Launch hardening & submission](plans/260926-1718-critterpass-full-build/phase-54-launch-hardening.md) | ◐ in progress | ▰▱▱▱▱▱▱▱▱▱ | 1/12 |
|  | [59 · Ops console designed pass](plans/260926-1718-critterpass-full-build/phase-59-ops-console-designed-pass.md) | ● done | ▰▰▰▰▰▰▰▰▰▰ | 9/9 |

</details>

<!-- progress:end -->
