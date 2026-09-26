/// <reference types="@cloudflare/vitest-pool-workers/types" />

/**
 * Matches the R2 binding declared in wrangler.jsonc so `cloudflare:test`'s and
 * `cloudflare:workers`' exported `env` are typed correctly in tests. Secrets
 * (`MEDIA_HMAC_KEYS`) never appear in generated Cloudflare types since Wrangler stores them
 * outside the config file; tests inject that value directly when building the worker's `Env`.
 */
declare namespace Cloudflare {
  interface Env {
    readonly MEDIA: R2Bucket;
  }
}
