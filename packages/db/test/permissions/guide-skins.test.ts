/**
 * `guide_skins` (C1): the form a traveller dresses a guide in is theirs alone, synced on `me`,
 * written only by the server (after `set_guide_skin` checks the form is owned), one per guide.
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

describe('guide_skins', () => {
  it('shows a traveller their own skins only, on me', async () => {
    const { actors } = harness.fixture;
    const probe = 'SELECT 1 FROM guide_skins';
    expect(await visibleRows(harness, actors.organiser, probe)).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe), kind).toBe(0);
    }
    expect((await harness.rows('me', 'organiser')).get('guide_skins')).toHaveLength(1);
    expect((await harness.rows('me', 'member')).get('guide_skins') ?? []).toHaveLength(0);
  });

  it('is written by the server only, one skin per guide', async () => {
    const { actors } = harness.fixture;
    const copy = `INSERT INTO guide_skins (user_id, guide_id, form_id)
      SELECT $1, guide_id, form_id FROM guide_skins LIMIT 1`;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query(copy, [actors.organiser]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withSystem(harness.db.pool, (tx) => tx.query(copy, [actors.organiser])),
    ).rejects.toThrow(/guide_skins_user_guide_key/);
  });
});
