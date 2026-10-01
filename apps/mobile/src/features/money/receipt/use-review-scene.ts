/**
 * Turns the scan's step and the server's parse into the scene the scan screen shows: the review
 * (who had each line, the payer, KEEP TOTAL, the result line) or the three ways forward, plus the
 * highlighted lines on the photo (all read lines, or the locked total and greyed lines).
 */
/* eslint-disable lingui/no-unlocalized-strings -- scene kinds and tones, never copy. */
import { perHeadMinor } from '@cp/cost-engine';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useMemo, useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { fxContextOf } from '../add-expense/preview';
import type { MoneyContext } from '../data/use-money-context';
import { useLiveRows } from '../data/live-rows';
import { FX_RUN_SQL, FX_TABLES, type FxRow } from '../data/queries';
import { formatAmount } from '../format';
import {
  initialAssignments,
  suggestionsOf,
  totalGap,
  type Assignments,
  type ParsedReceipt,
  type ReceiptView,
} from './review-model';
import { linesToCheck, resultParts, reviewRows, type ReviewCopy } from './review-rows';
import type { ScanScene } from './ScanView';
import type { SweepLine } from './ScanSweep';
import type { ScanControls } from './use-scan';

export function useReviewScene(input: {
  readonly ctx: MoneyContext;
  readonly scan: ScanControls;
  readonly view: ReceiptView;
  readonly autoSplit: boolean;
  readonly onPicker: (id: string | null) => void;
}) {
  const { ctx, scan, view } = input;
  const { t } = useLingui();
  const locale = useLocale();
  const members = ctx.splitMembers;
  const ids = members.map((member) => member.userId);
  const parsed: ParsedReceipt | null =
    view.kind === 'review' || view.kind === 'total_only' ? view.parsed : null;
  const suggestions = scan.receipt === null ? null : suggestionsOf(scan.receipt);
  const receiptId = scan.receipt?.id ?? null;
  const [edits, setEdits] = useState<{ id: string | null; assignments: Assignments } | null>(null);
  const [payerOverride, setPayer] = useState<string | null>(null);
  const [keepTotal, setKeepTotal] = useState(true);
  const assignments: Assignments =
    edits !== null && edits.id === receiptId
      ? edits.assignments
      : parsed === null
        ? {}
        : initialAssignments(parsed, input.autoSplit ? suggestions : null, ids);
  const payerId = payerOverride ?? suggestions?.payer_uid ?? ctx.uid ?? '';
  const crewCurrency = ctx.crew?.settlementCurrency ?? 'USD';
  const fxRows = useLiveRows<FxRow>(
    FX_RUN_SQL,
    parsed === null || parsed.currency === crewCurrency ? null : [parsed.currency, crewCurrency],
    FX_TABLES,
  );
  const fx = useMemo(
    () => (parsed === null ? null : fxContextOf(fxRows.rows, parsed.currency)),
    [fxRows.rows, parsed],
  );

  const copy: ReviewCopy = {
    everyone: upper(t({ id: 'money.review.everyone', message: 'Everyone' }), locale),
    byShare: upper(t({ id: 'money.review.byShare', message: 'By share' }), locale),
    not: (names) => upper(t({ id: 'money.review.not', message: `Not ${names}` }), locale),
    pays: (names) => t({ id: 'money.review.pays', message: `${names} pays` }),
    everyoneElse: t({ id: 'money.review.everyoneElse', message: 'Everyone else' }),
    amount: (minor) => formatAmount(minor, parsed?.currency ?? crewCurrency, locale),
  };

  const read = scan.read?.lines ?? [];
  const totalId = parsed?.total_line_id ?? null;
  // Lines to check stay lit on the photo, so they can be compared with the paper.
  const toCheck = parsed === null ? new Set<string>() : linesToCheck(parsed);
  const sweepLines: SweepLine[] = read.map((line) => ({
    id: line.id,
    box: line.bbox,
    tone:
      view.kind === 'total_only'
        ? line.id === totalId
          ? 'locked'
          : 'grey'
        : toCheck.has(line.id)
          ? 'locked'
          : ('read' as const),
  }));

  function assign(lineId: string, next: readonly string[] | null) {
    setEdits({ id: receiptId, assignments: { ...assignments, [lineId]: next } });
  }

  function build(actions: {
    readonly onCommit: () => void;
    readonly onEven: () => void;
    readonly locale: string;
  }): ScanScene {
    const step = scan.state.step;
    if (step === 'aim') return { kind: 'aim' };
    if (step === 'denied') return { kind: 'denied' };
    if (step === 'saved_offline') return { kind: 'offline' };
    if (step === 'upload_failed') return { kind: 'upload_failed' };
    if (parsed === null || step !== 'waiting') {
      return { kind: 'reading', waiting: step === 'waiting' };
    }
    const payerName = members.find((member) => member.userId === payerId)?.name ?? '';
    if (view.kind === 'total_only') {
      const total = BigInt(parsed.total_minor ?? 0);
      return {
        kind: 'failure',
        failure: {
          issue: scan.read?.quality ?? null,
          total: formatAmount(total, parsed.currency, actions.locale),
          merchant: parsed.merchant,
          each: formatAmount(
            members.length === 0 ? 0n : perHeadMinor(total, members.length),
            parsed.currency,
            actions.locale,
          ),
          onTypeLines: scan.typeLines,
          onRetake: scan.retake,
          onEven: actions.onEven,
          onBack: scan.retake,
        },
      };
    }
    const result = resultParts({
      parsed,
      assignments,
      members,
      payerId,
      keepTotal,
      crewCurrency,
      fx,
      copy,
    });
    const gap = totalGap(parsed);
    const linesText = formatAmount(
      BigInt(parsed.lines_total_minor),
      parsed.currency,
      actions.locale,
    );
    const printedText = formatAmount(
      BigInt(parsed.total_minor ?? 0),
      parsed.currency,
      actions.locale,
    );
    return {
      kind: 'review',
      review: {
        rows: reviewRows(parsed, assignments, members, copy),
        members,
        summary: result.parts.map((part) => ({
          who: part.who,
          amount: formatAmount(part.amountMinor, result.currency, actions.locale),
        })),
        payerName,
        mismatch:
          gap === 0n || parsed.total_minor === null
            ? null
            : {
                text: t({
                  id: 'money.review.mismatch',
                  message: `Lines add up to ${linesText}, the receipt says ${printedText}.`,
                }),
                keep: keepTotal,
              },
        onFix: scan.typeLines,
        committing: false,
        onLine: (lineId) => input.onPicker(lineId),
        onKeepTotal: setKeepTotal,
        onPayer: () => input.onPicker('payer'),
        onCommit: actions.onCommit,
      },
    };
  }

  return {
    parsed,
    assignments,
    payerId,
    keepTotal,
    fxSnapshotId: fx?.snapshotId ?? null,
    sweepLines,
    setPayer,
    assign,
    build,
  };
}
