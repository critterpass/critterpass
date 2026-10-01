/**
 * A storm swap's Viator booking moves truthfully, with Viator's published Partner API samples
 * served at the network boundary (the live sandbox check waits on our Viator access): only the
 * original booker holds the new date, pays it in Viator's form (`book_activity`), and the old
 * booking is cancelled only after the new one is confirmed. A refused payment (the published book
 * sample with its item REJECTED) leaves the old booking confirmed and never calls cancel.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { generateUuidV7 } from '@cp/domain';
import { createSupplierHttp, createViatorAdapter, VIATOR_SANDBOX_URL } from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDisruptionCommands } from '../../src/commands/disruptions';
import { registerSupplierCommands } from '../../src/commands/suppliers';
import {
  buildMoneyCrew,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from '../money/money-harness';
import { errorOf, type SignedIn } from '../setup/setup-harness';

const FIXTURES = path.resolve(
  import.meta.dirname,
  '../../../../packages/suppliers/test/viator/fixtures',
);
const served: Record<string, string> = {
  '/partner/bookings/cart/hold': 'cart-hold-viator-form.json',
  '/partner/bookings/cart/book': 'cart-book-viator-form.json',
  '/partner/bookings/BR-593038025/cancel-quote': 'cancel-quote.json',
  '/partner/bookings/BR-593038025/cancel': 'cancel.json',
};
const calls: string[] = [];
let refuseBooking = false;

function viatorFetch(input: string | URL): Promise<Response> {
  const pathname = new URL(input).pathname;
  calls.push(pathname);
  const file = served[pathname];
  if (file === undefined) return Promise.reject(new Error(`nothing served for ${pathname}`));
  const body = JSON.parse(readFileSync(path.join(FIXTURES, file), 'utf8')) as {
    items?: { status?: string }[];
  };
  if (pathname.endsWith('/cart/book') && refuseBooking) {
    for (const item of body.items ?? []) item.status = 'REJECTED';
  }
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

const port = createViatorAdapter({
  http: createSupplierHttp({
    fetch: viatorFetch,
    audit: () => Promise.resolve(),
    sleep: () => Promise.resolve(),
  }),
  config: { apiKey: 'sandbox-key', baseUrl: VIATOR_SANDBOX_URL, hostingUrl: 'https://pay.test' },
});
const now = () => new Date('2023-07-21T00:00:00Z');

let harness: MoneyHarness;
let crew: MoneyCrew;
const members = () => crew.members as [SignedIn, SignedIn, SignedIn];

async function bookActivity(who: SignedIn, holdId: string): Promise<void> {
  const booked = await harness.run(who, 'book_activity', {
    hold_id: holdId,
    title: 'Nusa Penida boat',
    traveller_details: { first_name: 'Ana', last_name: 'Lee', phone: '+6591234567' },
    payment_session_ref: 'form-token',
  });
  expect(booked.status, JSON.stringify(booked.body)).toBe(200);
}

/** A confirmed Viator booking made the normal way, and a storm swap waiting on its booker. */
async function stormWithBooking(): Promise<{ storm: string; oldOrder: string }> {
  const [booker, maya] = members();
  const oldOrder = generateUuidV7();
  const held = await harness.run(booker, 'hold_activity', {
    hold_id: oldOrder,
    trip_id: crew.tripId,
    offer_ref: '5010SYDNEY',
    option_code: 'TG1',
    date: '2026-10-16',
    time: '09:00',
    pax: [{ age_band: 'ADULT', count: 2 }],
    participant_ids: [booker.uid, maya.uid],
    stable_id: generateUuidV7(),
    currency: 'AUD',
  });
  expect(held.status, JSON.stringify(held.body)).toBe(200);
  await bookActivity(booker, oldOrder);
  const options = [
    {
      id: 'swap',
      label: 'Swap Friday and Saturday',
      supplier: 'viator_rebook',
      supplier_move: {
        state: 'awaiting_booker_payment',
        old_order_id: oldOrder,
        new_date: '2026-10-17',
      },
    },
  ];
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO disruptions (trip_id, kind, cause, dedupe_key, title, options)
     VALUES ($1, 'storm', 'rough_seas', $2, 'Rough seas Friday', $3) RETURNING id`,
    [crew.tripId, `storm:${generateUuidV7()}`, JSON.stringify(options)],
  );
  return { storm: rows[0]?.id as string, oldOrder };
}

async function status(orderId: string): Promise<string> {
  const { rows } = await harness.pool.query<{ status: string }>(
    'SELECT status FROM supplier_orders WHERE id = $1',
    [orderId],
  );
  return rows[0]?.status ?? 'missing';
}

async function move(stormId: string): Promise<Record<string, unknown>> {
  const { rows } = await harness.pool.query<{
    options: { supplier_move: Record<string, unknown> }[];
  }>('SELECT options FROM disruptions WHERE id = $1', [stormId]);
  return rows[0]?.options[0]?.supplier_move ?? {};
}

beforeAll(async () => {
  harness = await startMoneyHarness((registry) => {
    registerSupplierCommands(registry, {
      http: createSupplierHttp({ fetch: viatorFetch, audit: () => Promise.resolve() }),
      links: {},
      port,
      now,
    });
    registerDisruptionCommands(registry, { port, now });
  });
  crew = await buildMoneyCrew(harness, 3);
  await harness.pool.query(
    "UPDATE ops.partner_adapters SET enabled = true WHERE partner = 'viator_booking'",
  );
  await harness.pool.query(
    `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
     VALUES ('USD', 'AUD', 1.5, '2026-10-14', 'test-aud')`,
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('hold_storm_seats', () => {
  it("is the original booker's alone", async () => {
    const { storm } = await stormWithBooking();
    const response = await harness.run(members()[1], 'hold_storm_seats', {
      disruption_id: storm,
      hold_id: generateUuidV7(),
    });
    expect(errorOf(response).code).toBe('FORBIDDEN');
  });

  it('cancels the old booking only after the new one is confirmed', async () => {
    const { storm, oldOrder } = await stormWithBooking();
    const newOrder = generateUuidV7();
    const start = calls.length;
    const held = await harness.run(members()[0], 'hold_storm_seats', {
      disruption_id: storm,
      hold_id: newOrder,
    });
    expect(held.status, JSON.stringify(held.body)).toBe(200);
    expect(await status(oldOrder)).toBe('confirmed');
    expect(await move(storm)).toMatchObject({
      state: 'awaiting_booker_payment',
      new_order_id: newOrder,
    });
    await bookActivity(members()[0], newOrder);
    expect(await status(newOrder)).toBe('confirmed');
    expect(await status(oldOrder)).toBe('cancelled');
    const made = calls.slice(start).map((call) => call.split('/').at(-1));
    expect(made).toEqual(['hold', 'book', 'cancel-quote', 'cancel']);
    expect(await move(storm)).toMatchObject({ state: 'moved' });
  });

  it('keeps the old booking when the payment is refused', async () => {
    const { storm, oldOrder } = await stormWithBooking();
    const newOrder = generateUuidV7();
    await harness.run(members()[0], 'hold_storm_seats', {
      disruption_id: storm,
      hold_id: newOrder,
    });
    refuseBooking = true;
    const start = calls.length;
    await harness.run(members()[0], 'book_activity', {
      hold_id: newOrder,
      title: 'Nusa Penida boat',
      traveller_details: { first_name: 'Ana', last_name: 'Lee', phone: '+6591234567' },
      payment_session_ref: 'form-token',
    });
    refuseBooking = false;
    expect(await status(newOrder)).toBe('rejected');
    expect(await status(oldOrder)).toBe('confirmed');
    expect(calls.slice(start).some((call) => call.includes('cancel'))).toBe(false);
  });
});
