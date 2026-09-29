/**
 * `mark_paid` (docs/api-contracts.md §4.9, offline, notification action `MARK_PAID`): the payer
 * says they sent the money, and how. A planned transfer nobody requested yet is created under the
 * client's id; a smaller amount than asked is a partial payment and the rest stays open as its own
 * payment. The payee confirms it (or it confirms itself after seven days).
 */
import {
  DomainError,
  generateUuidV7,
  markPaidPayloadSchema,
  nextPaymentStatus,
  type PaymentResult,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { announcePayment, loadPayment, type PaymentRow } from '../../money/settle';
import { defineCommand } from '../_framework/define-command';
import { requireAllInTrip, requireMoneyMember, tripMoneyMembers } from './shared';

async function existing(
  tx: Parameters<typeof loadPayment>[0],
  paymentId: string,
): Promise<PaymentRow | undefined> {
  try {
    return await loadPayment(tx, paymentId);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') return undefined;
    throw error;
  }
}

export const markPaidCommand = defineCommand({
  name: 'mark_paid',
  v: 1,
  schema: markPaidPayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'money_mark',
  authorize: async (tx, payload, ctx) => {
    const payment = await existing(tx, payload.payment_id);
    if (payment === undefined) {
      if (payload.create === undefined) throw new DomainError('NOT_FOUND', { reason: 'payment' });
      await requireMoneyMember(tx, payload.create.trip_id, ctx.uid);
      return;
    }
    if (payment.from_id !== ctx.uid) throw new DomainError('FORBIDDEN', { reason: 'payer_only' });
  },
  handle: async (tx, payload, ctx): Promise<PaymentResult> => {
    const now = ctx.clock.serverNow;
    if ((await existing(tx, payload.payment_id)) === undefined && payload.create !== undefined) {
      const trip = await requireMoneyMember(tx, payload.create.trip_id, ctx.uid);
      requireAllInTrip(await tripMoneyMembers(tx, trip.id), [payload.create.to_uid]);
      if (payload.create.to_uid === ctx.uid || payload.create.currency !== trip.crew_currency) {
        throw new DomainError('VALIDATION', { reason: 'invalid_transfer' });
      }
      await asSystemRole(tx, () =>
        tx.query(
          `INSERT INTO payments (id, crew_id, trip_id, from_id, to_id, amount_minor, currency,
             method, status, marked_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'marked_paid', $9, $4)`,
          [
            payload.payment_id,
            trip.crew_id,
            trip.id,
            ctx.uid,
            payload.create?.to_uid,
            payload.amount_minor ?? payload.create?.amount_minor,
            trip.crew_currency,
            payload.method,
            now,
          ],
        ),
      );
      const created = await loadPayment(tx, payload.payment_id);
      await announcePayment(tx, created, 'marked_paid', 'payment.marked_paid', ctx.uid);
      return { payment_id: created.id, status: 'marked_paid', version: created.version };
    }

    const payment = await loadPayment(tx, payload.payment_id, true);
    if (nextPaymentStatus(payment.status, 'mark_paid') === null) {
      throw new DomainError('STATE_INVALID', { state: payment.status });
    }
    const asked = BigInt(payment.amount_minor);
    const paid = payload.amount_minor === undefined ? asked : BigInt(payload.amount_minor);
    if (paid > asked) throw new DomainError('VALIDATION', { reason: 'more_than_owed' });
    const remainderId = paid < asked ? generateUuidV7() : undefined;
    await asSystemRole(tx, async () => {
      await tx.query(
        `UPDATE payments SET status = 'marked_paid', method = $2, amount_minor = $3, marked_at = $4,
           version = version + 1 WHERE id = $1`,
        [payment.id, payload.method, paid.toString(), now],
      );
      if (remainderId !== undefined) {
        await tx.query(
          `INSERT INTO payments (id, crew_id, trip_id, from_id, to_id, amount_minor, currency,
             status, requested_at, reissued_from_id, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 = 'requested' THEN $9::timestamptz END, $10, $11)`,
          [
            remainderId,
            payment.crew_id,
            payment.trip_id,
            payment.from_id,
            payment.to_id,
            (asked - paid).toString(),
            payment.currency,
            payment.status === 'pending' ? 'pending' : 'requested',
            now,
            payment.id,
            payment.created_by,
          ],
        );
      }
    });
    await announcePayment(tx, payment, 'marked_paid', 'payment.marked_paid', ctx.uid);
    return {
      payment_id: payment.id,
      status: 'marked_paid',
      version: payment.version + 1,
      ...(remainderId === undefined ? {} : { remainder_payment_id: remainderId }),
    };
  },
});
