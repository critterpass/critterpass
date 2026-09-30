/**
 * `collection_entries` (C1): a traveller's finds are theirs alone (on `me`); a crew sees counts
 * only, through `crew_collection_counts`; only the server writes entries; names are copied in
 * only once an entry is verified, so a pending find never carries a name.
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

describe('collection_entries', () => {
  it('shows a traveller their own entries only', async () => {
    const { actors } = harness.fixture;
    const probe = 'SELECT 1 FROM collection_entries';
    expect(await visibleRows(harness, actors.organiser, probe)).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe), kind).toBe(0);
    }
    expect((await harness.rows('me', 'organiser')).get('collection_entries')).toHaveLength(1);
    for (const stream of ['me', 'crew_people', 'crews'] as const) {
      expect(
        (await harness.rows(stream, 'member')).get('collection_entries') ?? [],
        stream,
      ).toEqual([]);
    }
  });

  it('is written by the server only', async () => {
    const { actors } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query(
          `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, source)
           SELECT $1, form_id, critter_id, now(), 'grant' FROM collection_entries LIMIT 1`,
          [actors.member],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('never stores a name on a pending entry', async () => {
    const { actors } = harness.fixture;
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, source,
             verification, critter_name)
           SELECT $1, form_id, critter_id, now(), 'grant', 'pending', 'Probe'
             FROM collection_entries LIMIT 1`,
          [actors.member],
        ),
      ),
    ).rejects.toThrow(/collection_entries_names_check/);
  });
});
