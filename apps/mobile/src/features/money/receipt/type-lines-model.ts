/**
 * TYPE THE LINES: when Tokek read the total but not the lines, the member types them in, starting
 * from the prices it could read. Each typed line is an item for whoever had it; the gap to the
 * printed total (service, tax, what the fold hid) is shared by share like a service line. The
 * result is added as an expense with exact per-member amounts (CUSTOM), so no typed number is
 * ever passed off as the server's parse.
 */
/* eslint-disable lingui/no-unlocalized-strings -- line kinds and ids are wire values, never copy. */
import { itemisedShares, type ItemisedLine } from '@cp/cost-engine';
import type { AddExpensePayload } from '@cp/domain';

import { minorToUnits, unitsToMinor } from '../add-expense/draft';
import type { ParsedReceipt } from './review-model';

export interface TypedLine {
  readonly id: string;
  readonly label: string;
  /** Display units, as typed. */
  readonly digits: string;
  /** Who had it; null = everyone. */
  readonly assignees: readonly string[] | null;
}

/** The lines the parse could read, then one empty line to type into. */
export function prefillLines(parsed: ParsedReceipt | null): TypedLine[] {
  const read = (parsed?.lines ?? [])
    .filter((line) => line.kind === 'item')
    .map((line) => ({
      id: line.line_id,
      label: line.label,
      digits: minorToUnits(BigInt(line.amount_minor), parsed?.currency ?? ''),
      assignees: null,
    }));
  return [...read, { id: `typed-${String(read.length)}`, label: '', digits: '', assignees: null }];
}

export function typedTotal(lines: readonly TypedLine[], currency: string): bigint {
  return lines.reduce((sum, line) => sum + unitsToMinor(line.digits, currency), 0n);
}

/** Each member's exact share; `totalMinor` (the printed total) is kept when given. */
export function typedShares(input: {
  readonly lines: readonly TypedLine[];
  readonly currency: string;
  readonly members: readonly string[];
  readonly payerId: string;
  readonly totalMinor: bigint | null;
}) {
  const items: ItemisedLine[] = input.lines
    .filter((line) => unitsToMinor(line.digits, input.currency) > 0n)
    .map((line) => ({
      lineId: line.id,
      kind: 'item' as const,
      amountMinor: unitsToMinor(line.digits, input.currency),
      assignees: line.assignees ?? [],
    }));
  if (items.length === 0) return null;
  const typed = typedTotal(input.lines, input.currency);
  const gap = input.totalMinor === null ? 0n : input.totalMinor - typed;
  // More typed than printed can only be a typo: refuse rather than discount it away.
  if (gap < 0n) return null;
  if (gap !== 0n) {
    items.push({ lineId: 'rest', kind: 'service', amountMinor: gap });
  }
  return itemisedShares({ members: input.members, payerId: input.payerId, lines: items });
}

export function typedPayload(input: {
  readonly lines: readonly TypedLine[];
  readonly currency: string;
  readonly members: readonly string[];
  readonly payerId: string;
  readonly totalMinor: bigint | null;
  readonly expenseId: string;
  readonly tripId: string;
  readonly fxSnapshotId: string | null;
  readonly merchant: string | null;
}): AddExpensePayload | null {
  const result = typedShares(input);
  if (result === null) return null;
  return {
    expense_id: input.expenseId,
    trip_id: input.tripId,
    amount_minor: Number(result.totalMinor),
    currency: input.currency,
    fx_snapshot_id: input.fxSnapshotId,
    payer_uid: input.payerId,
    split: {
      mode: 'fixed',
      shares: result.shares.map((share) => ({
        user_id: share.userId,
        fixed_minor: Number(share.amountMinor),
      })),
    },
    category: 'food',
    description: input.merchant ?? '',
    ...(input.merchant === null || input.merchant === '' ? {} : { merchant: input.merchant }),
  };
}
