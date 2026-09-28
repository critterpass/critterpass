/**
 * `passes` (docs/data-model.md §3.1): the owner and active crewmates read a pass, nobody writes one
 * directly, and the only write path is `app.reserve_pass` / `app.issue_pass`, which touch the
 * caller's own row: one pass per user, its number reserved once and never reissued.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, insertUser } from '../helpers/actors';
import type { ActorKind } from '../helpers/fixtures';
import { idsByTable, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let organiserPassId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { rows } = await harness.db.pool.query<{ id: string }>(
    'SELECT id FROM passes WHERE user_id = $1',
    [harness.fixture.actors.organiser],
  );
  organiserPassId = rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

function asUser<T>(uid: string, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  return withUser(harness.db.pool, uid, anonymousActor().device, fn);
}

async function visiblePasses(actor: ActorKind): Promise<string[]> {
  return asUser(harness.fixture.actors[actor], async (tx) => {
    const { rows } = await tx.query<{ id: string }>('SELECT id FROM passes WHERE id = $1', [
      organiserPassId,
    ]);
    return rows.map((row) => row.id);
  });
}

async function freshUser(): Promise<string> {
  return withSystem(harness.db.pool, (tx) => insertUser(tx, { status: 'anonymous' }));
}

interface Reserved {
  id: string;
  number: string;
  status: string;
}

function reserve(uid: string, passId: string | null): Promise<Reserved> {
  return asUser(uid, async (tx) => {
    const { rows } = await tx.query<Reserved>(
      'SELECT id, number, status FROM app.reserve_pass($1)',
      [passId],
    );
    return rows[0]!;
  });
}

interface Issued {
  id: string;
  number: string;
  issued_at: Date;
  newly: boolean;
}

function issue(uid: string, passId: string): Promise<Issued> {
  return asUser(uid, async (tx) => {
    const { rows } = await tx.query<Issued>('SELECT * FROM app.issue_pass($1)', [passId]);
    return rows[0]!;
  });
}

describe('passes RLS', () => {
  it.each(['organiser', 'coOrganiser', 'member'] as const)(
    "lets the %s read the organiser's pass",
    async (actor) => {
      expect(await visiblePasses(actor)).toEqual([organiserPassId]);
    },
  );

  it.each(['outsider', 'exMember', 'anonymous'] as const)('hides it from the %s', async (actor) => {
    expect(await visiblePasses(actor)).toEqual([]);
  });

  it('refuses direct inserts and updates, even of the caller’s own row', async () => {
    const uid = harness.fixture.actors.organiser;
    await expect(
      asUser(uid, (tx) =>
        tx.query("INSERT INTO passes (user_id, number) VALUES ($1, 'CP-9999')", [uid]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(uid, (tx) => tx.query("UPDATE passes SET cover = 'gold' WHERE user_id = $1", [uid])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('reserving and issuing', () => {
  it('reserves one draft per user and returns it again on a replay', async () => {
    const uid = await freshUser();
    const passId = crypto.randomUUID();
    const first = await reserve(uid, passId);
    expect(first).toMatchObject({ id: passId, status: 'draft' });
    expect(first.number).toMatch(/^CP-\d{4,}$/);
    const again = await reserve(uid, crypto.randomUUID());
    expect(again).toEqual(first);
  });

  it('issues a reserved pass once, keeping its id and number', async () => {
    const uid = await freshUser();
    const reserved = await reserve(uid, null);
    const issued = await issue(uid, crypto.randomUUID());
    expect(issued).toMatchObject({ id: reserved.id, number: reserved.number, newly: true });
    const replay = await issue(uid, crypto.randomUUID());
    expect(replay).toMatchObject({ id: reserved.id, number: reserved.number, newly: false });
    expect(replay.issued_at).toEqual(issued.issued_at);
  });

  it('allocates a number when an offline issue arrives without a reservation', async () => {
    const uid = await freshUser();
    const passId = crypto.randomUUID();
    const issued = await issue(uid, passId);
    expect(issued).toMatchObject({ id: passId, newly: true });
    expect(issued.number).toMatch(/^CP-\d{4,}$/);
  });

  it('never hands two users the same number', async () => {
    const numbers = await Promise.all(
      Array.from({ length: 8 }, async () => (await reserve(await freshUser(), null)).number),
    );
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('formats numbers with four digits at least and never truncates', async () => {
    const { rows } = await harness.db.pool.query<{ small: string; large: string }>(
      'SELECT app.format_pass_number(427) AS small, app.format_pass_number(123456) AS large',
    );
    expect(rows[0]).toEqual({ small: 'CP-0427', large: 'CP-123456' });
  });

  it('refuses a reservation without a caller', async () => {
    await expect(
      withSystem(harness.db.pool, (tx) => tx.query('SELECT * FROM app.reserve_pass(NULL)')),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('passes in sync streams', () => {
  it("syncs the organiser's own pass on me", async () => {
    expect(idsByTable(await harness.rows('me', 'organiser'))['passes']).toEqual([organiserPassId]);
  });

  it('syncs it to an active crewmate on crew_people', async () => {
    expect(idsByTable(await harness.rows('crew_people', 'member'))['passes']).toContain(
      organiserPassId,
    );
  });

  it.each(['outsider', 'exMember', 'anonymous'] as const)('never syncs it to the %s', async (a) => {
    const people = idsByTable(await harness.rows('crew_people', a))['passes'] ?? [];
    const me = idsByTable(await harness.rows('me', a))['passes'] ?? [];
    expect([...people, ...me]).not.toContain(organiserPassId);
  });
});
