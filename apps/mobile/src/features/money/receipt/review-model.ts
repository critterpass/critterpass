/**
 * The itemised receipt review: the server's validated parse (every amount re-read from its OCR
 * line) and its suggestions become who-had-what per line; the engine splits it (items to whoever
 * had them, service/tax/tip by share of items) and the result is summed up the way the sheet reads
 * it ("Jordan pays $1.50 · Everyone else $13.34"). The commit sends assignments only: amounts
 * always come from the server's parse.
 */
/* eslint-disable lingui/no-unlocalized-strings -- line kinds and statuses are wire values. */
import { itemisedShares, type ItemisedLine, type ReceiptLineKind } from '@cp/cost-engine';
import type { CommitReceiptPayload, ReceiptSuggestions } from '@cp/domain';

import { json, type ReceiptRow } from '../data/queries';

export interface ParsedLine {
  readonly line_id: string;
  readonly label: string;
  readonly qty: number | null;
  readonly amount_minor: number;
  readonly kind: ReceiptLineKind;
}

export interface ParsedReceipt {
  readonly merchant: string | null;
  readonly datetime: string | null;
  readonly currency: string;
  readonly lines: readonly ParsedLine[];
  readonly total_minor: number | null;
  readonly total_line_id: string | null;
  readonly lines_total_minor: number;
  readonly matches_total: boolean;
  readonly status: 'parsed' | 'partial' | 'failed';
}

/** Who had each item line; `null` means everyone in the split. */
export type Assignments = Readonly<Record<string, readonly string[] | null>>;

export function parsedOf(row: Pick<ReceiptRow, 'parsed'>): ParsedReceipt | null {
  return json<ParsedReceipt | null>(row.parsed, null);
}

export function suggestionsOf(row: Pick<ReceiptRow, 'suggestions'>): ReceiptSuggestions | null {
  return json<ReceiptSuggestions | null>(row.suggestions, null);
}

/** Starting assignments: everyone had every item, less whoever a suggestion leaves out. */
export function initialAssignments(
  parsed: ParsedReceipt,
  suggestions: ReceiptSuggestions | null,
  members: readonly string[],
): Assignments {
  const out: Record<string, readonly string[] | null> = {};
  for (const line of parsed.lines) {
    if (line.kind !== 'item') continue;
    const exclude = suggestions?.lines.find((s) => s.line_id === line.line_id)?.exclude ?? [];
    const kept = members.filter((id) => !exclude.includes(id));
    out[line.line_id] = exclude.length === 0 || kept.length === 0 ? null : kept;
  }
  return out;
}

/** The gap between the printed total and the lines, shared by share when keeping the total. */
export function totalGap(parsed: ParsedReceipt): bigint {
  if (parsed.total_minor === null) return 0n;
  return BigInt(parsed.total_minor) - BigInt(parsed.lines_total_minor);
}

export function receiptLines(
  parsed: ParsedReceipt,
  assignments: Assignments,
  keepTotal: boolean,
): ItemisedLine[] {
  const lines: ItemisedLine[] = parsed.lines.map((line) => ({
    lineId: line.line_id,
    kind: line.kind,
    amountMinor: BigInt(line.amount_minor),
    ...(line.kind === 'item' ? { assignees: assignments[line.line_id] ?? [] } : {}),
  }));
  const gap = totalGap(parsed);
  if (keepTotal && gap !== 0n) {
    lines.push({
      lineId: 'keep_total',
      kind: gap > 0n ? 'service' : 'discount',
      amountMinor: gap > 0n ? gap : -gap,
    });
  }
  return lines;
}

/** Each member's share in the receipt currency, in `members` order. */
export function receiptShares(
  parsed: ParsedReceipt,
  assignments: Assignments,
  members: readonly string[],
  payerId: string,
  keepTotal: boolean,
) {
  return itemisedShares({ members, payerId, lines: receiptLines(parsed, assignments, keepTotal) });
}

export interface ShareGroup {
  readonly userIds: readonly string[];
  readonly amountMinor: bigint;
}

/**
 * Members grouped by what they pay, the smallest group first ("Jordan pays $1.50", then "Everyone
 * else $13.34"); members at zero are left out.
 */
export function shareGroups(
  shares: readonly { readonly userId: string; readonly amountMinor: bigint }[],
): ShareGroup[] {
  const byAmount = new Map<bigint, string[]>();
  for (const share of shares) {
    if (share.amountMinor === 0n) continue;
    byAmount.set(share.amountMinor, [...(byAmount.get(share.amountMinor) ?? []), share.userId]);
  }
  return [...byAmount.entries()]
    .map(([amountMinor, userIds]) => ({ userIds, amountMinor }))
    .sort(
      (a, b) => a.userIds.length - b.userIds.length || (a.amountMinor < b.amountMinor ? -1 : 1),
    );
}

export type ReceiptView =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'review'; readonly parsed: ParsedReceipt }
  | { readonly kind: 'total_only'; readonly parsed: ParsedReceipt }
  | { readonly kind: 'unreadable'; readonly merchant: string | null };

/**
 * What the scan shows once the server has answered: the itemised review when there are item
 * lines, the three-way sheet when only the total was read, the manual entry when nothing was.
 */
export function receiptView(row: Pick<ReceiptRow, 'status' | 'parsed'> | null): ReceiptView {
  if (row === null || row.status === 'queued') return { kind: 'waiting' };
  const parsed = parsedOf(row);
  if (parsed === null || row.status === 'failed') {
    return { kind: 'unreadable', merchant: parsed?.merchant ?? null };
  }
  const items = parsed.lines.filter((line) => line.kind === 'item');
  if (items.length > 0) return { kind: 'review', parsed };
  if (parsed.total_minor !== null) return { kind: 'total_only', parsed };
  return { kind: 'unreadable', merchant: parsed.merchant };
}

export function toCommitPayload(input: {
  readonly receiptId: string;
  readonly expenseId: string;
  readonly payerId: string;
  readonly parsed: ParsedReceipt;
  readonly assignments: Assignments;
  readonly keepTotal: boolean;
}): CommitReceiptPayload {
  return {
    receipt_id: input.receiptId,
    expense_id: input.expenseId,
    payer_uid: input.payerId,
    lines: input.parsed.lines
      .filter((line) => line.kind === 'item')
      .map((line) => ({
        line_id: line.line_id,
        assignment: [...(input.assignments[line.line_id] ?? [])],
      })),
    keep_total: input.keepTotal,
    category: 'food',
  };
}
