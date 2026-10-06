/**
 * Member reads for drivers our crews used (read over the api, never synced):
 *
 * - `GET /v1/driver-directory?area&lang&seats&day_trips` (6e-1): listed drivers only (RLS shows
 *   members nothing else), ranked by `rankDirectory` (crew answers and dates, never money). When
 *   nobody matches an area, the most-listed other areas to widen to (6e-3).
 * - `GET /v1/driver-directory/{id}` (6e-2): the card plus his price text, number and one tip.
 * - `GET /v1/trips/{tripId}/drivers` (6g-3): the trip's drivers with the crew's answers and the
 *   invite timeline, for the crew only.
 */
import { crypto as dbCrypto, withUser } from '@cp/db';
import {
  DomainError,
  driverDirectoryQuerySchema,
  rankDirectory,
  type DriverDirectoryCard,
  type DriverDirectoryDetail,
  type DriverDirectoryList,
  type DriverVehicle,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import { asSystemRole } from '../admin/command';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';
import { requireKeyring, type DriverDirectoryDeps } from '../commands/driver-directory/shared';
import { loadOurDrivers } from '../commands/driver-directory/ours';

export interface DriverDirectoryRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly deps: DriverDirectoryDeps;
}

interface CardRow {
  id: string;
  display_name: string;
  areas: string[];
  languages: string[];
  vehicle: DriverVehicle | null;
  seats: number | null;
  day_trips: boolean;
  show_ratings: boolean;
  listed_at: Date;
  crews_loved: number | null;
  crews_rated: number | null;
  trips: number | null;
  top_tags: string[] | null;
}

const CARD_SQL = `SELECT l.id, l.display_name, l.areas, l.languages, l.vehicle, l.seats, l.day_trips,
    l.show_ratings, l.listed_at, s.crews_loved, s.crews_rated, s.trips, s.top_tags
  FROM driver_listings l LEFT JOIN driver_listing_stats s ON s.listing_id = l.id`;

function toCard(row: CardRow): DriverDirectoryCard {
  return {
    id: row.id,
    display_name: row.display_name,
    areas: row.areas,
    languages: row.languages,
    vehicle: row.vehicle,
    seats: row.seats,
    day_trips: row.day_trips,
    photo_url: null,
    listed_at: row.listed_at.toISOString(),
    crews_loved: row.show_ratings ? (row.crews_loved ?? 0) : null,
    crews_rated: row.show_ratings ? (row.crews_rated ?? 0) : null,
    trips: row.trips ?? 0,
    top_tags: row.show_ratings ? (row.top_tags ?? []) : [],
  };
}

export async function listDirectory(
  tx: pg.PoolClient,
  query: ReturnType<typeof driverDirectoryQuerySchema.parse>,
): Promise<DriverDirectoryList> {
  const { rows } = await tx.query<CardRow>(
    `${CARD_SQL}
      WHERE l.status = 'listed'
        AND ($1::text IS NULL OR EXISTS (SELECT 1 FROM unnest(l.areas) a WHERE lower(a) = lower($1)))
        AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM unnest(l.languages) g
                                          WHERE lower(g) LIKE lower($2) || '%'))
        AND ($3::int IS NULL OR coalesce(l.seats, 0) >= $3)
        AND ($4::boolean IS NULL OR l.day_trips = $4)`,
    [query.area ?? null, query.lang ?? null, query.seats ?? null, query.day_trips ?? null],
  );
  // Hidden ratings rank as no ratings, so the order never reveals them.
  const cards = rows.map(toCard);
  const ranked = rankDirectory(
    cards.map((card) => ({
      ...card,
      crews_loved: card.crews_loved ?? 0,
      crews_rated: card.crews_rated ?? 0,
    })),
  ).map((ranked) => cards.find((card) => card.id === ranked.id) ?? ranked);
  let nearby: DriverDirectoryList['nearby_areas'] = [];
  if (ranked.length === 0 && query.area !== undefined) {
    const others = await tx.query<{ area: string; drivers: number }>(
      `SELECT a AS area, count(*)::int AS drivers
         FROM driver_listings l, unnest(l.areas) a
        WHERE l.status = 'listed' AND lower(a) <> lower($1)
        GROUP BY a ORDER BY count(*) DESC, a LIMIT 3`,
      [query.area],
    );
    nearby = others.rows;
  }
  return { drivers: ranked, nearby_areas: nearby };
}

async function directoryDetail(
  tx: pg.PoolClient,
  deps: DriverDirectoryDeps,
  id: string,
): Promise<DriverDirectoryDetail> {
  const { rows } = await tx.query<CardRow & { price_text: string | null }>(
    `${CARD_SQL.replace('l.listed_at,', 'l.listed_at, l.price_text,')}
      WHERE l.id = $1 AND l.status = 'listed'`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'driver_listing' });
  return asSystemRole(tx, async () => {
    const phone = await tx.query<{ phone_e164_enc: string }>(
      'SELECT phone_e164_enc FROM driver_listings WHERE id = $1',
      [id],
    );
    const enc = phone.rows[0]?.phone_e164_enc;
    if (enc === undefined) throw new DomainError('NOT_FOUND', { reason: 'driver_listing' });
    const tip = await tx.query<{ id: string; text: string; crew_size: number; month: string }>(
      `SELECT id, text, crew_size, month::text FROM driver_tips
        WHERE listing_id = $1 AND status = 'visible' ORDER BY created_at DESC LIMIT 1`,
      [id],
    );
    return {
      ...toCard(row),
      price_text: row.price_text,
      phone_e164: dbCrypto.decryptField(enc, requireKeyring(deps)),
      tip: tip.rows[0] ?? null,
    };
  });
}

export function registerDriverDirectoryRoutes(
  app: OpenAPIHono<AppEnv>,
  route: DriverDirectoryRouteDeps,
): void {
  app.get('/v1/driver-directory', async (c) => {
    const { uid } = await requireCommandSession(route.sessions, c.req.raw.headers);
    const parsed = driverDirectoryQuerySchema.safeParse(c.req.query());
    if (!parsed.success) throw new DomainError('VALIDATION', { reason: 'query' });
    const body = await withUser(route.pool, uid, 'unknown', (tx) => listDirectory(tx, parsed.data));
    return c.json(body);
  });

  app.get('/v1/driver-directory/:id', async (c) => {
    const { uid } = await requireCommandSession(route.sessions, c.req.raw.headers);
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError('NOT_FOUND');
    const body = await withUser(route.pool, uid, 'unknown', (tx) =>
      directoryDetail(tx, route.deps, id),
    );
    return c.json(body);
  });

  app.get('/v1/trips/:tripId/drivers', async (c) => {
    const { uid } = await requireCommandSession(route.sessions, c.req.raw.headers);
    const tripId = c.req.param('tripId');
    if (!/^[0-9a-f-]{36}$/i.test(tripId)) throw new DomainError('NOT_FOUND');
    const body = await withUser(route.pool, uid, 'unknown', (tx) =>
      loadOurDrivers(tx, tripId, uid),
    );
    return c.json(body);
  });
}
