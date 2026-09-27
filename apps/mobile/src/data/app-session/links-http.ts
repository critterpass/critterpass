/**
 * The link endpoints' HTTP (lib/links/resolver-client.ts `LinksHttp`) over `fetch`, with the
 * session attached: every status resolves with its parsed JSON body; only a request that never got
 * a response (offline, timeout) rejects, which the resolver treats as "unavailable".
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: header names only. */
import type { LinksHttp } from '../../lib/links/resolver-client';

export interface LinksHttpOptions {
  readonly baseUrl: string;
  readonly sessionHeaders: () => Promise<Record<string, string>>;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function createLinksHttp(options: LinksHttpOptions): LinksHttp {
  const doFetch = options.fetch ?? fetch;
  return {
    async request({ method, path, body }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        const response = await doFetch(`${options.baseUrl}${path}`, {
          method,
          headers: {
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...(await options.sessionHeaders()),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        });
        return { status: response.status, body: await readJson(response) };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
