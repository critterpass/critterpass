/**
 * Settle up against synced rows: the engine's plan from the trip ledger, the payments on it, your
 * payout kinds (from the api, never stored), nudges and REMIND EVERYONE (online), and the Settled
 * Tokek ceremony when your sticker for this trip arrives.
 */
import { payoutKindsFor, type PayoutKind } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { feedback } from '@/motion';
import { toast } from '@/motion/island-toast';

import { MoneyLoading } from '../balances/BalancesScreen';
import { buildBalances } from '../balances/model';
import { nudgePaymentCommand, remindAllPaymentsCommand } from '../data/commands';
import { useSelectedTrip } from '../data/selected-trip';
import { useMoneyServices } from '../data/services';
import { useMoneyContext } from '../data/use-money-context';
import { useTripMoney } from '../data/use-trip-money';
import { MONEY_ROUTES, paymentRoute } from '../routes';
import { canRemind, openCount, planKey, settleRows, type SettleRowModel } from './model';
import { SettleList } from './SettleList';
import { useSettledCeremony } from './use-settled-ceremony';
import { WalletGuideProvider } from '@/features/bookings';

export function SettleScreen() {
  const ctx = useMoneyContext(useSelectedTrip());
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const services = useMoneyServices();
  const sync = useSyncStatus();
  const { t } = useLingui();
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

  if (ctx.status === 'loading' || !rows.loaded || ctx.trip === null) return <MoneyLoading />;
  const tripId = ctx.trip.id;

  async function onNudge(row: SettleRowModel) {
    if (row.paymentId === null) return;
    const who = ctx.members.find((member) => member.userId === row.fromId)?.name ?? '';
    const result = await nudge.send({ payment_id: row.paymentId });
    if (result.kind === 'applied') {
      feedback.emit('success');
      toast.show({
        id: 'money-nudged',
        title: t({ id: 'money.settle.nudged', message: `Nudged ${who}. Gently.` }),
      });
    } else {
      toast.show({
        id: 'money-nudged',
        title: t({ id: 'money.settle.nudgeLater', message: 'Already nudged today. Try tomorrow.' }),
      });
    }
  }

  async function onRemind() {
    const result = await remind.send({ trip_id: tripId });
    toast.show({
      id: 'money-remind',
      title:
        result.kind === 'applied'
          ? t({ id: 'money.settle.reminded', message: 'Reminded everyone who owes.' })
          : t({
              id: 'money.settle.remindLater',
              message: 'Everyone got a reminder today already.',
            }),
    });
  }

  const onKind = () => router.push(MONEY_ROUTES.payoutMethods);
  const people = ctx.splitMembers.length;
  return (
    <WalletGuideProvider tripId={ctx.trip?.id ?? null}>
      <SettleList
        rows={list}
        members={ctx.members}
        expenses={rows.expenses.length}
        open={openCount(list)}
        people={people}
        settled={settled}
        offline={sync.phase === 'offline'}
        kinds={payoutKindsFor(ctx.homeCountry)}
        myKinds={myKinds}
        canRemind={canRemind(list)}
        reminding={remind.pending}
        onKind={onKind}
        onNudge={(row) => void onNudge(row)}
        onRow={(row) => router.push(paymentRoute(row.paymentId ?? planKey(row.fromId, row.toId)))}
        onRemind={() => void onRemind()}
      />
    </WalletGuideProvider>
  );
}
