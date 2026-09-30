/**
 * Plan HTTP routes: the calendar feed (`GET /v1/trips/{id}/calendar.ics?token`). Calendar apps
 * poll it without a session, so the token is the only credential; it runs as the server and reads
 * only what that token's member may see.
 */
import { withSystem } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { loadFeed, renderIcs } from './calendar-feed';

export interface PlanRouteDeps {
  readonly pool: pg.Pool;
}

const params = z.object({ id: z.uuid() });
const query = z.object({ token: z.string().min(20).max(200) });

export function registerPlanRoutes(app: OpenAPIHono<AppEnv>, deps: PlanRouteDeps): void {
  app.get('/v1/trips/:id/calendar.ics', async (c) => {
    const trip = params.safeParse(c.req.param());
    const auth = query.safeParse({ token: c.req.query('token') });
    if (!trip.success || !auth.success) return c.text('Not found', 404);
    const feed = await withSystem(deps.pool, (tx) => loadFeed(tx, trip.data.id, auth.data.token));
    if (feed === null) return c.text('Not found', 404);
    c.header('Content-Type', 'text/calendar; charset=utf-8');
    c.header('Cache-Control', 'private, max-age=300');
    return c.body(renderIcs(feed, new Date()));
  });
}
