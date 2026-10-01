/**
 * Two crews on the real stack for the explore suites: crew A (organiser + one member) and crew B
 * (organiser alone) both going to Kyoto, whose curated places (a must-see, three picks, a stay)
 * are seeded, crew A's trip with a current plan. Routes and extra commands mount on demand.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';

import type { CommandRegistry } from '../../src/commands/_framework/registry';
import { registerExplore } from '../../src/explore/register';
import { seedCurrentPlan, type SeededPlan } from '../plan/plan-fixture';
import {
  buildSetupCrew,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../setup/setup-harness';
import { seedLiveDestinations } from '../travel-data/travel-seed';

export interface ExploreWorld {
  readonly harness: SetupHarness;
  readonly a: SetupCrew;
  readonly b: SetupCrew;
  readonly kyoto: string;
  readonly plan: SeededPlan;
  /** Must-see first, then three picks; `stay` is crew A's lodging in the plan. */
  readonly pois: {
    readonly mustSee: string;
    readonly picks: readonly string[];
    readonly stay: string;
  };
  get(who: SignedIn, path: string): Promise<{ status: number; body: Record<string, unknown> }>;
  q<T extends pg.QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
}

async function insertPoi(
  pool: pg.Pool,
  destinationId: string,
  name: string,
  category: string,
  editorial: Record<string, unknown>,
  lat: number,
): Promise<string> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, curation, editorial, tags)
       VALUES ($1, $2, $3, $4, 135.77, 'editorial', $5, '{temples}') RETURNING id`,
      [destinationId, name, category, lat, JSON.stringify(editorial)],
    );
    return rows[0]!.id;
  });
}

export async function startExploreWorld(
  extra?: (registry: CommandRegistry) => void,
): Promise<ExploreWorld> {
  const harness = await startSetupHarness(extra, (app, deps) => registerExplore(app, deps));
  const a = await buildSetupCrew(harness, 2);
  const b = await buildSetupCrew(harness, 1);
  const kyoto = (await seedLiveDestinations(harness.pool))['kyoto'] ?? '';
  const pool = harness.pool;
  const mustSee = await insertPoi(
    pool,
    kyoto,
    'Fushimi Inari Taisha',
    'temple_shrine',
    { must_see: true },
    34.967,
  );
  const picks = [
    await insertPoi(pool, kyoto, 'Kinkaku-ji', 'temple_shrine', {}, 35.039),
    await insertPoi(pool, kyoto, 'Nishiki Market', 'market', {}, 35.005),
    await insertPoi(pool, kyoto, 'Arashiyama Bamboo Grove', 'nature', {}, 35.017),
  ];
  const stay = await insertPoi(pool, kyoto, 'Gion Ryokan', 'stay', {}, 35.003);
  await withSystem(pool, async (tx) => {
    await tx.query('UPDATE trips SET destination_id = $1, tz = $2 WHERE id = ANY($3)', [
      kyoto,
      'Asia/Tokyo',
      [a.tripId, b.tripId],
    ]);
    await tx.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
      [a.tripId, a.members[1]!.uid],
    );
    await tx.query("UPDATE users SET home_airport = 'HAN' WHERE id = $1", [a.members[1]!.uid]);
  });
  const plan = await seedCurrentPlan(pool, a.tripId);
  await withSystem(pool, (tx) =>
    tx.query('UPDATE plan_items SET poi_id = $1 WHERE stable_id = $2', [stay, plan.walk]),
  );
  return {
    harness,
    a,
    b,
    kyoto,
    plan,
    pois: { mustSee, picks, stay },
    async get(who, path) {
      const response = await harness.request(path, { headers: { cookie: who.cookie } });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    },
    async q<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
      return (await pool.query<T>(sql, params)).rows;
    },
  };
}
