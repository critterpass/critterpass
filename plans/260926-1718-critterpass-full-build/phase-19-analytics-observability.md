---
phase: 19
title: Analytics, experiments, observability
status: pending
depends_on: [1, 7, 8, 10, 11, 17]
wave: 6
features: [F-024]
screens: []
effort: 10 sessions
owns:
  - packages/domain/src/analytics/**
  - packages/domain/src/flags/**
  - packages/domain/src/obs/**
  - packages/domain/src/redact/**
  - apps/mobile/src/lib/analytics/**
  - apps/mobile/src/lib/observability/**
  - apps/web/src/lib/analytics/**
  - apps/admin/src/lib/observability/**
  - services/api/src/obs/**
  - services/worker/src/obs/**
  - services/worker/src/analytics-export/**
  - services/media-worker/src/obs.ts
  - infra/monitoring/**
  - docs/runbooks/alerts/**
  - tools/scripts/posthog-*.ts, tools/scripts/grafana-*.ts
---
# Phase 19 — Analytics, experiments, observability

## Context links
| Source | Section |
|---|---|
| master synthesis | §2 row F-024; §10.5 event taxonomy; §10.4 privacy; F-159 (paywall governor uses events) |
| `docs/system-architecture.md` | §9 budgets, §10 observability & ops, §12 retention |
| `docs/code-standards.md` | §11 logging & PII, §15 AI traces, §17 testing |
| `docs/data-model.md` | `consents` (purpose `analytics`, `marketing`), `domain_events`, `ai_usage`, `ops_config` |
| `docs/data-model-sync-and-privacy.md` | "Logs & analytics" row; privacy classes C0–C3 |
| `docs/api-contracts.md` | tracing headers, `INTERNAL` error `event_id`, `set_feature_flag` |
| `plans/reports/researcher-260926-1143-web-links-ops-report.md` + fact-check | PostHog EU (identified_only, autocapture off, replay off/masked), Sentry versions (`@sentry/node` 10.x), OTel → Grafana Cloud, cookieless web, RevenueCat Experiments for paywall |
| `plans/reports/researcher-260926-1649-custom-hono-backend-report.md` | ops alerts, slot lag, PowerSync Prometheus |

## Overview
Goal: every surface emits typed, PII-free product events to PostHog EU under consent; errors reach Sentry with scrubbed payloads; api/worker/infra emit OTel traces, metrics and logs to Grafana Cloud; LLM calls trace to Langfuse; dashboards, alerts (phone 07:00–23:00 SGT) and an external uptime monitor are provisioned as code.
Done when: a staging run of the app + api produces catalog-valid PostHog events (none before consent), Sentry issues with release + source maps and no bodies, Grafana traces spanning api → DB, a slot-lag metric and the P1 alert set firing to the on-call contact in a test; dashboards/alerts are reproducible from `infra/monitoring`.

## Requirements
### F-024 — Analytics & experiments (+ platform observability)
| Aspect | Behaviour |
|---|---|
| Taxonomy | master §10.5 is the starter catalog: `object_action` snake_case; common props `user_pid, crew_id, trip_id, trip_status, platform, app_version, locale, entitlement, guide_id, surface (app/widget/notification/la/web), source`. Every event is a zod schema in `packages/domain/src/analytics`; props are ids, enums, buckets, counts and durations only |
| Forbidden | names, budget amounts, raw coordinates, message text, dietary data, email/phone, free text, C3 columns; age signals (Play Age Signals ToS) never forwarded |
| Identity | `person_profiles: 'identified_only'`; `user_pid` = HMAC(uid, analytics salt) — never the raw uid; `identify` only after consent + account exists (anonymous pass holders stay anonymous-distinct-id); `reset()` on sign-out/account deletion; server-side deletion request to PostHog on account purge |
| Consent | client events are sent only when `consents.analytics` is granted; before a decision, events are dropped (not queued); revocation stops sending and calls `opt_out_capturing`. Without consent, only events on the operational allow-list `NO_CONSENT_ALLOWED` in `packages/domain/src/analytics/operational.ts` (billing/fraud only: `purchase_completed`, `purchase_refunded`, `referral_qualified`, `trial_converted`) are sent server-side, without person profiles and without device props; every other event for that actor is skipped. Consent prompt itself is built by onboarding (phase 22) and settings (phase 45) calling `analytics.setConsent` |
| Mobile SDK | `posthog-react-native` EU host, autocapture of touches off, screen events from expo-router route changes (route name, no params), app lifecycle events on, session replay off at launch; code path ready behind flag `analytics.replay` (default off) for low-sample, fully masked onboarding + paywall replay after counsel review |
| Native surfaces | widget/LA/notification actions reach the api via `/v1/actions`; the api emits `widget_action`, `la_started`, `notification_delivered` server-side with `surface` set (extensions carry no analytics SDK) |
| Web | cookieless: PostHog `persistence: 'memory'`, no cookies/localStorage, no identify; `link_clicked` emitted server-side in the link resolver with `is_bot` |
| Server events | worker exports mapped `domain_events` → PostHog (batch, idempotent via event uuid = domain event id) for qualification, funnels and `llm_call` cost; api emits request-time events where no domain event exists |
| Flags & experiments | typed flag catalog (`packages/domain/src/flags`) with safe hard-coded defaults (kill-switch fallback when PostHog unreachable); client flags bootstrapped from api at launch to avoid flicker; server uses posthog-node local evaluation; experiment exposure event `$feature_flag_called` only on render of the variant. Business config (free guide limit 30, seat cap, supplier flags, perk lists) stays in `ops_config` — not PostHog. Paywall price/offering tests use RevenueCat Experiments (phase 46) |
| Funnels | PostHog insights as code for: acquisition (link → install_attributed → pass_issued → account_saved), invite fast path p50/p90 time-to-issue (15 s target), crew/vote, setup/plan, proposal → boarded, guide usage + limit hits, trip, critters/after, monetise (paywall_shown → purchase_completed, quiet_no) |
| Sentry | app (`@sentry/react-native` 8.28 Expo plugin, EAS source maps + dSYM/mapping upload, release = app version + EAS update id), api/worker (`@sentry/node` 10.x), web/admin (browser SDK), media-worker (`@sentry/cloudflare`); shared `beforeSend` scrubber strips bodies, headers, query strings, breadcrumbs with PII; `INTERNAL` errors return `detail.event_id`; crash-free sessions feed EAS Update staged rollout gate |
| OTel | api + worker NodeSDK (http, undici, pg, pino instrumentation), W3C `traceparent` from app; OTLP → Grafana Cloud; custom metrics in `packages/domain/src/obs/metrics.ts` (names + units + allowed labels; no user/trip ids as labels) |
| Collector | Grafana Alloy service on Railway scraping PowerSync Prometheus, Centrifugo `/metrics`, Redis exporter, Postgres (slot lag `pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)`, connections, `pg_stat_statements` top) via a read-only monitoring login |
| Langfuse | Langfuse Cloud (EU) client in api/worker obs; redacted prompts (redact user text per code-standards §11); tags `crew_id`, `trip_id`, `feature`, `model`, `tier`; trace id stored in `ai_usage.langfuse_trace_id`; scores from `rate_guide_answer` |
| Dashboards | Grafana: service health (RED per route, p95 vs §9 budgets), commands (outcome by code, RTT), sync (PowerSync lag, connections, upload rejects), realtime (sockets, publish rate, unsubscribe latency), jobs (queue depth, DLQ, failures by kind), push delivery (sent/accepted/failed by provider + category), DB (slot lag, replica lag, pool saturation), AI (cost/day by feature + tier from metrics; per crew-trip cost from PostHog `llm_call` + Langfuse) |
| Alerts | P1 (phone 07:00–23:00 SGT, queued outside): api down, sync lag >60 s, replication slot lag >1 GB or growing 15 min, DLQ growth, auth error spike, SMS spend spike, uptime check fail (payment-webhook failure alert is added by P46 as its own rule file under `infra/monitoring/alerts/`). P2 (email/Slack): error-rate >2 %, p95 over budget 30 min, AI cost/day > threshold, push failure >5 % |
| Uptime | Grafana Synthetic Monitoring (external probes, Singapore + Frankfurt): `api /health`, `sync /probes/liveness`, `rt /health`, `critterpass.app`, `media` signed probe object |
| Runbooks | one `docs/runbooks/alerts/<alert>.md` per P1 alert (other `docs/runbooks/*` files belong to their phases): signal, likely causes, checks, mitigation, rollback |
| Undesigned (in code) | none user-facing; consent copy/screen belongs to phases 22 and 45 |
| Decisions | D4 (ops), D5 (Langfuse), D17 (tools), D18 (EU/PDPL consent); C-resolutions: none specific |

## Architecture & contracts
| Delta | Detail |
|---|---|
| Tables | none created (data-model-sync-and-privacy: phase 19 creates no tables). Reads `consents`, `domain_events`, `ai_usage`, `ops_config` (phase 8). Export cursor stored in `ops_config` key `analytics.export_cursor` via `withSystem` |
| Roles | doc delta: add `monitoring_reader` login (pg_monitor, no table access) for Alloy; created by a migration owned here only if phase 8 has not added it — default: request phase 8 owner to add; if absent at execution, add `packages/db` migration `<timestamp>_monitoring_reader_role.sql` as a named dependency |
| Commands | none new. Doc delta: `set_consent {purpose, granted, copy_version}` is missing from `docs/api-contracts.md`; owned by phase 20 (first consumer; onboarding 22 and You 45 call it); phase 19 client gate subscribes to the local `consents` row (sync stream `me`) and to `analytics.setConsent` |
| HTTP | `GET /v1/config/bootstrap` gains `flags` (evaluated PostHog flags + catalog defaults) — doc delta (route owner: api core; this phase adds the `flags` field) |
| Jobs | analytics export loop in worker (advisory-lock singleton, 30 s interval, batch 500, retries with backoff). Doc delta: when the job runner lands, register as pg-boss cron `analytics.export` in `docs/api-contracts-async.md` |
| Metrics (names) | `cp_cmd_duration_ms{cmd,outcome}`, `cp_cmd_total{cmd,code}`, `cp_sync_upload_total{outcome}`, `cp_rt_publish_total{ns}`, `cp_rt_unsubscribe_ms`, `cp_job_total{queue,outcome}`, `cp_job_queue_depth{queue}`, `cp_push_total{provider,category,outcome}`, `cp_llm_cost_micros_total{feature,tier}`, `cp_llm_latency_ms{feature,model}`, `cp_supplier_call_ms{adapter,op,outcome}`, `cp_sms_sent_total{provider,country}`; emitted by owning phases using these definitions |
| Redaction | `packages/domain/src/redact`: key/value scrubber shared by Sentry `beforeSend`, pino `redact.paths`, Langfuse input masking and analytics prop guard; C3 column list imported from `packages/db` schema metadata at build (server) |
| Retention | PostHog EU project retention 13 months; Sentry 90 d; Grafana 14 d (free) / 30 d (Pro); Langfuse 90 d |

## Tasks
### T1 — Typed event catalog + redaction guard
- Goal: single source of truth for events, props and PII rules.
- Files: `packages/domain/src/analytics/{catalog.ts,common.ts,index.ts,catalog.test.ts}`, `packages/domain/src/redact/{index.ts,redact.test.ts}`.
- Steps: 1. zod schema per §10.5 event incl. common props; enums for `surface`, `entitlement`, `source`. 2. `AnalyticsEvent` discriminated union + `track` type helper. 3. Guard: rejects string props not in an enum/id/bucket allow-list; reject keys matching forbidden patterns (name, email, phone, lat, lng, amount, text, diet). 4. `redact(value)` deep scrubber used by Sentry/pino/Langfuse. 5. `user_pid` HMAC helper (server) signature defined here, key from env.
- Tests: `pnpm --fail-if-no-match --filter @cp/domain test -- analytics redact` (every event parses a valid sample; forbidden keys rejected; nested scrub).
- Done when: all §10.5 events defined; guard + scrubber tests green.

### T2 — Mobile analytics client with consent gate
- Goal: app sends catalog events only with consent.
- Files: `apps/mobile/src/lib/analytics/{client.ts,consent.ts,screen-tracking.ts,use-analytics.ts,index.ts}`, tests alongside; `apps/mobile/app.config.ts` + `package.json` (named deps: add SDK).
- Steps: 1. PostHog RN init (EU host, `identified_only`, autocapture touches off, replay disabled). 2. Consent gate: state from local `consents` row + `setConsent(granted)`; pre-decision events dropped; revoke → `optOut`. 3. `identify(user_pid)` after consent + non-anonymous account; `reset` on sign-out. 4. expo-router screen events (route name only). 5. Common props provider (platform, app_version, locale, entitlement, active crew/trip ids).
- Tests: `pnpm --fail-if-no-match --filter @cp/mobile test -- analytics` (Jest + RNTL: no network capture before consent, events after, catalog violation throws in dev and is dropped + Sentry breadcrumb in prod, reset on sign-out).
- Done when: tests green; staging dev build shows events in PostHog EU only after consent.

### T3 — Flags & experiments
- Goal: typed flags with safe defaults on client and server.
- Files: `packages/domain/src/flags/{catalog.ts,index.ts,catalog.test.ts}`, `apps/mobile/src/lib/analytics/flags.ts`, `services/api/src/obs/flags.ts`.
- Steps: 1. Flag catalog (key, type, default, owner area, experiment variants). 2. api: posthog-node local evaluation; `flags` field for `GET /v1/config/bootstrap` (handler owner adds the field call). 3. Client: bootstrap flags → PostHog `bootstrap`, `useFlag(key)` returns catalog default when unreachable; exposure event only on variant render. 4. Document split: business config in `ops_config`, UX experiments in PostHog, paywall tests in RevenueCat.
- Tests: `pnpm --fail-if-no-match --filter @cp/domain test -- flags`; `pnpm --fail-if-no-match --filter @cp/api test -- flags` (PostHog down → defaults); mobile hook test.
- Done when: tests green; a staging flag toggle changes `useFlag` result after relaunch.

### T4 — Server analytics: domain-event export + request events
- Goal: funnels include server-truth events without person profiles for non-consented users.
- Files: `services/worker/src/analytics-export/{mapper.ts,exporter.ts,loop.ts,*.test.ts}`, `services/api/src/obs/analytics.ts`, `packages/domain/src/analytics/operational.ts` (`NO_CONSENT_ALLOWED` list).
- Steps: 1. Mapper: `domain_events.type` → catalog event (+ props allow-list); unmapped types skipped. 2. Exporter: read after cursor (ordered by UUIDv7 id), consent lookup per actor; no consent → drop unless the event is in `NO_CONSENT_ALLOWED`; send batch with `uuid = domain_event.id` (idempotent), `$process_person_profile: false` when no consent. 3. Loop: advisory-lock singleton, 30 s, cursor in `ops_config`. 4. api helper `serverTrack(event)` for request-time events (link resolver, actions).
- Tests: `pnpm --fail-if-no-match --filter @cp/worker test -- analytics-export` (Testcontainers Postgres: cursor advances, replay sends same uuids, no-consent → no person profile, no-consent actor's non-allow-listed event skipped (test), C3 never in payload; PostHog HTTP stubbed at network boundary with recorded fixture).
- Done when: tests green; staging shows exported events.

### T5 — Sentry across app, api, worker, web, admin, media-worker
- Goal: scrubbed, symbolicated errors with releases.
- Files: `apps/mobile/src/lib/observability/{sentry.ts,index.ts}`, `services/api/src/obs/sentry.ts`, `services/worker/src/obs/sentry.ts`, `apps/admin/src/lib/observability/sentry.ts`, `apps/web/src/lib/analytics/sentry.ts`, `services/media-worker/src/obs.ts`; named deps: `apps/mobile/app.config.ts`, `eas.json` (source-map upload), service entry files (one init call).
- Steps: 1. RN SDK + Expo plugin, dSYM/ProGuard mapping + source maps via EAS, release/dist naming. 2. Shared `beforeSend`/`beforeBreadcrumb` = `redact`; `sendDefaultPii: false`. 3. Node SDK 10.x in api/worker with Hono error handler returning `event_id` in `INTERNAL`. 4. Browser + Cloudflare SDKs. 5. Environment tags (staging/production).
- Tests: `pnpm --fail-if-no-match --filter @cp/api test -- sentry` (INTERNAL response has event_id; scrubbed payload asserted via transport spy at network boundary); mobile Jest scrub test.
- Done when: staging test crash appears symbolicated with no body/headers; tests green.

### T6 — OpenTelemetry for api + worker
- Goal: traces, metrics, logs to Grafana Cloud.
- Files: `services/api/src/obs/{otel.ts,metrics.ts,logger.ts}`, `services/worker/src/obs/{otel.ts,metrics.ts,logger.ts}`, `packages/domain/src/obs/{metrics.ts,index.ts}`.
- Steps: 1. NodeSDK with http/undici/pg/pino instrumentations, resource attrs (service, version, env). 2. Metric definitions from domain; helper `recordCommand(cmd, outcome, ms)` etc. for owning phases. 3. pino → OTLP logs with `redact.paths`; `req_id`, `op_id`, hashed `uid`. 4. Accept `traceparent` from app; propagate into pg-boss job metadata (field reserved for job runner). 5. OTLP creds in Railway vars.
- Tests: `pnpm --fail-if-no-match --filter @cp/api test -- otel` (in-memory exporter: `/ready` produces http + pg spans; metric label allow-list enforced).
- Done when: staging traces visible in Grafana Tempo with api → pg spans.

### T7 — Collector: Alloy on Railway (PowerSync, Centrifugo, Redis, Postgres slot lag)
- Goal: infra metrics incl. replication slot lag.
- Files: `infra/monitoring/alloy/{config.alloy,Dockerfile,railway.json}`, `infra/monitoring/postgres-queries.yaml`.
- Steps: 1. Alloy service on Railway staging/production (private network). 2. Scrape PowerSync Prometheus, Centrifugo `/metrics`, Redis exporter. 3. Postgres exporter custom queries: slot lag bytes + active, replica lag, connections, top `pg_stat_statements`. 4. Remote write to Grafana Cloud.
- Tests: `alloy fmt --test` in CI; staging query `cp_pg_slot_lag_bytes` returns series.
- Done when: all four sources visible in Grafana staging.

### T8 — Langfuse hookup
- Goal: LLM traces with redaction and cost tags ready for the gateway.
- Files: `services/api/src/obs/langfuse.ts`, `services/worker/src/obs/langfuse.ts`, tests.
- Steps: 1. Langfuse client (EU), flush on shutdown. 2. `startLlmTrace({feature, model, tier, crew_id, trip_id})` returning trace id for `ai_usage.langfuse_trace_id`. 3. Input/output masking via `redact` + user-text masking. 4. Score API wrapper for answer ratings. 5. Emit `cp_llm_cost_micros_total` + PostHog `llm_call` from the same helper.
- Tests: `pnpm --fail-if-no-match --filter @cp/api test -- langfuse` (masking; one call → trace + metric + event; Langfuse HTTP stubbed at boundary).
- Done when: helper exported and tested; staging sample trace visible.

### T9 — Grafana dashboards, alerts, on-call, uptime (as code)
- Goal: reproducible monitoring.
- Files: `infra/monitoring/dashboards/*.json`, `infra/monitoring/alerts/*.yaml`, `infra/monitoring/synthetics/*.json`, `tools/scripts/grafana-apply.ts`, `docs/runbooks/alerts/*.md` (one per P1 alert).
- Steps: 1. Dashboards per Requirements. 2. Alert rules P1/P2 with thresholds; contact points (phone via Grafana OnCall/IRM SMS+call) with mute timing outside 07:00–23:00 SGT (queued). 3. Synthetic checks (SG + Frankfurt probes). 4. `grafana-apply.ts` idempotently provisions via API. 5. Runbooks.
- Tests: `pnpm tsx tools/scripts/grafana-apply.ts --dry-run` validates JSON; fire a test alert in staging and assert via the Grafana API that the contact point notification was sent (status saved as artifact).
- Done when: apply is idempotent; test alert dispatch confirmed by API; synthetic checks green. Physical phone receipt is a launch-milestone checklist item (M8), not an agent check.

### T10 — PostHog project, funnels, web cookieless capture
- Goal: product dashboards and web analytics.
- Files: `tools/scripts/posthog-apply.ts`, `infra/monitoring/posthog/{insights.json,dashboards.json}`, `apps/web/src/lib/analytics/{client.ts,index.ts}`.
- Steps: 1. PostHog EU project(s) staging/production; retention; IP capture off; data deletion for purged users (API helper called by account-deletion job). 2. Insights/funnels per Requirements incl. invite time-to-issue p50/p90 and AI cost per crew-trip (sum `llm_call.cost_est` by `trip_id`). 3. Web client: memory persistence, no cookies, page + CTA events only. 4. Apply script idempotent.
- Tests: `pnpm --fail-if-no-match --filter @cp/web test -- analytics` (no cookie/localStorage writes; Playwright check on built site); `posthog-apply --dry-run`.
- Done when: dashboards exist in staging project; web sets no cookies.

## Phase acceptance criteria
- [ ] Every master §10.5 event has a zod schema; guard rejects forbidden props
- [ ] No client event leaves the device before analytics consent (Jest + staging check)
- [ ] Server export idempotent (replay → same uuids), no person profile without consent
- [ ] Flags fall back to catalog defaults when PostHog is unreachable
- [ ] Sentry: symbolicated staging crash for iOS + Android; api `INTERNAL` returns `event_id`; payloads scrubbed
- [ ] Grafana shows api → pg traces, PowerSync/Centrifugo/Redis metrics and slot lag
- [ ] P1 test alert dispatched inside hours, muted/queued outside (API-verified); phone receipt checked at M8
- [ ] Synthetic uptime checks green for api, sync, rt, web, media
- [ ] Langfuse helper masks user text and writes trace id + cost metric
- [ ] Web analytics sets no cookies (Playwright)
- [ ] Dashboards/alerts/insights reproducible from `infra/monitoring` via apply scripts

## Risks & rollback
| Risk | Mitigation / rollback |
|---|---|
| PostHog identified-event cost higher than modelled | `identified_only`, server events without profiles, sample replay; flip threshold ~$1–2k/mo → re-evaluate |
| Over-instrumentation in motion-heavy UI | autocapture off; catalog-only events; guard in dev |
| Sentry replay/screenshot leaks map/chat | replay off; masking; Skia canvas masked wholesale |
| Metric label cardinality (trip ids) | label allow-list; per-trip cost only in PostHog/Langfuse |
| `@sentry/node` 11 churn | pin 10.x |
| Export loop duplicates with future pg-boss cron | single advisory lock key; move registration, keep code |

## Non-code dependencies
| Item | Needed for | If not ready |
|---|---|---|
| PostHog EU org, Grafana Cloud stack (+ IRM/OnCall), Langfuse EU project | T2–T10 | code + tests complete against recorded fixtures; staging verification item marked blocked |
| Counsel on analytics consent model (GDPR, Vietnam PDPL) | consent defaults | ship opt-in gate (strictest) |
| DPAs with PostHog/Sentry/Grafana/Langfuse | launch | non-code workstream (D18) |
| Founder phone number for on-call | T9 | alerts to email only |

## Open questions
1. Consent default — assumption: explicit opt-in everywhere for client analytics; server billing/fraud events without profiles (counsel to confirm).
2. Doc delta: `set_consent` command missing from `docs/api-contracts.md` (owner: phase 20).
3. Doc delta: `monitoring_reader` DB role not in `docs/data-model.md` roles list.
4. Doc delta: `analytics.export` cron to add to `docs/api-contracts-async.md` when the job runner lands; `flags` field on `/v1/config/bootstrap`.
5. Uptime vendor — assumption: Grafana Synthetic Monitoring (one vendor) rather than a separate status service.
6. Session replay — decided: off at launch, ready behind flag `analytics.replay`; enable only after counsel review.
