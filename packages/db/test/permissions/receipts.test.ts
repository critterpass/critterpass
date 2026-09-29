/**
 * `receipts` (C2): a scan is its scanner's (synced on `me` to them alone) until it is committed to
 * an expense, when the trip's crew reads it too. A member uploads only their own scan, and only on
 * a trip of their crew; the parse and the commit are the server's.
 */
import { randomUUID } from 'node:crypto';

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

const probe = 'SELECT 1 FROM receipts WHERE trip_id = $1';
const organiserScan = 'SELECT 1 FROM receipts WHERE trip_id = $1 AND user_id = $2';

describe('receipts', () => {
  it('keeps an uncommitted scan to its scanner', async () => {
    const { actors, tripId } = harness.fixture;
    expect(await visibleRows(harness, actors.organiser, probe, [tripId])).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
    expect((await harness.rows('me', 'organiser')).get('receipts')).toHaveLength(1);
    expect((await harness.rows('me', 'member')).get('receipts') ?? []).toHaveLength(0);
  });

  it('lets a member upload their own scan on their crew’s trip only', async () => {
    const { actors, tripId, crewId } = harness.fixture;
    const insert = (uid: string, owner: string) =>
      withUser(harness.db.pool, uid, randomUUID(), (tx) =>
        tx.query('INSERT INTO receipts (user_id, trip_id, crew_id) VALUES ($1, $2, $3)', [
          owner,
          tripId,
          crewId,
        ]),
      );
    await expect(insert(actors.member, actors.member)).resolves.toBeDefined();
    await expect(insert(actors.member, actors.organiser)).rejects.toThrow(/row-level security/i);
    await expect(insert(actors.outsider, actors.outsider)).rejects.toThrow(/row-level security/i);
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query("UPDATE receipts SET status = 'parsed' WHERE user_id = $1", [actors.organiser]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('shows a committed scan to the trip’s crew', async () => {
    const { actors, tripId } = harness.fixture;
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        `UPDATE receipts SET status = 'committed',
           expense_id = (SELECT id FROM expenses WHERE trip_id = $1 LIMIT 1)
         WHERE user_id = $2`,
        [tripId, actors.organiser],
      ),
    );
    for (const kind of ['member', 'coOrganiser'] as const) {
      expect(
        await visibleRows(harness, actors[kind], organiserScan, [tripId, actors.organiser]),
        kind,
      ).toBe(1);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(
        await visibleRows(harness, actors[kind], organiserScan, [tripId, actors.organiser]),
        kind,
      ).toBe(0);
    }
  });
});
