import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { anonymousActor, getCrewMembershipEpoch, insertCrewMember, insertUser } from '../helpers/actors';
import { buildCrewFixture, type CrewFixture } from '../helpers/crew-fixture';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: CrewFixture;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildCrewFixture(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

interface CrewMemberRow {
  readonly user_id: string;
  readonly role: string;
  readonly status: string;
  readonly colour: string | null;
  readonly notify_level: string | null;
}

async function selectMembers(uid: string): Promise<readonly CrewMemberRow[]> {
  return withUser(db.pool, uid, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<CrewMemberRow>(
      'SELECT user_id, role, status, colour, notify_level FROM crew_members WHERE crew_id = $1',
      [fixture.crewId],
    );
    return rows;
  });
}

describe('crew_members RLS: read', () => {
  it('is invisible to an outsider', async () => {
    expect(await selectMembers(fixture.outsiderId)).toHaveLength(0);
  });

  it('shows every member row to a member or the organiser', async () => {
    expect(await selectMembers(fixture.memberId)).toHaveLength(2);
    expect(await selectMembers(fixture.organiserId)).toHaveLength(2);
  });
});

describe('crew_members RLS: write', () => {
  it('lets a member update their own row', async () => {
    await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      await tx.query("UPDATE crew_members SET notify_level = 'muted' WHERE crew_id = $1 AND user_id = $2", [
        fixture.crewId,
        fixture.memberId,
      ]);
    });
    const rows = await selectMembers(fixture.organiserId);
    const row = rows.find((r) => r.user_id === fixture.memberId);
    expect(row).toMatchObject({ notify_level: 'muted' });
  });

  it('does not let a member update another member\'s row (row excluded, no change)', async () => {
    await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      await tx.query("UPDATE crew_members SET colour = 'red' WHERE crew_id = $1 AND user_id = $2", [
        fixture.crewId,
        fixture.organiserId,
      ]);
    });
    const rows = await selectMembers(fixture.organiserId);
    const organiserRow = rows.find((r) => r.user_id === fixture.organiserId);
    expect(organiserRow).not.toMatchObject({ colour: 'red' });
  });

  it('lets a user join a crew for themselves only', async () => {
    const joiner = fixture.outsiderId;
    await withUser(db.pool, joiner, anonymousActor().device, async (tx) => {
      await tx.query("INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')", [
        fixture.crewId,
        joiner,
      ]);
    });
    const rows = await selectMembers(fixture.organiserId);
    expect(rows.some((r) => r.user_id === joiner)).toBe(true);
  });

  it('rejects inserting a membership row for someone else', async () => {
    await expect(
      withUser(db.pool, fixture.outsiderId, anonymousActor().device, async (tx) => {
        await tx.query("INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')", [
          fixture.crewId,
          fixture.memberId,
        ]);
      }),
    ).rejects.toThrow();
  });
});

describe('membership epoch and removal', () => {
  it('lets a member leave by themselves', async () => {
    const isolated = await container.createDatabase();
    try {
      const fx = await buildCrewFixture(isolated.pool);
      await withUser(isolated.pool, fx.memberId, anonymousActor().device, async (tx) => {
        await tx.query("UPDATE crew_members SET status = 'left' WHERE crew_id = $1 AND user_id = $2", [
          fx.crewId,
          fx.memberId,
        ]);
      });
      const stillMember = await withUser(isolated.pool, fx.memberId, anonymousActor().device, async (tx) => {
        const { rows } = await tx.query<{ ok: number }>('SELECT 1 AS ok FROM crews WHERE id = $1', [
          fx.crewId,
        ]);
        return rows;
      });
      expect(stillMember).toHaveLength(0);
    } finally {
      await isolated.drop();
    }
  });

  it('bumps the epoch exactly once and emits one unsubscribe row when the organiser removes a member', async () => {
    const isolated = await container.createDatabase();
    try {
      const fx = await buildCrewFixture(isolated.pool);
      const before = await getCrewMembershipEpoch(isolated.pool, fx.crewId);

      await withUser(isolated.pool, fx.organiserId, anonymousActor().device, async (tx) => {
        await tx.query("UPDATE crew_members SET status = 'removed' WHERE crew_id = $1 AND user_id = $2", [
          fx.crewId,
          fx.memberId,
        ]);
      });

      const after = await getCrewMembershipEpoch(isolated.pool, fx.crewId);
      expect(after).toBe(before + 1);

      const { rows: outboxRows } = await isolated.pool.query<{
        channel: string;
        kind: string;
        payload: { user_id: string };
      }>("SELECT channel, kind, payload FROM rt_outbox WHERE kind = 'unsubscribe'");
      expect(outboxRows).toHaveLength(1);
      expect(outboxRows[0]).toMatchObject({
        channel: `crew:${fx.crewId}`,
        kind: 'unsubscribe',
        payload: { user_id: fx.memberId },
      });

      const exMemberSees = await withUser(isolated.pool, fx.memberId, anonymousActor().device, async (tx) => {
        const { rows } = await tx.query<{ ok: number }>('SELECT 1 AS ok FROM crews WHERE id = $1', [
          fx.crewId,
        ]);
        return rows;
      });
      expect(exMemberSees).toHaveLength(0);
    } finally {
      await isolated.drop();
    }
  });

  it('does not let a plain member remove another member', async () => {
    const isolated = await container.createDatabase();
    try {
      const fx = await buildCrewFixture(isolated.pool);
      const outsiderMemberId = await insertUser(isolated.pool);
      await insertCrewMember(isolated.pool, { crewId: fx.crewId, userId: outsiderMemberId, role: 'member' });

      await withUser(isolated.pool, fx.memberId, anonymousActor().device, async (tx) => {
        await tx.query("UPDATE crew_members SET status = 'removed' WHERE crew_id = $1 AND user_id = $2", [
          fx.crewId,
          outsiderMemberId,
        ]);
      });

      const stillActive = await withUser(isolated.pool, outsiderMemberId, anonymousActor().device, async (tx) => {
        const { rows } = await tx.query<{ status: string }>(
          'SELECT status FROM crew_members WHERE crew_id = $1 AND user_id = $2',
          [fx.crewId, outsiderMemberId],
        );
        return rows;
      });
      expect(stillActive[0]).toMatchObject({ status: 'active' });
    } finally {
      await isolated.drop();
    }
  });
});
