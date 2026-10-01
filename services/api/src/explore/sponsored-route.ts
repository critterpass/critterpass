/**
 * `GET /v1/explore/sponsored?destination_id&list_kind&category&trip_id` (docs/api-contracts-
 * explore.md): the one sponsored slot for a list the app builds itself (the map carousel, search
 * results), or `slot: null` wherever `sponsored(u,t)` does not hold or nothing is booked. The app
 * places it with the same rule as the picks row (third card, never first, labelled).
 */
import { withUser } from '@cp/db';
import { poiCategorySchema, sponsoredListKindSchema } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

import type { AppEnv } from '../app';
import type { CommandDoorDeps } from '../commands/_framework/doors';
import { requireCommandSession } from '../commands/_framework/session';
import { pickSponsored, sponsoredEligible } from './sponsored-slot';

const querySchema = z.object({
  destination_id: z.uuid(),
  list_kind: sponsoredListKindSchema,
  category: poiCategorySchema.optional(),
  trip_id: z.uuid().optional(),
  exclude: z
    .string()
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(z.uuid()).max(100))
    .optional(),
});

export function registerSponsoredRoute(
  app: OpenAPIHono<AppEnv>,
  deps: Pick<CommandDoorDeps, 'pool' | 'sessions'>,
): void {
  app.get('/v1/explore/sponsored', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const query = querySchema.parse(c.req.query());
    const slot = await withUser(deps.pool, session.uid, 'unknown', async (tx) => {
      if (query.trip_id !== undefined) {
        const { rows } = await tx.query(
          'SELECT 1 FROM trips WHERE id = $1 AND app.is_trip_member(id)',
          [query.trip_id],
        );
        if (rows.length === 0) return null;
      }
      if (!(await sponsoredEligible(tx, query.trip_id ?? null))) return null;
      return pickSponsored(tx, {
        destinationId: query.destination_id,
        listKind: query.list_kind,
        category: query.category,
        exclude: new Set(query.exclude ?? []),
      });
    });
    c.header('Cache-Control', 'private, no-store');
    return c.json({ slot: slot === null ? null : { ...slot, label: 'SPONSORED' } });
  });
}
