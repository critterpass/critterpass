/**
 * The governor on the push path uses the app's own rule over the user's synced impressions: one
 * unsolicited paywall per local day (a push counts toward it), and a quiet no on an offer keeps
 * its push away from that trip.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { governedCompose, paywallPushAllowed } from '../../src/jobs/billing/governor-hook';
import type { RoutedEvent } from '../../src/jobs/notify/register';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

const event = (tripId: string | null): RoutedEvent => ({
  id: '01920000-0000-7000-8000-0000000000e1',
  type: 'boost.activated',
  payload: {},
  crewId: null,
  tripId,
  actorId: null,
  occurredAt: new Date(),
});

describe('paywall governor on pushes', () => {
  it('lets one paywall push through a local day, then holds the rest', async () => {
    const now = new Date('2026-10-01T02:00:00Z');
    const composed = {
      title: { id: 't' },
      body: { id: 'b' },
      sender: { kind: 'system', id: 'critterpass', name: 'CritterPass' },
    };
    const compose = governedCompose(
      'ftf_ending',
      'push',
      (e) => e.tripId,
      () => Promise.resolve(composed as never),
      () => now,
    );
    const { first, second } = await withSystem(harness.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "INSERT INTO users (id, tz) VALUES (uuidv7(), 'Asia/Singapore') RETURNING id",
      );
      const uid = rows[0]!.id;
      return {
        first: await compose(tx, event(null), uid),
        second: await compose(tx, event(null), uid),
      };
    });
    expect(first).toEqual(composed);
    expect(second).toBeNull();
  });

  it("keeps an offer's push off a trip the user said no to", async () => {
    const now = new Date('2026-10-01T02:00:00Z');
    const verdict = await withSystem(harness.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        "INSERT INTO users (id, tz) VALUES (uuidv7(), 'UTC') RETURNING id",
      );
      const uid = rows[0]!.id;
      await tx.query(
        `INSERT INTO paywall_impressions (user_id, entry_point, outcome, governed, shown_at, local_date)
         VALUES ($1, 'ftf_ending', 'quiet_no', true, now(), '2026-09-20')`,
        [uid],
      );
      return paywallPushAllowed(tx, uid, 'ftf_ending', null, now);
    });
    // A quiet no is per trip; with no trip it does not apply, and the day is still unused.
    expect(verdict).toEqual({ allowed: true, localDate: '2026-10-01' });
  });
});
