/**
 * Money pushes (N-15, N-16 and the Settled Tokek): a new expense to the members it splits with
 * (not whoever added it), a request, nudge or reminder to the payer, a marked payment to the payee
 * (with CONFIRM), a confirm or dispute back to the payer, and the reward to every participant at
 * once. Bodies carry first names and amounts in the crew currency; never payout details.
 */
import { formatMoney, money } from '@cp/cost-engine';
import {
  expenseLink,
  MONEY_PUSH_BODY,
  MONEY_PUSH_TITLE,
  paymentLink,
  SETTLED_PUSH,
  settleLink,
} from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type RoutedEvent } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, firstName, str } from '../setup/facts';

interface PaymentFacts {
  readonly crew: string;
  readonly from_id: string;
  readonly to_id: string;
  readonly amount_minor: string;
  readonly currency: string;
  readonly status: string;
  readonly trip_id: string | null;
}

async function payment(tx: pg.PoolClient, id: string | null): Promise<PaymentFacts | undefined> {
  if (id === null) return undefined;
  const { rows } = await tx.query<PaymentFacts>(
    `SELECT c.name AS crew, p.from_id, p.to_id, p.amount_minor::text, p.currency, p.status, p.trip_id
       FROM payments p JOIN crews c ON c.id = p.crew_id WHERE p.id = $1`,
    [id],
  );
  return rows[0];
}

/**
 * Amounts as one recipient reads them: punctuated the way their app's language writes money
 * (`app.user_locale`), like the rest of the push, which the router renders from their catalog.
 */
async function amountsFor(
  tx: pg.PoolClient,
  uid: string,
): Promise<(minor: string, currency: string) => string> {
  const { rows } = await tx.query<{ locale: string }>('SELECT app.user_locale($1) AS locale', [
    uid,
  ]);
  const locale = rows[0]?.locale ?? 'en';
  return (minor, currency) =>
    formatMoney(money(BigInt(minor), currency), { locale, mode: 'local' });
}

type PaymentBody = keyof typeof MONEY_PUSH_BODY;

function paymentPush(
  event:
    | 'payment.requested'
    | 'payment.nudged'
    | 'payment.marked_paid'
    | 'payment.confirmed'
    | 'payment.disputed',
  body: PaymentBody,
  to: 'payer' | 'payee',
  actions: readonly string[],
): void {
  registerNotification({
    key: 'money_event',
    event,
    audience: (_tx, routed) => {
      const uid = str(routed, to === 'payer' ? 'from_id' : 'to_id');
      return Promise.resolve(uid === null ? [] : [uid]);
    },
    async compose(tx, routed, uid) {
      const paymentId = str(routed, 'payment_id');
      const facts = await payment(tx, paymentId);
      if (facts === undefined) return null;
      const amountOf = await amountsFor(tx, uid);
      // A request that was paid or confirmed meanwhile has nothing left to ask.
      if (body === 'requested' || body === 'nudged') {
        if (facts.status !== 'requested' && facts.status !== 'pending') return null;
      }
      return {
        title: MONEY_PUSH_TITLE,
        body: MONEY_PUSH_BODY[body],
        vars: {
          crew: facts.crew,
          payer: await firstName(tx, facts.from_id),
          payee: await firstName(tx, facts.to_id),
          amount: amountOf(facts.amount_minor, facts.currency),
        },
        sender: DEFAULT_SETUP_GUIDE,
        crewId: routed.crewId,
        tripId: facts.trip_id,
        deepLink: paymentLink(paymentId ?? ''),
        ctx: { payment_id: paymentId, actions },
        collapseVars: { payment_id: paymentId ?? '' },
      };
    },
  });
}

async function expenseAudience(tx: pg.PoolClient, routed: RoutedEvent): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT s.user_id FROM expense_shares s JOIN expenses e ON e.id = s.expense_id
      WHERE s.expense_id = $1 AND s.computed_minor > 0 AND s.user_id <> e.created_by
        AND e.deleted_at IS NULL`,
    [str(routed, 'expense_id')],
  );
  return rows.map((row) => row.user_id);
}

export function registerMoneyPushes(): void {
  registerNotification({
    key: 'money_event',
    event: 'expense.added',
    audience: expenseAudience,
    async compose(tx, routed, uid) {
      const { rows } = await tx.query<{
        crew: string;
        payer_id: string;
        amount_minor: string;
        currency: string;
        what: string;
        share: string | null;
        crew_currency: string;
      }>(
        `SELECT c.name AS crew, e.payer_id, e.amount_minor::text, e.currency,
                coalesce(e.merchant, nullif(e.description, ''), e.category) AS what,
                s.crew_computed_minor::text AS share, e.crew_currency
           FROM expenses e JOIN crews c ON c.id = e.crew_id
           LEFT JOIN expense_shares s ON s.expense_id = e.id AND s.user_id = $2
          WHERE e.id = $1 AND e.deleted_at IS NULL`,
        [str(routed, 'expense_id'), uid],
      );
      const row = rows[0];
      if (row?.share === null || row === undefined) return null;
      const amountOf = await amountsFor(tx, uid);
      return {
        title: MONEY_PUSH_TITLE,
        body: MONEY_PUSH_BODY.expense_added,
        vars: {
          crew: row.crew,
          payer: await firstName(tx, row.payer_id),
          amount: amountOf(row.amount_minor, row.currency),
          what: row.what,
          share: amountOf(row.share, row.crew_currency),
        },
        sender: DEFAULT_SETUP_GUIDE,
        crewId: routed.crewId,
        tripId: routed.tripId,
        deepLink: expenseLink(str(routed, 'expense_id') ?? ''),
        classContext: { small: true },
      };
    },
  });
  paymentPush('payment.requested', 'requested', 'payer', ['MARK_PAID']);
  paymentPush('payment.nudged', 'nudged', 'payer', ['MARK_PAID']);
  paymentPush('payment.marked_paid', 'marked_paid', 'payee', ['CONFIRM']);
  paymentPush('payment.confirmed', 'confirmed', 'payer', []);
  paymentPush('payment.disputed', 'disputed', 'payer', ['MARK_PAID']);
  registerNotification({
    key: 'money_event',
    event: 'payment.reminded',
    async audience(tx, routed) {
      const ids = routed.payload['payment_ids'];
      if (!Array.isArray(ids) || ids.length === 0) return [];
      const { rows } = await tx.query<{ from_id: string }>(
        `SELECT DISTINCT from_id FROM payments
          WHERE id = ANY($1::uuid[]) AND status IN ('pending', 'requested')`,
        [ids],
      );
      return rows.map((row) => row.from_id);
    },
    async compose(tx, routed, uid) {
      const ids = routed.payload['payment_ids'];
      const { rows } = await tx.query<PaymentFacts & { id: string }>(
        `SELECT p.id, c.name AS crew, p.from_id, p.to_id, p.amount_minor::text, p.currency,
                p.status, p.trip_id
           FROM payments p JOIN crews c ON c.id = p.crew_id
          WHERE p.id = ANY($1::uuid[]) AND p.from_id = $2 AND p.status IN ('pending', 'requested')
          ORDER BY p.amount_minor DESC LIMIT 1`,
        [Array.isArray(ids) ? ids : [], uid],
      );
      const facts = rows[0];
      if (facts === undefined) return null;
      const amountOf = await amountsFor(tx, uid);
      return {
        title: MONEY_PUSH_TITLE,
        body: MONEY_PUSH_BODY.reminded,
        vars: {
          crew: facts.crew,
          payee: await firstName(tx, facts.to_id),
          amount: amountOf(facts.amount_minor, facts.currency),
        },
        sender: DEFAULT_SETUP_GUIDE,
        crewId: routed.crewId,
        tripId: facts.trip_id,
        deepLink: paymentLink(facts.id),
        ctx: { payment_id: facts.id, actions: ['MARK_PAID'] },
      };
    },
  });
  registerNotification({
    key: 'settled_reward',
    event: 'trip.settled',
    audience: (_tx, routed) => {
      const ids = routed.payload['user_ids'];
      return Promise.resolve(
        Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [],
      );
    },
    compose: (_tx, routed) =>
      Promise.resolve({
        title: SETTLED_PUSH.title,
        body: SETTLED_PUSH.body,
        sender: DEFAULT_SETUP_GUIDE,
        crewId: routed.crewId,
        tripId: routed.tripId,
        deepLink: settleLink(),
        ctx: { reward: 'settled', granted_at: str(routed, 'granted_at') },
      }),
    // Once per member per trip, whichever confirm cleared it.
    dedupeKey: (routed, uid) => `settled_reward:${routed.tripId ?? ''}:${uid}`,
  });
}
