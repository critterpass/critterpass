/**
 * Finding a driver on the real stack, with the model's recorded reply at the network boundary: a
 * shared message is read into a card whose fields point at the words they came from, the card
 * reaches the crew's shortlist only once every line is confirmed, a day set on one driver is TAKEN
 * for another, NOT NOW is the caller's own, and private tours never store supplier content.
 * Outsiders get nothing.
 */
import { generateUuidV7, type IntakeReadResult } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDriverCommands } from '../../src/commands/drivers';
import { registerDriverRoutes } from '../../src/routes/drivers';
import {
  buildMoneyCrew,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from '../money/money-harness';
import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';

const MESSAGE =
  'Hi, Made here, driver in Ubud 12 yrs. Avanza 6 pax. Full day 10 hrs Rp 650k incl petrol + parking. English OK. WA +62 812 0000 0101';

/**
 * DeepSeek's reply to this message, as recorded from the `provider.extract` route
 * (`packages/ai/evals/provider-extract/recordings/bali-made-basic.json`).
 */
const RECORDED_REPLY = {
  name: { value: 'Made', quote: 'Made here' },
  phone: { value: '+62 812 0000 0101', quote: 'WA +62 812 0000 0101' },
  area: { value: 'Ubud', quote: 'driver in Ubud' },
  languages: { value: ['en'], quote: 'English OK' },
  car: { value: 'Avanza', seats: 6, quote: 'Avanza 6 pax' },
  prices: [
    {
      amount: 650000,
      amount_max: null,
      currency: 'IDR',
      unit: 'day',
      per: 'group',
      hours: 10,
      car: null,
      seats: null,
      from: false,
      quote: 'Full day 10 hrs Rp 650k',
    },
  ],
  includes: {
    fuel: 'yes',
    parking: 'yes',
    tolls: 'unknown',
    entry: 'unknown',
    quote: 'incl petrol + parking',
  },
  overtime: null,
  licence_shown: null,
  unreadable: [],
  cut_off: false,
};
const BY_VEHICLE_MESSAGE =
  'Sedan up to 3 pax 550k/day, Hiace up to 10 pax 950k/day. Driver Rai 0812 0000 3939';

/** The recorded reply to the message priced by vehicle (`generic-tiers-without-party.json`). */
const price = (amount: number, car: string, seats: number, quote: string) => ({
  amount,
  amount_max: null,
  currency: 'IDR',
  unit: 'day',
  per: 'group',
  hours: null,
  car,
  seats,
  from: false,
  quote,
});
const RECORDED_BY_VEHICLE = {
  name: { value: 'Rai', quote: 'Driver Rai' },
  phone: { value: '0812 0000 3939', quote: '0812 0000 3939' },
  area: null,
  languages: null,
  car: { value: null, seats: null, quote: '' },
  prices: [
    price(550000, 'Sedan', 3, 'Sedan up to 3 pax 550k/day'),
    price(950000, 'Hiace', 10, 'Hiace up to 10 pax 950k/day'),
  ],
  includes: { fuel: 'unknown', parking: 'unknown', tolls: 'unknown', entry: 'unknown', quote: '' },
  overtime: null,
  licence_shown: null,
  unreadable: [],
  cut_off: false,
};
const prompts: string[] = [];
const gateway = {
  callModel: (_route: string, input: { messages: unknown }) => {
    const prompt = JSON.stringify(input.messages);
    prompts.push(prompt);
    const reply = prompt.includes('Driver Rai') ? RECORDED_BY_VEHICLE : RECORDED_REPLY;
    return Promise.resolve({
      message: { content: [{ type: 'text', text: JSON.stringify(reply) }] },
    });
  },
} as unknown as Parameters<typeof registerDriverRoutes>[1]['gateway'];

let harness: MoneyHarness;
let crew: MoneyCrew;
let outsider: SignedIn;
const members = () => crew.members as [SignedIn, SignedIn, SignedIn];

beforeAll(async () => {
  harness = await startMoneyHarness(
    (registry) => registerDriverCommands(registry, { keyring: undefined }),
    (app, deps) =>
      registerDriverRoutes(app, {
        pool: deps.pool,
        sessions: deps.sessions,
        keyring: undefined,
        gateway,
        viator: undefined,
      }),
  );
  crew = await buildMoneyCrew(harness, 3);
  outsider = await harness.signIn();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function json<T>(session: SignedIn, path: string, init: RequestInit = {}) {
  const response = await harness.request(path, {
    ...init,
    headers: { cookie: session.cookie, 'content-type': 'application/json' },
  });
  return { status: response.status, body: (await response.json()) as T };
}

async function shareAndRead(
  by: SignedIn,
  text: string = MESSAGE,
): Promise<{ intakeId: string; read: IntakeReadResult }> {
  const intakeId = generateUuidV7();
  const shared = await harness.run(by, 'share_provider_intake', {
    intake_id: intakeId,
    trip_id: crew.tripId,
    kind: 'text',
    text,
  });
  expect(shared.status).toBe(200);
  const read = await json<IntakeReadResult>(by, `/v1/drivers/intake/${intakeId}/read`, {
    method: 'POST',
  });
  expect(read.status).toBe(200);
  return { intakeId, read: read.body };
}

describe('find a driver', () => {
  it('reads a shared message into a card whose fields point at their words, for the crew only', async () => {
    const [organiser, member] = members();
    const { intakeId, read } = await shareAndRead(member);
    expect(read.status).toBe('parsed');
    expect(read.parsed?.card).toMatchObject({ name: 'Made', phone: '+6281200000101', seats: 6 });
    const [start, end] = read.parsed?.spans.price ?? [0, 0];
    expect(MESSAGE.slice(start, end)).toBe('Full day 10 hrs Rp 650k');
    expect(prompts.at(-1)).toContain('Rp 650k');

    const list = await json<{ intake: { id: string; status: string }[] }>(
      organiser,
      `/v1/drivers?trip_id=${crew.tripId}`,
    );
    expect(list.body.intake.find((item) => item.id === intakeId)?.status).toBe('parsed');
    expect((await json(outsider, `/v1/drivers?trip_id=${crew.tripId}`)).status).toBe(404);
    expect(
      (await json(outsider, `/v1/drivers/intake/${intakeId}/read`, { method: 'POST' })).status,
    ).toBe(404);
  });

  it('picks the price for the crew when a driver prices by vehicle', async () => {
    const [, member] = members();
    const seated = await harness.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM trip_participants WHERE trip_id = $1 AND holds_seat',
      [crew.tripId],
    );
    expect(seated.rows[0]?.n).toBe(3);
    const { read } = await shareAndRead(member, BY_VEHICLE_MESSAGE);
    // Three travel: the sedan carries them, and the van stays listed as his other price.
    expect(read.parsed?.card).toMatchObject({
      name: 'Rai',
      car: 'Sedan',
      seats: 3,
      price_minor: 55000000,
      currency: 'IDR',
      price_unit: 'day',
    });
    expect(read.parsed?.card.price_ask).toBeUndefined();
    expect(read.parsed?.card.price_tiers?.map((tier) => [tier.seats, tier.price_minor])).toEqual([
      [3, 55000000],
      [10, 95000000],
    ]);
    const [start, end] = read.parsed?.spans.price ?? [0, 0];
    expect(BY_VEHICLE_MESSAGE.slice(start, end)).toBe('Sedan up to 3 pax 550k/day');
  });

  it('shortlists a driver only once every line with a value is confirmed', async () => {
    const [, member] = members();
    const { intakeId, read } = await shareAndRead(member);
    const card = read.parsed?.card;
    const providerId = generateUuidV7();
    const payload = {
      provider_id: providerId,
      trip_id: crew.tripId,
      intake_id: intakeId,
      card: { ...card, name: 'Made' },
      confirmed: ['name', 'phone', 'languages', 'car'],
    };
    const refused = await harness.run(member, 'confirm_provider_fields', payload);
    expect(errorOf(refused)).toMatchObject({
      code: 'VALIDATION',
      detail: { fields: ['price', 'includes'] },
    });
    const confirmed = await harness.run(member, 'confirm_provider_fields', {
      ...payload,
      confirmed: ['name', 'phone', 'languages', 'car', 'price', 'includes'],
    });
    expect(resultOf<{ provider_id: string }>(confirmed).provider_id).toBe(providerId);
    const { rows } = await harness.pool.query(
      `SELECT t.price_minor::text, t.currency, t.source, i.status
         FROM provider_terms t JOIN provider_intake i ON i.provider_id = t.provider_id
        WHERE t.provider_id = $1`,
      [providerId],
    );
    expect(rows[0]).toEqual({
      price_minor: '65000000',
      currency: 'IDR',
      source: 'found',
      status: 'used',
    });
  });

  it('sets a driver on days, locks them for another driver, and updates his own in place', async () => {
    const [organiser, member] = members();
    const made = generateUuidV7();
    const komang = generateUuidV7();
    for (const [id, name] of [
      [made, 'Made'],
      [komang, 'Komang'],
    ] as const) {
      await harness.run(member, 'confirm_provider_fields', {
        provider_id: id,
        trip_id: crew.tripId,
        card: { ...BARE_CARD, name },
        confirmed: ['name'],
      });
    }
    const day = (date: string, end: string) => ({
      date,
      window_start: '06:30',
      window_end: end,
      pickup: 'Villa gate',
    });
    const set = await harness.run(organiser, 'assign_provider', {
      trip_id: crew.tripId,
      provider_id: made,
      days: [day('2026-10-14', '18:00'), day('2026-10-18', '21:30')],
    });
    expect(set.status).toBe(200);
    const taken = await harness.run(organiser, 'assign_provider', {
      trip_id: crew.tripId,
      provider_id: komang,
      days: [day('2026-10-18', '20:00')],
    });
    expect(errorOf(taken)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'day_taken', dates: ['2026-10-18'] },
    });
    await harness.run(organiser, 'assign_provider', {
      trip_id: crew.tripId,
      provider_id: made,
      days: [day('2026-10-18', '22:00')],
    });
    const { rows } = await harness.pool.query(
      `SELECT to_char(day_date, 'YYYY-MM-DD') AS date, provider_id, window_end
         FROM provider_assignments WHERE trip_id = $1 ORDER BY day_date`,
      [crew.tripId],
    );
    expect(rows).toEqual([
      { date: '2026-10-14', provider_id: made, window_end: '18:00' },
      { date: '2026-10-18', provider_id: made, window_end: '22:00' },
    ]);
    const outside = await harness.run(outsider, 'assign_provider', {
      trip_id: crew.tripId,
      provider_id: made,
      days: [day('2026-10-15', '18:00')],
    });
    expect(errorOf(outside).code).toBe('NOT_FOUND');
  });

  it("keeps NOT NOW as the caller's own, once", async () => {
    const [organiser, member] = members();
    const payload = { trip_id: crew.tripId, date: '2026-10-16' };
    await harness.run(member, 'dismiss_pickup_gap', payload);
    await harness.run(member, 'dismiss_pickup_gap', payload);
    const { rows } = await harness.pool.query(
      'SELECT user_id FROM pickup_gap_dismissals WHERE trip_id = $1',
      [crew.tripId],
    );
    expect(rows).toEqual([{ user_id: member.uid }]);
    expect(organiser.uid).not.toBe(member.uid);
  });

  it('answers private tours as partner link rows while the APIs are off, storing nothing', async () => {
    const [organiser] = members();
    const before = await harness.pool.query('SELECT count(*)::int AS n FROM provider_terms');
    const tours = await json<{ cards: unknown[]; links: { partner: string; api: boolean }[] }>(
      organiser,
      `/v1/drivers/private-tours?trip_id=${crew.tripId}&days=2026-10-14`,
    );
    expect(tours.status).toBe(200);
    expect(tours.body.cards).toEqual([]);
    expect(tours.body.links.map((link) => [link.partner, link.api])).toEqual([
      ['klook', false],
      ['viator', false],
    ]);
    const after = await harness.pool.query('SELECT count(*)::int AS n FROM provider_terms');
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});

const BARE_CARD = {
  name: 'Made',
  phone: null,
  area: null,
  languages: [],
  car: null,
  seats: null,
  price_minor: null,
  currency: null,
  price_unit: null,
  included_hours: null,
  includes: {},
  overtime_minor: null,
  licence_shown: null,
};
