/**
 * Fit over HTTP (docs/api-contracts-planning.md, routes): when places fit the trip's days, the
 * curated places near a place, and ideas for a free window. Participants only; anyone else gets
 * `NOT_FOUND`. All three read as the caller, so an organiser's draft stays theirs.
 */
import { withUser } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

import type { AppEnv } from '../../app';
import type { CommandDoorDeps } from '../../commands/_framework/doors';
import { requireCommandSession } from '../../commands/_framework/session';
import { planStaySource, straightLineSource, tripFitFacts, readFitThresholds } from './context';
import { ideasForGap } from './gap-ideas';
import { nearbyPlaces } from './nearby';
import { fitForTrip, type FitDeps } from './service';

export const MAX_FIT_PLACES = 50;

export const fitBodySchema = z.strictObject({
  poi_ids: z.array(z.uuid()).min(1).max(MAX_FIT_PLACES),
  day_id: z.uuid().optional(),
  starts_at: z.iso.datetime({ offset: true }).optional(),
  include_context: z.boolean().optional(),
});

const tripParams = z.object({ id: z.uuid() });
const nearbyParams = z.object({ id: z.uuid(), poiId: z.uuid() });
const nearbyQuery = z.object({ limit: z.coerce.number().int().min(1).max(25).default(10) });
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u);
const gapQuery = z.object({ day_id: z.uuid(), start: clock, end: clock });

export const DEFAULT_FIT_DEPS: FitDeps = { stays: planStaySource, now: () => new Date() };

export function registerFitRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: Pick<CommandDoorDeps, 'pool' | 'sessions'>,
  fit: FitDeps = DEFAULT_FIT_DEPS,
): void {
  app.post('/v1/trips/:id/fit', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const { id } = tripParams.parse(c.req.param());
    const body = fitBodySchema.parse(await c.req.json());
    const result = await withUser(deps.pool, session.uid, 'unknown', (tx) =>
      fitForTrip(
        tx,
        {
          tripId: id,
          poiIds: [...new Set(body.poi_ids)],
          ...(body.day_id === undefined ? {} : { dayId: body.day_id }),
          ...(body.starts_at === undefined ? {} : { startsAt: new Date(body.starts_at) }),
          ...(body.include_context === undefined ? {} : { includeContext: body.include_context }),
        },
        fit,
      ),
    );
    c.header('Cache-Control', 'private, no-store');
    return c.json(result);
  });

  app.get('/v1/trips/:id/places/:poiId/nearby', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const { id, poiId } = nearbyParams.parse(c.req.param());
    const { limit } = nearbyQuery.parse(c.req.query());
    const places = await withUser(deps.pool, session.uid, 'unknown', async (tx) => {
      const trip = await tripFitFacts(tx, id);
      const { walkMaxM } = await readFitThresholds(tx);
      const travel = (fit.travel ?? straightLineSource)(trip.driveFactor, walkMaxM);
      return nearbyPlaces(tx, { destinationId: trip.destinationId, poiId, limit }, travel);
    });
    c.header('Cache-Control', 'private, max-age=900');
    return c.json({ places });
  });

  app.get('/v1/trips/:id/gaps/ideas', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const { id } = tripParams.parse(c.req.param());
    const query = gapQuery.parse(c.req.query());
    const result = await withUser(deps.pool, session.uid, 'unknown', (tx) =>
      ideasForGap(tx, { tripId: id, dayId: query.day_id, start: query.start, end: query.end }, fit),
    );
    c.header('Cache-Control', 'private, no-store');
    return c.json(result);
  });
}
