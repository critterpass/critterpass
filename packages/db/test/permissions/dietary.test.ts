/**
 * `dietary_profiles` (C3, RLS X) and `participant_dietary_flags` (C1, derived with consent): the
 * profile is its owner's alone; the crew sees only the diet and `no_<allergen>` flags, only while
 * the member consents to share them, and the guide sees the same flags for the trip in context.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withUser } from '../../src/tx';
import { expectSealed, visibleRows } from '../helpers/setup-privacy';
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

async function flagsSeenBy(kind: 'member' | 'outsider'): Promise<unknown[]> {
  const { tripId } = harness.fixture;
  const rows = await harness.rows('trip', kind, { trip_id: tripId });
  return (rows.get('participant_dietary_flags') ?? []).map((row) => row.flags);
}

describe('dietary data', () => {
  it('keeps the profile readable by its owner only, and by no role, publication or stream', async () => {
    await expectSealed(harness, 'dietary_profiles', { owner: 'organiser' });
  });

  it('shows consented flags to the crew and nothing more', async () => {
    const { actors, tripId } = harness.fixture;
    await as(
      actors.organiser,
      "UPDATE dietary_profiles SET avoid = '{coriander}', spice = 'hot' WHERE user_id = $1",
      [actors.organiser],
    );
    expect(await flagsSeenBy('member')).toEqual([['no_peanuts', 'vegetarian']]);
    expect(await flagsSeenBy('outsider')).toEqual([]);
    expect(
      await visibleRows(
        harness,
        actors.member,
        'SELECT 1 FROM participant_dietary_flags WHERE trip_id = $1',
        [tripId],
      ),
    ).toBe(1);
    const prefs = await withGuideReader(harness.db.pool, actors.organiser, tripId, (tx) =>
      tx.query<{ dietary_flags: unknown }>('SELECT dietary_flags FROM llm.user_prefs'),
    );
    expect(prefs.rows).toEqual([{ dietary_flags: ['no_peanuts', 'vegetarian'] }]);
  });

  it('withdraws the flags the moment consent goes', async () => {
    const { actors } = harness.fixture;
    await as(
      actors.organiser,
      "UPDATE dietary_profiles SET visibility = 'self' WHERE user_id = $1",
      [actors.organiser],
    );
    expect(await flagsSeenBy('member')).toEqual([]);
  });

  it("never lets a member write another member's profile or any flag", async () => {
    const { actors, tripId } = harness.fixture;
    const changed = await as(
      actors.member,
      "UPDATE dietary_profiles SET diet = 'vegan' WHERE user_id = $1",
      [actors.organiser],
    );
    expect(changed.rowCount).toBe(0);
    await expect(
      as(
        actors.member,
        "INSERT INTO participant_dietary_flags (trip_id, user_id, flags) VALUES ($1, $2, '{vegan}')",
        [tripId, actors.member],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
