/**
 * Ideas holds what the crew saved for the trip and hasn't put in a day: a place already in the
 * plan's current version leaves it (a pinned idea by its own name and spot), a place I hid leaves
 * it for me only, and a removed idea is gone. Read from the real local database.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { configure, renderHook, waitFor } from '@testing-library/react-native';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { useTripIdeas } from '../use-trip-ideas';

const TRIP = '0192f000-0000-7000-8000-0000000000f1';
const V1 = '0192f000-0000-7000-8000-000000000101';
const MAYA = '0192f000-0000-7000-8000-0000000000a1';
const TIRTA = '0192f000-0000-7000-8000-0000000000b1';
const SENIMAN = '0192f000-0000-7000-8000-0000000000b2';
const GOA = '0192f000-0000-7000-8000-0000000000b3';
const SARI = '0192f000-0000-7000-8000-0000000000b4';

configure({ asyncUtilTimeout: 5000 });

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  if (stack !== null) {
    await stack.close();
    removeDir(stack.dir);
    stack = null;
  }
});

async function idea(
  s: TestLocalFirst,
  id: string,
  poiId: string | null,
  name: string,
  extra: { deleted?: boolean; lat?: number } = {},
) {
  await s.db.execute(
    `INSERT INTO trip_ideas (id, trip_id, poi_id, name, category, lat, lng, backer_ids, sources,
       created_at, deleted_at)
     VALUES (?, ?, ?, ?, 'temple_shrine', ?, 115.26, ?, '["save"]', ?, ?)`,
    [
      id,
      TRIP,
      poiId,
      name,
      extra.lat ?? -8.5,
      JSON.stringify([MAYA]),
      `2026-10-0${id.slice(-1)}T00:00:00Z`,
      extra.deleted === true ? '2026-10-03T00:00:00Z' : null,
    ],
  );
}

describe('useTripIdeas', () => {
  it('leaves out placed, hidden and removed ideas and counts them', async () => {
    const s = await openTestLocalFirst({ holdUploads: true });
    stack = s;
    await s.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
      OWNER_UID_KEY,
      s.uid,
    ]);
    await s.db.execute(
      `INSERT INTO trips (id, crew_id, status, current_version_id) VALUES (?, 'crew', 'planning', ?)`,
      [TRIP, V1],
    );
    await s.db.execute(
      `INSERT INTO plan_items (id, version_id, day_id, trip_id, stable_id, poi_id, custom_place)
       VALUES ('pi-1', ?, 'day-one', ?, 'stop-one', ?, NULL), ('pi-2', ?, 'day-one', ?, 'stop-two', NULL, ?)`,
      [
        V1,
        TRIP,
        TIRTA,
        V1,
        TRIP,
        JSON.stringify({ name: 'Rice field pin', lat: -8.5, lng: 115.26 }),
      ],
    );
    await s.db.execute('INSERT INTO place_hides (id, user_id, poi_id) VALUES (?, ?, ?)', [
      'h1',
      s.uid,
      SENIMAN,
    ]);
    await s.db.execute('INSERT INTO place_hides (id, user_id, poi_id) VALUES (?, ?, ?)', [
      'h2',
      MAYA,
      GOA,
    ]);
    await idea(s, 'idea-1', TIRTA, 'Tirta Empul');
    await idea(s, 'idea-2', SENIMAN, 'Seniman Coffee');
    await idea(s, 'idea-3', GOA, 'Goa Gajah');
    await idea(s, 'idea-4', SARI, 'Sari Organik', { deleted: true });
    await idea(s, 'idea-5', null, 'Rice field pin');
    await idea(s, 'idea-6', null, 'Rice field pin', { lat: -8.6 });

    const { result } = await renderHook(() => useTripIdeas(TRIP), { wrapper: s.wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.ideas.map((entry) => entry.id)).toEqual(['idea-3', 'idea-6']);
    expect(result.current.placedCount).toBe(2);
    expect(result.current.hiddenCount).toBe(1);
    expect(result.current.ideas[0]?.backerIds).toEqual([MAYA]);
  });
});
