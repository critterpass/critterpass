/**
 * The figures a driver wrote, read from his own words: local shorthand ("700k", "650rb", "1,2tr",
 * "Rp 700.000", "3万円") becomes a number, and two figures joined by a dash or "to" become a range
 * ("600-800k" is 600,000 to 800,000). A price the model answers is kept only when it is one of
 * these figures, so the card never shows a number the message does not contain.
 */

export interface AmountToken {
  /** The figure, or the low end of a range. */
  readonly min: number;
  /** The high end of a range; null for a single figure. */
  readonly max: number | null;
  /** True when it is written as money: a currency sign or code next to it, or a "k"/"rb" suffix. */
  readonly marked: boolean;
}

const MULTIPLIERS: Readonly<Record<string, number>> = {
  k: 1e3,
  rb: 1e3,
  ribu: 1e3,
  nghìn: 1e3,
  ngàn: 1e3,
  mil: 1e3,
  千: 1e3,
  万: 1e4,
  jt: 1e6,
  juta: 1e6,
  tr: 1e6,
  triệu: 1e6,
  trieu: 1e6,
  mio: 1e6,
  million: 1e6,
};

const NUMBER =
  /(\d[\d.,]*\d|\d)(?:\s?(?:(k|rb|ribu|nghìn|ngàn|mil|jt|juta|triệu|trieu|tr|mio|million)(?![\p{L}\p{N}])|(万|千)))?/giu;
const SIGN_BEFORE = /(?:rp\.?|us\$|\$|€|£|¥|￥|₫|₱|฿|₩|₹|s\/\.?)\s?$/iu;
const CODE_BEFORE = /(?:^|[^A-Za-z])[A-Z]{3}\s?$/u;
const SIGN_AFTER = /^\s?(?:€|£|¥|￥|円|₫|đ(?![\p{L}])|\$|vnd\b|dong\b|baht\b|euros?\b)/iu;
const CODE_AFTER = /^\s?[A-Z]{3}(?![A-Za-z])/u;
const JOINER =
  /^\s*(?:-|–|—|~|〜|to|a|até|sampai|hingga|đến)\s*(?:rp\.?|us\$|\$|€|£|¥|￥|s\/\.?)?\s*$/iu;

/**
 * "650.000" and "1,150" are thousands, "1,2" and "2.5" decimals; anything else is not a number we
 * read (a date, a version, a phone number).
 */
export function parseFigure(text: string): number | null {
  if (/^\d+$/u.test(text)) return Number(text);
  const grouped = /^(\d{1,3}(?:[.,]\d{3})+)(?:[.,](\d{1,2}))?$/u.exec(text);
  if (grouped !== null) {
    return Number(`${(grouped[1] ?? '').replace(/[.,]/gu, '')}.${grouped[2] ?? '0'}`);
  }
  const decimal = /^(\d+)[.,](\d{1,2})$/u.exec(text);
  return decimal === null ? null : Number(`${decimal[1]}.${decimal[2]}`);
}

interface Found {
  readonly figure: number;
  readonly factor: number | null;
  readonly marked: boolean;
  readonly start: number;
  readonly end: number;
}

function figuresIn(text: string): Found[] {
  const found: Found[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const figure = parseFigure(match[1] ?? '');
    if (figure === null) continue;
    const suffix = (match[2] ?? match[3])?.toLowerCase();
    const factor = suffix === undefined ? null : (MULTIPLIERS[suffix] ?? null);
    const start = match.index;
    const end = start + match[0].length;
    const before = text.slice(Math.max(0, start - 6), start);
    const after = text.slice(end, end + 8);
    const marked =
      factor !== null ||
      SIGN_BEFORE.test(before) ||
      CODE_BEFORE.test(before) ||
      SIGN_AFTER.test(after) ||
      CODE_AFTER.test(after);
    found.push({ figure, factor, marked, start, end });
  }
  return found;
}

/** Every figure and range in the words, in reading order. */
export function amountTokens(text: string): AmountToken[] {
  const found = figuresIn(text);
  const tokens: AmountToken[] = [];
  for (let i = 0; i < found.length; i += 1) {
    const low = found[i] as Found;
    const high = found[i + 1];
    if (high !== undefined && JOINER.test(text.slice(low.end, high.start))) {
      // "600-800k": the low end is in the same thousands as the high end.
      const min = low.figure * (low.factor ?? high.factor ?? 1);
      const max = high.figure * (high.factor ?? 1);
      if (min < max) {
        tokens.push({ min, max, marked: low.marked || high.marked });
        i += 1;
        continue;
      }
    }
    tokens.push({ min: low.figure * (low.factor ?? 1), max: null, marked: low.marked });
  }
  return tokens;
}

export interface WrittenAmount {
  readonly min: number;
  readonly max: number | null;
}

const sameUpToThousands = (a: number, b: number) => {
  const ratio = a > b ? a / b : b / a;
  return [1e3, 1e6].some((scale) => Math.abs(ratio - scale) < 1e-9);
};

/**
 * The figure the driver wrote for the amount the model answered, or null when he wrote no such
 * figure (the model added, averaged, multiplied or made it up). A figure inside a written range
 * answers the whole range; a figure off by thousands ("185" for "185.000") answers the one money
 * figure in the words.
 */
export function writtenAmount(
  amount: number,
  amountMax: number | null,
  quote: string,
  source: string,
): WrittenAmount | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const tokens = amountTokens(quote);
  const range = tokens.find(
    (token) => token.max !== null && amount >= token.min && amount <= token.max,
  );
  if (range !== undefined) return { min: range.min, max: range.max };
  const singles = tokens.filter((token) => token.max === null);
  if (amountMax !== null && amountMax > amount) {
    const both = [amount, amountMax].every((end) => singles.some((token) => token.min === end));
    return both ? { min: amount, max: amountMax } : null;
  }
  if (singles.some((token) => token.min === amount)) return { min: amount, max: null };
  const money = tokens.filter((token) => token.marked);
  const only = money.length === 1 ? money[0] : undefined;
  if (only !== undefined && sameUpToThousands(only.min, amount)) {
    return { min: only.min, max: only.max };
  }
  const elsewhere = amountTokens(source).some(
    (token) => token.max === null && token.marked && token.min === amount,
  );
  return elsewhere ? { min: amount, max: null } : null;
}

const SIGNS: readonly (readonly [RegExp, string])[] = [
  [/\brp\.?\s?\d|\d\s?(?:rb|ribu|jt|juta)\b/iu, 'IDR'],
  [/us\$|\busd\b/iu, 'USD'],
  [/€|\beuros?\b/iu, 'EUR'],
  [/£/u, 'GBP'],
  [/₫|\d\s?đ(?![\p{L}])|\bvnd\b/iu, 'VND'],
  [/₱/u, 'PHP'],
  [/฿|\bbaht\b/iu, 'THB'],
  [/₩/u, 'KRW'],
  [/₹/u, 'INR'],
  [/\bs\/\.?\s?\d/iu, 'PEN'],
];

/**
 * The currency the words name outright (a code we know, or a sign only one currency uses); null for
 * a bare "$" or "¥", which several currencies share.
 */
export function currencyIn(text: string, known: (code: string) => boolean): string | null {
  for (const match of text.matchAll(/(?<![A-Za-z])[A-Z]{3}(?![A-Za-z])/gu)) {
    if (known(match[0])) return match[0];
  }
  for (const [pattern, code] of SIGNS) {
    if (pattern.test(text) && known(code)) return code;
  }
  return null;
}

/** The minutes an overtime price buys when the words say so ("延長30分", "per 30 min"), else null. */
export function minutesIn(text: string): number | null {
  const match = /(\d{1,3})\s?(?:min(?:ute)?s?\b|menit\b|phút|minutos?\b|分)/iu.exec(text);
  if (match === null) return null;
  const minutes = Number(match[1]);
  return minutes >= 1 && minutes <= 240 ? minutes : null;
}
