/**
 * `alarms` (C2, RLS O): the device alarm mirror is its owner's alone, directly and on the `me`
 * stream; `mirror_alarm_state` writes it as app_system, never app_user.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const probe = 'SELECT 1 FROM alarms WHERE trip_id = $1';

describe('alarms', () => {
  it('shows an alarm to its owner only, directly and through me', async () => {
    const { actors, tripId } = harness.fixture;
    expect(await visibleRows(harness, actors.organiser, probe, [tripId])).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
      const synced = await harness.rows('me', kind);
      expect(synced.get('alarms') ?? [], kind).toHaveLength(0);
    }
    const own = await harness.rows('me', 'organiser');
    expect(own.get('alarms')).toHaveLength(1);
  });

  it('is closed to the guide reader and to app_user writes', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withGuideReader(harness.db.pool, actors.organiser, tripId, (tx) =>
        tx.query('SELECT 1 FROM alarms'),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query("UPDATE alarms SET state = 'stopped' WHERE trip_id = $1", [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
