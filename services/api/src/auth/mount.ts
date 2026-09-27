import type { Hono } from 'hono';
import type pg from 'pg';

import {
  sessionRevokeRealtimeMiddleware,
  type SessionRevokeLogger,
} from '../realtime/session-revoke-hook';

import type { AuthModule } from './index';
import { registerAuthTokenRoutes } from './tokens';

/**
 * Mounts Better Auth on the api: the audience-scoped `GET /api/auth/token` and the `use: "sig"`
 * JWKS that PowerSync and Centrifugo verify against, the admin session-revocation fan-out, then
 * Better Auth's own catch-all. Call it after every other `/api/auth/*` route: Hono matches the first
 * registered route, so the catch-all must never shadow a more specific one.
 */
export function mountAuthHandler<E extends { Variables: object }>(
  app: Hono<E>,
  authModule: AuthModule,
  deps: { readonly pool: pg.Pool; readonly logger: SessionRevokeLogger },
): void {
  registerAuthTokenRoutes(app, authModule.auth);
  app.use('/api/auth/admin/*', sessionRevokeRealtimeMiddleware(deps));
  app.on(['GET', 'POST'], '/api/auth/*', (c) => authModule.handler(c.req.raw));
}
