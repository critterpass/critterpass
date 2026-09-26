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
    await tx.query('INSERT INTO user_settings (user_id) VALUES ($1)', [fixture.memberId]);
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

interface UserSettingsRow {
  readonly user_id: string;
  readonly chattiness: string | null;
}

async function selectSettings(viewerUid: string): Promise<readonly UserSettingsRow[]> {
  return withUser(db.pool, viewerUid, anonymousActor().device, async (tx) => {
    const { rows } = await tx.query<UserSettingsRow>(
      'SELECT user_id, chattiness FROM user_settings WHERE user_id = $1',
      [fixture.memberId],
    );
    return rows;
  });
}

describe('user_settings RLS: owner-only, not even crewmates', () => {
  it('lets the owner read their own settings', async () => {
    expect(await selectSettings(fixture.memberId)).toHaveLength(1);
  });

  it('hides settings from a crewmate who shares a crew with the owner', async () => {
    expect(await selectSettings(fixture.organiserId)).toHaveLength(0);
  });

  it('hides settings from an outsider', async () => {
    expect(await selectSettings(fixture.outsiderId)).toHaveLength(0);
  });

  it('lets the owner update their own settings', async () => {
    await withUser(db.pool, fixture.memberId, anonymousActor().device, async (tx) => {
      await tx.query('UPDATE user_settings SET chattiness = $1 WHERE user_id = $2', [
        'chatty',
        fixture.memberId,
      ]);
    });
    expect((await selectSettings(fixture.memberId))[0]).toMatchObject({ chattiness: 'chatty' });
  });

  it('does not let another crewmate update the owner\'s settings', async () => {
    await withUser(db.pool, fixture.organiserId, anonymousActor().device, async (tx) => {
      await tx.query('UPDATE user_settings SET chattiness = $1 WHERE user_id = $2', [
        'hijacked',
        fixture.memberId,
      ]);
    });
    expect((await selectSettings(fixture.memberId))[0]).not.toMatchObject({ chattiness: 'hijacked' });
  });

  it('rejects inserting settings for a different user', async () => {
    await expect(
      withUser(db.pool, fixture.outsiderId, anonymousActor().device, async (tx) => {
        await tx.query('INSERT INTO user_settings (user_id) VALUES ($1)', [fixture.organiserId]);
      }),
    ).rejects.toThrow();
  });
});
