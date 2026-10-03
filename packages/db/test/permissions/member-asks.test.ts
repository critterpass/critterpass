/**
 * `member_asks` (C2, two-party): an organiser's private ask about one member's saves. The asker and
 * the asked member read it and sync it on their own `me` stream; no other organiser, crewmate,
 * outsider, trip stream or guide ever sees it, and nobody writes it through app_user.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('member_asks', () => {
  it('is read by the asker and the asked member alone', async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM member_asks WHERE trip_id = $1';
    for (const kind of ['organiser', 'member'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(1);
    }
    for (const kind of ['coOrganiser', 'exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
  });

  it('is written by nobody through app_user, not even its two people', async () => {
    const { actors, tripId } = harness.fixture;
    for (const kind of ['organiser', 'member'] as const) {
      await expect(
        withUser(harness.db.pool, actors[kind], randomUUID(), (tx) =>
          tx.query("UPDATE member_asks SET status = 'accepted' WHERE trip_id = $1", [tripId]),
        ),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('syncs to its two people on their me stream and never on the trip stream', async () => {
    const { tripId } = harness.fixture;
    for (const kind of ['organiser', 'member'] as const) {
      expect((await harness.rows('me', kind)).get('member_asks') ?? [], kind).toHaveLength(1);
    }
    for (const kind of ['coOrganiser', 'outsider', 'exMember'] as const) {
      expect((await harness.rows('me', kind)).get('member_asks') ?? [], kind).toEqual([]);
    }
    for (const kind of ['organiser', 'member', 'coOrganiser'] as const) {
      const trip = await harness.rows('trip', kind, { trip_id: tripId });
      expect(trip.get('member_asks') ?? [], kind).toEqual([]);
    }
  });

  it('asks someone other than the asker, about one to three ideas', async () => {
    const { actors, tripId } = harness.fixture;
    for (const [memberId, ideas] of [
      [actors.organiser, `ARRAY['${randomUUID()}']::uuid[]`],
      [actors.member, "'{}'::uuid[]"],
    ] as const) {
      await expect(
        withSystem(harness.db.pool, (tx) =>
          tx.query(
            `INSERT INTO member_asks (trip_id, asked_by, member_id, idea_ids, ops)
             VALUES ($1, $2, $3, ${ideas}, '[]')`,
            [tripId, actors.organiser, memberId],
          ),
        ),
      ).rejects.toThrow(/check constraint/);
    }
  });

  it('never reaches the guide', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withGuideReader(harness.db.pool, actors.organiser, tripId, (tx) =>
        tx.query('SELECT 1 FROM member_asks'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
