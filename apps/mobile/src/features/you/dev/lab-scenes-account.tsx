/**
 * The account lab scenes: signing out (saved and unsaved), deleting the account with the
 * preflight's numbers (3n-9, the hold of 3n-10, offline, owing, an unsaved pass) and the closed
 * page (3n-11).
 */
/* eslint-disable lingui/no-unlocalized-strings -- lab fixture data, never shipped copy. */
import type { DeletionPreflight } from '@cp/domain';
import type { ReactNode } from 'react';

import { ClosedView, type ClosedMode } from '../account/closed-view';
import { DeleteView, type DeleteStep } from '../account/delete-view';
import { SignOutView } from '../account/sign-out-view';

const noop = () => undefined;

/** The render's numbers: eight critters, the Bali Six owing S$186.40, Pass+ from the App Store. */
const PREFLIGHT: DeletionPreflight = {
  instant: false,
  critters: 8,
  stamps: 5,
  balances: [
    {
      crew_id: '00000000-0000-4000-8000-000000000001',
      crew_name: 'the Bali Six',
      currency: 'SGD',
      net_minor: 18640,
    },
  ],
  organised_trips: [],
  active_trip: null,
  subscription: { source: 'app_store' },
};

/** Everything else the preflight can say: what you owe, a hand-over, a trip under way. */
const PREFLIGHT_OWING: DeletionPreflight = {
  ...PREFLIGHT,
  balances: [
    {
      crew_id: '00000000-0000-4000-8000-000000000002',
      crew_name: 'Uni housemates',
      currency: 'VND',
      net_minor: -450000,
    },
  ],
  organised_trips: [
    {
      trip_id: '00000000-0000-4000-8000-000000000003',
      trip_name: 'Đà Lạt',
      transfer_to_name: 'Maya',
      sole_member: false,
    },
  ],
  active_trip: { trip_id: '00000000-0000-4000-8000-000000000004', trip_name: 'Đà Nẵng' },
  subscription: { source: 'play' },
};

function Delete({
  step,
  online = true,
  preflight = PREFLIGHT,
}: {
  readonly step: DeleteStep;
  readonly online?: boolean;
  readonly preflight?: DeletionPreflight | null;
}) {
  return (
    <DeleteView
      step={step}
      online={online}
      busy={false}
      passPlus
      preflight={preflight}
      onSettle={noop}
      onManageSubscription={noop}
      download={{ line: 'Plans, photos and chat as a zip', onPress: noop }}
      reason={step === 'hold' ? 'too_many_pings' : null}
      problem={null}
      onContinue={noop}
      onReason={noop}
      onDelete={noop}
      onKeep={noop}
      onBack={noop}
    />
  );
}

function Closed({ mode }: { readonly mode: ClosedMode }) {
  return (
    <ClosedView
      mode={mode}
      purgeAt={mode === 'erased' ? null : '2026-10-26T09:00:00Z'}
      closedOn={new Date('2026-09-26T09:00:00Z')}
      busy={false}
      problem={null}
      onKeep={noop}
      onClose={noop}
    />
  );
}

function SignOut({ saved }: { readonly saved: boolean }) {
  return (
    <SignOutView
      saved={saved}
      busy={false}
      problem={null}
      onSignOut={noop}
      onSavePass={noop}
      onBack={noop}
    />
  );
}

export const ACCOUNT_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'sign-out-saved': () => <SignOut saved />,
  'sign-out-unsaved': () => <SignOut saved={false} />,
  '3n-9-delete': () => <Delete step="review" />,
  '3n-10-hold': () => <Delete step="hold" />,
  '3n-10-offline': () => <Delete step="hold" online={false} />,
  '3n-9-delete-owing': () => <Delete step="review" preflight={PREFLIGHT_OWING} />,
  '3n-9-delete-unsaved': () => (
    <Delete step="hold" preflight={{ ...PREFLIGHT, instant: true, balances: [], critters: 0 }} />
  ),
  '3n-11-closed': () => <Closed mode="closed" />,
  '3n-11-erased': () => <Closed mode="erased" />,
  '3n-11-restore': () => <Closed mode="restore" />,
};
