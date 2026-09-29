/**
 * `booking_attachments` (C2): a crew booking's voucher is read and synced by the trip's crew; a
 * personal booking's boarding pass by its owner alone. The server writes.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const byKind = 'SELECT 1 FROM booking_attachments WHERE trip_id = $1 AND kind = $2';

describe('booking attachments', () => {
  it('shows a crew voucher to the crew and a boarding pass to its owner only', async () => {
    const { actors, tripId } = harness.fixture;
    for (const kind of ['organiser', 'coOrganiser', 'member'] as const) {
      expect(await visibleRows(harness, actors[kind], byKind, [tripId, 'voucher']), kind).toBe(1);
    }
    expect(await visibleRows(harness, actors.organiser, byKind, [tripId, 'boarding_pass'])).toBe(1);
    for (const kind of ['coOrganiser', 'member', 'outsider', 'exMember', 'anonymous'] as const) {
      expect(
        await visibleRows(harness, actors[kind], byKind, [tripId, 'boarding_pass']),
        kind,
      ).toBe(0);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], byKind, [tripId, 'voucher']), kind).toBe(0);
    }
  });

  it('syncs the same split with the trip', async () => {
    const { tripId } = harness.fixture;
    const kinds = async (actor: 'organiser' | 'member' | 'outsider') =>
      ((await harness.rows('trip', actor, { trip_id: tripId })).get('booking_attachments') ?? [])
        .map((row) => row['kind'])
        .sort();
    expect(await kinds('organiser')).toEqual(['boarding_pass', 'voucher']);
    expect(await kinds('member')).toEqual(['voucher']);
    expect(await kinds('outsider')).toEqual([]);
  });

  it('refuses direct writes', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('DELETE FROM booking_attachments WHERE trip_id = $1', [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
