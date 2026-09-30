/**
 * `xp_ledger` and `crew_xp` (C1): a member reads and syncs their own XP rows, the crew its crew rows,
 * total and level stickers; nobody outside the crew sees any. Only the server grants XP, through
 * `app.grant_xp`, once per source; the ledger is append-only and the total always matches it.
 */
import { randomUUID } from 'node:crypto';

import { crewLevel, isStickerLevel } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

interface Grant {
  granted: boolean;
  level_before: number | null;
  level_after: number | null;
  sticker_ids: string[];
}

const grant = (amount: number, source: string, users: readonly string[] = []) =>
  withSystem(harness.db.pool, async (tx) => {
    const { rows } = await tx.query<Grant>(
      `SELECT * FROM app.grant_xp($1, $2, $3::uuid[], $4, 'quest', $5, now())`,
      [harness.fixture.crewId, harness.fixture.tripId, users, amount, source],
    );
    return rows[0]!;
  });

async function crewTotal(): Promise<{ xp: number; level: number; ledger: number }> {
  const { rows } = await harness.db.pool.query<{ xp: string; level: number; ledger: string }>(
    `SELECT x.xp, x.level,
            (SELECT coalesce(sum(amount), 0) FROM xp_ledger
              WHERE crew_id = $1 AND user_id IS NULL) AS ledger
       FROM crew_xp x WHERE x.crew_id = $1`,
    [harness.fixture.crewId],
  );
  const row = rows[0]!;
  return { xp: Number(row.xp), level: row.level, ledger: Number(row.ledger) };
}

describe('xp_ledger and crew_xp', () => {
  it('shows a member their own rows and the crew its crew rows, total and level stickers', async () => {
    const { actors, crewId } = harness.fixture;
    const own = 'SELECT 1 FROM xp_ledger WHERE user_id = $1';
    expect(await visibleRows(harness, actors.organiser, own, [actors.organiser])).toBe(1);
    expect(await visibleRows(harness, actors.member, own, [actors.organiser])).toBe(0);
    const crew = 'SELECT 1 FROM xp_ledger WHERE user_id IS NULL AND crew_id = $1';
    const total = 'SELECT 1 FROM crew_xp WHERE crew_id = $1';
    const sticker = "SELECT 1 FROM stickers WHERE kind = 'crew_level' AND crew_id = $1";
    for (const kind of ['organiser', 'member', 'coOrganiser'] as const) {
      expect(await visibleRows(harness, actors[kind], crew, [crewId]), kind).toBe(1);
      expect(await visibleRows(harness, actors[kind], total, [crewId]), kind).toBe(1);
      expect(await visibleRows(harness, actors[kind], sticker, [crewId]), kind).toBe(1);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], crew, [crewId]), kind).toBe(0);
      expect(await visibleRows(harness, actors[kind], total, [crewId]), kind).toBe(0);
      expect(await visibleRows(harness, actors[kind], sticker, [crewId]), kind).toBe(0);
    }
  });

  it('syncs own rows on me and the crew rows and total on crews', async () => {
    const { actors } = harness.fixture;
    const me = await harness.rows('me', 'organiser');
    expect(me.get('xp_ledger')?.map((row) => row['user_id'])).toEqual([actors.organiser]);
    const crews = await harness.rows('crews', 'member');
    expect(crews.get('xp_ledger')?.map((row) => row['user_id'])).toEqual([null]);
    expect(crews.get('crew_xp')?.map((row) => row['level'])).toEqual([2]);
    const outsider = await harness.rows('crews', 'outsider');
    expect(outsider.get('crew_xp') ?? []).toEqual([]);
    expect(outsider.get('xp_ledger') ?? []).toEqual([]);
  });

  it('is never written by a client, and even the server cannot rewrite or delete a row', async () => {
    const { actors, crewId } = harness.fixture;
    const asMember = (sql: string, params: unknown[]) =>
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) => tx.query(sql, params));
    await expect(
      asMember(
        `INSERT INTO xp_ledger (user_id, amount, source_kind, source_id, granted_at)
         VALUES ($1, 5000, 'quest', $2, now())`,
        [actors.organiser, randomUUID()],
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asMember('UPDATE xp_ledger SET amount = 9999 WHERE user_id = $1', [actors.organiser]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asMember('DELETE FROM xp_ledger WHERE user_id = $1', [actors.organiser]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asMember('UPDATE crew_xp SET xp = 99999 WHERE crew_id = $1', [crewId]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query('UPDATE xp_ledger SET amount = amount + 1 WHERE crew_id = $1', [crewId]),
      ),
    ).rejects.toThrow(/permission denied|append-only/);
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query('DELETE FROM xp_ledger WHERE user_id = $1', [actors.organiser]),
      ),
    ).rejects.toThrow(/append-only/);
  });

  it('grants each source once, keeps the total equal to the ledger, one sticker per level', async () => {
    const { actors } = harness.fixture;
    const before = await crewTotal();
    const source = randomUUID();
    const first = await grant(1500, source, [actors.member]);
    expect(first.granted).toBe(true);
    const again = await grant(1500, source, [actors.member]);
    expect(again).toMatchObject({ granted: false, sticker_ids: [] });
    const after = await crewTotal();
    expect(after.xp).toBe(before.xp + 1500);
    expect(after.xp).toBe(after.ledger);
    expect(after.level).toBe(crewLevel(after.xp).level);
    const crossed = first.sticker_ids.length;
    let expected = 0;
    for (let level = before.level + 1; level <= after.level; level += 1) {
      if (isStickerLevel(level)) expected += 1;
    }
    expect(crossed).toBe(expected);
    const { rows } = await harness.db.pool.query<{ level: number; n: string }>(
      `SELECT level, count(*) AS n FROM stickers
        WHERE kind = 'crew_level' AND crew_id = $1 GROUP BY level`,
      [harness.fixture.crewId],
    );
    expect(rows.every((row) => Number(row.n) === 1)).toBe(true);
  });

  it('keeps the database level curve equal to the app curve', async () => {
    const samples = [0, 1, 399, 400, 899, 900, 5999, 6000, 6640, 12_345, 50_000, 250_000];
    const { rows } = await harness.db.pool.query<{ xp: string; level: number }>(
      'SELECT xp, app.crew_level(xp) AS level FROM unnest($1::bigint[]) AS xp',
      [samples],
    );
    for (const row of rows) {
      expect(row.level, `xp ${row.xp}`).toBe(crewLevel(Number(row.xp)).level);
    }
  });
});
