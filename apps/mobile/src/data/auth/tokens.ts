/**
 * Short-lived audience-scoped token fetchers for PowerSync and Centrifugo (docs/api-contracts.md
 * §5.1 `GET /api/auth/token?aud=sync|rt`). Tokens are 15 minutes (services/api/src/auth/tokens.ts);
 * this caches one per audience and refreshes 60 s before expiry so a sync/realtime connection never
 * observes an expired token mid-session. A fetch that does not answer within
 * `TOKEN_FETCH_TIMEOUT_MS` counts as failed: a request made the moment the network comes back can
 * hang without ever erroring, and PowerSync only retries a connection whose token fetch has failed.
 */

export type TokenAudience = 'sync' | 'rt';

const REFRESH_AHEAD_MS = 60_000;

/** How long one token fetch may take before it counts as failed. */
export const TOKEN_FETCH_TIMEOUT_MS = 15_000;

export interface TokenClient {
  /** `signal` aborts once the fetch has timed out; a client that can cancel its request uses it. */
  getToken(
    aud: TokenAudience,
    signal: AbortSignal,
  ): Promise<{ token: string; expiresAtMs: number }>;
}

interface CachedToken {
  readonly token: string;
  readonly expiresAtMs: number;
}

/**
 * A per-audience token cache with refresh-ahead. Not a singleton module-level cache (unlike
 * sign-out-hooks.ts's registry, which is deliberately app-wide): callers construct one per auth
 * client instance, so signing out and back in never serves a stale token cached under a different
 * uid's session.
 */
export function createTokenCache(
  client: TokenClient,
  now: () => number = Date.now,
  timeoutMs: number = TOKEN_FETCH_TIMEOUT_MS,
) {
  const cache = new Map<TokenAudience, CachedToken>();

  function fetchWithin(aud: TokenAudience): Promise<CachedToken> {
    const abort = new AbortController();
    return new Promise<CachedToken>((resolve, reject) => {
      const timer = setTimeout(() => {
        abort.abort();
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing error.
        reject(new Error(`the ${aud} token fetch did not answer within ${timeoutMs} ms`));
      }, timeoutMs);
      client.getToken(aud, abort.signal).then(
        (fresh) => {
          clearTimeout(timer);
          resolve(fresh);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  async function getToken(aud: TokenAudience): Promise<string> {
    const cached = cache.get(aud);
    if (cached && cached.expiresAtMs - REFRESH_AHEAD_MS > now()) {
      return cached.token;
    }
    const fresh = await fetchWithin(aud);
    cache.set(aud, fresh);
    return fresh.token;
  }

  function invalidate(): void {
    cache.clear();
  }

  return { getToken, invalidate };
}

export type TokenCache = ReturnType<typeof createTokenCache>;
