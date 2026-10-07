/**
 * The price lines of a driver card. Only a figure the driver wrote is ever shown as his price: a
 * range keeps both ends, several prices (by group size, vehicle or length of day) are kept as a
 * list, and when they cannot be told apart, or the model answers a figure he did not write, the
 * card has no price at all, only his own words to ask him about.
 */
import type { DriverCard, PriceTier } from '@cp/domain';

import { amountTokens, currencyIn, minutesIn, writtenAmount } from './money-text';
import { priceOfferReplySchema, type ProviderExtractReply } from './reply';
import { spanOf } from './span';
import { capacityIn, seatsIn } from './vehicle';

export interface PriceOptions {
  /** Minor units per major unit for a currency (100 for USD, 1 for IDR); null = unknown code. */
  readonly minorPerMajor: (currency: string) => number | null;
  /** The trip's local currency, when the message names none ("650k"). */
  readonly currencyHint: string;
  /** How many travel, to pick between prices by group size; without it such prices are asked. */
  readonly partySize?: number | null;
}

type PriceFields = Pick<
  DriverCard,
  | 'price_minor'
  | 'currency'
  | 'price_unit'
  | 'included_hours'
  | 'price_max_minor'
  | 'price_per'
  | 'price_from'
  | 'price_tiers'
  | 'price_ask'
>;

export interface PriceReading {
  readonly fields: Partial<PriceFields>;
  /** The words the shown price was read from; null when no price is shown. */
  readonly quote: string | null;
  /** True when the shown price was picked from several. */
  readonly tiered: boolean;
  /** The vehicle of the price picked, and the seats its words state it carries. */
  readonly car: string | null;
  readonly seats: number | null;
}

interface Offer {
  readonly tier: PriceTier;
  readonly from: boolean;
  readonly car: string | null;
  readonly quote: string;
}
interface Unclear {
  readonly ask: string;
}

const NOTHING: PriceReading = { fields: {}, quote: null, tiered: false, car: null, seats: null };

export function toMinor(
  amount: number,
  currency: string,
  minorPerMajor: PriceOptions['minorPerMajor'],
): number | null {
  const per = minorPerMajor(currency);
  if (per === null || !Number.isFinite(amount) || amount <= 0) return null;
  const minor = Math.round(amount * per);
  return minor >= 1 && minor <= 100_000_000_000 ? minor : null;
}

/** The currency of a figure: what the model read, else a sign in the words, else the trip's. */
function currencyOf(answered: string | null, quote: string, options: PriceOptions): string | null {
  const known = (code: string) => options.minorPerMajor(code) !== null;
  const code = answered?.trim().toUpperCase() ?? null;
  if (code !== null && known(code)) return code;
  const shown = currencyIn(quote, known);
  if (shown !== null) return shown;
  // A code we do not know is not swapped for the trip's currency: the figure is asked about.
  return code === null && known(options.currencyHint) ? options.currencyHint : null;
}

function readOffer(raw: unknown, source: string, options: PriceOptions): Offer | Unclear | null {
  const quote =
    typeof raw === 'object' && raw !== null && 'quote' in raw && typeof raw.quote === 'string'
      ? raw.quote
      : '';
  // Words that are not in the message are no price of his, clear or not.
  if (spanOf(source, quote) === null) return null;
  const unclear: Unclear = { ask: quote.trim() };
  const parsed = priceOfferReplySchema.safeParse(raw);
  if (!parsed.success) return unclear;
  const offer = parsed.data;
  const written = writtenAmount(offer.amount, offer.amount_max, quote, source);
  const currency = currencyOf(offer.currency, quote, options);
  if (written === null || currency === null) return unclear;
  const priceMinor = toMinor(written.min, currency, options.minorPerMajor);
  const maxMinor =
    written.max === null ? null : toMinor(written.max, currency, options.minorPerMajor);
  if (priceMinor === null || (written.max !== null && maxMinor === null)) return unclear;
  const hours = offer.hours !== null && offer.hours > 0 && offer.hours <= 24 ? offer.hours : null;
  const per = offer.per === 'group' ? null : offer.per;
  // A price for a stated block of hours is a day or a block, never a one-way trip.
  const unit =
    per === 'hour'
      ? 'hours'
      : offer.unit === 'trip' && hours !== null
        ? hours >= 6
          ? 'day'
          : 'hours'
        : offer.unit;
  const seats = seatsIn(offer.seats, quote);
  return {
    tier: {
      label: quote.trim().slice(0, 160),
      seats,
      price_minor: priceMinor,
      price_max_minor: maxMinor,
      currency,
      price_unit: unit,
      price_per: per,
      included_hours: hours,
    },
    from: offer.from,
    car: offer.car?.trim().slice(0, 80) || null,
    quote,
  };
}

const sameTerms = (a: PriceTier, b: PriceTier) =>
  a.price_minor === b.price_minor &&
  a.price_max_minor === b.price_max_minor &&
  a.currency === b.currency &&
  a.price_unit === b.price_unit &&
  a.price_per === b.price_per;

/** The one price that is this crew's, or null when nothing in the message settles it. */
function pick(offers: readonly Offer[], partySize: number | null): Offer | null {
  const seats = offers.map((offer) => offer.tier.seats);
  if (seats.every((n): n is number => n !== null) && new Set(seats).size > 1) {
    if (partySize === null) return null;
    const fits = offers.filter((offer) => (offer.tier.seats ?? 0) >= partySize);
    const smallest = Math.min(...fits.map((offer) => offer.tier.seats ?? 0));
    const tightest = fits.filter((offer) => offer.tier.seats === smallest);
    return tightest.length === 1 ? (tightest[0] ?? null) : null;
  }
  // Half day and full day: the card is a day's hire, so the one full-day price is its price.
  const days = offers.filter(
    (offer) => offer.tier.price_unit === 'day' && offer.tier.price_per === null,
  );
  const others = offers.filter((offer) => offer.tier.price_unit !== 'day');
  return days.length === 1 && others.length === offers.length - 1 ? (days[0] ?? null) : null;
}

/** The card's price from every price the model listed. */
export function readPrices(
  listed: readonly unknown[],
  source: string,
  options: PriceOptions,
): PriceReading {
  const read = listed
    .map((raw) => readOffer(raw, source, options))
    .filter((entry) => entry !== null);
  if (read.length === 0) return NOTHING;
  const offers: Offer[] = [];
  for (const entry of read) {
    if ('tier' in entry && !offers.some((offer) => sameTerms(offer.tier, entry.tier))) {
      offers.push(entry);
    }
  }
  const tiers = offers.length > 1 ? { price_tiers: offers.map((o) => o.tier).slice(0, 6) } : {};
  const anyUnclear = read.some((entry) => 'ask' in entry);
  const chosen =
    anyUnclear || offers.length === 0
      ? null
      : offers.length === 1
        ? (offers[0] ?? null)
        : pick(offers, options.partySize ?? null);
  if (chosen === null) {
    const words = [...new Set(read.map((entry) => ('ask' in entry ? entry.ask : entry.quote)))];
    const ask = words.join(' / ').slice(0, 200).trim();
    return { ...NOTHING, fields: { ...tiers, ...(ask === '' ? {} : { price_ask: ask }) } };
  }
  const { tier } = chosen;
  return {
    fields: {
      price_minor: tier.price_minor,
      currency: tier.currency,
      price_unit: tier.price_unit,
      included_hours: tier.included_hours,
      ...(tier.price_max_minor === null ? {} : { price_max_minor: tier.price_max_minor }),
      ...(tier.price_per === null ? {} : { price_per: tier.price_per }),
      ...(chosen.from ? { price_from: true } : {}),
      ...tiers,
    },
    quote: chosen.quote,
    tiered: offers.length > 1,
    car: chosen.car,
    // "5-8 pax" and "up to 4" say what the vehicle carries; "for 6 of us" does not.
    seats:
      tier.seats !== null && (offers.length > 1 || capacityIn(chosen.quote) === tier.seats)
        ? tier.seats
        : null,
  };
}

export interface OvertimeReading {
  /** The price of one extra hour. */
  readonly minor: number;
  /** The minutes his own figure buys when not an hour ("per 30 min"); null for an hour. */
  readonly perMinutes: number | null;
}

/**
 * Overtime as a price per hour, whatever stretch of time the driver priced it by. A card has one
 * currency, its price's: overtime in another is not kept, and with no price on the card overtime
 * is kept only in the trip's currency (the card's currency stays empty, as when it is typed in).
 */
export function readOvertime(
  overtime: NonNullable<ProviderExtractReply['overtime']>,
  source: string,
  cardCurrency: string | null,
  options: PriceOptions,
): OvertimeReading | null {
  const written = writtenAmount(overtime.amount, null, overtime.quote, source);
  if (written === null || written.max !== null) return null;
  const known = (code: string) => options.minorPerMajor(code) !== null;
  const answered = overtime.currency?.trim().toUpperCase() ?? null;
  const currency =
    (answered !== null && known(answered) ? answered : null) ??
    currencyIn(overtime.quote, known) ??
    cardCurrency ??
    options.currencyHint;
  if (currency !== (cardCurrency ?? options.currencyHint)) return null;
  const minor = toMinor(written.min, currency, options.minorPerMajor);
  if (minor === null) return null;
  const stated = overtime.per_minutes;
  const figures = amountTokens(overtime.quote);
  const minutes =
    minutesIn(overtime.quote) ??
    (stated !== null &&
    Number.isInteger(stated) &&
    stated >= 1 &&
    stated <= 240 &&
    figures.some((figure) => figure.max === null && figure.min === stated)
      ? stated
      : 60);
  const perHour = Math.round((minor * 60) / minutes);
  if (perHour < 1 || perHour > 100_000_000_000) return null;
  return { minor: perHour, perMinutes: minutes === 60 ? null : minutes };
}
