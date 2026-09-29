/**
 * Money lab scenes for the receipt scan (3i-3, 3i-4) and the steps around it, over the drawn Ibu
 * Oka receipt: aiming, the camera refused, reading, saved offline, the itemised review with the
 * design's suggestions, the three ways forward, and typing the lines.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { formatAmount } from '../format';
import { initialAssignments, type Assignments } from '../receipt/review-model';
import { resultParts, reviewRows, type ReviewCopy } from '../receipt/review-rows';
import type { SweepLine } from '../receipt/ScanSweep';
import { ScanView, type ScanScene } from '../receipt/ScanView';
import { TypeLinesEditor } from '../receipt/TypeLinesEditor';
import { prefillLines } from '../receipt/type-lines-model';
import {
  IBU_OKA,
  IBU_OKA_SUGGESTIONS,
  IBU_OKA_TOTAL_ONLY,
  LAB_FX,
  LAB_MEMBERS,
} from './lab-fixtures';
import { IBU_OKA_ROWS, ReceiptPaper } from './ReceiptPaper';

const noop = () => undefined;
const ids = LAB_MEMBERS.map((member) => member.userId);

function useCopy(): ReviewCopy {
  const { t } = useLingui();
  const locale = useLocale();
  return {
    everyone: upper(t({ id: 'money.review.everyone', message: 'Everyone' }), locale),
    byShare: upper(t({ id: 'money.review.byShare', message: 'By share' }), locale),
    not: (names) => upper(t({ id: 'money.review.not', message: `Not ${names}` }), locale),
    pays: (names) => t({ id: 'money.review.pays', message: `${names} pays` }),
    everyoneElse: t({ id: 'money.review.everyoneElse', message: 'Everyone else' }),
  };
}

function lines(tone: (id: string) => SweepLine['tone']): SweepLine[] {
  return IBU_OKA_ROWS.filter((row) => row.kind !== 'head').map((row) => ({
    id: row.id,
    box: row.box,
    tone: tone(row.id),
  }));
}

function Scene({
  scene,
  photo = true,
  folded = false,
  sweep = lines(() => 'read').filter((line) => line.id !== 'l6'),
}: {
  readonly scene: ScanScene;
  readonly photo?: boolean;
  readonly folded?: boolean;
  readonly sweep?: readonly SweepLine[];
}) {
  return (
    <ScanView
      scene={scene}
      autoSplit
      photo={photo ? <ReceiptPaper folded={folded} /> : null}
      lines={photo ? sweep : []}
      onAutoSplit={noop}
      onClose={noop}
      onScan={noop}
      onPick={noop}
      onType={noop}
      onSettings={noop}
    />
  );
}

function Review() {
  const copy = useCopy();
  const locale = useLocale();
  const assignments: Assignments = initialAssignments(IBU_OKA, IBU_OKA_SUGGESTIONS, ids);
  const result = resultParts({
    parsed: IBU_OKA,
    assignments,
    members: LAB_MEMBERS,
    payerId: 'u-maya',
    keepTotal: true,
    crewCurrency: 'USD',
    fx: LAB_FX,
    copy,
  });
  return (
    <Scene
      scene={{
        kind: 'review',
        review: {
          rows: reviewRows(IBU_OKA, assignments, LAB_MEMBERS, copy),
          members: LAB_MEMBERS,
          summary: result.parts.map((part) => ({
            who: part.who,
            amount: formatAmount(part.amountMinor, result.currency, locale),
          })),
          payerName: 'Maya',
          mismatch: null,
          committing: false,
          onLine: noop,
          onKeepTotal: noop,
          onPayer: noop,
          onCommit: noop,
        },
      }}
    />
  );
}

function Failure() {
  const locale = useLocale();
  return (
    <Scene
      folded
      sweep={lines((id) => (id === 'l6' ? 'locked' : 'grey'))}
      scene={{
        kind: 'failure',
        failure: {
          issue: 'crumpled',
          total: formatAmount(108_000_000n, 'IDR', locale),
          merchant: IBU_OKA.merchant,
          each: formatAmount(1137n, 'USD', locale),
          onTypeLines: noop,
          onRetake: noop,
          onEven: noop,
          onBack: noop,
        },
      }}
    />
  );
}

function TypeLines() {
  const { t } = useLingui();
  const typed = prefillLines({ ...IBU_OKA_TOTAL_ONLY, lines: IBU_OKA.lines.slice(1, 2) });
  return (
    <TypeLinesEditor
      lines={typed}
      currency="IDR"
      totalMinor={108_000_000n}
      focus={typed[typed.length - 1]?.id ?? null}
      whoLabel={() => t({ id: 'money.typeLines.everyone', message: 'Everyone had it' })}
      payerName="Maya"
      canCommit
      committing={false}
      onFocus={noop}
      onLabel={noop}
      onKey={noop}
      onWho={noop}
      onAddLine={noop}
      onCommit={noop}
    />
  );
}

export const SCAN_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'scan-aim': () => <Scene scene={{ kind: 'aim' }} photo={false} />,
  'scan-denied': () => <Scene scene={{ kind: 'denied' }} photo={false} />,
  'scan-reading': () => <Scene scene={{ kind: 'reading', waiting: false }} />,
  'scan-offline': () => <Scene scene={{ kind: 'offline' }} />,
  'scan-review': () => <Review />,
  'scan-failure': () => <Failure />,
  'scan-type-lines': () => <TypeLines />,
};
