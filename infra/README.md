# Infrastructure and secrets

Topology: [docs/system-architecture.md](../docs/system-architecture.md) §2 and §6. Per-platform notes:
[railway/README.md](railway/README.md) (Railway + PlanetScale), [cloudflare/README.md](cloudflare/README.md)
(Workers, R2, DNS). Local stack: `pnpm infra:up` ([docker-compose.yml](docker-compose.yml)).

## Secret matrix

Only `.env.example` files are committed. Local values live in the git-ignored repo-root `.env` (and
`services/media-worker/.dev.vars`). "Provisioned" means the value exists in the store today.

| Secret | Store | Consumed by | Rotation | Status |
|---|---|---|---|---|
| `DATABASE_URL` (PgBouncer :6432), `DATABASE_DIRECT_URL` (:5432) | Railway variables (per env) | api (both), worker (direct) | quarterly; `pscale role reset` | provisioned (staging) |
| `REDIS_URL` | Railway reference `${{Redis.REDIS_URL}}` | api, worker | with Redis password | provisioned (staging) |
| `MEDIA_HMAC_KEYS` (+ `MEDIA_HMAC_ACTIVE_KID`) | Railway variables (api signs) + Wrangler secret (media Worker verifies) | api, media-worker | yearly; add new `kid`, switch active, drop old | provisioned (staging, local) |
| `SENTRY_DSN` | Railway variables (api, worker), Wrangler secrets (media Worker, web), GitHub secrets `SENTRY_DSN_WEB`/`SENTRY_DSN_ADMIN` (bundle time), EAS env (mobile) | all surfaces | on leak only (public client keys) | provisioned (staging) |
| `SENTRY_AUTH_TOKEN` | local `.env`; GitHub secret when source-map upload lands | release tooling | yearly | local only |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secrets | deploy-edge workflow | quarterly | account id set; **token pending (founder)** |
| R2 S3 access key + secret | Railway variables | api (presigned PUT) | quarterly | pending: storage phase |
| `CENTRIFUGO_HTTP_API_KEY`, Centrifugo JWKS/proxy URLs | Railway variables | centrifugo, api, worker | quarterly | pending: realtime phase |
| `PS_*` (replication role, storage URL, JWKS) | Railway variables | powersync-repl, powersync-api | quarterly | pending: sync phase |
| Better Auth secret, JWT signing keys (EdDSA) | Railway variables | api | quarterly (`rotationInterval`) | pending: auth phase |
| Apple: Sign in with Apple key, APNs `.p8` + key id, App Attest | Railway variables; EAS credentials for signing | api, worker, EAS | yearly / on staff change | pending: auth + push phases (team `YFND2EEW8S`) |
| Google: OAuth clients, FCM service account, Play Integrity, Play service account | Railway variables; EAS submit | api, worker, EAS | yearly | pending: founder (Google Play project) |
| `ANTHROPIC_API_KEY` (+ `ANTHROPIC_BASE_URL`), Langfuse keys | Railway variables; local `.env` | api, worker, evals | quarterly | local only |
| `MAPBOX_SECRET_TOKEN`, `FOURSQUARE_API_KEY` | Railway variables; local `.env` | api, worker, content tools | yearly | local only |
| RevenueCat keys + webhook secret, store notification secrets | Railway variables | api | yearly | pending: monetisation phase |
| OTP providers (WhatsApp, Twilio Verify, Prelude), supplier keys, data vendor keys, Resend, PostHog, Grafana | Railway variables | api, worker | quarterly | pending: owning phases |
| Field-encryption key (versioned key id) | Railway variables | api, worker | yearly | pending: first encrypted field |
| EAS / store credentials | EAS (managed credentials) | EAS builds and submits | yearly | Android keystore managed by EAS; iOS pending |

`pnpm env:check` validates each Node service's variables against its zod schema without printing values;
run it against a Railway environment with `railway run --service <service> pnpm env:check --service <service>`.
