/**
 * `commit_receipt` (docs/api-contracts.md §4.9, offline): the scanner (or any trip member) turns a
 * parsed receipt into an itemised expense. Every amount comes from the server's validated parse;
 * the client only says who had each item line (none named = everyone) and who paid. Service, tax
 * and tip lines are shared in proportion to each member's items; `keep_total` shares the gap to
 * the printed total the same way. Receipts are free (no guide quota).
 */
import { itemisedShares, type ItemisedLine } from '@cp/cost-engine';
import {
  commitReceiptPayloadSchema,
  DomainError,
  type ExpenseResult,
  type ReceiptStatus,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { createExpense } from '../../money/expense-writer';
import { defineCommand } from '../_framework/define-command';
import {
  localDateIn,
  requireAllInTrip,
  requireMoneyMember,
  tripDayOf,
  tripMoneyMembers,
} from './shared';

interface ParsedLine {
  readonly line_id: string;
  readonly kind: ItemisedLine['kind'];
  readonly amount_minor: number;
  readonly label: string;
}

interface ReceiptRow {
  readonly id: string;
  readonly trip_id: string;
  readonly status: ReceiptStatus;
  readonly parsed: {
    readonly currency: string;
    readonly merchant: string | null;
    readonly lines: readonly ParsedLine[];
    readonly total_minor: number | null;
  } | null;
}

async function loadReceipt(tx: pg.PoolClient, receiptId: string): Promise<ReceiptRow> {
  const { rows } = await tx.query<ReceiptRow>(
    'SELECT id, trip_id, status, parsed FROM receipts WHERE id = $1',
    [receiptId],
  );
  const receipt = rows[0];
  if (receipt === undefined) throw new DomainError('NOT_FOUND', { reason: 'receipt' });
  return receipt;
}

export const commitReceiptCommand = defineCommand({
  name: 'commit_receipt',
  v: 1,
  schema: commitReceiptPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const receipt = await loadReceipt(tx, payload.receipt_id);
    await requireMoneyMember(tx, receipt.trip_id, ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<ExpenseResult> => {
    const receipt = await loadReceipt(tx, payload.receipt_id);
    if (receipt.status !== 'parsed' && receipt.status !== 'partial') {
      throw new DomainError('STATE_INVALID', { state: receipt.status });
    }
    const parsed = receipt.parsed;
    if (parsed === null || !parsed.lines.some((line) => line.kind === 'item')) {
      throw new DomainError('STATE_INVALID', { reason: 'no_lines' });
    }
    const trip = await requireMoneyMember(tx, receipt.trip_id, ctx.uid);
    const members = await tripMoneyMembers(tx, trip.id);
    const named = payload.lines.flatMap((line) => line.assignment);
    requireAllInTrip(members, [payload.payer_uid, ...named]);
    const known = new Set(parsed.lines.map((line) => line.line_id));
    const unknown = payload.lines.filter((line) => !known.has(line.line_id));
    if (unknown.length > 0) {
      throw new DomainError('VALIDATION', {
        reason: 'unknown_line',
        line_ids: unknown.map((line) => line.line_id),
      });
    }
    const assignment = new Map(payload.lines.map((line) => [line.line_id, line.assignment]));
    const lines: ItemisedLine[] = parsed.lines.map((line) => ({
      lineId: line.line_id,
      kind: line.kind,
      amountMinor: BigInt(line.amount_minor),
      ...(line.kind === 'item' ? { assignees: assignment.get(line.line_id) ?? [] } : {}),
    }));
    let split = itemisedShares({ members, payerId: payload.payer_uid, lines });
    const printed = parsed.total_minor === null ? null : BigInt(parsed.total_minor);
    if (payload.keep_total && printed !== null && printed !== split.totalMinor) {
      const gap = printed - split.totalMinor;
      split = itemisedShares({
        members,
        payerId: payload.payer_uid,
        lines: [
          ...lines,
          {
            lineId: 'keep_total',
            kind: gap > 0n ? 'service' : 'discount',
            amountMinor: gap > 0n ? gap : -gap,
          },
        ],
      });
    }
    const spentAt = ctx.clock.effectiveClientTs;
    const localDate = localDateIn(trip.tz, spentAt);
    const result = await createExpense(tx, {
      id: payload.expense_id,
      crewId: trip.crew_id,
      tripId: trip.id,
      payerId: payload.payer_uid,
      amountMinor: split.totalMinor,
      currency: parsed.currency,
      fxSnapshotId: null,
      crewCurrency: trip.crew_currency,
      splitMode: 'items',
      category: payload.category,
      description: parsed.merchant ?? '',
      merchant: parsed.merchant,
      spentAt,
      localDate,
      tripDay: tripDayOf(trip.start_date, localDate),
      shares: split.shares.map((share) => ({
        userId: share.userId,
        weight: 1,
        fixedMinor: null,
        computedMinor: share.amountMinor,
      })),
      createdBy: ctx.uid,
      source: 'receipt',
      poiId: null,
      receiptId: receipt.id,
    });
    await asSystemRole(tx, () =>
      tx.query("UPDATE receipts SET status = 'committed', expense_id = $2 WHERE id = $1", [
        receipt.id,
        payload.expense_id,
      ]),
    );
    return result;
  },
});
