/**
 * guide_actions after the undo expansion: trip members read, app_system writes, and the status
 * guard enforces planned → needs_approval | running → done | failed, done → undone (reversible only).
 */
import {
  canTransitionGuideAction,
  GUIDE_ACTION_STATUSES,
  type GuideActionStatus,
} from '@cp/domain';
import { getTableColumns } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { guideActions } from '../../src/schema/plan';
import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { anonymousActor, firstRow } from '../helpers/actors';
import { buildPermissionFixture, type PermissionFixture } from '../helpers/fixtures';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { buildTripFixture, type TripFixture } from '../helpers/trip-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PermissionFixture;

async function insertAction(reversible: boolean): Promise<string> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO guide_actions (trip_id, kind, reversible, inverse, undo_until, disruption_id)
       VALUES ($1, 'move_pickup', $2, $3, now() + interval '1 day',
               (SELECT id FROM disruptions WHERE trip_id = $1 ORDER BY id LIMIT 1))
       RETURNING id`,
      [fixture.tripId, reversible, reversible ? { kind: 'move_pickup', to: '09:00' } : null],
    );
    return firstRow(rows).id;
  });
}

async function setStatus(id: string, ...statuses: string[]): Promise<void> {
  await withSystem(db.pool, async (tx) => {
    for (const status of statuses) {
      await tx.query('UPDATE guide_actions SET status = $2 WHERE id = $1', [id, status]);
    }
  });
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('guide_actions typed schema', () => {
  it('mirrors every column of the migrated table', async () => {
    const { rows } = await db.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'guide_actions' ORDER BY column_name`,
    );
    const typed = Object.values(getTableColumns(guideActions)).map((column) => column.name);
    expect(typed.sort()).toEqual(rows.map((row) => row.column_name));
  });
});

describe('guide_actions visibility', () => {
  it.each([
    ['outsider', 0],
    ['exMember', 0],
    ['member', 1],
    ['organiser', 1],
  ] as const)('the %s sees %i undo-able action(s)', async (actor, count) => {
    const id = await insertAction(true);
    const { rows } = await withUser(db.pool, fixture.actors[actor], anonymousActor().device, (tx) =>
      tx.query('SELECT inverse, undo_until, disruption_id FROM guide_actions WHERE id = $1', [id]),
    );
    expect(rows).toHaveLength(count);
  });

  it('denies app_user and guide_reader writes or reads outside their grant', async () => {
    const id = await insertAction(true);
    await expect(
      withUser(db.pool, fixture.actors.organiser, anonymousActor().device, (tx) =>
        tx.query("UPDATE guide_actions SET status = 'running' WHERE id = $1", [id]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withGuideReader(db.pool, fixture.actors.member, fixture.tripId, (tx) =>
        tx.query('SELECT 1 FROM guide_actions'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('guide_actions status guard', () => {
  it('runs the documented path planned → running → done → undone for a reversible action', async () => {
    const id = await insertAction(true);
    await setStatus(id, 'running', 'done', 'undone');
    const { rows } = await withSystem(db.pool, (tx) =>
      tx.query('SELECT status FROM guide_actions WHERE id = $1', [id]),
    );
    expect(rows).toEqual([{ status: 'undone' }]);
  });

  it('allows the approval path planned → needs_approval → running → failed', async () => {
    const id = await insertAction(false);
    await setStatus(id, 'needs_approval', 'running', 'failed');
  });

  it.each([
    [[], 'done'],
    [['needs_approval'], 'done'],
    [['running', 'failed'], 'running'],
    [['running', 'done', 'undone'], 'done'],
  ] as const)('after %j rejects the jump to %s', async (path, next) => {
    const id = await insertAction(true);
    await setStatus(id, ...path);
    await expect(setStatus(id, next)).rejects.toThrow(/illegal guide action transition/);
  });

  it('accepts exactly the transitions the domain machine allows', async () => {
    const pathTo: Record<GuideActionStatus, readonly GuideActionStatus[]> = {
      planned: [],
      needs_approval: ['needs_approval'],
      running: ['running'],
      done: ['running', 'done'],
      failed: ['running', 'failed'],
      undone: ['running', 'done', 'undone'],
    };
    for (const from of GUIDE_ACTION_STATUSES) {
      for (const to of GUIDE_ACTION_STATUSES.filter((s) => s !== from)) {
        const id = await insertAction(true);
        await setStatus(id, ...pathTo[from]);
        const accepted = await setStatus(id, to).then(
          () => true,
          () => false,
        );
        expect(accepted, `${from} -> ${to}`).toBe(canTransitionGuideAction(from, to));
      }
    }
  });

  it('never undoes a non-reversible action', async () => {
    const id = await insertAction(false);
    await setStatus(id, 'running', 'done');
    await expect(setStatus(id, 'undone')).rejects.toThrow(/not reversible/);
  });

  it('only creates actions in planned', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO guide_actions (trip_id, kind, status) VALUES ($1, 'move_pickup', 'done')",
          [fixture.tripId],
        ),
      ),
    ).rejects.toThrow(/must start planned/);
  });
});

describe('guide_actions on a plain trip: crew read, system write', () => {
  let plainDb: DbTestDatabase;
  let plain: TripFixture;
  let guideActionId: string;

  beforeAll(async () => {
    plainDb = await container.createDatabase();
    plain = await buildTripFixture(plainDb.pool);
    guideActionId = await withSystem(plainDb.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "INSERT INTO guide_actions (trip_id, kind, status) VALUES ($1, 'book_activity', 'planned') RETURNING id",
        [plain.tripId],
      );
      return firstRow(rows).id;
    });
  }, 180_000);

  afterAll(async () => {
    await plainDb.drop();
  });

  it('is invisible to an outsider', async () => {
    const rows = await withUser(
      plainDb.pool,
      plain.outsiderId,
      anonymousActor().device,
      async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          'SELECT id FROM guide_actions WHERE trip_id = $1',
          [plain.tripId],
        );
        return rows;
      },
    );
    expect(rows).toHaveLength(0);
  });

  it('is readable by any crew member', async () => {
    const rows = await withUser(
      plainDb.pool,
      plain.memberId,
      anonymousActor().device,
      async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          'SELECT id FROM guide_actions WHERE trip_id = $1',
          [plain.tripId],
        );
        return rows;
      },
    );
    expect(rows).toEqual([{ id: guideActionId }]);
  });

  it('denies a write from any app_user, including the organiser', async () => {
    await expect(
      withUser(plainDb.pool, plain.organiserId, anonymousActor().device, async (tx) => {
        await tx.query("UPDATE guide_actions SET status = 'done' WHERE id = $1", [guideActionId]);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('is writable by app_system', async () => {
    await withSystem(plainDb.pool, async (tx) => {
      await tx.query("UPDATE guide_actions SET status = 'running' WHERE id = $1", [guideActionId]);
      await tx.query("UPDATE guide_actions SET status = 'done' WHERE id = $1", [guideActionId]);
    });
    const rows = await withUser(
      plainDb.pool,
      plain.memberId,
      anonymousActor().device,
      async (tx) => {
        const { rows } = await tx.query<{ status: string }>(
          'SELECT status FROM guide_actions WHERE id = $1',
          [guideActionId],
        );
        return rows;
      },
    );
    expect(rows[0]).toMatchObject({ status: 'done' });
  });
});
