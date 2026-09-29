/**
 * Asking to be paid back (docs/api-contracts.md §4.9): `request_payment` (the payee asks a member
 * who owes them; offline, the client names the payment), `nudge_payment` (the payee, at most once
 * a day per pair: `NUDGE_TOO_SOON`) and `remind_all_payments` (any member, at most once a day per
 * trip: `RATE_LIMITED`). Pushes go out from the worker on the events.
 */
import { emitEvent } from '@cp/db';
import {
  DomainError,
  NUDGE_INTERVAL_HOURS,
  paymentIdPayloadSchema,
  remindAllPaymentsPayloadSchema,
  REMIND_ALL_INTERVAL_HOURS,
  requestPaymentPayloadSchema,
  type PaymentResult,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { announcePayment, loadPayment, openPayments } from '../../money/settle';
import { defineCommand } from '../_framework/define-command';
import { requireAllInTrip, requireMoneyMember, tripMoneyMembers } from './shared';

const HOUR_MS = 3_600_000;

export const requestPaymentCommand = defineCommand({
  name: 'request_payment',
  v: 1,
  schema: requestPaymentPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireMoneyMember(tx, payload.trip_id, ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<PaymentResult> => {
    const trip = await requireMoneyMember(tx, payload.trip_id, ctx.uid);
    requireAllInTrip(await tripMoneyMembers(tx, trip.id), [payload.from_uid]);
    if (payload.from_uid === ctx.uid) {
      throw new DomainError('VALIDATION', { reason: 'request_from_self' });
    }
    if (payload.currency !== trip.crew_currency) {
      throw new DomainError('VALIDATION', {
        reason: 'not_crew_currency',
        currency: trip.crew_currency,
      });
    }
    const open = (await openPayments(tx, trip.id)).find(
      (p) =>
        p.fromId === payload.from_uid &&
        p.toId === ctx.uid &&
        (p.status === 'pending' || p.status === 'requested'),
    );
    if (open !== undefined) {
      throw new DomainError('STATE_INVALID', { reason: 'already_requested', payment_id: open.id });
    }
    await asSystemRole(tx, () =>
      tx.query(
        `INSERT INTO payments (id, crew_id, trip_id, from_id, to_id, amount_minor, currency, status,
           requested_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'requested', $8, $5)`,
        [
          payload.payment_id,
          trip.crew_id,
          trip.id,
          payload.from_uid,
          ctx.uid,
          payload.amount_minor,
          payload.currency,
          ctx.clock.serverNow,
        ],
      ),
    );
    const payment = await loadPayment(tx, payload.payment_id);
    await announcePayment(tx, payment, 'requested', 'payment.requested', ctx.uid);
    return { payment_id: payment.id, status: 'requested', version: payment.version };
  },
});

export const nudgePaymentCommand = defineCommand({
  name: 'nudge_payment',
  v: 1,
  schema: paymentIdPayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'money_nudge',
  authorize: async (tx, payload, ctx) => {
    const payment = await loadPayment(tx, payload.payment_id);
    if (payment.to_id !== ctx.uid) throw new DomainError('FORBIDDEN', { reason: 'payee_only' });
  },
  handle: async (tx, payload, ctx): Promise<PaymentResult> => {
    const payment = await loadPayment(tx, payload.payment_id, true);
    if (payment.status !== 'pending' && payment.status !== 'requested') {
      throw new DomainError('STATE_INVALID', { state: payment.status });
    }
    const { rows } = await asSystemRole(tx, () =>
      tx.query<{ last: Date | null }>(
        `SELECT max(last_nudged_at) AS last FROM payments
          WHERE crew_id = $1 AND from_id = $2 AND to_id = $3`,
        [payment.crew_id, payment.from_id, payment.to_id],
      ),
    );
    const last = rows[0]?.last ?? null;
    const now = ctx.clock.serverNow;
    if (last !== null && now.getTime() - last.getTime() < NUDGE_INTERVAL_HOURS * HOUR_MS) {
      throw new DomainError('NUDGE_TOO_SOON', {
        next_at: new Date(last.getTime() + NUDGE_INTERVAL_HOURS * HOUR_MS).toISOString(),
      });
    }
    await asSystemRole(tx, () =>
      tx.query('UPDATE payments SET last_nudged_at = $2, version = version + 1 WHERE id = $1', [
        payment.id,
        now,
      ]),
    );
    await announcePayment(tx, payment, payment.status, 'payment.nudged', ctx.uid);
    return { payment_id: payment.id, status: payment.status, version: payment.version + 1 };
  },
});

export const remindAllPaymentsCommand = defineCommand({
  name: 'remind_all_payments',
  v: 1,
  schema: remindAllPaymentsPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireMoneyMember(tx, payload.trip_id, ctx.uid);
  },
  handle: async (tx, payload, ctx) => {
    const trip = await requireMoneyMember(tx, payload.trip_id, ctx.uid);
    const { rows } = await asSystemRole(tx, () =>
      tx.query<{ last: Date | null }>('SELECT app.last_payments_reminder_at($1) AS last', [
        trip.id,
      ]),
    );
    const last = rows[0]?.last ?? null;
    const now = ctx.clock.serverNow;
    const window = REMIND_ALL_INTERVAL_HOURS * HOUR_MS;
    if (last !== null && now.getTime() - last.getTime() < window) {
      throw new DomainError('RATE_LIMITED', {
        retry_after_s: Math.ceil((last.getTime() + window - now.getTime()) / 1000),
      });
    }
    const waiting = (await openPayments(tx, trip.id)).filter(
      (p) => p.status === 'pending' || p.status === 'requested',
    );
    await emitEvent(tx, {
      type: 'payment.reminded',
      aggregateKind: 'trip',
      aggregateId: trip.id,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId: trip.crew_id,
      tripId: trip.id,
      payload: { crew_id: trip.crew_id, trip_id: trip.id, payment_ids: waiting.map((p) => p.id) },
    });
    return { trip_id: trip.id, reminded: waiting.length };
  },
});
