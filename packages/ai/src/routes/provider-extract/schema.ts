/**
 * The driver card read from a shared message (route `provider.extract`): every field comes with the
 * exact words it was read from, and a field whose words are not in the message is dropped. A phone
 * number survives only when its digits are in the message, and a price only when its figure is, so
 * the reader can never invent either.
 */
import {
  DRIVER_FIELDS,
  EMPTY_DRIVER_CARD,
  INCLUDE_KEYS,
  type DriverCard,
  type DriverField,
  type IncludeValue,
  type ParsedIntake,
  type SourceSpan,
} from '@cp/domain';

import { verifiedPhone } from './phone';
import { readOvertime, readPrices, type PriceOptions } from './price';
import type { ProviderExtractReply } from './reply';
import { spanOf } from './span';
import { seatsIn, vehicleOf } from './vehicle';

export interface ValidateProviderOptions extends PriceOptions {
  /** The destination's calling code without `+` ("62"), for a local number ("0812…"). */
  readonly callingCode: string | null;
}

/** Words that say he speaks English: the language named, or that he is bilingual or interprets. */
const ENGLISH = /engl|ingl|inggris|anglais|biling|interpret|tiếng anh|英語|英语|通訳|영어/iu;
const fold = (text: string) => text.toLowerCase().replace(/\s+/gu, ' ').trim();
const overlaps = (a: string, b: string) => {
  const [x, y] = [fold(a), fold(b)];
  return x !== '' && y !== '' && (x.includes(y) || y.includes(x));
};

/** The reply checked against the message: fields without their words in it are dropped. */
export function validateProviderReply(
  reply: ProviderExtractReply,
  source: string,
  options: ValidateProviderOptions,
): ParsedIntake {
  const card: { -readonly [K in keyof DriverCard]: DriverCard[K] } = {
    ...EMPTY_DRIVER_CARD,
    includes: {},
  };
  const spans: Partial<Record<DriverField, SourceSpan>> = {};
  const keep = (field: DriverField, quote: string): boolean => {
    const span = spanOf(source, quote);
    if (span === null) return false;
    spans[field] = span;
    return true;
  };
  const name = reply.name?.value?.trim() ?? '';
  if (reply.name !== null && name !== '' && keep('name', reply.name.quote)) {
    card.name = name.slice(0, 120);
  }
  if (reply.phone !== null && reply.phone.value !== null) {
    const phone = verifiedPhone(reply.phone.value, reply.phone.quote, options.callingCode);
    if (phone !== null && keep('phone', reply.phone.quote)) card.phone = phone;
  }
  if (reply.area !== null && spanOf(source, reply.area.quote) !== null) {
    card.area = reply.area.value?.trim().slice(0, 80) || null;
  }
  if (reply.languages !== null && reply.languages.value !== null) {
    const quote = reply.languages.quote;
    const languages = [
      ...new Set(reply.languages.value.map((language) => language.trim().toLowerCase())),
    ]
      .filter((language) => language.length >= 2 && language.length <= 20)
      // Writing in English is not a claim to speak it: `en` needs words that say so.
      .filter((language) => language !== 'en' || ENGLISH.test(quote));
    if (languages.length > 0 && keep('languages', quote)) card.languages = languages.slice(0, 8);
  }
  if (reply.car !== null) {
    const car = vehicleOf(reply.car.value);
    const seats = seatsIn(reply.car.seats, reply.car.quote);
    if ((car !== null || seats !== null) && keep('car', reply.car.quote)) {
      card.car = car;
      card.seats = seats;
    }
  }
  // The overtime line is not a second price, even when the model lists it as one.
  const overtimeQuote = reply.overtime?.quote ?? '';
  const listed = reply.prices.filter(
    (offer) =>
      !(
        typeof offer === 'object' &&
        offer !== null &&
        'quote' in offer &&
        typeof offer.quote === 'string' &&
        overlaps(offer.quote, overtimeQuote)
      ),
  );
  const price = readPrices(listed, source, options);
  Object.assign(card, price.fields);
  if (price.quote !== null) keep('price', price.quote);
  // Prices by vehicle: the card is the vehicle of the price picked.
  if (price.seats !== null && (price.tiered || card.seats === null)) card.seats = price.seats;
  if (price.tiered && price.car !== null && spanOf(source, price.car) !== null) {
    card.car = vehicleOf(price.car) ?? card.car;
  }
  const includes = reply.includes;
  const said = (value: IncludeValue) => value !== 'unknown';
  if (INCLUDE_KEYS.some((key) => said(includes[key])) && keep('includes', includes.quote)) {
    for (const key of INCLUDE_KEYS) {
      if (said(includes[key])) card.includes[key] = includes[key];
    }
  }
  if (reply.overtime !== null && spanOf(source, reply.overtime.quote) !== null) {
    const overtime = readOvertime(reply.overtime, source, card.currency, options);
    if (overtime !== null && keep('overtime', reply.overtime.quote)) {
      card.overtime_minor = overtime.minor;
      if (overtime.perMinutes !== null) card.overtime_per_minutes = overtime.perMinutes;
    }
  }
  card.licence_shown = reply.licence_shown === true ? true : null;
  return {
    card,
    spans,
    unreadable: reply.unreadable.map((line) => line.slice(0, 160)).slice(0, 6),
    cut_off: reply.cut_off,
  };
}

/** True when the card has nothing a traveller could check (6c-3 instead of 6c-2). */
export function nothingRead(parsed: ParsedIntake): boolean {
  return DRIVER_FIELDS.every((field) => parsed.spans[field] === undefined);
}
