# Railway (Singapore) and PlanetScale

Project `critterpass` (`15372b45-8aeb-4a74-87d9-67b860e910a0`), workspace Vrex. Every service runs in
`asia-southeast1-eqsg3a` (Southeast Asia / Singapore). Environments:

| Environment | Id | Deploys from | State |
|---|---|---|---|
| `staging` | `5450c8b9-8205-4f7b-872e-e114e26a08ed` | `main` (auto) | live |
| `production` | `d94cb6e4-bba7-4182-9836-d83a09811434` | manual promote | services created idle until launch |

## Services

| Service | Source | Private host | Notes |
|---|---|---|---|
| `api` | repo, `services/api/Dockerfile` | `api.railway.internal` | public domain; pre-deploy `node dist/migrate.js` over `DATABASE_DIRECT_URL`; static outbound IP |
| `worker` | repo, `services/worker/Dockerfile` | `worker.railway.internal` | private only; static outbound IP |
| `Redis` | Railway Redis template (8.x) | `redis.railway.internal` | shared by api, worker, Centrifugo |
| `Postgres` | Railway Postgres 18 template | `postgres.railway.internal` | **PowerSync bucket storage only** (rebuildable); the app database is PlanetScale |
| `centrifugo` | repo, `infra/railway/centrifugo.Dockerfile` | `centrifugo.railway.internal` | config baked from `infra/centrifugo/config.json`, values from `CENTRIFUGO_*` variables |
| `powersync-repl` / `powersync-api` | repo, `infra/railway/powersync.Dockerfile` | – | one image; `PS_ROLE=sync` (exactly one) / `PS_ROLE=api` (scaled); values from `PS_*` variables |

### Config as code

`services/<service>/railway.json` holds each service's build and deploy settings (Dockerfile, health check,
pre-deploy command, watch patterns, region). Railway only auto-loads a config file at the repository root, and
neither the CLI nor the API token available to agents can set a service's config-file path, so each service's
**Settings → Config-as-code → Railway config file** is set once in the dashboard per environment
(e.g. `services/api/railway.json`). Until then `RAILWAY_DOCKERFILE_PATH` selects the Dockerfile.

### Variables (names only; values live in Railway)

| Service | Variables |
|---|---|
| api | `NODE_ENV=production`, `APP_ENV`, `DATABASE_URL` (PgBouncer `:6432`), `DATABASE_DIRECT_URL` (`:5432`, migrations only), `REDIS_URL=${{Redis.REDIS_URL}}`, `PUBLIC_BASE_URL`, `COMMIT_SHA=${{RAILWAY_GIT_COMMIT_SHA}}`, `RAILWAY_DOCKERFILE_PATH`, `SENTRY_DSN` |
| worker | `NODE_ENV=production`, `APP_ENV`, `DATABASE_DIRECT_URL`, `REDIS_URL=${{Redis.REDIS_URL}}`, `COMMIT_SHA`, `RAILWAY_DOCKERFILE_PATH`, `SENTRY_DSN`; nightly backup: `BACKUP_DATABASE_URL` (a BYPASSRLS role that reads every schema), `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` (off-provider R2 bucket; the job dead-letters without them) |
| centrifugo | `CENTRIFUGO_HTTP_API_KEY`, `CENTRIFUGO_ENGINE_REDIS_ADDRESS`, `CENTRIFUGO_CLIENT_TOKEN_JWKS_PUBLIC_ENDPOINT`, `CENTRIFUGO_CHANNEL_PROXY_SUBSCRIBE_ENDPOINT`, `CENTRIFUGO_CHANNEL_PROXY_PUBLISH_ENDPOINT`, `CENTRIFUGO_CLIENT_ALLOWED_ORIGINS` |
| powersync-* | `PS_ROLE`, `PS_DATA_SOURCE_URI` (PlanetScale replication role, `:5432`), `PS_DATA_SOURCE_SSLMODE=verify-full`, `PS_STORAGE_URI=${{Postgres.DATABASE_URL}}`, `PS_STORAGE_SSLMODE`, `PS_PORT`, `PS_JWKS_URI`, `PS_ADMIN_API_TOKEN` (diagnostics API; the service won't start without it), `PORT=8080` |

Validate a service's variables with `railway run --service api pnpm env:check --service api`.

### Bucket compaction (`powersync-compact`, to create)

Self-hosted PowerSync has no admin API for compaction; the service image compacts buckets with its own
`compact` command and exits. Create a Railway **cron** service `powersync-compact` next to the two PowerSync
services, with the same image (`infra/railway/powersync.Dockerfile`), the same `PS_*` variables (it needs
`PS_STORAGE_URI` and `PS_DATA_SOURCE_URI`), cron schedule `0 19 * * *` (daily 19:00 UTC), and start command
`node service/lib/entry.js compact`. That start command has to replace the image entrypoint, which otherwise
starts the service. The worker has no `powersync.compact` job.

## PlanetScale Postgres

Org `critterpass`, database `critterpass`, AWS `ap-southeast-1`, Postgres 18.

| Branch | Role | Size | Use |
|---|---|---|---|
| `main` | production | PS-5, 1 primary + 2 replicas (HA) | idle until launch; resize before launch |
| `staging` | development | PS-DEV | Railway staging |

- Login role per branch: `app_owner` (inherits `postgres`; migrations and, until the schema phase adds the
  RLS roles, the api). Credentials only in Railway variables; rotate with `pscale role reset <db> <branch> <role-id>`.
- Connection: host `aws-ap-southeast-1-2.pg.psdb.cloud`, database `postgres`, `sslmode=verify-full`;
  port `6432` = PgBouncer (request transactions), `5432` = direct (migrations, worker LISTEN, replication).
- Enabled on both branches: `vector`, `pg_trgm`, `unaccent`, `pgcrypto`; publication `powersync` (empty; tables
  are added by schema migrations).
- Backups: PlanetScale default policies (every 12 h, 2-day retention). Extend retention to 14–30 days and add the
  nightly off-provider `pg_dump` to R2 before launch.
