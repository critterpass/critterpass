/**
 * One payment, wired up. The payer's view asks the api for the payee's payout details (online,
 * audited, kept in memory only) and marks paid through the offline queue (creating the payment
 * when nobody requested it yet). The payee requests, nudges, confirms or disputes online.
 */
import { generateUuidV7, type PaymentMethod } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { feedback } from '@/motion';
import { toast } from '@/motion/island-toast';

import { MoneyLoading } from '../balances/BalancesScreen';
import { buildBalances } from '../balances/model';
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
import { amountPaidDigits, amountPaidMinor, isAmountPaidValid } from './amount-paid';
import { settleRows } from './model';
import { PaymentDetail, type RevealState } from './PaymentDetail';

export function PaymentScreen({ id }: { readonly id: string }) {
  const ctx = useMoneyContext(useSelectedTrip());
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const services = useMoneyServices();
  const { t } = useLingui();
  const mark = useCommand(markPaidCommand);
  const request = useCommand(requestPaymentCommand);
  const nudge = useCommand(nudgePaymentCommand);
  const confirm = useCommand(confirmPaidCommand);
  const dispute = useCommand(disputePaymentCommand);
  const [reveal, setReveal] = useState<RevealState>({ kind: 'loading' });
  const [method, setMethod] = useState<PaymentMethod>('bank');
  const [digits, setDigits] = useState<string | null>(null);
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

  if (ctx.status === 'loading' || !rows.loaded || ctx.trip === null) return <MoneyLoading />;
  if (row === null) return <MoneyLoading />;
  const tripId = ctx.trip.id;
  const name = (uid: string) => ctx.members.find((member) => member.userId === uid)?.name ?? '';
  const amountDigits = digits ?? amountPaidDigits(row.amountMinor, row.currency);
  const paid = amountPaidMinor(amountDigits, row.amountMinor, row.currency);
  const amountValid = isAmountPaidValid(paid, row.amountMinor);

  const done = (title: string) => {
    feedback.emit('success');
    toast.show({ id: 'money-payment', title });
    router.back();
  };
  const failed = () => feedback.emit('error');

  async function onMarkPaid() {
    if (row === null) return;
    const partial = paid < row.amountMinor ? { amount_minor: Number(paid) } : {};
    const result = await mark.send(
      row.paymentId === null
        ? {
            payment_id: generateUuidV7(),
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
    );
    if (result.kind === 'rejected' || result.kind === 'unavailable') return failed();
    done(t({ id: 'money.pay.marked', message: 'Marked paid. They confirm when it lands.' }));
  }

  async function onRequest() {
    if (row === null) return;
    const result = await request.send({
      payment_id: generateUuidV7(),
      trip_id: tripId,
      from_uid: row.fromId,
      amount_minor: Number(row.amountMinor),
      currency: row.currency,
    });
    if (result.kind !== 'applied') return failed();
    const who = name(row.fromId);
    done(t({ id: 'money.pay.requested', message: `Asked ${who} to pay.` }));
  }

  async function onSimple(kind: 'nudge' | 'confirm' | 'dispute') {
    if (row?.paymentId == null) return;
    const payload = { payment_id: row.paymentId };
    const who = name(row.fromId);
    const result =
      kind === 'nudge'
        ? await nudge.send(payload)
        : kind === 'confirm'
          ? await confirm.send(payload)
          : await dispute.send(payload);
    if (result.kind !== 'applied') return failed();
    done(
      kind === 'nudge'
        ? t({ id: 'money.settle.nudged', message: `Nudged ${who}. Gently.` })
        : kind === 'confirm'
          ? t({ id: 'money.pay.confirmed', message: 'Confirmed. Balances re-count.' })
          : t({ id: 'money.pay.disputed', message: `Told ${who} it didn't arrive.` }),
    );
  }

  return (
    <PaymentDetail
      row={row}
      fromName={name(row.fromId)}
      toName={name(row.toId)}
      reveal={paymentId === null ? { kind: 'unavailable' } : reveal}
      method={method}
      amountDigits={amountDigits}
      amountValid={amountValid}
      busy={mark.pending || request.pending || confirm.pending || dispute.pending}
      onMethod={setMethod}
      onAmount={setDigits}
      onMarkPaid={() => void onMarkPaid()}
      onRequest={() => void onRequest()}
      onNudge={() => void onSimple('nudge')}
      onConfirm={() => void onSimple('confirm')}
      onDispute={() => void onSimple('dispute')}
      onCopy={(text) => {
        void services.copy(text);
        toast.show({ id: 'money-copied', title: t({ id: 'money.pay.copied', message: 'Copied' }) });
      }}
      onOpen={(url) => void services.openUrl(url)}
    />
  );
}
