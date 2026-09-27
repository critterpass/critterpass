import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { idsByTable, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';
import { buildTripFixture, type TripFixture } from '../helpers/trip-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: TripFixture;
const device = anonymousActor().device;

async function insertShare(userId: string, total: number): Promise<void> {
  await withSystem(db.pool, async (tx) => {
    await tx.query(
      `INSERT INTO share_calcs (trip_id, user_id, version, components, personal_option_deltas, total_minor, currency)
       VALUES ($1, $2, 'cv_1', '[{"component_key":"food","amount_minor":1000}]',
               '[{"option_id":"skip-nara","delta_minor":-6400}]', $3, 'USD')`,
      [fixture.tripId, userId, total],
    );
    await tx.query(
      `INSERT INTO trip_share_totals (trip_id, user_id, total_minor, currency, calc_version)
       VALUES ($1, $2, $3, 'USD', 'cv_1')`,
      [fixture.tripId, userId, total],
    );
  });
}

function asUser<T>(uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return withUser(db.pool, uid, device, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildTripFixture(db.pool);
  await insertShare(fixture.organiserId, 131_000);
  await insertShare(fixture.memberId, 117_000);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('share_calcs RLS: own row only', () => {
  it("returns a member's own share with its personal option deltas", async () => {
    const rows = await asUser<{ user_id: string; personal_option_deltas: unknown[] }>(
      fixture.memberId,
      'SELECT user_id, personal_option_deltas FROM share_calcs',
    );
    expect(rows).toEqual([
      {
        user_id: fixture.memberId,
        personal_option_deltas: [{ option_id: 'skip-nara', delta_minor: -6400 }],
      },
    ]);
  });

  it("never returns another member's share calc or personal option deltas", async () => {
    const rows = await asUser(fixture.memberId, 'SELECT 1 FROM share_calcs WHERE user_id = $1', [
      fixture.organiserId,
    ]);
    expect(rows).toEqual([]);
  });

  it('hides every share calc from an outsider and an anonymous uid', async () => {
    expect(await asUser(fixture.outsiderId, 'SELECT 1 FROM share_calcs')).toEqual([]);
    expect(await asUser(anonymousActor().uid, 'SELECT 1 FROM share_calcs')).toEqual([]);
  });

  it('rejects app_user writes (system-only)', async () => {
    await expect(
      asUser(fixture.memberId, 'UPDATE share_calcs SET total_minor = 1 WHERE user_id = $1', [
        fixture.memberId,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('trip_share_totals RLS: every member total for the crew, nothing for outsiders', () => {
  it('lets a member read every total but no lines', async () => {
    const rows = await asUser<{ user_id: string; total_minor: string }>(
      fixture.memberId,
      'SELECT user_id, total_minor FROM trip_share_totals ORDER BY total_minor',
    );
    expect(rows).toEqual([
      { user_id: fixture.memberId, total_minor: '117000' },
      { user_id: fixture.organiserId, total_minor: '131000' },
    ]);
  });

  it('denies an outsider', async () => {
    expect(await asUser(fixture.outsiderId, 'SELECT 1 FROM trip_share_totals')).toEqual([]);
  });

  it('rejects app_user writes', async () => {
    await expect(
      asUser(
        fixture.organiserId,
        `INSERT INTO trip_share_totals (trip_id, user_id, total_minor, currency, calc_version)
         VALUES ($1, $2, 1, 'USD', 'x')`,
        [fixture.tripId, fixture.outsiderId],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('cost streams', () => {
  let harness: StreamHarness;
  beforeAll(async () => {
    harness = await startStreamHarness();
  }, 240_000);
  afterAll(async () => {
    await harness.stop();
  });

  it('syncs components and totals to the crew and a share calc only to its owner', async () => {
    const params = { trip_id: harness.fixture.tripId };
    const organiser = idsByTable(await harness.rows('trip', 'organiser', params));
    const member = idsByTable(await harness.rows('trip', 'member', params));
    expect(organiser['cost_components']).toHaveLength(1);
    expect(member['cost_components']).toHaveLength(1);
    expect(member['trip_share_totals']).toHaveLength(1);
    expect(organiser['share_calcs']).toHaveLength(1);
    expect(member['share_calcs'] ?? []).toEqual([]);
  });

  it('syncs nothing of a trip to an outsider or ex-member', async () => {
    const params = { trip_id: harness.fixture.tripId };
    for (const actor of ['outsider', 'exMember', 'anonymous'] as const) {
      const rows = idsByTable(await harness.rows('trip', actor, params));
      expect(rows['cost_components'] ?? []).toEqual([]);
      expect(rows['trip_share_totals'] ?? []).toEqual([]);
      expect(rows['share_calcs'] ?? []).toEqual([]);
    }
  });
});
