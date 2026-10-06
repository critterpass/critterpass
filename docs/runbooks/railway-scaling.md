# Railway scaling

Railway scales replicas by hand (service → Settings → Deploy → Replicas, or `multiRegionConfig`
in the service's `railway.json`). Thresholds per service live in
`infra/railway/scaling/production.json`; staging stays at one replica.

## When to add a replica

| Service | Scale up when (sustained 15 min) | Scale down when (sustained 1 h) | Max | Bound by |
|---|---|---|---|---|
| api | CPU > 70 % or command p95 > 300 ms or event loop lag > 100 ms | CPU < 25 % | 4 | PgBouncer client pool and 1 direct connection each |
| worker | any non-DLQ queue depth > 500 or oldest job > 2 min | queues near empty | 3 | 4 direct database connections each |
| powersync-api | CPU > 70 % or > 2,000 connections per replica | CPU < 25 % | 4 | bucket storage Postgres |
| centrifugo | > 5,000 connections per replica or CPU > 70 % | CPU < 25 % | 3 | Redis engine (already on) carries fan-out between replicas |
| powersync-repl | never: exactly one replica owns the replication slot | – | 1 | – |

Before adding a worker or api replica, redo the connection tally in `infra/railway/README.md`
(Database connection budget) against production `max_connections`: each extra worker adds 4
direct connections and each api replica 1.

## Steps

1. Check the dashboard that tripped the threshold (service health, jobs, realtime, sync).
2. Raise the replica count by one; wait for the health check, watch 15 minutes.
3. If the cause is a slow query or a hot loop rather than load, fix that instead: replicas hide it
   and burn connections.
4. Record the change and the reason in the ops log; scale back down when the down condition holds.

Vertical size (CPU and memory per replica) is set per service in Railway; raise it before adding
replicas for the worker (jobs are memory-bound) and the PowerSync api.
