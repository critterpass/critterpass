/**
 * `place_stances` (C1, RLS T): WANT IT / RATHER NOT is an explicit public stance, so the trip's
 * crew reads who said it and their words, on the trip stream; outsiders read nothing; only the
 * stance commands write it. One stance per person per place, a note of at most 140 characters,
 * and the guide reads stances only for members of the trip in context.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem } from '../../src/tx';
import { expectCrewReadOnly } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('place_stances', () => {
  it('is read by the crew only, synced on the trip stream and never written by app_user', async () => {
    await expectCrewReadOnly(harness, 'place_stances');
  });

  it('keeps one stance per person per place and a note of at most 140 characters', async () => {
    const { tripId, actors } = harness.fixture;
    const insert = (userId: string, note: string) =>
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO place_stances (trip_id, poi_id, user_id, stance, note)
           SELECT trip_id, poi_id, $2, 'rather_not', $3 FROM place_stances WHERE trip_id = $1 LIMIT 1`,
          [tripId, userId, note],
        ),
      );
    await expect(insert(actors.organiser, 'Again')).rejects.toThrow(
      /place_stances_trip_poi_user_key/,
    );
    await expect(insert(actors.member, 'x'.repeat(141))).rejects.toThrow(/check constraint/);
    await insert(actors.member, 'Too steep for my knees');
  });

  it("reaches the guide with each person's words for members of the trip only", async () => {
    const { tripId, actors } = harness.fixture;
    const read = (uid: string) =>
      withGuideReader(harness.db.pool, uid, tripId, async (tx) => {
        const { rows } = await tx.query<{ stance: string; note: string | null }>(
          'SELECT stance, note FROM llm.place_stances ORDER BY stance',
        );
        return rows;
      });
    expect((await read(actors.member)).map((row) => row.stance)).toContain('want');
    expect(await read(actors.outsider)).toEqual([]);
  });
});
