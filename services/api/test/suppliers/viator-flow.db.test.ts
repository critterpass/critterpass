/**
 * The Viator order flow on the real stack, with Viator's published Partner API samples served at
 * the network boundary (sandbox recordings replace them once access is approved). Off, nothing
 * reaches Viator. On: a hold is kept only when it leaves the crew time to vote (a 20-minute hold is
 * "book when agreed"), says "held" only for what is held, arms its expiry timer and pulls a vote on
 * the held item in before it lapses; booking lands in the wallet with its expense exactly once,
 * however often it is replayed; a lost booking answer waits for the status poll, which walks it
 * through "Waiting for the operator" to confirmed; cancelling needs the refund quote first; a
 * release ends the hold; and a plan change cannot move a Viator booking.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { withSystem } from '@cp/db';
import {
  clampClosesAt,
  generateUuidV7,
  type BookActivityResult,
  type HoldActivityResult,
} from '@cp/domain';
import { createSupplierHttp, createViatorAdapter, VIATOR_SANDBOX_URL } from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerSupplierCommands } from '../../src/commands/suppliers';
import { queryIn } from '../../src/plan/providers';
import { registerCancelQuoteRoute } from '../../src/suppliers/cancel-quote';
import { registerOrderRoutes } from '../../src/suppliers/order-routes';
import { supplierBookingImpact, supplierHoldExpiry } from '../../src/suppliers/plan-providers';
import { settleFromSupplier } from '../../src/suppliers/settle-door';
import {
  buildMoneyCrew,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from '../money/money-harness';
import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';

const FIXTURES = path.resolve(
  import.meta.dirname,
  '../../../../packages/suppliers/test/viator/fixtures',
);
/** The published hold sample's price hold (availability is not held). */
const PRICE_HELD_UNTIL = new Date('2023-07-21T03:17:37.494Z');

const served: Record<string, string> = {
  '/partner/bookings/cart/hold': 'cart-hold-viator-form.json',
  '/partner/bookings/cart/book': 'cart-book-viator-form.json',
  '/partner/bookings/status': 'booking-status-1.json',
  '/partner/bookings/BR-593038025/cancel-quote': 'cancel-quote.json',
  '/partner/bookings/BR-593038025/cancel': 'cancel.json',
};
const calls: string[] = [];
let bookLost = false;
let clock = new Date(PRICE_HELD_UNTIL.getTime() - 3 * 3_600_000);

function viatorFetch(input: string | URL): Promise<Response> {
  const pathname = new URL(input).pathname;
  calls.push(pathname);
  if (pathname.endsWith('/cart/book') && bookLost)
    return Promise.reject(new Error('socket hang up'));
  const file = served[pathname];
  if (file === undefined) return Promise.reject(new Error(`nothing served for ${pathname}`));
  return Promise.resolve(
    new Response(readFileSync(path.join(FIXTURES, file), 'utf8'), { status: 200 }),
  );
}

const port = createViatorAdapter({
  http: createSupplierHttp({
    fetch: viatorFetch,
    audit: () => Promise.resolve(),
    sleep: () => Promise.resolve(),
  }),
  config: { apiKey: 'sandbox-key', baseUrl: VIATOR_SANDBOX_URL, hostingUrl: 'https://pay.test' },
});
const now = () => clock;

let harness: MoneyHarness;
let crew: MoneyCrew;

beforeAll(async () => {
  harness = await startMoneyHarness(
    (registry) =>
      registerSupplierCommands(registry, {
        http: createSupplierHttp({ fetch: viatorFetch, audit: () => Promise.resolve() }),
        links: {},
        port,
        now,
      }),
    (app, deps) => {
      registerOrderRoutes(app, { ...deps, port, now });
      registerCancelQuoteRoute(app, { ...deps, port });
    },
  );
  crew = await buildMoneyCrew(harness, 3);
  await harness.pool.query(
    `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
     VALUES ('USD', 'AUD', 1.5, '2026-10-14', 'test-aud')`,
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const members = () => crew.members as [SignedIn, SignedIn, SignedIn];

async function viatorSwitch(on: boolean): Promise<void> {
  await harness.pool.query(
    "UPDATE ops.partner_adapters SET enabled = $1 WHERE partner = 'viator_booking'",
    [on],
  );
}

function hold(extra: Record<string, unknown> = {}) {
  const [organiser, maya] = members();
  return {
    hold_id: generateUuidV7(),
    trip_id: crew.tripId,
    offer_ref: '5010SYDNEY',
    option_code: 'TG1',
    date: '2026-10-13',
    time: '09:00',
    pax: [{ age_band: 'ADULT', count: 2 }],
    participant_ids: [organiser.uid, maya.uid],
    stable_id: generateUuidV7(),
    currency: 'AUD',
    ...extra,
  };
}

function book(holdId: string) {
  return {
    hold_id: holdId,
    title: 'Sydney harbour walk',
    traveller_details: { first_name: 'Ana', last_name: 'Lee', phone: '+6591234567' },
    payment_session_ref: 'form-token',
  };
}

async function order(id: string) {
  const { rows } = await harness.pool.query(
    `SELECT status, hold_valid_until, total_minor::int AS total, currency, voucher_booking_id
       FROM supplier_orders WHERE id = $1`,
    [id],
  );
  return rows[0] as Record<string, unknown>;
}

async function held(extra: Record<string, unknown> = {}): Promise<string> {
  const payload = hold(extra);
  const response = await harness.run(members()[0], 'hold_activity', payload);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return payload.hold_id;
}

describe('with the Viator switch off', () => {
  it('answers SUPPLIER_UNAVAILABLE and never calls Viator', async () => {
    await viatorSwitch(false);
    const before = calls.length;
    const response = await harness.run(members()[0], 'hold_activity', hold());
    expect(errorOf(response)).toMatchObject({
      code: 'SUPPLIER_UNAVAILABLE',
      detail: { reason: 'flag_off' },
    });
    expect(calls.length).toBe(before);
  });
});

describe('holding', () => {
  beforeAll(() => viatorSwitch(true));

  it('keeps a price hold that leaves time to vote, says only the price is held, and arms its expiry', async () => {
    clock = new Date(PRICE_HELD_UNTIL.getTime() - 3 * 3_600_000);
    const payload = hold();
    const result = resultOf<HoldActivityResult>(
      await harness.run(members()[0], 'hold_activity', payload),
    );
    expect(result).toMatchObject({
      status: 'hold_not_provided',
      hold_provided: false,
      seats_held_until: null,
      price_held_until: '2023-07-21T03:17:37.494535Z',
      book_when_agreed: false,
      total: { amount_minor: 1252, currency: 'AUD' },
    });
    expect((await order(payload.hold_id))['hold_valid_until']).toEqual(PRICE_HELD_UNTIL);
    const timers = await harness.pool.query(
      "SELECT due_at FROM scheduled_events WHERE kind = 'supplier.hold_expiry' AND ref_id = $1",
      [payload.hold_id],
    );
    expect(timers.rows).toEqual([{ due_at: new Date(PRICE_HELD_UNTIL.getTime() - 2 * 60_000) }]);

    // A vote on the held item closes before the hold lapses.
    const deadline = await withSystem(harness.pool, (tx) =>
      supplierHoldExpiry.earliestHoldExpiry({
        tripId: crew.tripId,
        stableIds: [payload.stable_id],
        bookingIds: [],
        query: queryIn(tx),
      }),
    );
    const closesAt = clampClosesAt(new Date(PRICE_HELD_UNTIL.getTime() + 86_400_000), deadline);
    expect(closesAt.getTime()).toBeLessThanOrEqual(PRICE_HELD_UNTIL.getTime());
  });

  it('keeps no hold that would lapse within 20 minutes: book when agreed', async () => {
    clock = new Date(PRICE_HELD_UNTIL.getTime() - 20 * 60_000);
    const payload = hold();
    const result = resultOf<HoldActivityResult>(
      await harness.run(members()[0], 'hold_activity', payload),
    );
    expect(result).toMatchObject({
      status: 'hold_not_provided',
      hold_provided: false,
      price_held_until: null,
      book_when_agreed: true,
    });
    expect((await order(payload.hold_id))['hold_valid_until']).toBeNull();
    const timers = await harness.pool.query('SELECT 1 FROM scheduled_events WHERE ref_id = $1', [
      payload.hold_id,
    ]);
    expect(timers.rowCount).toBe(0);
  });

  it('refuses someone outside the trip', async () => {
    const outsider = await harness.signIn();
    const response = await harness.run(outsider, 'hold_activity', hold());
    expect(errorOf(response).code).toBe('NOT_FOUND');
  });

  it('releases a hold and disarms its timer', async () => {
    clock = new Date(PRICE_HELD_UNTIL.getTime() - 3 * 3_600_000);
    const id = await held();
    const released = await harness.run(members()[0], 'release_activity_hold', { hold_id: id });
    expect(resultOf<{ status: string }>(released).status).toBe('released');
    const timers = await harness.pool.query(
      'SELECT status FROM scheduled_events WHERE ref_id = $1',
      [id],
    );
    expect(timers.rows).toEqual([{ status: 'cancelled' }]);
    const payment = await harness.request(`/v1/suppliers/payment-session/${id}`, {
      headers: { cookie: members()[0].cookie },
    });
    expect(payment.status).toBe(409);
  });
});

describe('booking', () => {
  beforeAll(() => viatorSwitch(true));

  it('books once into the wallet with its expense, however often it is replayed', async () => {
    clock = new Date(PRICE_HELD_UNTIL.getTime() - 3 * 3_600_000);
    const id = await held();
    const session = await harness.request(`/v1/suppliers/payment-session/${id}`, {
      headers: { cookie: members()[0].cookie },
    });
    expect(session.status).toBe(200);
    expect((await order(id))['status']).toBe('awaiting_payment');

    const first = resultOf<BookActivityResult>(
      await harness.run(members()[0], 'book_activity', book(id)),
    );
    expect(first).toMatchObject({ status: 'confirmed' });
    const booksBefore = calls.filter((c) => c.endsWith('/cart/book')).length;
    const again = resultOf<BookActivityResult>(
      await harness.run(members()[0], 'book_activity', book(id), { opId: generateUuidV7() }),
    );
    expect(again).toMatchObject({ status: 'confirmed', booking_id: first.booking_id });
    expect(calls.filter((c) => c.endsWith('/cart/book')).length).toBe(booksBefore);

    const wallet = await harness.pool.query(
      `SELECT b.source, b.supplier, b.supplier_ref, b.status, b.title, b.paid_by,
              b.price_minor::int AS price, b.currency, count(e.id)::int AS expenses
         FROM bookings b LEFT JOIN expenses e ON e.booking_id = b.id AND e.deleted_at IS NULL
        WHERE b.supplier_order_id = $1 GROUP BY b.id`,
      [id],
    );
    expect(wallet.rows).toEqual([
      {
        source: 'viator',
        supplier: 'viator',
        supplier_ref: 'BR-593038025',
        status: 'booked',
        title: 'Sydney harbour walk',
        paid_by: members()[0].uid,
        price: 1252,
        currency: 'AUD',
        expenses: 1,
      },
    ]);
  });

  it('refuses to book a hold that has lapsed', async () => {
    clock = new Date(PRICE_HELD_UNTIL.getTime() - 3 * 3_600_000);
    const id = await held();
    clock = new Date(PRICE_HELD_UNTIL.getTime() + 60_000);
    expect(errorOf(await harness.run(members()[0], 'book_activity', book(id))).code).toBe(
      'HOLD_EXPIRED',
    );
  });

  it('waits for the status poll when the booking answer is lost, through pending to confirmed', async () => {
    clock = new Date(PRICE_HELD_UNTIL.getTime() - 3 * 3_600_000);
    const id = await held();
    bookLost = true;
    const lost = resultOf<BookActivityResult>(
      await harness.run(members()[0], 'book_activity', book(id)),
    );
    bookLost = false;
    expect(lost.status).toBe('booking');

    served['/partner/bookings/status'] = 'booking-status-2.json';
    const pending = await settleFromSupplier(harness.pool, port, id, clock);
    expect(pending?.status).toBe('pending_operator');
    const waiting = await harness.pool.query<{ next_poll_at: Date; status: string }>(
      `SELECT o.next_poll_at, b.status FROM supplier_orders o
         JOIN bookings b ON b.id = o.voucher_booking_id WHERE o.id = $1`,
      [id],
    );
    expect(waiting.rows[0]?.status).toBe('pending_operator');
    expect((waiting.rows[0]?.next_poll_at as Date).getTime()).toBeGreaterThanOrEqual(
      clock.getTime() + 3 * 60_000,
    );

    served['/partner/bookings/status'] = 'booking-status-1.json';
    const confirmed = await settleFromSupplier(harness.pool, port, id, clock);
    expect(confirmed).toMatchObject({ status: 'confirmed' });
    expect(confirmed?.expenseId).not.toBeNull();
  });
});

describe('cancelling and plan changes', () => {
  beforeAll(() => viatorSwitch(true));

  async function confirmed(): Promise<{ id: string; bookingId: string }> {
    clock = new Date(PRICE_HELD_UNTIL.getTime() - 3 * 3_600_000);
    const id = await held();
    const result = resultOf<BookActivityResult>(
      await harness.run(members()[0], 'book_activity', book(id)),
    );
    return { id, bookingId: result.booking_id ?? '' };
  }

  it('needs the refund quote first, then cancels with a full refund', async () => {
    const { id } = await confirmed();
    const early = await harness.run(members()[0], 'cancel_activity_booking', {
      booking_id: id,
      reason_code: 'Customer_Service.I_canceled_my_entire_trip',
    });
    expect(errorOf(early)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'quote_first' },
    });

    const quote = await harness.request(`/v1/suppliers/bookings/${id}/cancel-quote`, {
      headers: { cookie: members()[0].cookie },
    });
    expect(await quote.json()).toMatchObject({
      cancellable: true,
      refund: { amount_minor: 6020, currency: 'AUD' },
      refund_percentage: 100,
    });
    const cancelled = await harness.run(
      members()[0],
      'cancel_activity_booking',
      { booking_id: id, reason_code: 'Customer_Service.I_canceled_my_entire_trip' },
      { opId: generateUuidV7() },
    );
    expect(resultOf(cancelled)).toMatchObject({ status: 'cancelled', refunded: true });
    const wallet = await harness.pool.query(
      'SELECT status FROM bookings WHERE supplier_order_id = $1',
      [id],
    );
    expect(wallet.rows).toEqual([{ status: 'cancelled' }]);
  });

  it('lets no one else ask for the quote', async () => {
    const { id } = await confirmed();
    const quote = await harness.request(`/v1/suppliers/bookings/${id}/cancel-quote`, {
      headers: { cookie: members()[2].cookie },
    });
    expect(quote.status).toBe(404);
  });

  it('blocks a plan change that moves a Viator booking and asks the organiser to cancel one removed', async () => {
    const { bookingId } = await confirmed();
    const stable = generateUuidV7();
    const impacts = await withSystem(harness.pool, (tx) =>
      supplierBookingImpact.impactOf({
        tripId: crew.tripId,
        ops: [
          {
            op: 'retime',
            target: stable,
            reason: 'later',
            affected_user_ids: [],
            booking_impact: true,
          },
          {
            op: 'remove',
            target: stable,
            reason: 'drop',
            affected_user_ids: [],
            booking_impact: true,
          },
        ],
        bookedItems: new Map([[stable, bookingId]]),
        query: queryIn(tx),
      }),
    );
    expect(impacts.map((impact) => [impact.kind, impact.blocked])).toEqual([
      ['reschedule', true],
      ['cancel', false],
    ]);
  });
});
