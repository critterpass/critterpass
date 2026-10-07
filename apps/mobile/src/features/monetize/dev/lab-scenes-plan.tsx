/** The plan management lab scenes (4d-1, 4d-2, 4d-3): pure views over fixed rows. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture names, places and ids, never shipped copy. */
import type { ReactNode } from 'react';

import type { Subscription } from '../data/billing-rows';
import { BillingIssueView } from '../plan/billing-issue-view';
import { CancelView } from '../plan/cancel-view';
import { planModel, type BoostLine, type PlanInput } from '../plan/plan-model';
import { PlanView } from '../plan/plan-view';
import { NO_RESTORE, noop, PASS_PERKS } from './lab-fixtures';

const sub = (over: Partial<Subscription>): Subscription => ({
  id: 's1',
  platform: 'play',
  productKey: 'pass_yearly',
  status: 'active',
  autoRenew: true,
  periodEnd: '2027-11-02T00:00:00Z',
  graceEndsAt: null,
  resumeAt: null,
  ...over,
});

const plan = (over: Partial<PlanInput>) =>
  planModel({
    subscriptions: [sub({})],
    passPlus: true,
    passPlusUntil: '2027-11-02T00:00:00Z',
    deviceStore: 'play',
    ...over,
  });

const BOOSTS: readonly BoostLine[] = [
  {
    id: 'b1',
    tripId: 't1',
    destination: 'Kyoto',
    crew: 'the Bali Six',
    source: 'purchase',
    on: true,
    endsAt: '2027-04-16T00:00:00Z',
    settled: { done: 2, of: 5 },
  },
  {
    id: 'b2',
    tripId: 't2',
    destination: 'Bali',
    crew: 'the Bali Six',
    source: 'first_trip_free',
    on: false,
    endsAt: '2026-10-26T00:00:00Z',
    settled: null,
  },
];

function Plan(over: Partial<PlanInput>, storeAvailable = true) {
  const model = plan(over);
  return (
    <PlanView
      plan={model}
      price={model.kind === 'active' ? '$29.99' : null}
      boosts={BOOSTS}
      restore={NO_RESTORE}
      storeAvailable={storeAvailable}
      onUpgrade={noop}
      onManageStore={noop}
      onRestore={noop}
      onCancel={noop}
      onBillingIssue={noop}
    />
  );
}

const MONTHS = [
  { label: 'N', name: 'November', paused: true },
  { label: 'D', name: 'December', paused: true },
  { label: 'J', name: 'January', paused: true },
  { label: 'F', name: 'February', paused: true },
  { label: 'M', name: 'March', paused: true },
  { label: 'A', name: 'April', paused: false, trip: true },
];

function Cancel(over: Partial<PlanInput>) {
  return (
    <CancelView
      plan={plan(over)}
      store="play"
      nextTrip={{ name: 'Kyoto', months: MONTHS }}
      perks={PASS_PERKS}
      onPause={noop}
      onKeep={noop}
      onCancel={noop}
    />
  );
}

function Issue(over: Partial<PlanInput>) {
  return (
    <BillingIssueView
      plan={plan(over)}
      boosts={BOOSTS}
      checking={false}
      canFixHere
      onUpdate={noop}
      onTryAgain={noop}
      onDone={noop}
    />
  );
}

export const PLAN_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '4d-1-yearly': () => Plan({}),
  '4d-1-free': () => Plan({ subscriptions: [], passPlus: false, passPlusUntil: null }),
  '4d-1-free-no-store': () =>
    Plan({ subscriptions: [], passPlus: false, passPlusUntil: null }, false),
  '4d-1-ending': () => Plan({ subscriptions: [sub({ status: 'cancelled_active' })] }),
  '4d-1-grace': () =>
    Plan({ subscriptions: [sub({ status: 'grace', graceEndsAt: '2026-11-09T00:00:00Z' })] }),
  '4d-1-paused-until': () =>
    Plan({
      subscriptions: [
        sub({
          status: 'expired',
          productKey: 'pass_monthly',
          autoRenew: false,
          resumeAt: '2027-03-02T00:00:00Z',
        }),
      ],
      passPlus: false,
      passPlusUntil: null,
      now: new Date('2027-02-01T00:00:00Z'),
    }),
  '4d-1-gift': () => Plan({ subscriptions: [], passPlusUntil: '2027-02-01T00:00:00Z' }),
  '4d-1-other-store': () => Plan({ subscriptions: [sub({ platform: 'app_store' })] }),
  '4d-2-monthly': () => Cancel({ subscriptions: [sub({ productKey: 'pass_monthly' })] }),
  '4d-2-yearly': () => Cancel({}),
  '4d-3-grace': () =>
    Issue({ subscriptions: [sub({ status: 'grace', graceEndsAt: '2026-11-09T00:00:00Z' })] }),
  '4d-3-off': () => Issue({ subscriptions: [sub({ status: 'on_hold' })], passPlus: false }),
  '4d-3-recovered': () => Issue({}),
};
