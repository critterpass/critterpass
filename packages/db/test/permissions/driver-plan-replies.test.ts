/**
 * `driver_plan_replies` (C1, RLS T): what a driver sent back through the page. The crew reads it,
 * nobody outside the crew does, no client writes it, and a link has one open reply at a time.
 */
import { createHash, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let shareId: string;

const openReply = (status = 'open') =>
  withSystem(harness.db.pool, (tx) =>
    tx.query(
      `INSERT INTO driver_plan_replies (share_id, trip_id, price_per_day_minor, currency, status)
       VALUES ($1, $2, 700000, 'IDR', $3)`,
      [shareId, harness.fixture.tripId, status],
    ),
  );

beforeAll(async () => {
  harness = await startStreamHarness();
  const { tripId, versionId } = harness.fixture;
  shareId = await withSystem(harness.db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO driver_plan_shares
         (trip_id, driver_name, itinerary_version_id, day_nos, token_hash, token_enc, expires_at)
       VALUES ($1, 'Made', $2, ARRAY[1, 2], $3, 'sealed', now() + interval '14 days') RETURNING id`,
      [tripId, versionId, createHash('sha256').update('reply-link').digest()],
    );
    return rows[0]!.id;
  });
  await openReply();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('driver_plan_replies', () => {
  it('is read by the crew only and never written by a member', async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM driver_plan_replies WHERE trip_id = $1';
    for (const kind of ['member', 'organiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBeGreaterThan(0);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query("UPDATE driver_plan_replies SET status = 'decided' WHERE trip_id = $1", [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps one open reply per link; replaced ones stay as history', async () => {
    await expect(openReply()).rejects.toThrow(/driver_plan_replies_open_key/);
    await expect(openReply('replaced')).resolves.toBeTruthy();
  });

  it('refuses a price without its currency and more than five tips', async () => {
    const { tripId } = harness.fixture;
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO driver_plan_replies (share_id, trip_id, price_per_day_minor, status)
           VALUES ($1, $2, 700000, 'replaced')`,
          [shareId, tripId],
        ),
      ),
    ).rejects.toThrow(/price_currency_check/);
    const sixTips = JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ text: `tip ${i}` })));
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO driver_plan_replies (share_id, trip_id, tips, status)
           VALUES ($1, $2, $3, 'replaced')`,
          [shareId, tripId, sixTips],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
