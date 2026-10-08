/**
 * One payment, wired up. The payer's view asks the api for the payee's payout details (online,
 * audited, kept in memory only) and marks paid through the offline queue (creating the payment
 * when nobody requested it yet). The payee requests, nudges, confirms or disputes online: each
 * answer is said (no signal, refused and why, or done), and "It didn't arrive" asks first, since it
 * tells a crewmate their payment is disputed.
 */
import { generateUuidV7, type PaymentMethod } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { SendResult } from '@/data/commands/client';
import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';
import { toast, useCommandFeedback, type CommandFeedbackCopy } from '@/motion/island-toast';

import { buildBalances } from '../balances/model';
import { MoneyNoTripScreen, MoneyScreenLoading, PaymentGone } from '../components/screen-states';
import {
  confirmPaidCommand,
  disputePaymentCommand,
  markPaidCommand,
  nudgePaymentCommand,
  requestPaymentCommand,
} from '../data/commands';
import { useSelectedTrip } from '../data/selected-trip';
import { useMoneyServices } from '../data/services';
import { useMoneyContext } from '../data/use-money-context';
import { useTripMoney } from '../data/use-trip-money';
import { MONEY_ROUTES } from '../routes';
import { amountPaidDigits, amountPaidMinor, isAmountPaidValid } from './amount-paid';
import { useSettleCopy } from './command-copy';
import { DisputeSheet } from './DisputeSheet';
import { settleRows } from './model';
import { PaymentDetail, type RevealState } from './PaymentDetail';

export function PaymentScreen({
  id,
  tripId: routeTripId = null,
}: {
  readonly id: string;
  readonly tripId?: string | null;
}) {
  const ctx = useMoneyContext(useSelectedTrip(), routeTripId);
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const services = useMoneyServices();
  const { t } = useLingui();
  const { report } = useCommandFeedback();
  const copy = useSettleCopy();
  const mark = useCommand(markPaidCommand);
  const request = useCommand(requestPaymentCommand);
  const nudge = useCommand(nudgePaymentCommand);
  const confirm = useCommand(confirmPaidCommand);
  const dispute = useCommand(disputePaymentCommand);
  const [reveal, setReveal] = useState<RevealState>({ kind: 'loading' });
  const [method, setMethod] = useState<PaymentMethod>('bank');
  const [digits, setDigits] = useState<string | null>(null);
  const [disputing, setDisputing] = useState(false);
  // A payment made here (a mark or a request with no payment yet) keeps one id however often its
  // button is tapped, so a repeat can only name the same payment.
  const [newPaymentId] = useState(() => generateUuidV7());
  // Held from the tap that sends until its answer: one action at a time, none sent twice.
  const sending = useRef(false);
  const currency = ctx.crew?.settlementCurrency ?? 'USD';

  const row = useMemo(() => {
    if (ctx.uid === null) return null;
    try {
      const model = buildBalances({
        uid: ctx.uid,
        members: ctx.members,
        shown: ctx.splitMembers,
        ledger: rows.ledger,
        payments: rows.payments,
        expenses: rows.expenses,
        currency,
      });
      const list = settleRows({
        uid: ctx.uid,
        payments: rows.payments,
        plan: model.plan,
        currency,
        now: new Date(),
      });
      return list.find((candidate) => candidate.key === id) ?? null;
    } catch {
      return null;
    }
  }, [ctx, rows, currency, id]);

  const paymentId = row?.paymentId ?? null;
  const isPayer = row?.role === 'payer';
  useEffect(() => {
    if (!isPayer || paymentId === null) return undefined;
    let live = true;
    void services.revealPayout(paymentId).then((outcome) => {
      if (!live) return;
      setReveal(
        outcome.kind === 'ok'
          ? { kind: 'ok', methods: outcome.value }
          : outcome.kind === 'offline'
            ? { kind: 'offline' }
            : { kind: 'unavailable' },
      );
      if (outcome.kind === 'ok' && outcome.value[0] !== undefined) {
        const kind = outcome.value[0].kind;
        setMethod(kind === 'wise_link' ? 'wise' : kind);
      }
    });
    return () => {
      live = false;
    };
  }, [isPayer, paymentId, services]);

  if (ctx.status === 'loading' || (ctx.status === 'ready' && !rows.loaded)) {
    return <MoneyScreenLoading />;
  }
  if (ctx.trip === null) return <MoneyNoTripScreen crew={ctx.crew !== null} />;
  if (row === null) return <PaymentGone />;
  const tripId = ctx.trip.id;
  const name = (uid: string) => ctx.members.find((member) => member.userId === uid)?.name ?? '';
  const amountDigits = digits ?? amountPaidDigits(row.amountMinor, row.currency);
  const paid = amountPaidMinor(amountDigits, row.amountMinor, row.currency);
  const amountValid = isAmountPaidValid(paid, row.amountMinor);

  /** Sends one action, says what it did, and leaves for Settle up only when it went through. */
  async function act(send: () => Promise<SendResult>, feedback: CommandFeedbackCopy) {
    if (sending.current) return;
    sending.current = true;
    try {
      const outcome = report(await send(), feedback);
      if (outcome === 'done' || (outcome === 'queued' && feedback.offlineCapable === true)) {
        goBackOr(MONEY_ROUTES.settle);
      }
    } finally {
      sending.current = false;
    }
  }

  function onMarkPaid() {
    if (row === null || !amountValid) return;
    const partial = paid < row.amountMinor ? { amount_minor: Number(paid) } : {};
    void act(
      () =>
        mark.send(
          row.paymentId === null
            ? {
                payment_id: newPaymentId,
                method,
                ...partial,
                create: {
                  trip_id: tripId,
                  to_uid: row.toId,
                  amount_minor: Number(row.amountMinor),
                  currency: row.currency,
                },
              }
            : { payment_id: row.paymentId, method, ...partial },
          row.version === null ? undefined : { baseVersion: row.version },
        ),
      copy('markPaid'),
    );
  }

  function onRequest() {
    if (row === null) return;
    void act(
      () =>
        request.send({
          payment_id: newPaymentId,
          trip_id: tripId,
          from_uid: row.fromId,
          amount_minor: Number(row.amountMinor),
          currency: row.currency,
        }),
      copy('request', name(row.fromId)),
    );
  }

  function onSimple(kind: 'nudge' | 'confirm' | 'dispute', note?: string) {
    if (row?.paymentId == null) return;
    const payload = { payment_id: row.paymentId };
    void act(
      () =>
        kind === 'nudge'
          ? nudge.send(payload)
          : kind === 'confirm'
            ? confirm.send(payload)
            : dispute.send(note === undefined || note === '' ? payload : { ...payload, note }),
      copy(kind, name(row.fromId)),
    );
  }

  return (
    <>
      <PaymentDetail
        row={row}
        fromName={name(row.fromId)}
        toName={name(row.toId)}
        reveal={paymentId === null ? { kind: 'unavailable' } : reveal}
        method={method}
        amountDigits={amountDigits}
        amountValid={amountValid}
        busy={
          mark.pending || request.pending || nudge.pending || confirm.pending || dispute.pending
        }
        onMethod={setMethod}
        onAmount={setDigits}
        onMarkPaid={onMarkPaid}
        onRequest={onRequest}
        onNudge={() => onSimple('nudge')}
        onConfirm={() => onSimple('confirm')}
        onDispute={() => setDisputing(true)}
        onCopy={(text) => {
          void services.copy(text);
          toast.show({
            id: 'money-copied',
            title: t({ id: 'money.pay.copied', message: 'Copied' }),
          });
        }}
        onOpen={(url) => void services.openUrl(url)}
      />
      {disputing ? (
        <DisputeSheet
          payerName={name(row.fromId)}
          onCancel={() => setDisputing(false)}
          onConfirm={(note) => {
            setDisputing(false);
            onSimple('dispute', note);
          }}
        />
      ) : null}
    </>
  );
}
