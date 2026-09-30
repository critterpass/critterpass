/**
 * `affiliate_clicks` (C2) and `affiliate_conversions` (C5), RLS S: a click is written by the api and
 * read by the conversions import and the ops console only. No actor (not even the one who clicked),
 * no guide_reader, no replication role, publication or stream can read either table.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import { FIXTURE_SUB_ID } from '../helpers/suppliers-fixture';
import { expectSealed } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('affiliate clicks and conversions', () => {
  it('are sealed from every actor, role, publication and stream', async () => {
    await expectSealed(harness, 'affiliate_clicks', { owner: null });
    await expectSealed(harness, 'affiliate_conversions', { owner: null });
  });

  it('join a conversion back to its click by the opaque sub id only', async () => {
    const { rows } = await withSystem(harness.db.pool, (tx) =>
      tx.query<{ sub_id: string }>(
        `SELECT c.sub_id FROM affiliate_conversions v JOIN affiliate_clicks c ON c.id = v.click_id
          WHERE v.sub_id = $1`,
        [FIXTURE_SUB_ID],
      ),
    );
    expect(rows).toEqual([{ sub_id: FIXTURE_SUB_ID }]);
  });

  it('refuse a sub id that could carry an identifier', async () => {
    const { actors } = harness.fixture;
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO affiliate_clicks (user_id, partner, sub_id, target_kind, target_ref, url)
           VALUES ($1, 'agoda', $2, 'stay', 'poi:x', 'https://www.agoda.com/')`,
          [actors.member, actors.member],
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
  });
});
