/**
 * Short-lived, audience-scoped EdDSA tokens for PowerSync and Centrifugo (docs/api-contracts.md
 * §5.1 `GET /api/auth/token`, `GET /api/auth/jwks`). Both routes are registered on the real Hono app
 * *before* the `/api/auth/*` catch-all to `auth.handler` (services/api/src/app.ts): Better Auth's own
 * `jwt` plugin already serves `/token` and `/jwks`, but neither is what PowerSync/Centrifugo need
 * as-is — `/token` has no per-request audience, and its JWKS keys never carry `use: "sig"`, which
 * Centrifugo silently rejects (a spike finding, docs/system-architecture.md §11 S-RT).
 */
import type { Context, Hono } from 'hono';

import { DomainError, type ErrorResponseBody } from '@cp/domain';

import type { AuthInstance } from './config';

const TOKEN_AUDIENCES = ['sync', 'rt'] as const;
export type TokenAudience = (typeof TOKEN_AUDIENCES)[number];

function isTokenAudience(value: string | undefined): value is TokenAudience {
  return value !== undefined && (TOKEN_AUDIENCES as readonly string[]).includes(value);
}

function errorResponse(c: Context, error: DomainError) {
  const body: ErrorResponseBody = error.toResponseBody();
  return c.json(body, error.http as never);
}

interface JwksKey {
  readonly kid?: string;
  readonly use?: string;
  readonly [key: string]: unknown;
}

interface SignJwtResult {
  readonly token: string;
}

interface GetJwksResult {
  readonly keys: readonly JwksKey[];
}

/** The subset of `auth.api` these routes call; typed narrowly so this file does not depend on Better Auth's full generated `api` surface. */
export interface AuthTokenApi {
  getSession(args: { headers: Headers }): Promise<{
    user: { id: string; isAnonymous?: boolean | null };
    session: { id: string };
  } | null>;
  signJWT(args: { body: { payload: Record<string, unknown> } }): Promise<SignJwtResult>;
  getJwks(): Promise<GetJwksResult>;
}

function toTokenApi(auth: AuthInstance): AuthTokenApi {
  // Better Auth's generated `api` object structurally satisfies this; a narrow cast keeps every
  // other file in this module free of its (very large) generated type.
  return auth.api as unknown as AuthTokenApi;
}

/**
 * Mounts `GET /api/auth/token?aud=sync|rt` and a `use: "sig"`-patched `GET /api/auth/jwks`. Register
 * before the `/api/auth/*` → `auth.handler` passthrough so these specific routes win.
 */
export function registerAuthTokenRoutes<E extends { Variables: object }>(
  app: Hono<E>,
  auth: AuthInstance,
): void {
  const api = toTokenApi(auth);

  app.get('/api/auth/token', async (c) => {
    const audParam = c.req.query('aud');
    if (!isTokenAudience(audParam)) {
      return errorResponse(c, new DomainError('VALIDATION', { reason: 'aud must be sync or rt' }));
    }

    const session = await api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      // Covers both "no session" and "session revoked" (Better Auth's own getSession returns null
      // once a session row is gone/expired): either way, no token is minted.
      return errorResponse(c, new DomainError('AUTH_REQUIRED'));
    }

    const result = await api.signJWT({
      body: {
        payload: {
          sub: session.user.id,
          sid: session.session.id,
          anon: Boolean(session.user.isAnonymous),
          aud: audParam,
          // Required explicitly: the low-level signJWT primitive only calls jose's setIssuedAt()
          // when the caller's payload includes iat (a spike finding, docs/system-architecture
          // .md §11 S-SYNC); PowerSync rejects a connection JWT with no iat claim.
          iat: Math.floor(Date.now() / 1000),
        },
      },
    });
    return c.json({ token: result.token });
  });

  app.get('/api/auth/jwks', async (c) => {
    const { keys } = await api.getJwks();
    return c.json({ keys: keys.map((key) => ({ ...key, use: key.use ?? 'sig' })) });
  });
}

/**
 * Forces the jwt plugin's lazy rotation check (services/api/src/auth/config.ts's
 * `jwks.rotationInterval`/`gracePeriod`): Better Auth only mints a new signing key the next time
 * something actually needs to sign, so calling this from a scheduled job rotates ahead of
 * traffic instead of on a live request's critical path. The minted token itself is discarded.
 */
export async function rotateJwksIfDue(auth: AuthInstance): Promise<void> {
  const api = toTokenApi(auth);
  await api.signJWT({
    body: {
      payload: {
        sub: 'system:jwks-rotation-check',
        aud: 'sync',
        iat: Math.floor(Date.now() / 1000),
      },
    },
  });
}
