/**
 * Short-lived audience-scoped token fetchers for PowerSync and Centrifugo (docs/api-contracts.md
 * §5.1 `GET /api/auth/token?aud=sync|rt`). Tokens are 15 minutes (services/api/src/auth/tokens.ts);
 * this caches one per audience and refreshes 60 s before expiry so a sync/realtime connection never
 * observes an expired token mid-session.
 */

export type TokenAudience = 'sync' | 'rt';

const REFRESH_AHEAD_MS = 60_000;

export interface TokenClient {
  getToken(aud: TokenAudience): Promise<{ token: string; expiresAtMs: number }>;
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
export function createTokenCache(client: TokenClient, now: () => number = Date.now) {
  const cache = new Map<TokenAudience, CachedToken>();

  async function getToken(aud: TokenAudience): Promise<string> {
    const cached = cache.get(aud);
    if (cached && cached.expiresAtMs - REFRESH_AHEAD_MS > now()) {
      return cached.token;
    }
    const fresh = await client.getToken(aud);
    cache.set(aud, fresh);
    return fresh.token;
  }

  function invalidate(): void {
    cache.clear();
  }

  return { getToken, invalidate };
}

export type TokenCache = ReturnType<typeof createTokenCache>;
