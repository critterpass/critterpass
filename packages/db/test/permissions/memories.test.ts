/**
 * `memories` and `memory_reactions` (C1, RLS T via the viewer list): the trip's travellers read the
 * year-later memory and its reactions and sync them on the trip stream, and a traveller who has
 * since left the crew keeps them (the recap itself they no longer see); a crewmate who never
 * travelled, the outsider and the ex-member read nothing; only commands and the worker write.
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

describe.each(['memories', 'memory_reactions'])('%s', (table) => {
  it('stays with a traveller who left the crew, and never reaches one who stayed home', async () => {
    const { tripId } = harness.fixture;
    const probe = `SELECT 1 FROM ${table} WHERE trip_id = $1`;
    const sync = (uid: string) =>
      evaluateStream(harness.db.pool, harness.config, 'trip', {
        userId: uid,
        parameters: { trip_id: tripId },
      });
    const former = await addRecapCrewmate(harness.db.pool, harness.fixture, {
      viewer: true,
      left: true,
    });
    expect(await visibleRows(harness, former, probe, [tripId])).toBe(1);
    expect((await sync(former)).get(table)).toHaveLength(1);
    expect(
      await visibleRows(harness, former, 'SELECT 1 FROM recaps WHERE trip_id = $1', [tripId]),
    ).toBe(0);
    const homebody = await addRecapCrewmate(harness.db.pool, harness.fixture, {
      viewer: false,
      left: false,
    });
    expect(await visibleRows(harness, homebody, probe, [tripId])).toBe(0);
    expect((await sync(homebody)).get(table) ?? []).toEqual([]);
  });
});
