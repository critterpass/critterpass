import { describe, expect, it } from 'vitest';

import {
  validateProviderReply,
  type PriceOfferReply,
  type ProviderExtractReply,
} from '../src/routes/provider-extract';

const MESSAGE =
  'Hi, Made here, driver in Ubud 12 yrs. Avanza 6 pax. Full day 10 hrs Rp 650k incl petrol + parking. English OK. WA +62 812 0000 0101';
const options = {
  minorPerMajor: (currency: string) => ({ IDR: 100, USD: 100, JPY: 1 })[currency] ?? null,
  currencyHint: 'IDR',
  callingCode: '62',
};

const offer = (overrides: Partial<PriceOfferReply> = {}): PriceOfferReply => ({
  amount: 650_000,
  amount_max: null,
  currency: 'IDR',
  unit: 'day',
  per: 'group',
  hours: 10,
  car: null,
  seats: null,
  from: false,
  quote: 'Full day 10 hrs Rp 650k',
  ...overrides,
});

const reply = (overrides: Partial<ProviderExtractReply> = {}): ProviderExtractReply => ({
  name: { value: 'Made', quote: 'Made here' },
  phone: { value: '+62 812 0000 0101', quote: '+62 812 0000 0101' },
  area: { value: 'Ubud', quote: 'driver in Ubud' },
  languages: { value: ['en'], quote: 'English OK' },
  car: { value: 'Toyota Avanza', seats: 6, quote: 'Avanza 6 pax' },
  prices: [offer()],
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
  ...overrides,
});

/** A card read from a message that holds only these price words. */
const priced = (source: string, prices: PriceOfferReply[], extra: object = {}) =>
  validateProviderReply(
    reply({ name: null, phone: null, area: null, languages: null, car: null, prices }),
    source,
    { ...options, ...extra },
  ).card;

describe('the price on the card', () => {
  it('keeps a range as its low and high end', () => {
    const card = priced('usually 600-800k per day', [
      offer({ amount: 700_000, hours: null, quote: '600-800k per day' }),
    ]);
    expect(card).toMatchObject({ price_minor: 60_000_000, price_max_minor: 80_000_000 });
  });

  it('asks instead of showing a figure the driver did not write', () => {
    const card = priced('Car 500k per day, driver fee 150k per day', [
      offer({ amount: 650_000, hours: null, quote: 'Car 500k per day, driver fee 150k per day' }),
    ]);
    expect(card).toMatchObject({
      price_minor: null,
      currency: null,
      price_ask: 'Car 500k per day, driver fee 150k per day',
    });
  });

  it('asks when two prices for the same thing disagree, and lists both', () => {
    const card = priced('Day tour 600k. Day tour 750k in high season', [
      offer({ amount: 600_000, hours: null, quote: 'Day tour 600k' }),
      offer({ amount: 750_000, hours: null, quote: 'Day tour 750k' }),
    ]);
    expect(card.price_minor).toBeNull();
    expect(card.price_ask).toBe('Day tour 600k / Day tour 750k');
    expect(card.price_tiers?.map((tier) => tier.price_minor)).toEqual([60_000_000, 75_000_000]);
  });

  it('shows one price when the model lists the same price twice', () => {
    const card = priced('Day tour 600k', [
      offer({ amount: 600_000, hours: null, quote: 'Day tour 600k' }),
      offer({ amount: 600_000, hours: null, quote: '600k' }),
    ]);
    expect(card.price_minor).toBe(60_000_000);
    expect(card.price_tiers).toBeUndefined();
  });

  const bySeats = [
    offer({
      amount: 550_000,
      hours: null,
      car: 'Sedan',
      seats: 3,
      quote: 'Sedan up to 3 pax 550k',
    }),
    offer({
      amount: 950_000,
      hours: null,
      car: 'Hiace',
      seats: 10,
      quote: 'Hiace up to 10 pax 950k',
    }),
  ];
  const seatsSource = 'Sedan up to 3 pax 550k, Hiace up to 10 pax 950k';

  it('picks the price for the smallest vehicle the crew fits, and its vehicle', () => {
    expect(priced(seatsSource, bySeats, { partySize: 2 })).toMatchObject({
      price_minor: 55_000_000,
      car: 'Sedan',
      seats: 3,
    });
    const six = priced(seatsSource, bySeats, { partySize: 6 });
    expect(six).toMatchObject({ price_minor: 95_000_000, car: 'Hiace', seats: 10 });
    expect(six.price_tiers).toHaveLength(2);
    expect(six.price_ask).toBeUndefined();
  });

  it('asks when prices differ by group size and nothing says how many travel, or none fits', () => {
    expect(priced(seatsSource, bySeats)).toMatchObject({ price_minor: null, car: null });
    expect(priced(seatsSource, bySeats).price_ask).toContain('Sedan up to 3 pax 550k');
    expect(priced(seatsSource, bySeats, { partySize: 12 }).price_minor).toBeNull();
  });

  it('shows the full day when prices differ by length, and keeps the others as tiers', () => {
    const source = 'Half day (5 hours) 400k, full day (10 hours) 700k, airport drop 300k';
    const card = priced(source, [
      offer({ amount: 400_000, unit: 'hours', hours: 5, quote: 'Half day (5 hours) 400k' }),
      offer({ amount: 700_000, quote: 'full day (10 hours) 700k' }),
      offer({ amount: 300_000, unit: 'trip', hours: null, quote: 'airport drop 300k' }),
    ]);
    expect(card).toMatchObject({ price_minor: 70_000_000, price_unit: 'day', included_hours: 10 });
    expect(card.price_tiers?.map((tier) => tier.price_unit)).toEqual(['hours', 'day', 'trip']);
  });

  it('marks a rate per hour or per person, with the minimum hours as the block', () => {
    expect(
      priced('Rp 90k/hour min 4 hours', [
        offer({
          amount: 90_000,
          unit: 'day',
          per: 'hour',
          hours: 4,
          quote: 'Rp 90k/hour min 4 hours',
        }),
      ]),
    ).toMatchObject({
      price_minor: 9_000_000,
      price_unit: 'hours',
      price_per: 'hour',
      included_hours: 4,
    });
    expect(
      priced('Rp 450k per person', [
        offer({ amount: 450_000, per: 'person', hours: null, quote: 'Rp 450k per person' }),
      ]),
    ).toMatchObject({ price_minor: 45_000_000, price_per: 'person' });
  });

  it('reads a "trip" with stated hours as a day or a block, and flags a floor', () => {
    const tour = (hours: number) =>
      priced('tour 11 hrs USD 120, short 3 hrs', [
        offer({ amount: 120, currency: 'USD', unit: 'trip', hours, from: true, quote: 'USD 120' }),
      ]);
    expect(tour(11)).toMatchObject({ price_unit: 'day', price_minor: 12_000, price_from: true });
    expect(tour(3).price_unit).toBe('hours');
    expect(tour(30).included_hours).toBeNull();
  });

  it('takes the currency the model read, else a sign in the words, else the trip currency', () => {
    const read = (currency: string | null, quote: string) =>
      priced(quote, [offer({ amount: 55, currency, hours: null, quote })]);
    expect(read('usd', '$55 per car').currency).toBe('USD');
    expect(read(null, 'USD 55 per car').currency).toBe('USD');
    expect(read(null, '55 per car')).toMatchObject({ currency: 'IDR', price_minor: 5500 });
    // A currency we cannot count in is asked about, not swapped for the trip's.
    expect(read('XYZ', '55 per car')).toMatchObject({ price_minor: null, price_ask: '55 per car' });
  });
});

describe('overtime on the card', () => {
  const overtime = (source: string, value: NonNullable<ProviderExtractReply['overtime']>) =>
    validateProviderReply(
      reply({
        name: null,
        phone: null,
        area: null,
        languages: null,
        car: null,
        prices: [],
        overtime: value,
      }),
      source,
      options,
    ).card;

  it('turns a price per 30 minutes into a price per hour and keeps the unit he used', () => {
    const source = '3時間 ¥27,000、延長30分 ¥4,500';
    const card = validateProviderReply(
      reply({
        name: null,
        phone: null,
        area: null,
        languages: null,
        car: null,
        prices: [
          offer({
            amount: 27_000,
            currency: 'JPY',
            unit: 'hours',
            hours: 3,
            quote: '3時間 ¥27,000',
          }),
        ],
        overtime: { amount: 4500, currency: 'JPY', per_minutes: null, quote: '延長30分 ¥4,500' },
      }),
      source,
      options,
    ).card;
    expect(card).toMatchObject({ overtime_minor: 9000, overtime_per_minutes: 30, currency: 'JPY' });
  });

  it('keeps overtime with no price only in the trip currency, the card currency left empty', () => {
    const said = { amount: 75_000, per_minutes: 60, quote: 'Overtime 75rb per jam' };
    const source = 'Overtime 75rb per jam setelah 10 jam';
    const card = overtime(source, { ...said, currency: null });
    expect(card).toMatchObject({ overtime_minor: 7_500_000, currency: null, price_minor: null });
    expect(card.overtime_per_minutes).toBeUndefined();
    expect(overtime(source, { ...said, currency: 'USD' }).overtime_minor).toBeNull();
  });

  it('trusts minutes the model answers only when the words hold that figure', () => {
    const quote = 'extra 50k each 20';
    const said = { amount: 50_000, currency: null, quote };
    expect(overtime(quote, { ...said, per_minutes: 20 }).overtime_minor).toBe(15_000_000);
    expect(overtime(quote, { ...said, per_minutes: 15 }).overtime_minor).toBe(5_000_000);
  });

  it('drops overtime in another currency than the price, a range, or an unwritten figure', () => {
    const other = validateProviderReply(
      reply({ overtime: { amount: 5, currency: 'USD', per_minutes: 60, quote: 'English OK' } }),
      `${MESSAGE} extra hour USD 5`,
      options,
    );
    expect(other.card.overtime_minor).toBeNull();
    expect(other.spans.overtime).toBeUndefined();
    const said = { currency: null, per_minutes: 60 };
    expect(
      overtime('50-75k per hour', { ...said, amount: 50_000, quote: '50-75k per hour' })
        .overtime_minor,
    ).toBeNull();
    expect(
      overtime('extra 50k', { ...said, amount: 60_000, quote: 'extra 50k' }).overtime_minor,
    ).toBeNull();
  });

  it('does not read the overtime line as a second price', () => {
    const source = '3時間 ¥27,000、延長30分 ¥4,500';
    const card = validateProviderReply(
      reply({
        name: null,
        phone: null,
        area: null,
        languages: null,
        car: null,
        prices: [
          offer({
            amount: 27_000,
            currency: 'JPY',
            unit: 'hours',
            hours: 3,
            quote: '3時間 ¥27,000',
          }),
          offer({
            amount: 4500,
            currency: 'JPY',
            unit: 'hours',
            hours: null,
            quote: '延長30分 ¥4,500',
          }),
        ],
        overtime: { amount: 4500, currency: 'JPY', per_minutes: 30, quote: '延長30分 ¥4,500' },
      }),
      source,
      options,
    ).card;
    expect(card).toMatchObject({ price_minor: 27_000, overtime_minor: 9000 });
    expect(card.price_tiers).toBeUndefined();
  });
});
