/**
 * `GET /v1/trips/{id}/places/suggest` (docs/api-contracts-planning.md): Tokek's suggestions for the
 * trip's places list, ranked by fit, a page at a time. Participants only; anyone else gets
 * `NOT_FOUND`. Read as the caller, so their hides and an organiser's draft stay theirs.
 */
import { withUser } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

import type { AppEnv } from '../../app';
import type { CommandDoorDeps } from '../../commands/_framework/doors';
import { requireCommandSession } from '../../commands/_framework/session';
import { DEFAULT_FIT_DEPS } from '../fit/routes';
import type { FitDeps } from '../fit/service';
import { suggestPlaces } from './rank';

export const MAX_SUGGEST_LIMIT = 30;

const tripParams = z.object({ id: z.uuid() });
const category = z.string().regex(/^[a-z_]{1,32}$/u);
export const suggestQuerySchema = z.object({
  /** One category or several, comma separated (`food,market`). */
  category: z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === '' ? [] : value.split(',')))
    .pipe(z.array(category).max(12)),
  limit: z.coerce.number().int().min(1).max(MAX_SUGGEST_LIMIT).default(MAX_SUGGEST_LIMIT),
  cursor: z.coerce.number().int().min(0).max(100_000).default(0),
});

export function registerSuggestRoute(
  app: OpenAPIHono<AppEnv>,
  deps: Pick<CommandDoorDeps, 'pool' | 'sessions'>,
  fit: FitDeps = DEFAULT_FIT_DEPS,
): void {
  app.get('/v1/trips/:id/places/suggest', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const { id } = tripParams.parse(c.req.param());
    const query = suggestQuerySchema.parse(c.req.query());
    const page = await withUser(deps.pool, session.uid, 'unknown', (tx) =>
      suggestPlaces(
        tx,
        {
          tripId: id,
          uid: session.uid,
          categories: query.category,
          limit: query.limit,
          cursor: query.cursor,
        },
        fit,
      ),
    );
    c.header('Cache-Control', 'private, no-store');
    return c.json(page);
  });
}
