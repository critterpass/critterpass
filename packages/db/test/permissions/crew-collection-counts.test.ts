/**
 * `crew_collection_counts` (C1): "Maya has 14". Crewmates read each other's counts (on
 * `crew_people`), never the entries behind them; outsiders and ex-members see nothing; the counts
 * follow verified finds and disappear the moment the owner hides their collection.
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

async function organiserCounts(): Promise<{ critters: number; forms: number }[]> {
  const { rows } = await harness.db.pool.query<{ critters: number; forms: number }>(
    'SELECT critters, forms FROM crew_collection_counts WHERE crew_id = $1 AND user_id = $2',
    [harness.fixture.crewId, harness.fixture.actors.organiser],
  );
  return rows;
}

describe('crew_collection_counts', () => {
  it('shows the crew counts only, and nobody outside it', async () => {
    const { actors } = harness.fixture;
    const probe = 'SELECT 1 FROM crew_collection_counts WHERE user_id = $1';
    for (const kind of ['organiser', 'member', 'coOrganiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [actors.organiser]), kind).toBe(1);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [actors.organiser]), kind).toBe(0);
    }
    const synced = (await harness.rows('crew_people', 'member')).get('crew_collection_counts');
    expect(synced?.map((row) => [row['critters'], row['forms']])).toEqual([[1, 1]]);
    expect(
      (await harness.rows('crew_people', 'outsider')).get('crew_collection_counts') ?? [],
    ).toEqual([]);
  });

  it('is never written by a client', async () => {
    const { actors } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('UPDATE crew_collection_counts SET critters = 99 WHERE user_id = $1', [
          actors.organiser,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('drops the rows when the owner hides their collection and restores them when shown', async () => {
    const { actors } = harness.fixture;
    const setHidden = (hidden: boolean) =>
      withSystem(harness.db.pool, (tx) =>
        tx.query('UPDATE user_settings SET hide_collection = $2 WHERE user_id = $1', [
          actors.organiser,
          hidden,
        ]),
      );
    await setHidden(true);
    expect(await organiserCounts()).toEqual([]);
    expect(
      (await harness.rows('crew_people', 'member')).get('crew_collection_counts') ?? [],
    ).toEqual([]);
    await setHidden(false);
    expect(await organiserCounts()).toEqual([{ critters: 1, forms: 1 }]);
  });

  it('counts verified finds only', async () => {
    const { actors } = harness.fixture;
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        "UPDATE collection_entries SET verification = 'pending', critter_name = NULL WHERE user_id = $1",
        [actors.organiser],
      ),
    );
    expect(await organiserCounts()).toEqual([{ critters: 0, forms: 0 }]);
  });
});
