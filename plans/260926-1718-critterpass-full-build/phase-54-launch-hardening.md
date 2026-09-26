---
phase: 54
title: Launch hardening & store submission
status: pending
depends_on: [19, 30, 37, 38, 42, 45, 47, 49, 50, 51, 52, 53]
wave: 23
features: []
screens: [all]
tasks: 12
owns:
  - e2e/journeys/
  - tools/scripts/load/
  - tools/scripts/security/
  - tools/scripts/perf/
  - tools/scripts/drills/
  - packages/db/test/fuzz/
  - services/api/src/ops/kill-switches.ts
  - services/worker/src/jobs/ops/ai-cost-guard.ts
  - infra/monitoring/alerts/
  - infra/monitoring/dashboards/launch/
  - infra/railway/scaling/
  - docs/runbooks/
  - docs/compliance/
  - .github/workflows/release.yml
  - .github/workflows/nightly-journeys.yml
---
# Phase 54 — Launch hardening & store submission

## Context links

| Source | Section |
|---|---|
| `docs/product-decisions.md` | D1 (one public launch, full scope), D4 ops (99.5% SLO, alerts 07:00–23:00 SGT, uptime monitor, nightly pg_dump to R2, monthly restore drill, fixed outbound IP, external security review), D5 (AI tiers, evals), D7 (fair-use caps), D10 (affiliate disclosure), D17 (EAS, Maestro, Sentry, Grafana), D18 (compliance), R11 store items |
| `docs/system-architecture.md` | §6 envs, §9 perf budgets, §10 ops (backups, alerts, uptime), §11 spikes (failover drill), §8 compliance |
| `docs/code-standards.md` | testing + security + Definition of Done |
| `docs/data-model-sync-and-privacy.md` | §1 privacy classes, §6 retention/purge, deletion row |
| `docs/api-contracts.md` | error codes, rate limits, `/v1/actions` auth |
| `docs/api-contracts-async.md` | §1 channels, §2 queues (DLQ), §3 push |
| Phase files | 19 (observability), 50 (`docs/play-policy-declarations.md`), 53 (store assets), 13 (AI gateway budgets), 17 (ops console flags) |
| Reports | `researcher-260926-1649-custom-hono-backend-report.md` (ops, failover, PgBouncer, replicas), `researcher-260926-1143-web-links-ops-report.md` (ops, store rules), `researcher-260926-1143-native-platform-monetization-report.md` + fact-check (App Review, privacy manifests); master R11, R19 |

## Overview

Goal: prove the full product is launch-ready on both platforms — every journey passes end-to-end on real devices, performance/a11y/security/privacy/load gates pass, operations are drilled and alerting, then submit to App Review and Play with a staged rollout.

Done when (agent-checkable): journey suites green once on iOS + Android devices and scheduled nightly; all gates below have recorded evidence in `docs/compliance/launch-evidence.md`; restore and failover drills succeeded within target; production builds submitted to both stores with staged-rollout config and kill switches verified.
Founder-owned launch gate (checklist in `docs/runbooks/release.md`, outside agent sessions): 3 consecutive green nightly journey runs; both stores approved; staged rollout started.

## Requirements

| Area | Must hold |
|---|---|
| Journeys | onboarding → crew invite/join → vote → setup → draft → proposal/RSVP → booking (Viator sandbox) → money → trip day (leave-by LA/alarm, crew map, SOS) → critters → recap/album → community publish → paywall/restore → deletion; plus offline trip day, disruption, voice, widgets/notification actions |
| Perf | budgets from system-architecture §9 (cold start, JS frame drops, sync catch-up, API p95, LA update latency ≤5 s, bundle size); regressions fail CI |
| Accessibility | VoiceOver/TalkBack labels, Dynamic Type/font scale to max, contrast pairs, reduced motion, 44 pt targets; audit on every screen family |
| Security | external auth/permission review (Better Auth, action keys, RLS backstop, Centrifugo proxy, PowerSync JWT); RLS fuzz; secrets scan (gitleaks) across repo + CI logs; dependency audit; advisory patch process ≤48 h |
| Privacy & compliance | App Privacy labels + privacy manifests (required-reason APIs) for app and extensions; Play Data safety; age rating questionnaires; EU AI Act Art. 50 disclosure on every guide surface; affiliate + "contains ads: no" declarations; deletion end-to-end (in-app + web) with purge verification; legal docs counsel-approved (D18) |
| Load | Centrifugo fan-out (10k connections, crew channels), push fan-out (APNs/FCM burst for 1k crews), PowerSync (initial sync + upload queue under failover), AI job queue (concurrency + cost) |
| AI cost | per-user/per-trip daily budget, global daily spend cap per model tier, alert + pause/queue on breach, kill switch per feature; tier downgrade only via founder admin toggle (D5 tiers never changed automatically); fair-use caps verified |
| Ops | nightly off-provider pg_dump to R2 + monthly restore drill; PlanetScale failover drill (logical slot survives, PowerSync resumes); uptime monitor; alert routing 07:00–23:00 SGT; runbooks; Railway replica scaling runbook; fixed outbound IP verified with partners |
| Submission | App Review notes + demo account; Play policy declarations; staged rollout (iOS phased release 7 d; Play 1%→5%→20%→50%→100%) with halt criteria |

## Architecture & contracts

| Area | Delta |
|---|---|
| Kill switches | `services/api/src/ops/kill-switches.ts`: typed registry over `ops_config` (`ai.<feature>.enabled`, `ai.tier.<model>.enabled`, `la.<kind>.enabled`, `widgets.push.enabled`, `supplier.<name>.enabled`, `android.fsi.enabled`, `signup.enabled`, `otp.<channel>.enabled`); read-through cache 30 s; toggled from admin console (17) with audit |
| AI cost guard | worker cron `ops.ai_cost_guard` every 5 min over `ai_usage`: per-tier spend vs caps → alert + pause (Opus skeleton jobs held in pg-boss queue with user-visible "queued" progress; other features throttled or disabled via kill switch); model downgrade only via audited founder admin toggle — doc delta: add queue to async §2.3 |
| Alerts | `infra/monitoring/alerts/*.yaml` Grafana alert rules (P1 list in system-architecture §10) with SGT schedule routing |
| No new tables | – |

## Tasks

### T1 — Journey suites (iOS)
- Goal: full-journey Maestro on iOS devices.
- Files: `e2e/journeys/ios/*.yaml`, `e2e/journeys/_shared/*.yaml`, `.github/workflows/nightly-journeys.yml`.
- Steps: 1. Compose area flows into journeys listed above using two devices for crew flows. 2. Run on staging via EAS build + device cloud. 3. Nightly workflow with artefacts.
- Tests: `maestro test e2e/journeys/ios/`.
- Done when: suite green once on staging devices; nightly workflow scheduled and producing artefacts. (3 consecutive nights = founder gate item.)

### T2 — Journey suites (Android)
- Goal: parity journeys.
- Files: `e2e/journeys/android/*.yaml`.
- Steps: as T1 on Pixel + Samsung (API 36/37).
- Tests: `maestro test e2e/journeys/android/`.
- Done when: suite green once on Pixel + Samsung; included in the nightly workflow. (3 consecutive nights = founder gate item.)

### T3 — Performance budgets in CI
- Goal: measurable gates.
- Files: `tools/scripts/perf/{cold-start,frames,bundle,api-p95}.ts`, `tools/scripts/perf/budgets.json`.
- Steps: 1. Collect via Maestro + `adb`/`xctrace` exports, k6 for API. 2. Compare to budgets; fail on regression.
- Tests: `pnpm tsx tools/scripts/perf/run.ts --ci`.
- Done when: report generated and all budgets pass on reference devices.

### T4 — Accessibility audit + fixes list
- Goal: a11y gate.
- Files: `tools/scripts/perf/a11y-scan.ts` (Maestro + accessibility snapshot), `docs/compliance/accessibility-audit.md`.
- Steps: 1. Automated label/target/contrast scan over journey screens. 2. Manual VoiceOver/TalkBack pass checklist. 3. File defects to owning area folders as fix tasks (each fixed in its own session).
- Tests: `pnpm tsx tools/scripts/perf/a11y-scan.ts`.
- Done when: zero automated violations; manual checklist signed.

### T5 — RLS backstop fuzz + authz regression
- Goal: prove data isolation.
- Files: `packages/db/test/fuzz/rls-fuzz.test.ts`, `packages/db/test/fuzz/generators.ts`.
- Steps: 1. Generate random crews/trips/users; for every published + private table, attempt cross-user select/insert/update/delete as `app_user`, `guide_reader`, `powersync_repl`, `public_reader` (phase 51: public views only, no base tables). 2. Assert policy matrix from data-model.
- Tests: `pnpm --filter @cp/db test -- fuzz`.
- Done when: 10k iterations, zero unexpected access.

### T6 — Security scans + external review package
- Goal: security gate.
- Files: `tools/scripts/security/{gitleaks.toml,scan.sh,review-scope.md}`, `docs/compliance/security-review.md`.
- Steps: 1. gitleaks on history + CI, `pnpm audit`, OSV scan, container scan. 2. Scope doc for external reviewer (auth, action keys, JWT/JWKS, Centrifugo proxy, PowerSync, webhooks, media HMAC). 3. Track findings + fixes.
- Tests: `bash tools/scripts/security/scan.sh`.
- Done when: scans clean; external review findings closed or accepted by founder.

### T7 — Privacy & compliance evidence
- Goal: store and legal declarations.
- Files: `docs/compliance/{app-privacy-labels,play-data-safety,age-rating,ai-disclosure,affiliate-disclosure,launch-evidence}.md`, `tools/scripts/security/privacy-manifest-check.ts`.
- Steps: 1. Derive data types from data-model privacy classes + SDK inventory. 2. Verify `PrivacyInfo.xcprivacy` in app + every extension. 3. Deletion e2e: request → purge job → verify C3 rows gone, R2 objects deleted. 4. AI disclosure presence check on guide surfaces (Maestro assertions).
- Tests: `pnpm tsx tools/scripts/security/privacy-manifest-check.ts`; `maestro test e2e/journeys/_shared/deletion.yaml`.
- Done when: evidence docs complete; purge verification passes.

### T8 — Load tests
- Goal: capacity proof.
- Files: `tools/scripts/load/{centrifugo.k6.js,push-fanout.ts,powersync.ts,ai-jobs.ts,README.md}`.
- Steps: 1. k6 websocket for Centrifugo. 2. Push fan-out against APNs sandbox/FCM validate-only. 3. PowerSync sync + upload under a PlanetScale failover. 4. AI job burst with cost accounting.
- Tests: `k6 run tools/scripts/load/centrifugo.k6.js`; `pnpm tsx tools/scripts/load/powersync.ts --staging`.
- Done when: SLO targets met; results recorded in `docs/runbooks/capacity.md`.

### T9 — AI cost guardrails + kill switches
- Goal: bounded spend + fast off.
- Files: `services/api/src/ops/kill-switches.ts`, `services/worker/src/jobs/ops/ai-cost-guard.ts`, tests beside.
- Steps: 1. Registry + middleware checks. 2. Cost guard cron: alert + pause/queue (Opus skeleton jobs queued, never re-routed to another model); per-feature throttle/kill switch. 3. Founder admin toggles (incl. manual tier downgrade) audited.
- Tests: `pnpm --filter @cp/api test -- kill-switches`; `pnpm --filter @cp/worker test -- ai-cost-guard`.
- Done when: exceeding a cap pauses/queues or disables within one cron tick and alerts; no code path changes a model tier without an audited admin toggle.

### T10 — Backups, restore drill, failover drill
- Goal: recoverability.
- Files: `tools/scripts/drills/{restore.ts,failover.ts}`, `docs/runbooks/{restore,failover}.md`.
- Steps: 1. Restore latest R2 pg_dump into scratch Postgres 18; row-count + checksum compare. 2. PlanetScale failover; verify api, worker, PowerSync slot, Centrifugo recovery.
- Tests: `pnpm tsx tools/scripts/drills/restore.ts --verify`; `pnpm tsx tools/scripts/drills/failover.ts --staging`.
- Done when: restore RTO and failover recovery recorded within targets.

### T11 — Alerting, runbooks, scaling
- Goal: on-call ready.
- Files: `infra/monitoring/alerts/*.yaml`, `infra/monitoring/dashboards/launch/*.json`, `docs/runbooks/{on-call,incident,api-down,sync-lag,dlq,push-failures,payments,otp-spend,ai-spend}.md`, `docs/runbooks/railway-scaling.md`, `infra/railway/scaling/*.json`.
- Steps: 1. Alert rules + SGT routing + uptime monitor config. 2. One runbook per P1 alert. 3. Replica scaling thresholds.
- Tests: `pnpm tsx tools/scripts/drills/fire-test-alerts.ts --staging`.
- Done when: each P1 test alert pages in-hours and queues out-of-hours.

### T12 — Store submission + staged rollout
- Goal: launch.
- Files: `.github/workflows/release.yml`, `docs/runbooks/release.md`.
- Steps: 1. EAS build production + submit with review notes, demo account, entitlement/IAP review screenshots. 2. Play policy declarations from phase 50. 3. Phased release + halt criteria (crash-free <99.5%, P1 alert) wired to Sentry release health. 4. EAS Update channel policy.
- Tests: `actionlint .github/workflows/release.yml`; `npx eas-cli build --profile production --platform all --non-interactive --dry-run` where supported.
- Done when: production builds submitted to both stores (submission ids recorded); staged-rollout + halt config merged; halt procedure rehearsed on staging. Store approval and rollout start = founder gate items.

## Phase acceptance criteria
- [ ] Journeys green on iOS + Android and scheduled nightly (founder gate: 3 nights in a row)
- [ ] Perf budgets and a11y scan pass
- [ ] RLS fuzz zero unexpected access; secrets scan clean; external review closed
- [ ] Privacy labels, Data safety, age rating, AI + affiliate disclosures documented and in-app
- [ ] Load tests meet SLO; results recorded
- [ ] Kill switches + AI cost guard verified
- [ ] Restore + failover drills passed
- [ ] Alerts routed per SGT schedule; runbooks exist for each P1
- [ ] Both stores submitted; rollout + halt config ready (founder gate: approval, rollout live)

## Risks & rollback
| Risk | Mitigation |
|---|---|
| App Review rejection (LA/alarms, personas, 3.1.x) | pre-check submission early with TestFlight review; kill switches for contested surfaces |
| Failover breaks PowerSync slot | fallback per D4 (Railway Postgres HA or PowerSync Cloud) runbook |
| Launch spike overwhelms AI spend | cost guard alert + pause/queue; founder may toggle a tier downgrade |
| Bad release | halt phased release; EAS Update rollback |

## Non-code dependencies
| Item | If not ready |
|---|---|
| External security reviewer | launch blocked (D4) |
| Counsel sign-off (D18) | launch blocked; legal pages carry review banner in staging |
| Store accounts, tax/banking, legal entity | submission blocked |
| Partner approvals (Agoda, Klook, Trip.com) | flags stay off; affiliate links path live |
| Physical test devices / device cloud | Firebase Test Lab + AWS Device Farm |

## Open questions
1. Journey suite device cloud (BrowserStack vs AWS Device Farm) — default AWS Device Farm.
2. Doc delta: `ops.ai_cost_guard` cron and kill-switch key list in async §2.3 / ops_config docs.
3. Restore RTO target — default 4 h; failover recovery target 5 min.
