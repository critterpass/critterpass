import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, setCrewMemberStatus } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { buildTripFixture, type TripFixture } from '../helpers/trip-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: TripFixture;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildTripFixture(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

interface TripRow {
  readonly id: string;
  readonly status: string;
  readonly phase: string;
}

async function selectTrip(uid: string): Promise<readonly TripRow[]> {
  return withUser(db.pool, uid, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<TripRow>('SELECT id, status, phase FROM trips WHERE id = $1', [
      fixture.tripId,
    ]);
    return rows;
  });
}

describe('trips RLS', () => {
  it('is invisible to an outsider', async () => {
    expect(await selectTrip(fixture.outsiderId)).toHaveLength(0);
  });

  it('is visible to any crew member, not just a participant', async () => {
    expect(await selectTrip(fixture.memberId)).toHaveLength(1);
    expect(await selectTrip(fixture.organiserId)).toHaveLength(1);
  });

  it('derives phase from status via the generated column', async () => {
    const rows = await selectTrip(fixture.memberId);
    expect(rows[0]).toMatchObject({ status: 'voting', phase: 'planning' });
  });

  it('lets the organiser transition status', async () => {
    await withUser(db.pool, fixture.organiserId, anonymousActor().device, async (tx) => {
      await tx.query("UPDATE trips SET status = 'won' WHERE id = $1", [fixture.tripId]);
    });
    const rows = await selectTrip(fixture.memberId);
    expect(rows[0]).toMatchObject({ status: 'won' });
  });

  it('does not let a plain member transition status', async () => {
    await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      await tx.query("UPDATE trips SET status = 'setup' WHERE id = $1", [fixture.tripId]);
    });
    const rows = await selectTrip(fixture.memberId);
    expect(rows[0]).toMatchObject({ status: 'won' });
  });

  it('rejects an illegal transition even from the organiser (state machine backstop)', async () => {
    await expect(
      withUser(db.pool, fixture.organiserId, anonymousActor().device, async (tx) => {
        await tx.query("UPDATE trips SET status = 'archived' WHERE id = $1", [fixture.tripId]);
      }),
    ).rejects.toThrow(/illegal trip status transition/i);
  });

  it('lets any crew member pitch a new trip for their crew', async () => {
    await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      await tx.query("INSERT INTO trips (crew_id, status) VALUES ($1, 'voting')", [fixture.crewId]);
    });
    const rows = await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ id: string }>('SELECT id FROM trips WHERE crew_id = $1', [
        fixture.crewId,
      ]);
      return rows;
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects creating a trip for a crew the caller does not belong to', async () => {
    await expect(
      withUser(db.pool, fixture.outsiderId, anonymousActor().device, async (tx) => {
        await tx.query("INSERT INTO trips (crew_id, status) VALUES ($1, 'voting')", [
          fixture.crewId,
        ]);
      }),
    ).rejects.toThrow();
  });

  it('rejects an illegal initial status on insert', async () => {
    await expect(
      withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
        await tx.query("INSERT INTO trips (crew_id, status) VALUES ($1, 'confirmed')", [
          fixture.crewId,
        ]);
      }),
    ).rejects.toThrow(/illegal initial trip status/i);
  });

  it('hides the trip from a user removed from the crew', async () => {
    const isolated = await container.createDatabase();
    try {
      const fx = await buildTripFixture(isolated.pool);
      await withSystem(isolated.pool, (tx) =>
        setCrewMemberStatus(tx, { crewId: fx.crewId, userId: fx.memberId, status: 'removed' }),
      );
      const rows = await withUser(
        isolated.pool,
        fx.memberId,
        anonymousActor().device,
        async (tx) => {
          const { rows } = await tx.query<{ id: string }>('SELECT id FROM trips WHERE id = $1', [
            fx.tripId,
          ]);
          return rows;
        },
      );
      expect(rows).toHaveLength(0);
    } finally {
      await isolated.drop();
    }
  });

  it('writes one unsubscribe row on the trip channel when the crew removal happens', async () => {
    const isolated = await container.createDatabase();
    try {
      const fx = await buildTripFixture(isolated.pool);
      await withSystem(isolated.pool, (tx) =>
        setCrewMemberStatus(tx, { crewId: fx.crewId, userId: fx.memberId, status: 'removed' }),
      );
      const { rows } = await isolated.pool.query<{ channel: string }>(
        "SELECT channel FROM rt_outbox WHERE kind = 'unsubscribe' ORDER BY channel",
      );
      expect(rows).toEqual([{ channel: `crew:${fx.crewId}` }, { channel: `trip:${fx.tripId}` }]);
    } finally {
      await isolated.drop();
    }
  });
});
