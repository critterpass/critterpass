# Push failures over 20 % (P1)

**Signal:** more than 20 % of push sends end `failed` or `rejected` for 15 minutes (rule `cp-p1-push-failures`; the P2 rule fires at 5 %). Alarms, SOS, leave-by and crew nudges ride on push.

**Likely causes:** APNs or FCM outage; an expired or revoked APNs key (`.p8`) or FCM service account; a bad worker deploy building malformed payloads; a burst of invalid tokens after a reinstall wave (those end `invalid_token` and do not count here).

**Checks**
1. Grafana push dashboard: failures by `provider` and `category`. One provider only points at its credentials or status page (Apple Developer system status, Firebase status).
2. Worker logs for `push send failed` with the provider's reason.
3. Sentry for new errors in `services/worker/src/jobs/push/`.

**Mitigation:** rotate the failing credential (Railway worker variables) and redeploy the worker; roll back a bad deploy. If one category floods failures, switch it off with its kill switch in the ops console. Failed sends go to the push dead-letter queue: redrive it once fixed (see dlq-growth).

**Rollback:** redeploy the previous worker image in Railway.
