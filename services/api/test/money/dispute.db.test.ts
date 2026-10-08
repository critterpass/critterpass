/**
 * "I never got it" on the real stack. A member owes the organiser $100 and says they paid; only
 * the organiser (the payee) can dispute that, and only while the payment is waiting for their
 * confirmation. A dispute keeps the debt in the ledger and hands the payment back to the payer,
 * who can mark it paid again.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
import {
  buildMoneyCrew,
  netsOf,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from './money-harness';

let harness: MoneyHarness;
let crew: MoneyCrew;
let payee: SignedIn;
let payer: SignedIn;
let bystander: SignedIn;
let outsider: SignedIn;
let paymentId: string;

async function paymentRow(id: string) {
  const { rows } = await harness.pool.query<{
    status: string;
    note: string | null;
    disputed: boolean;
    version: number;
  }>(
    `SELECT status, dispute_note AS note, disputed_at IS NOT NULL AS disputed,
            version::int AS version FROM payments WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function disputedEvents(id: string): Promise<number> {
  const { rows } = await harness.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM domain_events
      WHERE type = 'payment.disputed' AND aggregate_id = $1`,
    [id],
  );
  return rows[0]!.n;
}

beforeAll(async () => {
  harness = await startMoneyHarness();
  crew = await buildMoneyCrew(harness, 3);
  payee = crew.organiser;
  payer = crew.members[1]!;
  bystander = crew.members[2]!;
  outsider = await harness.signIn();
  const added = await harness.run(payee, 'add_expense', {
    expense_id: generateUuidV7(),
    trip_id: crew.tripId,
    amount_minor: 30_000,
    currency: 'USD',
    payer_uid: payee.uid,
    split: { mode: 'equal', shares: crew.members.map((m) => ({ user_id: m.uid })) },
  });
  expect(added.status).toBe(200);
  paymentId = generateUuidV7();
  const requested = await harness.run(payee, 'request_payment', {
    payment_id: paymentId,
    trip_id: crew.tripId,
    from_uid: payer.uid,
    amount_minor: 10_000,
    currency: 'USD',
  });
  expect(requested.status).toBe(200);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('disputing a payment', () => {
  it('refuses a payment nobody has marked paid yet', async () => {
    const early = await harness.run(payee, 'dispute_payment', { payment_id: paymentId });
    expect(errorOf(early)).toMatchObject({ code: 'STATE_INVALID', detail: { state: 'requested' } });
    expect(await paymentRow(paymentId)).toMatchObject({ status: 'requested', disputed: false });
  });

  it('is the payee’s alone: not the payer, another member or a stranger', async () => {
    const marked = await harness.run(payer, 'mark_paid', { payment_id: paymentId, method: 'bank' });
    expect(resultOf(marked)).toMatchObject({ status: 'marked_paid' });

    const byPayer = await harness.run(payer, 'dispute_payment', { payment_id: paymentId });
    expect(errorOf(byPayer)).toMatchObject({ code: 'FORBIDDEN', detail: { reason: 'payee_only' } });
    const byMember = await harness.run(bystander, 'dispute_payment', { payment_id: paymentId });
    expect(['NOT_FOUND', 'FORBIDDEN']).toContain(errorOf(byMember).code);
    // Someone outside the crew cannot even see the payment.
    const byStranger = await harness.run(outsider, 'dispute_payment', { payment_id: paymentId });
    expect(byStranger.status).not.toBe(200);
    expect(['NOT_FOUND', 'FORBIDDEN']).toContain(errorOf(byStranger).code);

    expect(await paymentRow(paymentId)).toMatchObject({ status: 'marked_paid', disputed: false });
    expect(await disputedEvents(paymentId)).toBe(0);
  });

  it('marks it disputed with the note, tells the crew once and leaves the debt owed', async () => {
    const before = await paymentRow(paymentId);
    const disputed = await harness.run(payee, 'dispute_payment', {
      payment_id: paymentId,
      note: '  Nothing arrived on my side  ',
    });
    expect(resultOf(disputed)).toEqual({
      payment_id: paymentId,
      status: 'disputed',
      version: before!.version + 1,
    });
    expect(await paymentRow(paymentId)).toEqual({
      status: 'disputed',
      note: 'Nothing arrived on my side',
      disputed: true,
      version: before!.version + 1,
    });
    expect(await disputedEvents(paymentId)).toBe(1);
    expect((await netsOf(harness, crew.crewId))['USD']?.[payer.uid]).toBe(-10_000);

    const twice = await harness.run(payee, 'dispute_payment', { payment_id: paymentId });
    expect(errorOf(twice)).toMatchObject({ code: 'STATE_INVALID', detail: { state: 'disputed' } });
    expect(await disputedEvents(paymentId)).toBe(1);
  });

  it('lets the payer mark it paid again and the payee confirm', async () => {
    const again = await harness.run(payer, 'mark_paid', { payment_id: paymentId, method: 'cash' });
    expect(resultOf(again)).toMatchObject({ status: 'marked_paid' });
    const confirmed = await harness.run(payee, 'confirm_paid', { payment_id: paymentId });
    expect(resultOf(confirmed)).toMatchObject({ status: 'confirmed' });
    expect((await netsOf(harness, crew.crewId))['USD']?.[payer.uid]).toBeUndefined();
  });

  it('answers NOT_FOUND for a payment that does not exist', async () => {
    const missing = await harness.run(payee, 'dispute_payment', { payment_id: generateUuidV7() });
    expect(errorOf(missing).code).toBe('NOT_FOUND');
  });
});
