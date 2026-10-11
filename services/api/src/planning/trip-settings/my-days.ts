/**
 * `GET /v1/trips/{id}/my-days?start` (docs/api-contracts-planning.md, routes): the caller's own
 * shared days for one week from `start`, as the crew's counts read them (free, maybe, busy, or
 * unknown where nothing was shared), for the free-days sheet's "what the crew sees". Trip members
 * only, else `NOT_FOUND`; read as the caller, so only their own days can come back.
 */
import { withUser } from '@cp/db';
import { MY_DAYS_WINDOW, myDaysQuerySchema, type DayState, type MyDaysResult } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../../app';
import type { CommandDoorDeps } from '../../commands/_framework/doors';
import { requireCommandSession } from '../../commands/_framework/session';
import { requireTripMember } from '../../plan/access';

const tripParams = z.object({ id: z.uuid() });

const MY_DAYS_SQL = `SELECT ($2::date + g.n)::text AS date, coalesce(c.state, 'unknown') AS state
  FROM generate_series(0, $3::int - 1) AS g(n)
  LEFT JOIN calendar_days c ON c.user_id = $1 AND c.date = $2::date + g.n
  ORDER BY g.n`;

export async function myDays(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
  start: string,
): Promise<MyDaysResult> {
  await requireTripMember(tx, tripId);
  const { rows } = await tx.query<{ date: string; state: DayState }>(MY_DAYS_SQL, [
    uid,
    start,
    MY_DAYS_WINDOW,
  ]);
  return { trip_id: tripId, days: rows };
}

export function registerMyDaysRead(
  app: OpenAPIHono<AppEnv>,
  deps: Pick<CommandDoorDeps, 'pool' | 'sessions'>,
): void {
  app.get('/v1/trips/:id/my-days', async (c) => {
    const { id } = tripParams.parse(c.req.param());
    const { start } = myDaysQuerySchema.parse({ start: c.req.query('start') });
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const body = await withUser(deps.pool, session.uid, 'unknown', (tx) =>
      myDays(tx, id, session.uid, start),
    );
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });
}
