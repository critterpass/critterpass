# cp-web: bindings, variables and secrets

The site Worker's configuration lives in `apps/web/wrangler.jsonc` (the Astro Cloudflare adapter
reads it from the app). This page lists what each environment needs; no values live in git.

| Name | Kind | Environments | Purpose |
|---|---|---|---|
| `ASSETS` | static assets | all | Built site; also read by the OG renderer for fonts and critter stickers |
| `DB` | D1 | all | Coming-soon waitlist |
| `OG_CACHE` | R2 (`cp-og`) | all | Rendered Open Graph cards, keyed `og/<HMAC>.png` |
| `SITE_MODE` | var | production `coming-soon`, staging `site` | Which front door `/` shows |
| `OG_CACHE_SECRET` | secret | staging, production | HMAC key for OG cache keys (any long random string, different per environment) |
| `LINKS_WEB_PROXY_SECRET` | secret | staging, production | Same value as the api's; lets previews see the visitor's IP and user agent |
| `ANDROID_CERT_FINGERPRINTS` | secret | staging, production | App Links fingerprints |
| `SENTRY_DSN` | secret | staging, production | Error reporting |

```bash
# Set a secret on the deployed script (staging shown; production is cp-web-production)
pnpm --filter @cp/web exec wrangler secret put OG_CACHE_SECRET --name cp-web-staging
```

Without `OG_CACHE_SECRET` the Worker still draws every card, it just never caches one.

## Deploy

`.github/workflows/deploy-edge.yml` deploys staging on every push to `main` and production on
manual dispatch. `.github/workflows/web.yml` runs the site's end-to-end suite on pull requests and,
after each staging deploy, checks that every public page unfurls (Open Graph and Twitter tags,
reachable card image). Build with `CLOUDFLARE_ENV=<env>` and deploy without `--env`: the adapter
picks the environment at bundle time.
