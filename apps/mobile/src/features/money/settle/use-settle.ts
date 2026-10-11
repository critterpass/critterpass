/**
 * Settle up for either UI, against synced rows: the engine's plan from the trip ledger, the
 * payments on it, your payout kinds (from the api, never stored), nudges and remind-everyone
 * (online), and whether your Settled sticker for this trip has arrived.
 */
import { payoutKindsFor, type PayoutKind } from '@cp/domain';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { useCommandFeedback } from '@/motion/island-toast';

import { buildBalances } from '../balances/model';
import { nudgePaymentCommand, remindAllPaymentsCommand } from '../data/commands';
import { useSelectedTrip } from '../data/selected-trip';
import { useMoneyServices } from '../data/services';
import { useMoneyContext } from '../data/use-money-context';
import { useTripMoney } from '../data/use-trip-money';
import { MONEY_ROUTES, paymentRoute } from '../routes';
import { useSettleCopy } from './command-copy';
import { canRemind, openCount, planKey, settleRows, type SettleRowModel } from './model';
import { useSettledCeremony } from './use-settled-ceremony';

export type SettleState = ReturnType<typeof useSettle>;

export function useSettle(routeTripId: string | null = null) {
  const ctx = useMoneyContext(useSelectedTrip(), routeTripId);
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const services = useMoneyServices();
  const sync = useSyncStatus();
  const { report } = useCommandFeedback();
  const copy = useSettleCopy();
  const nudge = useCommand(nudgePaymentCommand);
  const remind = useCommand(remindAllPaymentsCommand);
  const [myKinds, setMyKinds] = useState<readonly PayoutKind[]>([]);
  const currency = ctx.crew?.settlementCurrency ?? 'USD';
  const settled = useSettledCeremony(ctx.uid, ctx.trip?.id ?? null);

  useEffect(() => {
    let live = true;
    void services.myPayoutMethods().then((outcome) => {
      if (live && outcome.kind === 'ok') setMyKinds(outcome.value.map((method) => method.kind));
    });
    return () => {
      live = false;
    };
  }, [services]);

  const list = useMemo(() => {
    if (ctx.uid === null) return [];
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
      return settleRows({
        uid: ctx.uid,
        payments: rows.payments,
        plan: model.plan,
        currency,
        now: new Date(),
      });
    } catch {
      return [];
    }
  }, [ctx, rows, currency]);

  if (ctx.status === 'loading' || (ctx.status === 'ready' && !rows.loaded)) {
    return { kind: 'loading' } as const;
  }
  if (ctx.trip === null) return { kind: 'no-trip', crew: ctx.crew !== null } as const;
  const tripId = ctx.trip.id;

  async function onNudge(row: SettleRowModel) {
    if (row.paymentId === null || nudge.pending) return;
    const who = ctx.members.find((member) => member.userId === row.fromId)?.name ?? '';
    report(await nudge.send({ payment_id: row.paymentId }), copy('nudge', who));
  }

  async function onRemind() {
    if (remind.pending) return;
    report(await remind.send({ trip_id: tripId }), copy('remind'));
  }

  const onKind = () => router.push(MONEY_ROUTES.payoutMethods);
  return {
    kind: 'ready',
    tripId,
    trip: ctx.trip,
    rows: list,
    members: ctx.members,
    expenses: rows.expenses.length,
    open: openCount(list),
    people: ctx.splitMembers.length,
    settled,
    offline: sync.phase === 'offline',
    kinds: payoutKindsFor(ctx.homeCountry),
    myKinds,
    canRemind: canRemind(list),
    reminding: remind.pending,
    onKind,
    onNudge: (row: SettleRowModel) => void onNudge(row),
    onRow: (row: SettleRowModel) =>
      router.push(paymentRoute(row.paymentId ?? planKey(row.fromId, row.toId), routeTripId)),
    onRemind: () => void onRemind(),
  } as const;
}
