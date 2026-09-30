/**
 * `GET /v1/explore/destinations/{id}?trip_id&month&currency&origins` (docs/api-contracts-explore.md):
 * the destination guide in one read. The travel-data insights (month curve, events, FX chip and
 * per-origin fares, each labelled with when it was seen) re-priced for every crew member's home
 * airport when a trip is in context, the first-timer picks, and at most one labelled sponsored slot
 * where `sponsored(u,t)` holds. Partner content never appears here, so nothing cached holds it.
 */
import { withUser } from '@cp/db';
import {
  DomainError,
  FARE_REFRESH_TZ,
  monthKeyIn,
  monthKeySchema,
  nextMonthKeys,
  withSponsoredSlot,
  type ListEntry,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';
import type { CommandDoorDeps } from '../commands/_framework/doors';
import { requireCommandSession } from '../commands/_framework/session';
import { resolveDestination } from '../travel-data/destination-ref';
import {
  readDestinationInsights,
  type DestinationInsights,
} from '../travel-data/destination-route';
import { originsQuerySchema } from '../travel-data/fares-route';
import { readPicks, type DestinationPick } from './picks';
import { pickSponsored, sponsoredEligible, type SponsoredPick } from './sponsored-slot';

export interface CrewOrigin {
  readonly origin: string;
  readonly user_ids: readonly string[];
}

export interface ExploreDestination extends DestinationInsights {
  readonly trip_id: string | null;
  /** Which members fly from which airport (the viewer alone without a trip). */
  readonly origins: readonly CrewOrigin[];
  /** The viewer has no home airport: the app asks for one before re-pricing. */
  readonly home_airport_missing: boolean;
  readonly picks: readonly ListEntry<DestinationPick, SponsoredPick>[];
}

const querySchema = z.object({
  trip_id: z.uuid().optional(),
  origins: originsQuerySchema.optional(),
  month: monthKeySchema.optional(),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase())
    .optional(),
});

async function crewOrigins(tx: pg.PoolClient, tripId: string | null): Promise<CrewOrigin[]> {
  const { rows } = await tx.query<{ origin: string; user_ids: string[] }>(
    tripId === null
      ? `SELECT upper(home_airport) AS origin, ARRAY[id] AS user_ids FROM users
          WHERE id = app.uid() AND home_airport ~* '^[a-z]{3}$'`
      : `SELECT upper(u.home_airport) AS origin, array_agg(u.id ORDER BY u.id) AS user_ids
           FROM trip_participants p JOIN users u ON u.id = p.user_id
          WHERE p.trip_id = $1 AND p.rsvp IS DISTINCT FROM 'out' AND u.home_airport ~* '^[a-z]{3}$'
          GROUP BY upper(u.home_airport) ORDER BY 1`,
    tripId === null ? [] : [tripId],
  );
  return rows;
}

async function viewerCurrency(tx: pg.PoolClient): Promise<string> {
  const { rows } = await tx.query<{ currency: string | null }>(
    'SELECT upper(home_currency) AS currency FROM users WHERE id = app.uid()',
  );
  return rows[0]?.currency ?? 'USD';
}

export async function readExploreDestination(
  tx: pg.PoolClient,
  input: z.infer<typeof querySchema> & { readonly id: string; readonly now: Date },
): Promise<ExploreDestination> {
  const tripId = input.trip_id ?? null;
  if (tripId !== null) {
    const { rows } = await tx.query(
      'SELECT 1 FROM trips WHERE id = $1 AND app.is_trip_member(id)',
      [tripId],
    );
    if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  }
  const destination = await resolveDestination(tx, input.id);
  const origins = await crewOrigins(tx, tripId);
  const own = await tx.query<{ missing: boolean }>(
    "SELECT home_airport IS NULL OR home_airport !~* '^[a-z]{3}$' AS missing FROM users WHERE id = app.uid()",
  );
  const insights = await readDestinationInsights(tx, {
    destination,
    origins: input.origins ?? origins.map((entry) => entry.origin).slice(0, 8),
    month: input.month ?? nextMonthKeys(monthKeyIn(input.now, FARE_REFRESH_TZ), 2)[1] ?? '',
    currency: input.currency ?? (await viewerCurrency(tx)),
    now: input.now,
  });
  const organic = await readPicks(tx, destination.id, tripId);
  const eligible = await sponsoredEligible(tx, tripId);
  const slot = eligible
    ? await pickSponsored(tx, {
        destinationId: destination.id,
        listKind: 'picks',
        exclude: new Set(organic.map((pick) => pick.poi_id)),
      })
    : null;
  return {
    ...insights,
    trip_id: tripId,
    origins,
    home_airport_missing: own.rows[0]?.missing ?? true,
    picks: withSponsoredSlot(organic, slot, eligible),
  };
}

export function registerExploreDestinationRoute(
  app: OpenAPIHono<AppEnv>,
  deps: Pick<CommandDoorDeps, 'pool' | 'sessions'>,
): void {
  app.get('/v1/explore/destinations/:id', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const query = querySchema.parse(c.req.query());
    const body = await withUser(deps.pool, session.uid, 'unknown', (tx) =>
      readExploreDestination(tx, { ...query, id: c.req.param('id'), now: new Date() }),
    );
    // Per viewer (the sponsored slot follows their entitlements), so short and private.
    c.header('Cache-Control', 'private, max-age=900');
    return c.json(body);
  });
}
