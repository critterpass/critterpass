/**
 * `stickers` (C1): a member's own stickers (the Settled Tokek) are theirs to read and sync on `me`;
 * crew-wide stickers go to the crew on `crews`; only the server grants, and one Settled Tokek per
 * member per trip.
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

describe('stickers', () => {
  it('shows a member their own stickers and syncs them on me', async () => {
    const { actors } = harness.fixture;
    const probe = "SELECT 1 FROM stickers WHERE kind = 'settled'";
    expect(await visibleRows(harness, actors.organiser, probe)).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe), kind).toBe(0);
    }
    expect((await harness.rows('me', 'organiser')).get('stickers')).toHaveLength(1);
    expect((await harness.rows('me', 'member')).get('stickers') ?? []).toHaveLength(0);
  });

  it('shows crew-wide stickers to the crew only', async () => {
    const { crewId } = harness.fixture;
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        "INSERT INTO stickers (crew_id, kind, granted_at) VALUES ($1, 'crew_level', now())",
        [crewId],
      ),
    );
    expect((await harness.rows('crews', 'member')).get('stickers')).toHaveLength(1);
    expect((await harness.rows('crews', 'exMember')).get('stickers') ?? []).toHaveLength(0);
  });

  it('is granted by the server only, once per member per trip', async () => {
    const { actors, crewId, tripId } = harness.fixture;
    const grant =
      "INSERT INTO stickers (user_id, crew_id, trip_id, kind, granted_at) VALUES ($1, $2, $3, 'settled', now())";
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query(grant, [actors.member, crewId, tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withSystem(harness.db.pool, (tx) => tx.query(grant, [actors.organiser, crewId, tripId])),
    ).rejects.toThrow(/stickers_settled_once_uk/);
  });
});
