/**
 * The receipt card's lines (3m-6), every amount from the recap's receipt: one line per spend
 * category (food with its meal count), the total, what was planned and each person's share, then
 * the priciest thing, the cheapest day and how long settling took.
 */
import type { RecapReceipt } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';

import type { ReceiptLine } from '@/ui/documents/Receipt';

import { wholeMoney } from '../summary/summary-copy';

function categoryLabel(line: RecapReceipt['lines'][number], meals: number): string {
  switch (line.category) {
    case 'stays':
      return t({ id: 'recap.receipt.stays', message: 'Stays' });
    case 'food':
      return t({
        id: 'recap.receipt.food',
        message: plural(meals, { one: 'Food · # meal', other: 'Food · # meals' }),
      });
    case 'transit':
      return t({ id: 'recap.receipt.transit', message: 'Transit' });
    case 'fun':
      return t({ id: 'recap.receipt.fun', message: 'Fun' });
    case 'other':
    default:
      return t({ id: 'recap.receipt.other', message: 'Other' });
  }
}

/** The receipt's sections, in print order. */
export function receiptSections(receipt: RecapReceipt, locale: string): ReceiptLine[][] {
  const money = (minor: number) => wholeMoney(locale, minor, receipt.currency);
  const spend = receipt.lines.map((line) => ({
    key: line.category,
    label: categoryLabel(line, receipt.meals),
    amount: money(line.total_minor),
  }));
  const totals: ReceiptLine[] = [
    {
      key: 'total',
      label: t({ id: 'recap.receipt.total', message: 'Total' }),
      amount: money(receipt.total_minor),
      emphasis: true,
    },
    ...(receipt.planned_total_minor === null
      ? []
      : [
          {
            key: 'planned',
            label: t({ id: 'recap.receipt.planned', message: 'Planned' }),
            amount: money(receipt.planned_total_minor),
          },
        ]),
    {
      key: 'each',
      label: t({ id: 'recap.receipt.each', message: 'Each' }),
      amount: money(receipt.each_minor),
      emphasis: true,
    },
  ];
  const facts: ReceiptLine[] = [];
  if (receipt.priciest !== null) {
    facts.push({
      key: 'priciest',
      label: t({ id: 'recap.receipt.priciest', message: 'Priciest' }),
      amount: receipt.priciest.description,
    });
  }
  if (receipt.cheapest_day !== null) {
    const day = receipt.cheapest_day.day_no;
    const each = money(receipt.cheapest_day.each_minor);
    facts.push({
      key: 'cheapest',
      label: t({ id: 'recap.receipt.cheapest', message: 'Cheapest day' }),
      amount: t({ id: 'recap.receipt.cheapestValue', message: `D${day} · ${each} each` }),
    });
  }
  const after = receipt.settled_days_after_end;
  if (receipt.settled && after !== null) {
    const days = Math.max(0, after);
    facts.push({
      key: 'settled',
      label: t({ id: 'recap.receipt.settled', message: 'Settled' }),
      amount:
        after <= 0
          ? t({ id: 'recap.receipt.settledEarly', message: 'Before home' })
          : t({
              id: 'recap.receipt.settledIn',
              message: plural(days, { one: 'In # day', other: 'In # days' }),
            }),
    });
  }
  return [spend, totals, facts].filter((section) => section.length > 0);
}

/** The sign-off under the lines while the guide has not written one. */
export function receiptNote(receipt: RecapReceipt, locale: string): string {
  if (receipt.settled) {
    return t({ id: 'recap.receipt.square', message: "Everyone's square. Nobody owes anybody." });
  }
  const owed = wholeMoney(locale, receipt.outstanding_minor, receipt.currency);
  return t({ id: 'recap.receipt.owed', message: `${owed} still to settle across the crew.` });
}

export function receiptSubtitle(dates: string, travellers: number): string {
  return t({
    id: 'recap.receipt.subtitle',
    message: plural(travellers, { one: `${dates} · # guest`, other: `${dates} · # guests` }),
  });
}

export function yourShare(locale: string, minor: number, currency: string): string {
  const amount = wholeMoney(locale, minor, currency);
  return t({ id: 'recap.receipt.yourShare', message: `Your share: ${amount}` });
}
