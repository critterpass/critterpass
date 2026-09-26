# Cloudflare — Workers, R2, deploy

Edge resources for Critterpass: three Workers plus the R2 buckets they and the api read or write.
No real secret values live in this repo; everything below is a name or shape, never a key.

## Workers

| Worker | Directory | Purpose | Bindings |
|---|---|---|---|
| `cp-web` | `apps/web` | Astro 7 site on `@astrojs/cloudflare`: marketing/link pages, OG, AASA/assetlinks (wired in later work) | `ASSETS` (static output) |
| `cp-admin` | `apps/admin` | Vite + React back-office SPA served as Workers static assets (SPA fallback to `index.html`) | static assets only |
| `cp-media-worker` | `services/media-worker` | Verifies HMAC-signed media URLs and streams the matching object from R2 | `MEDIA` (R2 bucket), `MEDIA_HMAC_KEYS` (secret) |

Each Worker's `wrangler.jsonc` declares `staging` and `production` environments; the deployed scripts are
`<name>-staging` / `<name>-production`. The Astro site builds through Cloudflare's Vite plugin, which picks the
environment when bundling: build with `CLOUDFLARE_ENV=staging` (or `production`) and deploy without `--env`.

Live staging hosts (Workers custom domains on the `critterpass.app` zone, certificates issued by Cloudflare):
`staging.critterpass.app` (web), `admin.staging.critterpass.app` (admin), `media.staging.critterpass.app`
(media Worker). Production routes stay commented in each `wrangler.jsonc` until launch.

## Secrets

| Name | Used by | Shape | Set with |
|---|---|---|---|
| `MEDIA_HMAC_KEYS` | `cp-media-worker` | JSON object `{ "<key id>": "<secret>" }`; supports rotation by adding a new `kid` before removing the old one | `wrangler secret put MEDIA_HMAC_KEYS --env staging` (repeat with `--env production`) |
| `SENTRY_DSN` | `cp-media-worker`, `cp-web` | Sentry project DSN | `wrangler secret put SENTRY_DSN --env staging` (web: `--name cp-web-staging`) |

Never put `MEDIA_HMAC_KEYS`, or any secret, in a `wrangler.jsonc`; Wrangler secrets live in
Cloudflare's own store, not in git. The signing side of the same key set is `signMediaUrl` from
`packages/domain`, called wherever a media URL needs to leave the api.

## R2 buckets

| Bucket | Environment | Used by |
|---|---|---|
| `cp-media-dev` | local dev | `cp-media-worker`'s default (top-level) `wrangler.jsonc` binding |
| `cp-media-staging` | staging | `cp-media-worker` `env.staging` |
| `cp-media-prod` | production | `cp-media-worker` `env.production` |
| `cp-tiles` | shared | PMTiles served to MapLibre clients |
| `cp-backups` | shared | nightly off-provider `pg_dump` (35 day lifecycle) |
| `cp-og` | shared | rendered Open Graph images |

All six buckets exist with the APAC location hint. The three media buckets carry the CORS rules in
[r2-cors.json](r2-cors.json) (browser PUTs from the web and admin origins); `cp-backups` expires objects
after 35 days.

## Deploy commands

Run from the repo root; each Worker deploys independently.

```bash
# Validate a build without deploying (local verification and CI)
pnpm --filter @cp/media-worker exec wrangler deploy --dry-run --outdir dist
pnpm --filter @cp/web build && pnpm --filter @cp/web exec wrangler deploy --dry-run --outdir dist
pnpm --filter @cp/admin build && pnpm --filter @cp/admin exec wrangler deploy --dry-run --outdir dist

# Real deploy to staging (swap --env production for a production release)
pnpm --filter @cp/media-worker exec wrangler deploy --env staging
CLOUDFLARE_ENV=staging pnpm --filter @cp/web build && pnpm --filter @cp/web exec wrangler deploy
pnpm --filter @cp/admin build && pnpm --filter @cp/admin exec wrangler deploy --env staging
```

`cp-media-worker` deploys straight from `services/media-worker/src/index.ts` (Wrangler bundles
it); `cp-web` and `cp-admin` must be built first so `dist/` exists for their `assets` binding.
