# Cloudflare — Workers, R2, deploy

Edge resources for Critterpass: three Workers plus the R2 buckets they and the api read or write.
No real secret values live in this repo; everything below is a name or shape, never a key.

## Workers

| Worker | Directory | Purpose | Bindings |
|---|---|---|---|
| `cp-web` | `apps/web` | Astro 7 site on `@astrojs/cloudflare`: marketing/link pages, OG, AASA/assetlinks (wired in later work) | `ASSETS` (static output) |
| `cp-admin` | `apps/admin` | Vite + React back-office SPA served as Workers static assets (SPA fallback to `index.html`) | static assets only |
| `cp-media-worker` | `services/media-worker` | Verifies HMAC-signed media URLs and streams the matching object from R2 | `MEDIA` (R2 bucket), `MEDIA_HMAC_KEYS` (secret) |

Each Worker's `wrangler.jsonc` declares `staging` and `production` environments. Wrangler names
the deployed script `<name>-staging` / `<name>-production` unless an environment sets its own
`name`. Custom domain routes are left commented out in every `wrangler.jsonc` until the
`critterpass.app` DNS zone is live (`docs/system-architecture.md` §14); until then, use the
`*.workers.dev` URL Wrangler prints after a real deploy.

## Secrets

| Name | Used by | Shape | Set with |
|---|---|---|---|
| `MEDIA_HMAC_KEYS` | `cp-media-worker` | JSON object `{ "<key id>": "<secret>" }`; supports rotation by adding a new `kid` before removing the old one | `wrangler secret put MEDIA_HMAC_KEYS --env staging` (repeat with `--env production`) |

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

Buckets are provisioned separately (not created by this skeleton); nothing here creates, deletes
or lists a real bucket.

## Deploy commands

Run from the repo root; each Worker deploys independently.

```bash
# Validate a build without deploying (local verification and CI)
pnpm --filter @cp/media-worker exec wrangler deploy --dry-run --outdir dist
pnpm --filter @cp/web build && pnpm --filter @cp/web exec wrangler deploy --dry-run --outdir dist
pnpm --filter @cp/admin build && pnpm --filter @cp/admin exec wrangler deploy --dry-run --outdir dist

# Real deploy to staging (swap --env production for a production release)
pnpm --filter @cp/media-worker exec wrangler deploy --env staging
pnpm --filter @cp/web build && pnpm --filter @cp/web exec wrangler deploy --env staging
pnpm --filter @cp/admin build && pnpm --filter @cp/admin exec wrangler deploy --env staging
```

`cp-media-worker` deploys straight from `services/media-worker/src/index.ts` (Wrangler bundles
it); `cp-web` and `cp-admin` must be built first so `dist/` exists for their `assets` binding.
