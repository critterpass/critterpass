/**
 * `stamps` (docs/data-model.md §3.10): the owner and active crewmates read them, only the system
 * writes them, and `app.put_home_stamp` inks the caller's own home stamp No. 1 once their pass is
 * issued, re-inking it (never adding a second) when the home airport changes.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, insertUser } from '../helpers/actors';
import type { ActorKind } from '../helpers/fixtures';
import { idsByTable, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let homeStampId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { rows } = await harness.db.pool.query<{ id: string }>(
    "SELECT id FROM stamps WHERE user_id = $1 AND kind = 'home'",
    [harness.fixture.actors.organiser],
  );
  homeStampId = rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

function asUser<T>(uid: string, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  return withUser(harness.db.pool, uid, anonymousActor().device, fn);
}

async function visibleStamps(actor: ActorKind): Promise<string[]> {
  return asUser(harness.fixture.actors[actor], async (tx) => {
    const { rows } = await tx.query<{ id: string }>('SELECT id FROM stamps WHERE id = $1', [
      homeStampId,
    ]);
    return rows.map((row) => row.id);
  });
}

function putHomeStamp(uid: string, iata: string, country: string): Promise<boolean> {
  return asUser(uid, async (tx) => {
    const { rows } = await tx.query<{ ok: boolean }>('SELECT app.put_home_stamp($1, $2) AS ok', [
      iata,
      country,
    ]);
    return rows[0]!.ok;
  });
}

async function homeStamps(
  uid: string,
): Promise<{ iata: string; country: string; seq_no: number }[]> {
  const { rows } = await harness.db.pool.query<{ iata: string; country: string; seq_no: number }>(
    "SELECT iata, country, seq_no FROM stamps WHERE user_id = $1 AND kind = 'home'",
    [uid],
  );
  return rows;
}

describe('stamps RLS', () => {
  it.each(['organiser', 'coOrganiser', 'member'] as const)(
    "lets the %s read the organiser's home stamp",
    async (actor) => {
      expect(await visibleStamps(actor)).toEqual([homeStampId]);
    },
  );

  it.each(['outsider', 'exMember', 'anonymous'] as const)('hides it from the %s', async (actor) => {
    expect(await visibleStamps(actor)).toEqual([]);
  });

  it('refuses direct writes from app_user', async () => {
    const uid = harness.fixture.actors.organiser;
    await expect(
      asUser(uid, (tx) => tx.query("UPDATE stamps SET iata = 'KUL' WHERE user_id = $1", [uid])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('the home stamp', () => {
  it('waits for an issued pass, then inks No. 1 once and re-inks it on a new home', async () => {
    const uid = await withSystem(harness.db.pool, (tx) => insertUser(tx, { status: 'anonymous' }));
    expect(await putHomeStamp(uid, 'SIN', 'SG')).toBe(false);

    await asUser(uid, (tx) => tx.query('SELECT * FROM app.issue_pass($1)', [crypto.randomUUID()]));
    expect(await putHomeStamp(uid, 'SIN', 'SG')).toBe(true);
    expect(await putHomeStamp(uid, 'SIN', 'SG')).toBe(true);
    expect(await homeStamps(uid)).toEqual([{ iata: 'SIN', country: 'SG', seq_no: 1 }]);

    expect(await putHomeStamp(uid, 'KUL', 'MY')).toBe(true);
    expect(await homeStamps(uid)).toEqual([{ iata: 'KUL', country: 'MY', seq_no: 1 }]);
  });
});

describe('stamps in sync streams', () => {
  it('syncs the home stamp to its owner on me and to an active crewmate on crew_people', async () => {
    expect(idsByTable(await harness.rows('me', 'organiser'))['stamps']).toEqual([homeStampId]);
    expect(idsByTable(await harness.rows('crew_people', 'member'))['stamps']).toContain(
      homeStampId,
    );
  });

  it.each(['outsider', 'exMember', 'anonymous'] as const)('never syncs it to the %s', async (a) => {
    const people = idsByTable(await harness.rows('crew_people', a))['stamps'] ?? [];
    expect(people).not.toContain(homeStampId);
  });
});
