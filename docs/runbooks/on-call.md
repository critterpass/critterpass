# On-call

One person (the founder) is on call 07:00–23:00 Singapore time, every day from launch. Outside those
hours P1 alerts queue and are sent at 07:00 (`infra/monitoring/alerts/notification-policy.yaml`).
Target: 99.5 % monthly availability for api, sync and realtime (docs/system-architecture.md §10).

## Where alerts come from

| Source | What | Where it lands |
|---|---|---|
| Grafana alert rules (`infra/monitoring/alerts/p1*.yaml`, `p2.yaml`) | api, sync, replication, queues, auth, spend, push, purchases | on-call email (P1 in hours, P2 always); add the Grafana IRM SMS/call receiver once the on-call number exists |
| Grafana Synthetic Monitoring (`infra/monitoring/synthetics/`) | `/health`, PowerSync, Centrifugo, web, media from Singapore and Frankfurt | rule `cp-p1-uptime-check-failed` |
| Sentry | new issues and crash-free drops in app, api, worker, web | Sentry email; release health halts a staged rollout (docs/runbooks/release.md) |
| Worker `ops.ai_cost_guard` | 80 % and 100 % of an AI cap | Sentry and the ops console |

Every P1 rule names its runbook in `docs/runbooks/alerts/`.

## When a P1 fires

1. Acknowledge: reply on the alert thread or silence it in Grafana for the time you need, never longer than 2 hours.
2. Open the runbook named in the alert and the Grafana service health dashboard.
3. If users are affected for over 15 minutes, post a short status on the app's social accounts and answer support mail with it.
4. Fix or mitigate with the runbook: roll back, switch the feature off (kill switches in the ops console), scale (docs/runbooks/railway-scaling.md).
5. Follow docs/runbooks/incident.md for anything that lasted over 30 minutes, lost data or touched money.

## Weekly checks

- Alerts still route: `pnpm tsx tools/scripts/drills/fire-test-alerts.ts --staging` (in hours: delivered now; out of hours: delivered at 07:00).
- Last night's backup reached R2 and the monthly restore drill is not overdue (docs/runbooks/restore.md).
- Sentry: no unresolved issue older than a week in the crash or payments categories.
- Dependency advisories: `bash tools/scripts/security/scan.sh deps osv` (patch high and critical within 48 hours).

## Access you need from a phone

Grafana, Sentry, Railway, PlanetScale, RevenueCat, the ops console (Cloudflare Access) and the
App Store Connect / Play Console apps for halting a rollout.
