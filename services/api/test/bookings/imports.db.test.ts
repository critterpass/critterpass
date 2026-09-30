/**
 * Imports on the real stack. A paste appears at once as its owner's `parsing` candidate with the
 * parse queued. A forward shown to the crew is added by one member for everyone, with its split
 * expense and the deadline from the confirmation; a second member's ADD is refused with where it
 * went; IGNORE drops a candidate; someone outside the crew cannot see or resolve it.
 */
import { withSystem, withUser } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { MoneyCrew, MoneyHarness } from '../money/money-harness';
import { buildMoneyCrew } from '../money/money-harness';
import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
import { startBookingsHarness } from './bookings-harness';

let harness: MoneyHarness;
let crew: MoneyCrew;

const STAY = {
  kind: 'stay',
  title: 'Villa Tirta, Ubud',
  supplier: 'agoda',
  supplier_name: 'Agoda',
  supplier_ref: '1482236907',
  starts_at: '2026-10-12T06:00:00.000Z',
  ends_at: '2026-10-19T04:00:00.000Z',
  tz: 'Asia/Makassar',
  location: 'Jl. Raya Sayan No. 8, Ubud',
  price: { amount_minor: 90_000, currency: 'USD' },
  travellers: ['Maya Tan'],
  free_cancel_until: '2026-10-05T15:59:00.000Z',
  cancel_policy_text: 'Free cancellation until 5 October 2026 23:59 (property local time).',
  segments: [],
  details: { room: 'Deluxe Pool Villa' },
  barcode: null,
  extracted_by: 'model',
};

async function crewCandidate(owner: SignedIn): Promise<string> {
  return withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO import_candidates (user_id, crew_id, trip_id, source, extracted, dedupe_key,
         status, crew_visible)
       VALUES ($1, $2, $3, 'forward', $4, $5, 'pending', true) RETURNING id`,
      [owner.uid, crew.crewId, crew.tripId, JSON.stringify(STAY), `crew:${generateUuidV7()}`],
    );
    return rows[0]!.id;
  });
}

beforeAll(async () => {
  harness = await startBookingsHarness();
  crew = await buildMoneyCrew(harness, 3);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('pasting', () => {
  it('shows a parsing candidate to its owner and queues the parse', async () => {
    const [organiser, maya] = crew.members as [SignedIn, SignedIn];
    const candidateId = generateUuidV7();
    const response = await harness.run(organiser, 'import_paste', {
      candidate_id: candidateId,
      trip_id: crew.tripId,
      url: 'https://www.agoda.com/account/booking/1482236907',
    });
    expect(resultOf(response)).toEqual({ candidate_id: candidateId });
    const seen = (uid: string) =>
      withUser(harness.pool, uid, 'test', (tx) =>
        tx.query<{ status: string }>('SELECT status FROM import_candidates WHERE id = $1', [
          candidateId,
        ]),
      );
    expect((await seen(organiser.uid)).rows).toEqual([{ status: 'parsing' }]);
    expect((await seen(maya.uid)).rows).toEqual([]);
    const job = await harness.pool.query(
      "SELECT 1 FROM pgboss.job WHERE name = 'import.parse' AND data->>'candidate_id' = $1",
      [candidateId],
    );
    expect(job.rowCount).toBe(1);
  });
});

describe('resolving a crew candidate', () => {
  it('adds it once for everyone, with its split expense and real deadline', async () => {
    const [organiser, maya, alex] = crew.members as [SignedIn, SignedIn, SignedIn];
    const candidateId = await crewCandidate(maya);
    const outsider = await harness.signIn();
    expect(
      (
        await harness.run(outsider, 'resolve_import_candidate', {
          candidate_id: candidateId,
          action: 'add',
        })
      ).status,
    ).toBe(404);
    const expenseId = generateUuidV7();
    const added = await harness.run(alex, 'resolve_import_candidate', {
      candidate_id: candidateId,
      action: 'add',
      traveller_ids: [organiser.uid, maya.uid, alex.uid],
      split: { expense_id: expenseId },
    });
    expect(resultOf(added)).toEqual({
      candidate_id: candidateId,
      status: 'accepted',
      booking_id: candidateId,
      expense_id: expenseId,
    });
    const { rows } = await harness.pool.query<{
      source: string;
      visibility: string;
      free_cancel_until: Date;
      cancel_policy_text: string;
    }>(
      'SELECT source, visibility, free_cancel_until, cancel_policy_text FROM bookings WHERE id = $1',
      [candidateId],
    );
    expect(rows[0]).toMatchObject({
      source: 'forward',
      visibility: 'crew',
      free_cancel_until: new Date(STAY.free_cancel_until),
      cancel_policy_text: STAY.cancel_policy_text,
    });
    const again = await harness.run(organiser, 'resolve_import_candidate', {
      candidate_id: candidateId,
      action: 'add',
    });
    expect(errorOf(again)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'already_resolved', booking_id: candidateId },
    });
  });

  it('drops a candidate on IGNORE', async () => {
    const [organiser, maya] = crew.members as [SignedIn, SignedIn];
    const candidateId = await crewCandidate(organiser);
    const ignored = await harness.run(maya, 'resolve_import_candidate', {
      candidate_id: candidateId,
      action: 'ignore',
    });
    expect(resultOf(ignored)).toMatchObject({ status: 'rejected' });
    const { rows } = await harness.pool.query<{ status: string; resolved_by: string }>(
      'SELECT status, resolved_by FROM import_candidates WHERE id = $1',
      [candidateId],
    );
    expect(rows[0]).toEqual({ status: 'rejected', resolved_by: maya.uid });
  });
});
