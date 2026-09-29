/**
 * The payment state machine table: every action from every status either moves where the table
 * says or is refused, confirmed and cancelled payments never move again, and a dispute only
 * follows a payment marked paid.
 */
import {
  nextPaymentStatus,
  PAYMENT_STATUSES,
  PAYMENT_TRANSITIONS,
  type PaymentAction,
} from '@cp/domain';
import { describe, expect, it } from 'vitest';

const ACTIONS = Object.keys(PAYMENT_TRANSITIONS) as PaymentAction[];

describe('payment transitions', () => {
  it.each(ACTIONS)('%s moves only from its listed statuses', (action) => {
    const { from, to } = PAYMENT_TRANSITIONS[action];
    for (const status of PAYMENT_STATUSES) {
      expect(nextPaymentStatus(status, action)).toBe(from.includes(status) ? (to ?? status) : null);
    }
  });

  it('never moves a confirmed or cancelled payment', () => {
    for (const action of ACTIONS) {
      expect(nextPaymentStatus('confirmed', action)).toBeNull();
      expect(nextPaymentStatus('cancelled', action)).toBeNull();
    }
  });

  it('lets the payee dispute only a payment marked paid, and the payer mark it again', () => {
    expect(nextPaymentStatus('requested', 'dispute')).toBeNull();
    expect(nextPaymentStatus('marked_paid', 'dispute')).toBe('disputed');
    expect(nextPaymentStatus('disputed', 'mark_paid')).toBe('marked_paid');
    expect(nextPaymentStatus('disputed', 'auto_confirm')).toBeNull();
  });
});
