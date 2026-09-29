/**
 * The payee's side (docs/api-contracts.md §4.9): `confirm_paid` (offline, notification action
 * `CONFIRM`) writes the payment into the ledger and, when it clears the trip, grants every
 * participant the Settled Tokek at the same server time; `dispute_payment` says the money never
 * arrived, and the payer can mark it paid again.
 */
import {
  DomainError,
  disputePaymentPayloadSchema,
  nextPaymentStatus,
  paymentIdPayloadSchema,
  type PaymentResult,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { announcePayment, confirmPayment, loadPayment } from '../../money/settle';
import { defineCommand } from '../_framework/define-command';

async function requirePayee(
  tx: Parameters<typeof loadPayment>[0],
  paymentId: string,
  uid: string,
): Promise<void> {
  const payment = await loadPayment(tx, paymentId);
  if (payment.to_id !== uid) throw new DomainError('FORBIDDEN', { reason: 'payee_only' });
}

export const confirmPaidCommand = defineCommand({
  name: 'confirm_paid',
  v: 1,
  schema: paymentIdPayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'money_mark',
  authorize: (tx, payload, ctx) => requirePayee(tx, payload.payment_id, ctx.uid),
  handle: async (tx, payload, ctx): Promise<PaymentResult> => {
    const payment = await loadPayment(tx, payload.payment_id, true);
    if (nextPaymentStatus(payment.status, 'confirm') === null) {
      throw new DomainError('STATE_INVALID', { state: payment.status });
    }
    const outcome = await confirmPayment(tx, payment, ctx.clock.serverNow, ctx.uid);
    return {
      payment_id: payment.id,
      status: 'confirmed',
      version: outcome.version,
      ...(outcome.settledAt === null ? {} : { settled_at: outcome.settledAt.toISOString() }),
    };
  },
});

export const disputePaymentCommand = defineCommand({
  name: 'dispute_payment',
  v: 1,
  schema: disputePaymentPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload, ctx) => requirePayee(tx, payload.payment_id, ctx.uid),
  handle: async (tx, payload, ctx): Promise<PaymentResult> => {
    const payment = await loadPayment(tx, payload.payment_id, true);
    if (nextPaymentStatus(payment.status, 'dispute') === null) {
      throw new DomainError('STATE_INVALID', { state: payment.status });
    }
    await asSystemRole(tx, () =>
      tx.query(
        `UPDATE payments SET status = 'disputed', disputed_at = $2, dispute_note = $3,
           version = version + 1 WHERE id = $1`,
        [payment.id, ctx.clock.serverNow, payload.note ?? null],
      ),
    );
    await announcePayment(tx, payment, 'disputed', 'payment.disputed', ctx.uid);
    return { payment_id: payment.id, status: 'disputed', version: payment.version + 1 };
  },
});
