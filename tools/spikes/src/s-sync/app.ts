import { Hono } from 'hono';
import type pg from 'pg';

import type { BetterAuthInstance } from '../s-auth/harness';

import { createUploadApp } from './upload-app';

interface SignJwtResult {
  token: string;
}

/**
 * Same narrow, source-verified cast s-rt/harness.ts uses: `buildAuthOptions`'s return type is
 * widened to `BetterAuthOptions` (so `computeSpikeAuthTables` can also accept it), which erases
 * the `jwt` plugin's `signJWT` endpoint from the inferred `api` surface.
 */
interface SignJwtApi {
  signJWT(args: { body: { payload: Record<string, unknown> } }): Promise<SignJwtResult>;
}

export interface CreateAppOptions {
  auth: BetterAuthInstance;
  pool: pg.Pool;
}

/**
 * One Hono app serving Better Auth (JWKS + session/link endpoints, reused unmodified from
 * s-auth) and the sync upload door, deployed as a single Railway service for the S-SYNC spike
 * (`tools/spikes/s-sync-app.Dockerfile`). Locally the same app is served in-process
 * (harness.ts).
 */
export function createSpikeSyncApp({ auth, pool }: CreateAppOptions): Hono {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true }));
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
  app.route('/', createUploadApp(pool));

  // Spike-only convenience: mints a connection JWT for a synthetic user id and an explicit
  // audience, standing in for a real client's post-sign-in `/api/auth/token` call
  // (system-architecture.md §4.3). No session is needed because S-SYNC proves PowerSync's
  // replication/auth/upload contract, not sign-in itself — that is S-AUTH's job (already
  // PASSED). Passing `aud` in the payload overrides the jwt plugin's configured default
  // audience per call (better-auth/src/plugins/jwt/sign.ts: `payload.aud ?? options.jwt.audience`),
  // so one Better Auth instance mints both `aud: rt` (S-RT) and `aud: sync` (this spike) tokens
  // without two separate plugin configs — a real finding for the auth and sync build, not just
  // spike wiring.
  //
  // `iat` must be set explicitly here: the low-level `signJWT` API only calls `setIssuedAt()`
  // when `payload.iat` is truthy (`const iat = payload.iat!; ... if (iat) jwt.setIssuedAt(iat)`)
  // — unlike its own `getJwtToken()` wrapper (what the real `/api/auth/token` endpoint uses),
  // which always fills `iat` before calling `signJWT`. PowerSync v1.26.1 rejects a token with no
  // `iat` claim at all (`PSYNC_S2101 "JWT payload is missing a required claim \"iat\""`);
  // Centrifugo (S-RT, which also calls this low-level API directly) does not require it. Real
  // production tokens are unaffected since they go through `getJwtToken()`.
  app.post('/internal/spike/token', async (c) => {
    const body = await c.req.json<{ userId: string; audience: string }>();
    const signJwtApi = auth.api as unknown as SignJwtApi;
    const result = await signJwtApi.signJWT({
      body: {
        payload: { sub: body.userId, aud: body.audience, iat: Math.floor(Date.now() / 1000) },
      },
    });
    return c.json({ token: result.token });
  });

  return app;
}
