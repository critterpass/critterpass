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
  await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
    await tx.query(
      "INSERT INTO consents (user_id, purpose, granted_at) VALUES ($1, 'analytics', now())",
      [fixture.memberId],
    );
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

interface ConsentRow {
  readonly user_id: string;
  readonly purpose: string;
}

async function selectConsents(viewerUid: string): Promise<readonly ConsentRow[]> {
  return withUser(db.pool, viewerUid, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<ConsentRow>(
      'SELECT user_id, purpose FROM consents WHERE user_id = $1',
      [fixture.memberId],
    );
    return rows;
  });
}

describe('consents RLS: owner-only', () => {
  it('lets the owner read their own consents', async () => {
    expect(await selectConsents(fixture.memberId)).toHaveLength(1);
  });

  it('hides consents from a crewmate and from an outsider', async () => {
    expect(await selectConsents(fixture.organiserId)).toHaveLength(0);
    expect(await selectConsents(fixture.outsiderId)).toHaveLength(0);
  });

  it('lets the owner revoke their own consent', async () => {
    await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      await tx.query("UPDATE consents SET revoked_at = now() WHERE user_id = $1 AND purpose = 'analytics'", [
        fixture.memberId,
      ]);
    });
    const { rows } = await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      return tx.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM consents WHERE user_id = $1',
        [fixture.memberId],
      );
    });
    expect(rows[0]?.revoked_at).not.toBeNull();
  });

  it('rejects granting a consent on behalf of someone else', async () => {
    await expect(
      withUser(db.pool, fixture.outsiderId, anonymousActor().device, async (tx) => {
        await tx.query("INSERT INTO consents (user_id, purpose) VALUES ($1, 'marketing')", [
          fixture.organiserId,
        ]);
      }),
    ).rejects.toThrow();
  });

  it('enforces one row per (user_id, purpose)', async () => {
    await expect(
      withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
        await tx.query("INSERT INTO consents (user_id, purpose) VALUES ($1, 'analytics')", [
          fixture.memberId,
        ]);
      }),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});
