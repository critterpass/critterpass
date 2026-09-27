/**
 * Realtime disconnect for sessions revoked by an admin (docs/api-contracts-async.md §1.1
 * "Revocation": `session.revoked` → server API `disconnect`). A user's own `/sign-out` and
 * `/revoke-session(s)` already queue the disconnect from the auth `hooks.after`; this middleware
 * covers the admin endpoints that end another user's sessions, whose target is only in the request
 * body. It wraps the Better Auth handler and queues one `rt_outbox` `disconnect` row after a
 * successful call; the relay then drops every Centrifugo connection of that user within a second,
 * and the revoked device can no longer fetch a fresh `rt` token.
 */
import { enqueueRealtime, withSystem } from '@cp/db';
import { userChannel } from '@cp/domain';
import type { MiddlewareHandler } from 'hono';
import type pg from 'pg';
import { z } from 'zod';

/** Better Auth admin endpoints (mounted under /api/auth) that end every session of `userId`. */
export const ADMIN_SESSION_ENDING_PATHS: ReadonlySet<string> = new Set([
  '/api/auth/admin/revoke-user-sessions',
  '/api/auth/admin/ban-user',
  '/api/auth/admin/remove-user',
]);

const targetSchema = z.object({ userId: z.uuid() });

export interface SessionRevokeLogger {
  error(details: object, message: string): void;
}

/** Queues the `disconnect` row the relay turns into a Centrifugo `disconnect` of every connection. */
export async function enqueueSessionDisconnect(pool: pg.Pool, userId: string): Promise<void> {
  await withSystem(pool, (tx) =>
    enqueueRealtime(tx, {
      channel: userChannel(userId),
      payload: { type: 'session.revoked', user_id: userId },
      kind: 'disconnect',
    }),
  );
}

export function sessionRevokeRealtimeMiddleware(deps: {
  readonly pool: pg.Pool;
  readonly logger: SessionRevokeLogger;
}): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method !== 'POST' || !ADMIN_SESSION_ENDING_PATHS.has(c.req.path)) {
      await next();
      return;
    }
    const body: unknown = await c.req.raw
      .clone()
      .json()
      .catch(() => undefined);
    await next();
    if (c.res.status !== 200) return;
    const target = targetSchema.safeParse(body);
    if (!target.success) return;
    try {
      await enqueueSessionDisconnect(deps.pool, target.data.userId);
    } catch (error) {
      // The revocation itself already succeeded; the short `rt` token lifetime bounds this miss.
      deps.logger.error(
        { err: error, path: c.req.path },
        'could not queue realtime disconnect for a revoked user',
      );
    }
  };
}
