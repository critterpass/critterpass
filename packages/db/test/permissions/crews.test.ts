import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
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

interface CrewRow {
  readonly id: string;
  readonly name: string;
}

async function selectCrew(uid: string): Promise<readonly CrewRow[]> {
  return withUser(db.pool, uid, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<CrewRow>('SELECT id, name FROM crews WHERE id = $1', [
      fixture.crewId,
    ]);
    return rows;
  });
}

describe('crews RLS', () => {
  it('is invisible to an outsider', async () => {
    expect(await selectCrew(fixture.outsiderId)).toHaveLength(0);
  });

  it('is visible to a member and to the organiser', async () => {
    expect(await selectCrew(fixture.memberId)).toHaveLength(1);
    expect(await selectCrew(fixture.organiserId)).toHaveLength(1);
  });

  it('lets any member rename the crew', async () => {
    await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      await tx.query('UPDATE crews SET name = $1 WHERE id = $2', ['Renamed Crew', fixture.crewId]);
    });
    const rows = await selectCrew(fixture.organiserId);
    expect(rows[0]).toMatchObject({ name: 'Renamed Crew' });
  });

  it('does not let an outsider rename the crew (row excluded, no error, no change)', async () => {
    await withUser(db.pool, fixture.outsiderId, anonymousActor().device, async (tx) => {
      await tx.query('UPDATE crews SET name = $1 WHERE id = $2', ['Hijacked', fixture.crewId]);
    });
    const rows = await selectCrew(fixture.organiserId);
    expect(rows[0]).not.toMatchObject({ name: 'Hijacked' });
  });

  it('denies a member writing member_ceiling directly (column-level grant, not just row policy)', async () => {
    await expect(
      withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
        await tx.query('UPDATE crews SET member_ceiling = 2 WHERE id = $1', [fixture.crewId]);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets a user create a crew and immediately see it once seated as its organiser', async () => {
    // RETURNING re-checks the SELECT policy against the state at that statement, so a brand new
    // crew with no crew_members row yet cannot use RETURNING; the client generates the id instead
    // (docs/data-model.md §1: client-created rows supply their own UUIDv7), same as the offline
    // command path would, then seats the creator as organiser before reading the row back.
    const creator = fixture.outsiderId;
    const newCrewId = generateUuidV7();
    await withUser(db.pool, creator, anonymousActor().device, async (tx) => {
      await tx.query('INSERT INTO crews (id, name, created_by) VALUES ($1, $2, $3)', [
        newCrewId,
        'A New Crew',
        creator,
      ]);
      await tx.query(
        "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser')",
        [newCrewId, creator],
      );
    });

    const rows = await withUser(db.pool, creator, anonymousActor().device, async (tx) => {
      const result = await tx.query<{ id: string }>('SELECT id FROM crews WHERE id = $1', [
        newCrewId,
      ]);
      return result.rows;
    });
    expect(rows).toHaveLength(1);
  });

  it('rejects creating a crew with someone else as created_by', async () => {
    await expect(
      withUser(db.pool, fixture.outsiderId, anonymousActor().device, async (tx) => {
        await tx.query('INSERT INTO crews (name, created_by) VALUES ($1, $2)', [
          'Impersonated',
          fixture.organiserId,
        ]);
      }),
    ).rejects.toThrow();
  });
});
