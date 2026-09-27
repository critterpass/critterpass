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
| `centrifugo` | repo, `infra/railway/centrifugo.Dockerfile` | `centrifugo.railway.internal:8000` | config baked from `infra/centrifugo/config.json`, values from `CENTRIFUGO_*` variables; public domain for the client websocket |
| `powersync-repl` / `powersync-api` | repo, `infra/railway/powersync.Dockerfile` | – | one image; `PS_ROLE=sync` (exactly one) / `PS_ROLE=api` (scaled); values from `PS_*` variables; `powersync-api` has the public domain |
| `powersync-compact` | repo, `infra/railway/powersync.Dockerfile` | – | cron `0 19 * * *`, start command `node service/lib/entry.js compact` (see below) |

Staging public domains (1 replica each in `asia-southeast1-eqsg3a`):

| Service | Domain | Client use |
|---|---|---|
| `api` | `https://api-staging-de92.up.railway.app` | `EXPO_PUBLIC_API_BASE_URL`; tokens from `GET /api/auth/token?aud=sync\|rt` |
| `powersync-api` | `https://powersync-api-staging.up.railway.app` (port 8080) | `EXPO_PUBLIC_POWERSYNC_URL` |
| `centrifugo` | `https://centrifugo-staging-652b.up.railway.app` (port 8000) | `wss://centrifugo-staging-652b.up.railway.app/connection/websocket` |

### Config as code

`services/<service>/railway.json` and `infra/railway/*.toml` hold each service's intended build and deploy
settings (Dockerfile, health check, pre-deploy command, watch patterns, region). Railway has deprecated
config-as-code files: setting a service's config-file path is rejected ("use Infrastructure as Code
(.railway/railway.ts) instead"), and the CLI has no settings command. Services deploy by CLI upload
(`railway up --ci --service <s> --environment staging` from a clean checkout of `main`), with
`RAILWAY_DOCKERFILE_PATH` selecting the Dockerfile. The remaining settings from each `.toml` (health check path
and timeout, restart policy, draining/overlap seconds, replicas per region, cron schedule, start command) are
set on the service instance with the GraphQL mutation `serviceInstanceUpdate(serviceId, environmentId, input)`
at `https://backboard.railway.com/graphql/v2`, authenticated with the logged-in CLI's token from
`~/.railway/config.json`; that token accepts every field except `railwayConfigFile`.

### Variables (names only; values live in Railway)

| Service | Variables |
|---|---|
| api | `NODE_ENV=production`, `APP_ENV`, `DATABASE_URL` (PgBouncer `:6432`), `DATABASE_DIRECT_URL` (`:5432`, migrations only), `REDIS_URL=${{Redis.REDIS_URL}}`, `PUBLIC_BASE_URL`, `COMMIT_SHA=${{RAILWAY_GIT_COMMIT_SHA}}`, `RAILWAY_DOCKERFILE_PATH`, `SENTRY_DSN` |
| worker | `NODE_ENV=production`, `APP_ENV`, `DATABASE_DIRECT_URL`, `REDIS_URL=${{Redis.REDIS_URL}}`, `COMMIT_SHA`, `RAILWAY_DOCKERFILE_PATH`, `SENTRY_DSN`; nightly backup: `BACKUP_DATABASE_URL` (a BYPASSRLS role that reads every schema), `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` (off-provider R2 bucket; the job dead-letters without them) |
| api (realtime) | `RT_PROXY_SECRET` (same value as the `x-cp-rt-proxy-secret` header Centrifugo sends; unset = `/internal/rt/*` is not mounted) |
| worker (realtime) | `CENTRIFUGO_API_URL=http://centrifugo.railway.internal:8000`, `CENTRIFUGO_HTTP_API_KEY` (same value as Centrifugo's); both set = the `rt_outbox` relay runs |
| centrifugo | `RAILWAY_DOCKERFILE_PATH`, `PORT=8000`, `CENTRIFUGO_HTTP_API_KEY`, `CENTRIFUGO_ENGINE_REDIS_ADDRESS=${{Redis.REDIS_URL}}`, `CENTRIFUGO_CLIENT_TOKEN_JWKS_PUBLIC_ENDPOINT=http://api.railway.internal:8787/api/auth/jwks`, `CENTRIFUGO_CHANNEL_PROXY_SUBSCRIBE_ENDPOINT` / `CENTRIFUGO_CHANNEL_PROXY_PUBLISH_ENDPOINT` (`http://api.railway.internal:8787/internal/rt/subscribe\|publish`), `CENTRIFUGO_CHANNEL_PROXY_SUBSCRIBE_HTTP_STATIC_HEADERS` / `CENTRIFUGO_CHANNEL_PROXY_PUBLISH_HTTP_STATIC_HEADERS` (`{"x-cp-rt-proxy-secret": <api RT_PROXY_SECRET>}`), `CENTRIFUGO_CLIENT_ALLOWED_ORIGINS` (space-separated web origins, staging `https://staging.critterpass.app`; native clients send no `Origin`) |
| powersync-* | `RAILWAY_DOCKERFILE_PATH`, `PS_ROLE`, `PS_DATA_SOURCE_URI` (PlanetScale replication role, `:5432`), `PS_DATA_SOURCE_SSLMODE=verify-full`, `PS_STORAGE_URI=${{Postgres.DATABASE_URL}}`, `PS_STORAGE_SSLMODE=disable` (private network), `PS_PORT=8080`, `PS_JWKS_URI` (the api's public `/api/auth/jwks`), `PS_ADMIN_API_TOKEN` (diagnostics API; the service won't start without it), `PORT=8080` |

Shared secrets (`CENTRIFUGO_HTTP_API_KEY`, `RT_PROXY_SECRET`, `PS_ADMIN_API_TOKEN`) are `openssl rand -hex 32`, set
with `railway variable set NAME --stdin --skip-deploys`. Centrifugo caches the JWKS for an hour: after a signing
key change on the api, restart `centrifugo`.

Validate a service's variables with `railway run --service api pnpm env:check --service api`.

### Bucket compaction (`powersync-compact`)

Self-hosted PowerSync has no admin API for compaction; the service image compacts buckets with its own
`compact` command and exits. `powersync-compact` is a Railway **cron** service next to the two PowerSync
services, with the same image (`infra/railway/powersync.Dockerfile`), the same `PS_*` variables (it needs
`PS_STORAGE_URI` and `PS_DATA_SOURCE_URI`), cron schedule `0 19 * * *` (daily 19:00 UTC), restart policy
`NEVER`, and start command `node service/lib/entry.js compact`, which replaces the image entrypoint that
otherwise starts the service. Schedule and start command are set with `serviceInstanceUpdate` (see Config as
code). The worker has no `powersync.compact` job.

## PlanetScale Postgres

Org `critterpass`, database `critterpass`, AWS `ap-southeast-1`, Postgres 18.

| Branch | Role | Size | Use |
|---|---|---|---|
| `main` | production | PS-5, 1 primary + 2 replicas (HA) | idle until launch; resize before launch |
| `staging` | development | PS-DEV | Railway staging |

- PowerSync replication role on `staging`: `powersync-repl-staging` (id `an03whx4bklj`, `pscale role create
  critterpass staging powersync-repl-staging --inherited-roles postgres --with-replication`; PlanetScale grants
  REPLICATION only to roles inheriting `postgres`, and the initial snapshot needs its BYPASSRLS because every
  published table forces RLS). Its URL is `PS_DATA_SOURCE_URI` on the three PowerSync services.
- Login role per branch: `app_owner` (inherits `postgres`; migrations and, until the schema phase adds the
  RLS roles, the api). Credentials only in Railway variables; rotate with `pscale role reset <db> <branch> <role-id>`.
- Connection: host `aws-ap-southeast-1-2.pg.psdb.cloud`, database `postgres`, `sslmode=verify-full`;
  port `6432` = PgBouncer (request transactions), `5432` = direct (migrations, worker LISTEN, replication).
- Enabled on both branches: `vector`, `pg_trgm`, `unaccent`, `pgcrypto`; publication `powersync` (empty; tables
  are added by schema migrations).
- Backups: PlanetScale default policies (every 12 h, 2-day retention). Extend retention to 14–30 days and add the
  nightly off-provider `pg_dump` to R2 before launch.
