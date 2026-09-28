# Monitoring as code

Grafana Cloud (metrics, traces, logs, alerting, Synthetic Monitoring), PostHog EU (product
analytics) and the Alloy collector, all reproducible from this directory.

| Path | What | Applied by |
|---|---|---|
| `dashboards/*.json` | Service health, commands, sync, realtime, jobs, push, database, AI cost | `pnpm tsx tools/scripts/grafana-apply.ts --env <env>` |
| `alerts/p1.yaml`, `alerts/p2.yaml` | Alert rule groups; every P1 rule links `docs/runbooks/alerts/<runbook>.md` | same |
| `alerts/notification-policy.yaml` | Contact point, the 07:00–23:00 SGT window for P1, routing | same |
| `synthetics/<env>.json` | External uptime checks from Singapore and Frankfurt | same (Synthetic Monitoring API) |
| `alloy/` + `postgres-queries.yaml` | Collector on Railway: PowerSync, Centrifugo, Redis, Postgres slot lag | Railway service `alloy` (config file `infra/monitoring/alloy/railway.json`) |
| `posthog/*.json` | Product insights and dashboards | `pnpm tsx tools/scripts/posthog-apply.ts` |

`--dry-run` validates every file without network access; the apply is idempotent (dashboards and
rules are overwritten by uid, contact points and checks are matched and updated).

## Metric names in Grafana

OpenTelemetry metrics arrive through Grafana Cloud's OTLP endpoint and are translated to
Prometheus names: `ms` histograms gain `_milliseconds` (`cp_cmd_duration_ms_milliseconds_bucket`);
counters keep their names because their units are annotations (`{command}`). The catalog is
`packages/domain/src/obs/metrics.ts`; labels never carry user, crew or trip ids.

## Variables (names only)

| Where | Variables |
|---|---|
| api, worker (Railway) | `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` (Grafana Cloud OTLP basic auth), `SENTRY_DSN`, `POSTHOG_PROJECT_API_KEY`, `POSTHOG_HOST`, `ANALYTICS_PID_SALT`; api also `POSTHOG_PROJECT_SECRET_KEY` |
| alloy (Railway) | `APP_ENV`, `GRAFANA_PROM_REMOTE_WRITE_URL`, `GRAFANA_PROM_USERNAME`, `GRAFANA_CLOUD_TOKEN`, `POWERSYNC_API_METRICS_ADDR` / `POWERSYNC_REPL_METRICS_ADDR` (`powersync-*.railway.internal:9464`), `CENTRIFUGO_METRICS_ADDR` (`centrifugo.railway.internal:9000`), `REDIS_ADDR`, `REDIS_PASSWORD`, `MONITORING_DATABASE_URL` (the `monitoring_reader` login) |
| apply scripts (local or CI) | `GRAFANA_URL`, `GRAFANA_TOKEN`, `GRAFANA_PROM_DATASOURCE_UID`, `ONCALL_EMAIL`, `GRAFANA_SM_URL`, `GRAFANA_SM_TOKEN`, `MEDIA_HMAC_KEYS`, `MEDIA_HMAC_ACTIVE_KID`; `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` |

## Setup steps outside the repo

1. Grafana Cloud stack (EU or Singapore region) with Synthetic Monitoring enabled; a service
   account token (Editor) for `grafana-apply`.
2. `monitoring_reader` password: set it on the database (`ALTER ROLE monitoring_reader PASSWORD …`)
   and in the Alloy `MONITORING_DATABASE_URL`. If the migration logged that it could not grant
   `pg_monitor`, grant it with the platform's admin role.
3. Upload the media probe object `probe/health.txt` to each environment's media bucket.
4. P1 paging is email-only until an on-call phone number exists; then add a Grafana IRM (OnCall)
   SMS/call contact point as a second P1 receiver in `alerts/notification-policy.yaml`.
5. Retention: PostHog 13 months, Sentry 90 days, Grafana 14 days (free) or 30 days (Pro),
   Langfuse 90 days — set in each vendor's project settings.
