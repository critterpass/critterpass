/**
 * `room_assignments` (C1, RLS T) and `room_prefs` (C2, RLS O): who sleeps where is crew-visible and
 * written by the server for the organiser; a member's own room chips are theirs alone (the crew
 * sees only the group labels the server derives), synced to their own devices.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { expectCrewReadOnly, visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const as = (uid: string, sql: string, params: unknown[] = []) =>
  withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query(sql, params));

describe('room_assignments', () => {
  it('is crew-visible, read-only and synced with the trip', async () => {
    await expectCrewReadOnly(harness, 'room_assignments');
  });

  it('refuses a member moving themselves or anyone else', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      as(
        actors.member,
        "INSERT INTO room_assignments (trip_id, room_key, user_id) VALUES ($1, 'a', $2)",
        [tripId, actors.member],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('room_prefs', () => {
  it('shows a member their own chips only, on their own devices', async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM room_prefs WHERE user_id = $1';
    expect(await visibleRows(harness, actors.organiser, probe, [actors.organiser])).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'outsider', 'exMember'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [actors.organiser]), kind).toBe(0);
    }
    const own = await harness.rows('me', 'organiser');
    expect(own.get('room_prefs')).toHaveLength(1);
    const others = await harness.rows('me', 'member');
    expect(others.get('room_prefs') ?? []).toHaveLength(0);
    const trip = await harness.rows('trip', 'member', { trip_id: tripId });
    expect(trip.has('room_prefs')).toBe(false);
  });

  it('lets a member set chips only for themselves on a trip of their crew', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      as(
        actors.member,
        "INSERT INTO room_prefs (trip_id, user_id, chips) VALUES ($1, $2, '{snorer}')",
        [tripId, actors.organiser],
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      as(
        actors.outsider,
        "INSERT INTO room_prefs (trip_id, user_id, chips) VALUES ($1, $2, '{snorer}')",
        [tripId, actors.outsider],
      ),
    ).rejects.toThrow(/row-level security/i);
    await as(
      actors.member,
      "INSERT INTO room_prefs (trip_id, user_id, chips, partner_id) VALUES ($1, $2, '{light_sleeper}', $3)",
      [tripId, actors.member, actors.coOrganiser],
    );
  });
});
