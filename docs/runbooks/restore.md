# Restore from backup

Backups: PlanetScale's own (point-in-time) plus the worker's nightly `ops.backup` job (20:00 UTC),
which streams `pg_dump -Fc` to R2 as `postgres/YYYY-MM-DD.dump` and keeps 35 days
(`services/worker/src/jobs/ops/backup.ts`). Targets: RPO ≤5 min with PlanetScale PITR, ≤24 h from
R2 alone; RTO ≤2 h (docs/system-architecture.md §10).

## Which backup to use

| Situation | Restore from |
|---|---|
| Bad migration or bad data in the last days | PlanetScale point-in-time restore into a new branch, then switch the app's URLs |
| PlanetScale unavailable or the account lost | the newest R2 dump into any Postgres 18 with the same extensions (`infra/docker/postgres`) |
| One table or a few rows | restore into a scratch database (below), then copy the rows back as the owner |

## Monthly drill

1. Start a scratch Postgres from the repo image (built by `pnpm infra:up`), apart from the dev
   database: `docker run -d --name restore-drill -p 54329:5432 -e POSTGRES_PASSWORD=drill
   critterpass-postgres:local`.
2. With the staging backup variables (`railway run --service worker --environment staging -- env`
   gives `BACKUP_S3_*` and `BACKUP_DATABASE_URL`; never paste them into files):

   ```sh
   railway run --service worker --environment staging -- sh -c \
     'RESTORE_TARGET_URL=postgres://postgres:drill@localhost:54329/postgres \
      SOURCE_DATABASE_URL="$BACKUP_DATABASE_URL" \
      pnpm tsx tools/scripts/drills/restore.ts --verify'
   ```

3. The script prints download and restore times, `pg_restore` errors, migrations applied since
   the dump, and the table comparison. It fails on any restore error, a missing table, a table
   that came back empty, or a total time over the RTO.
4. Add a row to the log below, then `docker rm -f restore-drill`.

## Real restore (production)

1. Declare an incident (docs/runbooks/incident.md); switch `signup.enabled` off and put the app
   in read-only by stopping the worker.
2. Create the new database (PlanetScale branch or another provider). Create every role the
   migrations name (`git grep -h "CREATE ROLE" packages/db/migrations`) before restoring, as
   `restore.ts` does from a reachable source; then `pg_restore --no-owner` the dump, and
   `pnpm --filter @cp/db migrate` for migrations newer than the dump (it skips those recorded in
   `public._migrations`).
3. Set every role's password, point `DATABASE_URL`, `DIRECT_DATABASE_URL`, PowerSync's
   `PS_DATA_SOURCE_URI` and the backup URL at it in Railway, redeploy api, worker and PowerSync
   (PowerSync re-snapshots; clients resync).
4. Verify with `restore.ts --verify` against the restored database as the source of truth only
   for table presence, then run the staging contract suite against it before reopening.

## Drill log

| Date | Dump | Size | Download | Restore | Total | Result |
|---|---|---|---|---|---|---|
