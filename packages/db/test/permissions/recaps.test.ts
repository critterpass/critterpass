/**
 * `recaps` (C1, RLS T via the viewer list): the trip's travellers who are still in the crew read
 * the recap and sync it on the trip stream; a crewmate who never travelled, the outsider and the
 * ex-member read nothing; only the worker writes it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addRecapCrewmate } from '../helpers/recap-fixture';
import { visibleRows } from '../helpers/setup-privacy';
import { evaluateStream, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('recaps', () => {
  it('is hidden from a crewmate who never travelled, on the database and the stream', async () => {
    const { tripId } = harness.fixture;
    const homebody = await addRecapCrewmate(harness.db.pool, harness.fixture, {
      viewer: false,
      left: false,
    });
    expect(
      await visibleRows(harness, homebody, 'SELECT 1 FROM recaps WHERE trip_id = $1', [tripId]),
    ).toBe(0);
    const synced = await evaluateStream(harness.db.pool, harness.config, 'trip', {
      userId: homebody,
      parameters: { trip_id: tripId },
    });
    expect(synced.get('recaps') ?? []).toEqual([]);
  });
});
