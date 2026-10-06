# Purchases late or refused (P1)

**Signal:** RevenueCat events take over 5 minutes (p95) from receipt to applied (`cp-p1-payments-webhook-lag`), or more than five events in 30 minutes are refused or belong to another account (`cp-p1-payments-refused`). People paid and do not have what they bought.

**Likely causes:** the billing apply queue is stuck or dead-lettering; the webhook secret changed in RevenueCat but not on the api; RevenueCat outage; an account merge left a purchase on the old uid.

**Checks**
1. Grafana jobs dashboard: depth of the billing queue and its dead-letter queue.
2. api logs for `/v1/webhooks/revenuecat` 401s (secret mismatch) and worker logs for `billing apply` errors.
3. RevenueCat dashboard → Integrations → Webhooks: delivery failures. RevenueCat status page.
4. For refusals: the ops console customer view of the app user id from the event.

**Mitigation:** fix the secret or redeploy; redrive the billing dead letters (applying is idempotent per event id). Run the reconcile job from the ops console to pull entitlements straight from RevenueCat. For an account owned by someone else, follow the support macro and transfer in RevenueCat; never grant by hand without an audit note.

**Rollback:** redeploy the previous api or worker image in Railway.
