/**
 * A driver's price in words, as he gave it: a range keeps both ends, a floor says "from", and a
 * rate says what it is counted by, so a price per person or per hour never reads as the car's.
 */
import type { DriverCard, PriceTier } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';

import { money } from './format';

export type PriceWords = Pick<DriverCard, 'price_minor' | 'currency'> &
  Partial<Pick<DriverCard, 'price_max_minor' | 'price_per' | 'price_from'>>;

/** True when the figure is the least he would charge: a floor, or the low end of a range. */
export const isFloor = (price: PriceWords): boolean =>
  price.price_from === true || (price.price_max_minor ?? null) !== null;

/** The price words to ask him about, when the card has no price of its own. */
export const askWords = (card: DriverCard): string | null =>
  card.price_minor === null ? (card.price_ask ?? null) : null;

export function usePriceWords() {
  const { t } = useLingui();
  const locale = useLocale();
  const from = (amount: string): string =>
    t({ id: 'drivers.price.from', message: `from ${amount}` });
  const price = (words: PriceWords): string | null => {
    const low = money(words.price_minor, words.currency, locale);
    if (low === null) return null;
    const high = money(words.price_max_minor ?? null, words.currency, locale);
    const amount = high === null ? low : `${low}–${high}`;
    const counted =
      words.price_per === 'person'
        ? t({ id: 'drivers.price.perPerson', message: `${amount} a person` })
        : words.price_per === 'hour'
          ? t({ id: 'drivers.price.perHour', message: `${amount} an hour` })
          : amount;
    return words.price_from === true ? from(counted) : counted;
  };
  /** One of several prices he gave: the figure, then the seats it is for or his own words. */
  const tier = (one: PriceTier): string => {
    const amount = price(one) ?? '';
    const seats = one.seats;
    return seats === null
      ? `${amount} · ${one.label}`
      : t({ id: 'drivers.price.tierSeats', message: `${amount} · ${seats} seats` });
  };
  /** Added to the WhatsApp question when his message gives no one price for this crew. */
  const question = (words: string, people: number): string =>
    t({
      id: 'drivers.price.question',
      message: ` You wrote "${words}". What is the price for ${people} of us for a day?`,
    });
  return { from, price, tier, question };
}
