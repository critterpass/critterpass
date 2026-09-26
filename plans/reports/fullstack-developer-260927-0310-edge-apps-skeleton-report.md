# Edge apps skeleton (web, admin, media-worker) + media URL signing — report

Worktree: `/Users/quocs/Projects/critterpass-worktrees/edge-apps-skeleton`
Branch: `feat/edge-apps-skeleton` (3 commits, working tree clean, not pushed)

## Files changed

**`feat(domain): add HMAC media url signing and verification`**
- `packages/domain/src/media-signature.ts` (new, 137 lines) — `signMediaUrl`, `verifyMediaSignature`, Web Crypto only
- `packages/domain/src/media-signature.test.ts` (new, 213 lines, 15 tests)
- `packages/domain/src/index.ts` (edit) — exports the two functions and their types
- `packages/domain/tsconfig.json` (edit) — added `"lib": ["ES2024", "DOM"]` for `crypto`/`btoa`/`atob`/`URL` ambient types

**`feat(media): verify signed media urls in the edge worker`**
- `services/media-worker/package.json`, `tsconfig.json`, `wrangler.jsonc`, `vitest.config.ts`
- `services/media-worker/src/index.ts` (89 lines) — module Worker, GET/HEAD only, verify → R2 stream
- `services/media-worker/src/index.test.ts` (88 lines, 6 tests) — Miniflare R2 via `@cloudflare/vitest-pool-workers`
- `services/media-worker/src/cloudflare-env.d.ts` (13 lines) — ambient `Cloudflare.Env` + `cloudflare:test` types

**`build(web): add astro and admin skeletons`**
- `apps/web/{package.json,astro.config.mjs,wrangler.jsonc,tsconfig.json}`, `apps/web/src/{env.d.ts,pages/index.astro}`
- `apps/admin/{package.json,vite.config.ts,wrangler.jsonc,tsconfig.json,index.html}`, `apps/admin/src/main.tsx`
- `infra/cloudflare/README.md` (new)
- `pnpm-workspace.yaml` (edit) — `allowBuilds.workerd: true`; `minimumReleaseAgeExclude` gained `@cloudflare/workers-types@5.20260926.1` (pnpm added this automatically on install; kept it)
- `pnpm-lock.yaml` (regenerated)

## Versions used

Astro 7.3.5, `@astrojs/cloudflare` 14.3.3, `@astrojs/check` 0.9.10, Vite 8.3.1, React/`react-dom` 19.3.0, `@vitejs/plugin-react` 6.1.1, `wrangler` 4.141.0, `@cloudflare/workers-types` 5.20260926.1, `@cloudflare/vitest-pool-workers` 0.22.0, `vitest` 4.1.11 (media-worker only, see deviation below).

## Contract implemented

`signMediaUrl({ baseUrl, objectKey, variant, expiresAt, keyId, secret })` and `verifyMediaSignature({ objectKey, variant, exp, kid, sig, keys, now })` in `packages/domain/src/media-signature.ts`. `verifyMediaSignature` never throws; it returns `{ status: 'ok' | 'expired' | 'bad_signature' | 'unknown_key' }` or `{ status: 'malformed', reason }`. Signature check order is malformed input → unknown key id → HMAC verify (`crypto.subtle.verify`, constant-time) → expiry (`now > exp`) → ok — signature is checked before trusting the `exp` claim, since `exp` is itself part of the signed message. Base64url encode/decode use `btoa`/`atob` (ambient Web APIs, not `node:*` imports), so the module has zero Node-specific imports and runs unchanged under Node's global `crypto`/`TextEncoder` or the Workers runtime.

`services/media-worker/src/index.ts` parses `v`/`exp`/`kid`/`sig` from the query string and the object key from the URL path, calls `verifyMediaSignature`, and on `ok` streams `env.MEDIA.get()` (GET) or `env.MEDIA.head()` (HEAD) with `Content-Type` from R2 metadata (falls back to `application/octet-stream`), `ETag`, and `Cache-Control: private, max-age=<min(exp-now, 3600)>`. Any non-`ok` verification result and an unparseable request path return 403; a missing object returns 404; non-GET/HEAD methods return 405 with an `Allow` header.

## Tests / builds / dry-runs

All run from the worktree root unless noted.

| Command | Result |
|---|---|
| `pnpm install` | clean (after allow-listing `workerd`'s postinstall) |
| `pnpm --filter @cp/domain test` | 15/15 passed |
| `pnpm --filter @cp/media-worker test` | 6/6 passed (valid+headers, expired, tampered, unknown kid, missing object, wrong method) |
| `pnpm --filter @cp/web build` | passed (`astro build`, prerendered `index.html`) |
| `pnpm --filter @cp/admin build` | passed (`vite build`) |
| `pnpm turbo run lint typecheck test build --filter=@cp/web --filter=@cp/admin --filter=@cp/media-worker --filter=@cp/domain` | 15/15 tasks passed |
| `pnpm vitest run tools/scripts` | 24/24 passed (workspace dependency graph + boundaries fixtures still green with the new packages) |
| `wrangler deploy --dry-run --outdir <scratch>` for media-worker, web, admin | all three succeeded, no upload |
| `pnpm exec prettier --check apps/web apps/admin services/media-worker packages/domain infra/cloudflare` | clean (after one `--write` pass on 3 `wrangler.jsonc` files + `index.ts`) |

## Deviations / notes for the controller

1. **Vitest version split, as anticipated by the task.** `@cloudflare/vitest-pool-workers@0.22.0`'s peer dependency is `vitest: ^4.1.0`, not the workspace catalog's `5.0.2` (confirmed via `npm view`; 0.22.0 is the current latest, no 5-compatible release exists). `services/media-worker/package.json` pins `"vitest": "4.1.11"` directly instead of `catalog:`; `pnpm --filter @cp/media-worker test` resolves that local version and passes. This package is filtered out of every verify command that runs a root-level unified Vitest process, so nothing in this task's scope executes media-worker's tests under Vitest 5. I did not touch the root `vitest.config.ts` (out of my file ownership) — if a future task ever runs a bare, unfiltered `vitest run` from the repo root that must include `services/media-worker`, it will need `@cloudflare/vitest-pool-workers` upgraded past its own Vitest-5 support (not yet released) or `services/media-worker` excluded from that root workspace's `projects` glob.
2. **`@cloudflare/vitest-pool-workers` API changed at 0.22.0.** `defineWorkersConfig`/the `/config` subpath (documented almost everywhere online) was removed; 0.22.0 exports a `cloudflareTest()` Vite plugin from the package's main entry instead (confirmed by inspecting the published package's `exports` map and by getting it working). `services/media-worker/vitest.config.ts` uses `cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })` with `defineConfig` from `vitest/config`. Also switched the test file to `import { env } from 'cloudflare:workers'` instead of `cloudflare:test`'s `env`, since the latter is marked `@deprecated` in the installed package's own type declarations; `createExecutionContext`/`waitOnExecutionContext` (not deprecated) still come from `cloudflare:test`.
3. **`compatibility_date` capped at `2026-08-01`, not today.** All three `wrangler.jsonc` files originally used today's date (2026-09-27); Miniflare bundled inside `@cloudflare/vitest-pool-workers@0.22.0` (pinned to an alpha build from mid-August) rejected it with `ERR_FUTURE_COMPATIBILITY_DATE`. Moved all three to `2026-08-01`, safely under that runtime's own knowledge cutoff; this has no functional effect for the plain `fetch`/R2/static-assets behavior these skeletons use. The controller should bump this when a real feature needs a newer compatibility flag, watching for the same ceiling if `vitest-pool-workers` hasn't shipped a newer Miniflare by then.
4. **`@astrojs/cloudflare` 14.3.3 auto-declares `SESSION` (KV) and `IMAGES` bindings** at build/dry-run time ("Enabling image processing…", "Enabling sessions…") even though the one placeholder page uses neither. This is the adapter's own default, not something added in `apps/web/wrangler.jsonc`; `astro build`, `astro check` and `wrangler deploy --dry-run` all succeed regardless. A real (non-dry-run) deploy will need a KV namespace bound as `SESSION` and Cloudflare Images enabled on the account, or these features explicitly turned off in `astro.config.mjs` once the web app's actual scope is known.
5. **TypeScript `Uint8Array<ArrayBuffer>` generic.** `crypto.subtle.verify`'s `BufferSource` parameter rejects a bare `Uint8Array` (which this TS/lib combination widens to `Uint8Array<ArrayBufferLike>`, including `SharedArrayBuffer`). Fixed by typing `base64UrlDecode`'s return and the local in `verifyMediaSignature` as `Uint8Array<ArrayBuffer>` explicitly. Worth knowing if later packages hit the same error against Web Crypto APIs.
6. Package-manager note: `pnpm install` initially failed with `ERR_PNPM_IGNORED_BUILDS` for `workerd`'s postinstall (needed by `wrangler`/Miniflare); allow-listed it in `pnpm-workspace.yaml` per the task's own instructions for this exact situation.

No file ownership violations; no files outside the assigned list were touched. `apps/`, `services/` did not exist in this worktree before this task (T1's manifests-only pass hadn't reached them), so every file under `apps/web`, `apps/admin`, `services/media-worker` is new.

## Unresolved questions

None blocking. Open items for later phases: real KV/Images bindings for `cp-web` before a non-dry-run deploy (see deviation 4); custom domain routes are commented out in all three `wrangler.jsonc` files pending the `critterpass.app` DNS zone (T8).
