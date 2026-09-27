/**
 * Minimal ambient types for the Cloudflare bindings `worker-configuration.d.ts` (generated with
 * `wrangler types --include-runtime=false`) references. The full `--include-runtime` output embeds
 * workerd's own global `Element`/`Response`/`ReadableStream` etc, which structurally conflict with
 * the DOM lib types this app's browser-side scripts need — so we generate the narrow `Env`-only
 * output and declare just the two binding shapes this app actually calls.
 */
interface D1Result<T = Record<string, unknown>> {
  readonly results: T[];
  readonly success: boolean;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

declare abstract class D1Database {
  prepare(query: string): D1PreparedStatement;
}

// Referenced by the generated `Env` interface (the `ASSETS` binding) but never called by our code.
interface Fetcher {
  fetch(input: unknown, init?: unknown): Promise<Response>;
}

// Astro v6's Cloudflare adapter removed `Astro.locals.runtime.env` in favour of this built-in
// module (its own `Astro.locals.runtime.env` getter now throws, pointing here).
declare module 'cloudflare:workers' {
  export const env: Env;
}
