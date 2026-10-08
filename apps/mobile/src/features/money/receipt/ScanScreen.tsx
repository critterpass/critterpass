/**
 * Scan a receipt (3i-3, 3i-4) against the real pipeline: capture, read on the device, upload, the
 * server's parse, then the itemised review (commit_receipt) or the three ways forward. Behind the
 * `money.receipts` flag; without the flag or the on-device reader it goes to manual entry.
 */
import { generateUuidV7 } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Linking } from 'react-native';

import type { SendResult } from '@/data/commands/client';
import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { useFlag } from '@/lib/analytics/flags';
import { goBackOr } from '@/lib/navigation/back';
import { useCommandFeedback, type CommandFeedbackCopy } from '@/motion/island-toast';

import { MONEY_FALLBACK, MoneyNoTripScreen, MoneyScreenLoading } from '../components/screen-states';
import { addExpenseCommand, commitReceiptCommand } from '../data/commands';
import { selectTrip, useSelectedTrip } from '../data/selected-trip';
import { useMoneyServices } from '../data/services';
import { useMoneyContext } from '../data/use-money-context';
import { useSendOnce } from '../data/use-send-once';
import { MONEY_ROUTES } from '../routes';
import { MemberPicker } from './MemberPicker';
import { receiptView, toCommitPayload } from './review-model';
import { ScanView } from './ScanView';
import { TypeLinesScreen } from './TypeLinesScreen';
import { useReceiptQueueDrain } from './receipt-queue';
import { useReviewScene } from './use-review-scene';
import { useScan, useWaitedTooLong } from './use-scan';
import { WalletGuideProvider } from '@/features/bookings';

/** The receipt was already turned into its expense (an earlier SPLIT IT whose answer was lost). */
function alreadyCommitted(result: SendResult): boolean {
  return (
    result.kind === 'rejected' &&
    result.code === 'STATE_INVALID' &&
    (result.detail as { state?: unknown } | undefined)?.state === 'committed'
  );
}

export function ScanScreen({ tripId: routeTripId = null }: { readonly tripId?: string | null }) {
  const services = useMoneyServices();
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a flag key, not copy
  const enabled = useFlag('money.receipts');
  const ctx = useMoneyContext(useSelectedTrip(), routeTripId);
  const trip =
    ctx.trip === null ? null : { id: ctx.trip.id, localCurrency: ctx.trip.localCurrency };
  const scan = useScan(services, trip);
  useReceiptQueueDrain(services);
  const locale = useLocale();
  const { t } = useLingui();
  const { report } = useCommandFeedback();
  const commit = useCommand(commitReceiptCommand);
  const add = useCommand(addExpenseCommand);
  const [autoSplit, setAutoSplit] = useState(true);
  const [picker, setPicker] = useState<string | null>(null);
  const view = useMemo(() => receiptView(scan.receipt), [scan.receipt]);
  const slow = useWaitedTooLong(
    scan.state.step === 'waiting' && view.kind === 'waiting' ? scan.state.receiptId : null,
  );
  // One receipt is one expense: its id is made once, and SPLIT IT is held while it goes out (a
  // repeat whose first answer was lost is refused as committed, which counts as done).
  const [expenseId] = useState(() => generateUuidV7());
  // SPLIT EVENLY is the same receipt's expense: taken by the first tap and kept once it is out.
  const even = useSendOnce();
  const scene = useReviewScene({
    ctx,
    scan,
    view,
    autoSplit,
    slow,
    committing: commit.pending,
    onPicker: setPicker,
  });

  const addRoute = (name: string | null) => ({
    pathname: MONEY_ROUTES.add,
    params: {
      ...(name === null ? {} : { name }),
      ...(routeTripId === null ? {} : { trip: routeTripId }),
    },
  });
  if (!enabled || services.reader === null) return <Redirect href={addRoute(null)} />;
  if (ctx.status === 'loading' || ctx.uid === null) return <MoneyScreenLoading />;
  if (ctx.trip === null) return <MoneyNoTripScreen crew={ctx.crew !== null} />;
  if (scan.state.step === 'typing') {
    return <TypeLinesScreen ctx={ctx} parsed={scene.parsed} receiptId={scan.state.receiptId} />;
  }

  // A step that went through says so and leaves for the balances; one that did not says so, and
  // what to do next, and the screen stays as it was.
  const settle = (result: SendResult, copy: CommandFeedbackCopy): boolean => {
    const outcome = report(result, { ...copy, id: 'money-receipt' });
    const went = outcome === 'done' || (outcome === 'queued' && copy.offlineCapable === true);
    if (went) {
      // Balances shows the trip the receipt went to.
      if (routeTripId !== null) selectTrip(routeTripId);
      router.dismissTo(MONEY_ROUTES.balances);
    }
    return went;
  };

  // Typing it in starts from what the server read of the shop's name.
  const typeItIn = () =>
    router.replace(addRoute(view.kind === 'unreadable' ? view.merchant : null));

  async function onCommit() {
    if (scene.parsed === null || scan.receipt === null || commit.pending) return;
    const result = await commit.send(
      toCommitPayload({
        receiptId: scan.receipt.id,
        expenseId,
        payerId: scene.payerId,
        parsed: scene.parsed,
        assignments: scene.assignments,
        keepTotal: scene.keepTotal,
      }),
    );
    // An earlier SPLIT IT whose answer was lost already made the expense: that is done too.
    settle(
      alreadyCommitted(result) ? { kind: 'applied', opId: result.opId, result: null } : result,
      {
        done: t({ id: 'money.scan.committed', message: 'Split. Balances re-count.' }),
        needsSignal: t({
          id: 'money.scan.commitOffline',
          message: "Couldn't reach CritterPass. Try SPLIT IT again when you're online.",
        }),
        refused: t({
          id: 'money.scan.commitRefused',
          message: "That split didn't go through. Try again, or type it in.",
        }),
      },
    );
  }

  async function onEven() {
    if (scene.parsed?.total_minor == null || ctx.trip === null || !even.take()) return;
    const result = await add.send({
      expense_id: expenseId,
      trip_id: ctx.trip.id,
      amount_minor: scene.parsed.total_minor,
      currency: scene.parsed.currency,
      fx_snapshot_id: scene.fxSnapshotId,
      payer_uid: scene.payerId,
      split: {
        mode: 'equal',
        shares: ctx.splitMembers.map((member) => ({ user_id: member.userId })),
      },
      category: 'food',
      description: scene.parsed.merchant ?? '',
      ...(scene.parsed.merchant === null ? {} : { merchant: scene.parsed.merchant }),
    });
    const went = settle(result, {
      done: t({ id: 'money.scan.splitEven', message: 'Split evenly. Balances re-count.' }),
      offlineCapable: true,
      refused: t({
        id: 'money.scan.evenRefused',
        message: "That didn't go through. Try again, or type it in.",
      }),
    });
    if (!went) even.release();
  }

  const photoUri =
    scan.state.step === 'reading' ||
    scan.state.step === 'uploading' ||
    scan.state.step === 'waiting'
      ? scan.state.uri
      : null;
  const pickerLine = scene.parsed?.lines.find((line) => line.line_id === picker) ?? null;
  return (
    <WalletGuideProvider tripId={ctx.trip?.id ?? null}>
      <>
        <ScanView
          scene={scene.build({
            onCommit: () => void onCommit(),
            onEven: () => void onEven(),
            locale,
          })}
          autoSplit={autoSplit}
          photo={
            photoUri === null ? null : (
              <Image
                source={{ uri: photoUri }}
                style={{ width: '100%', aspectRatio: 0.7 }}
                resizeMode="contain"
              />
            )
          }
          lines={scene.sweepLines}
          onAutoSplit={() => setAutoSplit((on) => !on)}
          onClose={() => goBackOr(MONEY_FALLBACK)}
          onScan={() => void scan.scan()}
          onPick={() => void scan.pick()}
          onType={typeItIn}
          onRetake={scan.retake}
          onSettings={() => void Linking.openSettings()}
        />
        {picker === 'payer' ? (
          <MemberPicker
            title={t({ id: 'money.scan.whoPaid', message: 'Who paid?' })}
            members={ctx.splitMembers}
            selected={[scene.payerId]}
            onDone={(next) => {
              const id = next?.[0];
              if (id !== undefined) scene.setPayer(id);
              setPicker(null);
            }}
            onClose={() => setPicker(null)}
          />
        ) : pickerLine !== null ? (
          <MemberPicker
            title={pickerLine.label}
            members={ctx.splitMembers}
            selected={scene.assignments[pickerLine.line_id] ?? null}
            onDone={(next) => {
              scene.assign(pickerLine.line_id, next);
              setPicker(null);
            }}
            onClose={() => setPicker(null)}
          />
        ) : null}
      </>
    </WalletGuideProvider>
  );
}
