import { describe, expect, it } from 'vitest';

import {
  extractProvider,
  parseProviderReply,
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

describe('provider extract', () => {
  it('keeps each field with the span of the words it was read from', () => {
    const parsed = validateProviderReply(reply(), MESSAGE, options);
    expect(parsed.card).toMatchObject({
      name: 'Made',
      phone: '+6281200000101',
      seats: 6,
      price_minor: 65_000_000,
      currency: 'IDR',
      price_unit: 'day',
      included_hours: 10,
      includes: { fuel: 'yes', parking: 'yes' },
    });
    expect(parsed.card.price_ask).toBeUndefined();
    expect(parsed.card.price_tiers).toBeUndefined();
    const [start, end] = parsed.spans.price ?? [0, 0];
    expect(MESSAGE.slice(start, end)).toBe('Full day 10 hrs Rp 650k');
  });

  it('never keeps a phone number whose digits are not in the message', () => {
    const invented = reply({ phone: { value: '+6281299999999', quote: '+62 812 0000 0101' } });
    expect(validateProviderReply(invented, MESSAGE, options).card.phone).toBeNull();
    const unquoted = reply({
      phone: { value: '+6281200000101', quote: 'call me on +62 812 0000 0101' },
    });
    expect(validateProviderReply(unquoted, MESSAGE, options).card.phone).toBeNull();
  });

  it('drops fields quoted from words the message does not contain', () => {
    const parsed = validateProviderReply(
      reply({
        overtime: { amount: 75_000, currency: null, per_minutes: 60, quote: 'overtime 75k/hour' },
        name: { value: 'Wayan', quote: 'Wayan here' },
        prices: [offer({ quote: 'Full day Rp 900k' })],
      }),
      MESSAGE,
      options,
    );
    expect(parsed.card.name).toBeNull();
    expect(parsed.card.overtime_minor).toBeNull();
    expect(parsed.card.price_minor).toBeNull();
    expect(parsed.card.price_ask).toBeUndefined();
    expect(parsed.spans.name).toBeUndefined();
    expect(parsed.spans.price).toBeUndefined();
  });

  it('reads a field answered with a null value as absent and keeps the rest of the card', () => {
    const raw = {
      ...reply(),
      languages: { value: null, quote: '' },
      car: { value: null, seats: null, quote: '' },
      area: 'Ubud',
      overtime: { amount: null, quote: '' },
      prices: [offer(), { amount: 'cheap', quote: 'Rp 650k' }],
    };
    const parsed = parseProviderReply(raw);
    expect(parsed).not.toBeNull();
    if (parsed === null) return;
    expect(parsed).toMatchObject({ area: null, overtime: null });
    const card = validateProviderReply({ ...parsed, prices: [offer()] }, MESSAGE, options).card;
    expect(card).toMatchObject({ name: 'Made', languages: [], car: null, price_minor: 65_000_000 });
    // The price the model answered off-shape is words to ask about, not a lost card.
    expect(validateProviderReply(parsed, MESSAGE, options).card).toMatchObject({
      name: 'Made',
      price_minor: null,
      price_ask: 'Full day 10 hrs Rp 650k / Rp 650k',
    });
  });

  it('answers null when the model declines or replies off-schema', async () => {
    const gateway = {
      callModel: () =>
        Promise.resolve({ message: { content: [{ type: 'text', text: '{"name": 1}' }] } }),
    } as unknown as Parameters<typeof extractProvider>[0];
    expect(await extractProvider(gateway, { text: MESSAGE, kind: 'text', ...options })).toBeNull();
    expect(parseProviderReply([reply()])).toBeNull();
    expect(parseProviderReply('Made')).toBeNull();
  });

  it('counts English only when the words say he speaks it', () => {
    const assumed = reply({ languages: { value: ['en', 'id'], quote: 'Made here' } });
    expect(validateProviderReply(assumed, MESSAGE, options).card.languages).toEqual(['id']);
    const onlyAssumed = validateProviderReply(
      reply({ languages: { value: ['EN'], quote: 'Made here' } }),
      MESSAGE,
      options,
    );
    expect(onlyAssumed.card.languages).toEqual([]);
    expect(onlyAssumed.spans.languages).toBeUndefined();
    expect(validateProviderReply(reply(), MESSAGE, options).card.languages).toEqual(['en']);
  });

  it('keeps seats without a model, and never the seats of a group that is not in the quote', () => {
    const noModel = reply({ car: { value: 'car', seats: 6, quote: 'Avanza 6 pax' } });
    expect(validateProviderReply(noModel, MESSAGE, options).card).toMatchObject({
      car: null,
      seats: 6,
    });
    const party = reply({ car: { value: 'Avanza', seats: 4, quote: 'Avanza 6 pax' } });
    expect(validateProviderReply(party, MESSAGE, options).card).toMatchObject({
      car: 'Avanza',
      seats: null,
    });
  });
});
