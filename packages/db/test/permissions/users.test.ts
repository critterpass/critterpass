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

interface UserRow {
  readonly id: string;
  readonly display_name: string | null;
}

async function selectUser(viewerUid: string, targetId: string): Promise<readonly UserRow[]> {
  return withUser(db.pool, viewerUid, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<UserRow>('SELECT id, display_name FROM users WHERE id = $1', [
      targetId,
    ]);
    return rows;
  });
}

describe('users RLS', () => {
  it('lets a user read their own row', async () => {
    expect(await selectUser(fixture.memberId, fixture.memberId)).toHaveLength(1);
  });

  it("lets a crewmate read a shared-crew member's row", async () => {
    expect(await selectUser(fixture.organiserId, fixture.memberId)).toHaveLength(1);
    expect(await selectUser(fixture.memberId, fixture.organiserId)).toHaveLength(1);
  });

  it('hides a user with no shared crew from an outsider', async () => {
    expect(await selectUser(fixture.outsiderId, fixture.memberId)).toHaveLength(0);
    expect(await selectUser(fixture.memberId, fixture.outsiderId)).toHaveLength(0);
  });

  it('lets a user update their own display_name', async () => {
    await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      await tx.query('UPDATE users SET display_name = $1 WHERE id = $2', [
        'New Name',
        fixture.memberId,
      ]);
    });
    const rows = await selectUser(fixture.memberId, fixture.memberId);
    expect(rows[0]).toMatchObject({ display_name: 'New Name' });
  });

  it("does not let a user update someone else's row", async () => {
    await withUser(db.pool, fixture.organiserId, anonymousActor().device, async (tx) => {
      await tx.query('UPDATE users SET display_name = $1 WHERE id = $2', [
        'Hijacked',
        fixture.memberId,
      ]);
    });
    const rows = await selectUser(fixture.memberId, fixture.memberId);
    expect(rows[0]).not.toMatchObject({ display_name: 'Hijacked' });
  });

  it('lets a user insert only their own row', async () => {
    const newUid = anonymousActor().uid;
    await withUser(db.pool, newUid, anonymousActor().device, async (tx) => {
      await tx.query('INSERT INTO users (id) VALUES ($1)', [newUid]);
    });
    expect(await selectUser(newUid, newUid)).toHaveLength(1);
  });

  it('rejects inserting a row for a different id', async () => {
    await expect(
      withUser(db.pool, fixture.outsiderId, anonymousActor().device, async (tx) => {
        await tx.query('INSERT INTO users (id) VALUES ($1)', [anonymousActor().uid]);
      }),
    ).rejects.toThrow();
  });
});
