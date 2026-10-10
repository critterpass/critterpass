/**
 * The trip's books as a CSV a spreadsheet opens: one line per expense (date, what, category, who
 * paid, the amount in its own currency and in the crew currency) and one column per member with
 * their share. Amounts are exact decimals built from the integer minor units (never through a
 * float). Text a person typed is quoted, and a cell that a spreadsheet would run as a formula is
 * kept as text.
 */
import { currencyExponent, isKnownCurrency } from '@cp/cost-engine';

import type { ExpenseItem } from '../data/expense-items';
import type { ShareRow } from '../data/queries';

export interface CsvMember {
  readonly userId: string;
  readonly name: string;
}

export interface CsvHeadings {
  readonly date: string;
  readonly what: string;
  readonly category: string;
  readonly paidBy: string;
  readonly amount: string;
  readonly currency: string;
  /** The crew-currency column, e.g. "In USD". */
  readonly crewAmount: string;
}

/** Exact decimal text of an amount in minor units ("186.40", "450000", "-3.05"). */
export function decimalOf(minor: bigint, currency: string): string {
  const exponent = isKnownCurrency(currency) ? currencyExponent(currency) : 2;
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString().padStart(exponent + 1, '0');
  const whole = exponent === 0 ? digits : digits.slice(0, -exponent);
  const fraction = exponent === 0 ? '' : `.${digits.slice(-exponent)}`;
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

const FORMULA_START = /^[=+\-@\t\r]/u;

/** One cell: quoted when needed, and typed text that starts like a formula is kept as text. */
export function csvCell(value: string, typed = true): string {
  const safe = typed && FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\n\r]/u.test(safe) ? `"${safe.replace(/"/gu, '""')}"` : safe;
}

export function expensesCsv(input: {
  readonly items: readonly ExpenseItem[];
  readonly shares: readonly ShareRow[];
  readonly members: readonly CsvMember[];
  readonly crewCurrency: string;
  readonly headings: CsvHeadings;
  /** The category's name in the reader's language. */
  readonly categoryName: (category: ExpenseItem['category']) => string;
}): string {
  const { headings } = input;
  const shareOf = new Map<string, bigint>();
  for (const share of input.shares) {
    if (share.computed_minor === null) continue;
    shareOf.set(`${share.expense_id}:${share.user_id}`, BigInt(share.computed_minor));
  }
  const header = [
    headings.date,
    headings.what,
    headings.category,
    headings.paidBy,
    headings.amount,
    headings.currency,
    headings.crewAmount,
    ...input.members.map((member) => member.name),
  ].map((cell) => csvCell(cell));
  const lines = input.items
    // A delete still in the queue is already gone for the reader.
    .filter((item) => item.pending !== 'delete')
    .sort((a, b) => a.localDate.localeCompare(b.localDate) || a.spentAt.localeCompare(b.spentAt))
    .map((item) => {
      const crewAmount =
        item.currency === input.crewCurrency
          ? decimalOf(item.amountMinor, item.currency)
          : item.crewAmountMinor === null
            ? ''
            : decimalOf(item.crewAmountMinor, input.crewCurrency);
      return [
        csvCell(item.localDate, false),
        csvCell(item.title),
        csvCell(input.categoryName(item.category)),
        csvCell(item.payerName),
        decimalOf(item.amountMinor, item.currency),
        item.currency,
        crewAmount,
        ...input.members.map((member) => {
          const share = shareOf.get(`${item.id}:${member.userId}`);
          return share === undefined ? '' : decimalOf(share, item.currency);
        }),
      ].join(',');
    });
  // CRLF line ends (RFC 4180), which every spreadsheet reads.
  return [header.join(','), ...lines].join('\r\n');
}
