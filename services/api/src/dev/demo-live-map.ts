/**
 * `POST /v1/dev/seed-live-map`: a crew live map scenario for device runs on staging. The caller
 * organises a new crew "The Bali Six" with two trips in their trip days in Ubud (Asia/Makassar):
 * one boosted (the live map is on) and one unboosted (the Boost gate), plus Campuhan Ridge as a
 * meet-up place. It answers the crew's live join code and both trip ids, so the shard's runner can
 * bring simulated crewmates in with the code (tools/scripts/live-map-sim/sim.ts `--code`) and keep
 * them walking. A new crew each call, so every run starts from the same state.
 *
 * Mounted with the other dev routes (./routes.ts): never in production.
 */
import { DomainError, generateUuidV7 } from '@cp/domain';
import { withSystem } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import { startCrew } from '../commands/crews/create-crew';
import { enforceUidRateLimit, requireCommandSession } from '../commands/_framework/session';
import type { DevRouteDeps } from './routes';

export const LIVE_MAP_TZ = 'Asia/Makassar';
export const LIVE_MAP_CREW_NAME = 'The Bali Six';
const DESTINATION = { slug: 'ubud-live-map', name: 'Ubud', country: 'Indonesia', currency: 'IDR' };
const MEETUP_PLACE = { name: 'Campuhan Ridge', lat: -8.5031, lng: 115.2542 };

// The trip machine accepts one hop per update, from the vote to the trip being on.
const TO_IN_TRIP = [
  'won',
  'setup',
  'drafting',
  'draft_review',
  'proposed',
  'confirmed',
  'pre_trip',
  'in_trip',
];

export interface SeedLiveMapResult {
  readonly crew_id: string;
  readonly code: string;
  readonly trip_id: string;
  readonly unboosted_trip_id: string;
  readonly poi_id: string;
}

function localDate(now: Date, days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: LIVE_MAP_TZ }).format(
    new Date(now.getTime() + days * 86_400_000),
  );
}

async function idOf(tx: pg.PoolClient, sql: string, values: unknown[]): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(sql, values);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('live map seed: expected a row back');
  return id;
}

async function tripInTripDays(
  tx: pg.PoolClient,
  crewId: string,
  destinationId: string,
  uid: string,
  boosted: boolean,
  now: Date,
): Promise<string> {
  const tripId = await idOf(
    tx,
    `INSERT INTO trips (crew_id, status, destination_id, start_date, end_date, tz, local_currency)
     VALUES ($1, 'voting', $2, $3, $4, $5, $6) RETURNING id`,
    [
      crewId,
      destinationId,
      localDate(now, -1),
      localDate(now, 2),
      LIVE_MAP_TZ,
      DESTINATION.currency,
    ],
  );
  await tx.query(
    `INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')`,
    [tripId, uid],
  );
  for (const status of TO_IN_TRIP) {
    await tx.query('UPDATE trips SET status = $1 WHERE id = $2', [status, tripId]);
  }
  await tx.query(
    `INSERT INTO trip_entitlements (trip_id, boost_active, live_map) VALUES ($1, $2, $2)
     ON CONFLICT (trip_id) DO UPDATE SET boost_active = $2, live_map = $2`,
    [tripId, boosted],
  );
  return tripId;
}

/** Builds the caller's live map crew and both trips in one system transaction. */
export async function seedLiveMapFor(
  pool: pg.Pool,
  uid: string,
  now: Date,
): Promise<SeedLiveMapResult> {
  return withSystem(pool, async (tx) => {
    const crewId = generateUuidV7();
    const crew = await startCrew(tx, { crewId, name: LIVE_MAP_CREW_NAME, art: null, uid, now });
    await tx.query(
      `INSERT INTO destinations (slug, name, country, coverage, currency, tz)
       VALUES ($1, $2, $3, 'live', $4, $5) ON CONFLICT (slug) DO NOTHING`,
      [DESTINATION.slug, DESTINATION.name, DESTINATION.country, DESTINATION.currency, LIVE_MAP_TZ],
    );
    const destinationId = await idOf(tx, 'SELECT id FROM destinations WHERE slug = $1', [
      DESTINATION.slug,
    ]);
    const poiId = await idOf(
      tx,
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, $2, 'nature', $3, $4) RETURNING id`,
      [destinationId, MEETUP_PLACE.name, MEETUP_PLACE.lat, MEETUP_PLACE.lng],
    );
    const tripId = await tripInTripDays(tx, crewId, destinationId, uid, true, now);
    const unboostedTripId = await tripInTripDays(tx, crewId, destinationId, uid, false, now);
    return {
      crew_id: crewId,
      code: crew.code,
      trip_id: tripId,
      unboosted_trip_id: unboostedTripId,
      poi_id: poiId,
    };
  });
}

const SEED_PER_UID_RULE = { windowSeconds: 60, max: 10 };

export function registerLiveMapSeed(app: OpenAPIHono<AppEnv>, deps: DevRouteDeps): void {
  app.post('/v1/dev/seed-live-map', async (c) => {
    if (deps.appEnv === 'production') {
      throw new DomainError('FORBIDDEN', { reason: 'not_in_production' });
    }
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'dev_seed_live_map', uid, SEED_PER_UID_RULE);
    const result = await seedLiveMapFor(deps.pool, uid, deps.clock?.() ?? new Date());
    deps.logger.info({ crew_id: result.crew_id }, 'live map scenario seeded');
    return c.json(result);
  });
}
