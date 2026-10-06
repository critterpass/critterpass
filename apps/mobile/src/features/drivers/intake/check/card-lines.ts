/**
 * The lines of a driver card (6c-2) as the check screen shows and edits them: what each line says,
 * which lines carry a value (each must be confirmed), the includes he has not said, and an edit
 * typed back into the card.
 */
import { currencyExponent, isKnownCurrency } from '@cp/cost-engine';
import { INCLUDE_KEYS, type DriverCard, type DriverField, type IncludeKey } from '@cp/domain';

/** The lines in the order the card shows them. */
export const CARD_LINES: readonly DriverField[] = [
  'phone',
  'languages',
  'car',
  'price',
  'includes',
  'overtime',
];

export function filledLines(card: DriverCard): DriverField[] {
  const out: DriverField[] = [];
  if (card.phone !== null) out.push('phone');
  if (card.languages.length > 0) out.push('languages');
  if (card.car !== null || card.seats !== null) out.push('car');
  if (card.price_minor !== null) out.push('price');
  if (Object.keys(card.includes).length > 0) out.push('includes');
  if (card.overtime_minor !== null) out.push('overtime');
  return out;
}

/** What the price does not say yet: tolls, entry, overtime (6c-2 orange chips). */
export function unsaidIncludes(card: DriverCard): IncludeKey[] {
  return INCLUDE_KEYS.filter((key) => (card.includes[key] ?? 'unknown') === 'unknown');
}

const majorOf = (minor: number, currency: string) =>
  minor / 10 ** (isKnownCurrency(currency) ? currencyExponent(currency) : 2);

/** The text a line's edit field starts with. */
export function editText(card: DriverCard, field: DriverField): string {
  switch (field) {
    case 'name':
      return card.name ?? '';
    case 'phone':
      return card.phone ?? '';
    case 'languages':
      return card.languages.join(', ');
    case 'car':
      return [card.car, card.seats === null ? null : String(card.seats)]
        .filter((part) => part !== null)
        .join(', ');
    case 'price':
      return card.price_minor === null || card.currency === null
        ? ''
        : String(majorOf(card.price_minor, card.currency));
    case 'overtime':
      return card.overtime_minor === null || card.currency === null
        ? ''
        : String(majorOf(card.overtime_minor, card.currency));
    case 'includes':
      return '';
  }
}

const toMinor = (text: string, currency: string): number | null => {
  const amount = Number(text.replace(/[^\d.]/gu, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 10 ** (isKnownCurrency(currency) ? currencyExponent(currency) : 2));
};

/** The card with one line typed in by the traveller. */
export function applyEdit(
  card: DriverCard,
  field: DriverField,
  text: string,
  fallbackCurrency: string,
): DriverCard {
  const value = text.trim();
  switch (field) {
    case 'name':
      return { ...card, name: value === '' ? null : value.slice(0, 120) };
    case 'phone': {
      const digits = value.replace(/[^\d+]/gu, '');
      return { ...card, phone: /^\+[1-9]\d{6,14}$/u.test(digits) ? digits : null };
    }
    case 'languages':
      return {
        ...card,
        languages: value
          .split(/[,·/]/u)
          .map((part) => part.trim())
          .filter((part) => part.length >= 2)
          .slice(0, 8),
      };
    case 'car': {
      const seats = /(\d{1,2})\s*$/u.exec(value)?.[1];
      const car = value.replace(/[,\s]*\d{1,2}\s*$/u, '').trim();
      return {
        ...card,
        car: car === '' ? null : car.slice(0, 80),
        seats: seats === undefined ? card.seats : Number(seats),
      };
    }
    case 'price': {
      const currency = card.currency ?? fallbackCurrency;
      const minor = toMinor(value, currency);
      return minor === null
        ? { ...card, price_minor: null, currency: null }
        : { ...card, price_minor: minor, currency, price_unit: card.price_unit ?? 'day' };
    }
    case 'overtime': {
      const currency = card.currency ?? fallbackCurrency;
      return { ...card, overtime_minor: toMinor(value, currency) };
    }
    case 'includes':
      return card;
  }
}
