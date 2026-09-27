/**
 * `GET /v1/fares?origins&dest&month` (docs/api-contracts.md §5.5): Travelpayouts calendars as
 * cached by the nightly precompute, one entry per requested origin with its state (`ok`, `stale`,
 * `missing`), source and "seen" time. Reads run as `app_user` (fare cells are RLS "R").
 */
import { withUser } from '@cp/db';
import { iataCodeSchema, monthKeySchema } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { requireCommandSession } from '../commands/_framework/session';
import { resolveDestination } from './destination-ref';
import { readFares } from './fares-read';
import type { TravelDataRouteDeps } from './routes';

export const MAX_FARE_ORIGINS = 12;

/** `SIN,KUL` → `['SIN', 'KUL']`, each a valid IATA code, at most 12. */
export const originsQuerySchema = z
  .string()
  .transform((value) => value.split(',').map((code) => code.trim().toUpperCase()))
  .pipe(z.array(iataCodeSchema).min(1).max(MAX_FARE_ORIGINS));

const faresQuerySchema = z.object({
  origins: originsQuerySchema,
  dest: z.string().min(1),
  month: monthKeySchema,
});

export function registerFaresRoute(app: OpenAPIHono<AppEnv>, deps: TravelDataRouteDeps): void {
  app.get('/v1/fares', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const query = faresQuerySchema.parse(c.req.query());
    const body = await withUser(deps.pool, session.uid, 'unknown', async (tx) => {
      const destination = await resolveDestination(tx, query.dest);
      const destIata = destination.travel?.airports[0];
      const fares =
        destIata === undefined
          ? []
          : await readFares(tx, { origins: query.origins, destIata, month: query.month });
      return {
        destination_id: destination.id,
        dest_iata: destIata ?? null,
        month: query.month,
        fares,
      };
    });
    c.header('Cache-Control', 'private, max-age=21600');
    return c.json(body);
  });
}
