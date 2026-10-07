import { describe, expect, it } from '@jest/globals';
import { EMPTY_DRIVER_CARD, type DriverCard, type IntakeItem, type PriceTier } from '@cp/domain';

import { readCardFor, withReadPrice } from '../read-price';

const tier = (seats: number, price: number): PriceTier => ({
  label: `up to ${String(seats)} pax`,
  seats,
  price_minor: price,
  price_max_minor: null,
  currency: 'IDR',
  price_unit: 'day',
  price_per: null,
  included_hours: null,
});
const TIERS = [tier(3, 55_000_000), tier(10, 95_000_000)];
const card = (over: Partial<DriverCard>): DriverCard => ({ ...EMPTY_DRIVER_CARD, ...over });
const priced = (minor: number) => card({ price_minor: minor, currency: 'IDR', price_unit: 'day' });

describe("a shortlisted driver's price as his message gave it", () => {
  it('keeps his words to ask about only while the shortlist has no price', () => {
    const read = card({ price_tiers: TIERS, price_ask: '550k / 950k' });
    expect(withReadPrice(card({}), read)).toMatchObject({
      price_ask: '550k / 950k',
      price_tiers: TIERS,
    });
    const typed = withReadPrice(priced(95_000_000), read);
    expect(typed.price_ask).toBeUndefined();
    expect(typed.price_tiers).toEqual(TIERS);
  });

  it('keeps what the price is counted by', () => {
    const read = { ...priced(45_000_000), price_per: 'person' as const };
    expect(withReadPrice(priced(45_000_000), read).price_per).toBe('person');
    expect(withReadPrice(priced(46_000_000), read).price_per).toBe('person');
  });

  it('keeps his range and floor only with the figure he wrote', () => {
    const read = { ...priced(60_000_000), price_max_minor: 80_000_000, price_from: true };
    expect(withReadPrice(priced(60_000_000), read)).toMatchObject({
      price_max_minor: 80_000_000,
      price_from: true,
    });
    const typed = withReadPrice(priced(70_000_000), read);
    expect(typed.price_max_minor).toBeUndefined();
    expect(typed.price_from).toBeUndefined();
  });

  it('leaves a driver with no read message as shortlisted', () => {
    const intake = [
      { provider_id: 'd1', parsed: { card: card({ price_ask: 'ask' }) } },
      { provider_id: null, parsed: null },
    ] as unknown as IntakeItem[];
    expect(readCardFor(intake, 'd2')).toBeNull();
    expect(readCardFor(intake, 'd1')?.price_ask).toBe('ask');
    expect(withReadPrice(priced(1), null)).toEqual(priced(1));
  });
});
