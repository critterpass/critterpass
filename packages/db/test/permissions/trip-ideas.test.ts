/**
 * `trip_ideas` (C1, RLS T): the trip's crew reads its Ideas and syncs them on the trip stream, as
 * saves inside the trip's destination already show on the place page; the outsider, the ex-member
 * and an anonymous uid read nothing; only the planning commands and jobs write it. A removed idea
 * leaves the stream, and the guide reads Ideas without the link a member pasted.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem } from '../../src/tx';
import { expectCrewReadOnly } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let poiId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { rows } = await harness.db.pool.query<{ poi_id: string }>(
    'SELECT poi_id FROM trip_ideas WHERE trip_id = $1',
    [harness.fixture.tripId],
  );
  poiId = rows[0]!.poi_id;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('trip_ideas', () => {
  it('is read by the crew only, synced on the trip stream and never written by app_user', async () => {
    await expectCrewReadOnly(harness, 'trip_ideas');
  });

  it('holds one live idea per place per trip, and the place may come back once removed', async () => {
    const { tripId, actors } = harness.fixture;
    const insert = (tx: pg.PoolClient) =>
      tx.query(
        `INSERT INTO trip_ideas (trip_id, poi_id, name, category, lat, lng, sources, created_by)
         VALUES ($1, $2, 'Again', 'other', 0, 0, ARRAY['swipe'], $3)`,
        [tripId, poiId, actors.member],
      );
    await expect(withSystem(harness.db.pool, insert)).rejects.toThrow(/trip_ideas_trip_poi_key/);
    await withSystem(harness.db.pool, async (tx) => {
      await tx.query('UPDATE trip_ideas SET deleted_at = now() WHERE trip_id = $1', [tripId]);
      await insert(tx);
    });
    const synced = await harness.rows('trip', 'member', { trip_id: tripId });
    expect(synced.get('trip_ideas')?.map((row) => row['name'])).toEqual(['Again']);
  });

  it('rejects an unknown source and a category outside the place categories', async () => {
    const { tripId } = harness.fixture;
    for (const [category, sources] of [
      ['other', "ARRAY['rumour']"],
      ['spa', "ARRAY['save']"],
    ] as const) {
      await expect(
        withSystem(harness.db.pool, (tx) =>
          tx.query(
            `INSERT INTO trip_ideas (trip_id, name, category, lat, lng, sources)
             VALUES ($1, 'Pin', $2, 1, 1, ${sources})`,
            [tripId, category],
          ),
        ),
      ).rejects.toThrow(/check constraint/);
    }
  });

  it('reaches the guide without the pasted link, for members of the trip only', async () => {
    const { tripId, actors } = harness.fixture;
    const read = (uid: string) =>
      withGuideReader(harness.db.pool, uid, tripId, async (tx) => {
        const { rows, fields } = await tx.query('SELECT * FROM llm.trip_ideas');
        return { rows, columns: fields.map((field) => field.name) };
      });
    const member = await read(actors.member);
    expect(member.rows).toHaveLength(1);
    expect(member.columns).not.toContain('source_url');
    expect((await read(actors.outsider)).rows).toHaveLength(0);
    await expect(
      withGuideReader(harness.db.pool, actors.member, tripId, (tx) =>
        tx.query('SELECT 1 FROM trip_ideas'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
