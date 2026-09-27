# API down (P1)

**Signal:** `probe_success{job="<env>-api-health"}` is 0 from every probe for 2 minutes (rule `cp-p1-api-down`).

**Likely causes:** a failed deploy or crash loop; the pre-deploy migration failing; PlanetScale or Redis unreachable (`/ready` fails first); Railway region incident.

**Checks**
1. Railway → `api` → Deployments: is the latest deploy healthy or crash-looping? Read its logs.
2. `curl -s https://<api host>/ready` shows which dependency fails (`db`, `redis`).
3. Grafana → *CritterPass / Service health*: did 5xx or latency rise before the outage?
4. Sentry: new issues in the `api` release that just shipped.

**Mitigation:** roll back to the previous deployment in Railway (Deployments → ⋯ → Redeploy). If the database is the cause, follow the PlanetScale status page and fail over per `docs/runbooks` database notes.

**Rollback:** redeploying the previous image is safe; migrations are additive. If a migration broke the deploy, fix forward with a new migration, never by editing an applied one.
