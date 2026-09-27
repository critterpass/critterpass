# Dead-letter queue growing (P1)

**Signal:** `cp_job_queue_depth` for a `*dlq*` queue keeps rising over 15 minutes (rule `cp-p1-dlq-growth`). Jobs exhausted their retries.

**Likely causes:** a provider outage (APNs, FCM, Anthropic, a supplier); a bad deploy throwing on every job of one kind; malformed payloads from a new producer.

**Checks**
1. Sentry: `DeadLetter` issues are grouped per queue (`dead-letter`, `<queue>` fingerprint) with the error message.
2. Worker logs (`job dead-lettered`, with `queue` and `job_id`).
3. The ops console jobs view: which queue, since when.

**Mitigation:** fix the cause (roll back the worker, wait out the provider), then redrive the dead letters from the ops console (or `redrive(boss, queue)` in `services/worker/src/boss/dlq.ts`). Jobs are idempotent, so a redrive is safe.

**Rollback:** redeploy the previous worker image in Railway.
