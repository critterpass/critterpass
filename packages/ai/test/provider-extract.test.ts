import { describe, expect, it } from 'vitest';

import {
  extractProvider,
  spanOf,
  validateProviderReply,
  verifiedPhone,
  type ProviderExtractReply,
} from '../src/routes/provider-extract';

const MESSAGE =
  'Hi, Made here, driver in Ubud 12 yrs. Avanza 6 pax. Full day 10 hrs Rp 650k incl petrol + parking. English OK. WA +62 812 0000 0101';
const options = {
  minorPerMajor: (currency: string) => ({ IDR: 100, USD: 100 })[currency] ?? null,
  currencyHint: 'IDR',
  callingCode: '62',
};

const reply = (overrides: Partial<ProviderExtractReply> = {}): ProviderExtractReply => ({
  name: { value: 'Made', quote: 'Made here' },
  phone: { value: '+6281200000101', quote: '+62 812 0000 0101' },
  area: { value: 'Ubud', quote: 'driver in Ubud' },
  languages: { value: ['en'], quote: 'English OK' },
  car: { value: 'Toyota Avanza', seats: 6, quote: 'Avanza 6 pax' },
  price: {
    amount: 650_000,
    currency: 'IDR',
    unit: 'day',
    hours: 10,
    quote: 'Full day 10 hrs Rp 650k',
  },
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
    expect(verifiedPhone('0813-0000-0202', 'WhatsApp 0813-0000-0202', '62')).toBe('+6281300000202');
    expect(verifiedPhone('0813-0000-0202', 'WhatsApp 0813-0000-0202', null)).toBeNull();
  });

  it('drops fields quoted from words the message does not contain', () => {
    const parsed = validateProviderReply(
      reply({
        overtime: { amount: 75_000, quote: 'overtime 75k/hour' },
        name: { value: 'Wayan', quote: 'Wayan here' },
      }),
      MESSAGE,
      options,
    );
    expect(parsed.card.name).toBeNull();
    expect(parsed.card.overtime_minor).toBeNull();
    expect(parsed.spans.name).toBeUndefined();
  });

  it('matches quotes across case and spacing differences', () => {
    expect(spanOf('Rp  650K\nper day', 'rp 650k per day')).toEqual([0, 16]);
    expect(spanOf('abc', '')).toBeNull();
  });

  it('answers null when the model declines or replies off-schema', async () => {
    const gateway = {
      callModel: () =>
        Promise.resolve({ message: { content: [{ type: 'text', text: '{"name": 1}' }] } }),
    } as unknown as Parameters<typeof extractProvider>[0];
    expect(await extractProvider(gateway, { text: MESSAGE, kind: 'text', ...options })).toBeNull();
  });
});
