/**
 * `POST /v1/stt/token` (docs/api-contracts.md §5.3): a short-lived Deepgram credential for the
 * app's live transcription, used on Android and for iOS locales without an on-device model. The
 * account key never leaves the server; the app opens Deepgram's websocket with a 60-second token
 * from Deepgram's token grant, which only authorises streaming. Rate-limited per user, since
 * each token is a fresh grant. The token sends the traveller's speech to Deepgram, so it is only
 * given while their voice consent stands (`CONSENT_REQUIRED` otherwise).
 */
import { DomainError } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import {
  enforceUidRateLimit,
  requireCommandSession,
  type SessionResolver,
} from '../commands/_framework/session';
import { requireVoiceConsent } from '../lib/voice-consent';

/** What the app's Deepgram client opens the socket with (`Sec-WebSocket-Protocol: bearer, …`). */
export interface SttToken {
  readonly token: string;
  readonly scheme: 'bearer';
  readonly expires_at: string;
}

export const STT_TOKEN_TTL_SECONDS = 60;
const GRANT_URL = 'https://api.deepgram.com/v1/auth/grant';

/** A voice turn opens one socket; a few retries a minute is plenty, a loop is not. */
const STT_TOKEN_PER_UID_RULE = { windowSeconds: 60, max: 12 };

export type MintSttToken = () => Promise<SttToken>;

function unavailable(reason: string): DomainError {
  return new DomainError('SUPPLIER_UNAVAILABLE', { supplier: 'deepgram', reason });
}

/** Asks Deepgram for a streaming token that expires in {@link STT_TOKEN_TTL_SECONDS}. */
export function deepgramTokenMinter(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): MintSttToken {
  return async () => {
    let response: Response;
    try {
      response = await fetchImpl(GRANT_URL, {
        method: 'POST',
        headers: { authorization: `Token ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ttl_seconds: STT_TOKEN_TTL_SECONDS }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw unavailable('unreachable');
    }
    if (!response.ok) throw unavailable(`http_${response.status}`);
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
      throw unavailable('malformed');
    }
    const ttl = typeof body.expires_in === 'number' ? body.expires_in : STT_TOKEN_TTL_SECONDS;
    return {
      token: body.access_token,
      scheme: 'bearer',
      expires_at: new Date(now() + ttl * 1000).toISOString(),
    };
  };
}

export interface SttTokenRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  /** Null when Deepgram is not configured: the app keeps on-device recognition only. */
  readonly mint: MintSttToken | null;
}

export function registerSttTokenRoutes(app: OpenAPIHono<AppEnv>, deps: SttTokenRouteDeps): void {
  app.post('/v1/stt/token', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'stt_token', uid, STT_TOKEN_PER_UID_RULE);
    await requireVoiceConsent(deps.pool, uid);
    if (deps.mint === null) throw unavailable('not_configured');
    c.header('Cache-Control', 'private, no-store');
    return c.json(await deps.mint());
  });
}

/** Mounts the route with `DEEPGRAM_API_KEY`; unset answers `SUPPLIER_UNAVAILABLE`. */
export function registerSttTokenRoutesFromEnv(
  app: OpenAPIHono<AppEnv>,
  deps: Omit<SttTokenRouteDeps, 'mint'>,
  env: Readonly<Record<string, string | undefined>>,
): void {
  const key = env['DEEPGRAM_API_KEY']?.trim();
  registerSttTokenRoutes(app, { ...deps, mint: key ? deepgramTokenMinter(key) : null });
}
