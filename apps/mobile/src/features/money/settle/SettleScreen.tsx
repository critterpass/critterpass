/**
 * Settle up (its data and actions are `useSettle`), with the Settled Tokek ceremony when your
 * sticker for this trip arrives.
 */
import { WalletGuideProvider } from '@/features/bookings';

import { MoneyNoTripScreen, MoneyScreenLoading } from '../components/screen-states';
import { SettleList } from './SettleList';
import { useSettle } from './use-settle';

export function SettleScreen({ tripId: routeTripId = null }: { readonly tripId?: string | null }) {
  const settle = useSettle(routeTripId);
  if (settle.kind === 'loading') return <MoneyScreenLoading />;
  if (settle.kind === 'no-trip') return <MoneyNoTripScreen crew={settle.crew} />;
  return (
    <WalletGuideProvider tripId={settle.tripId}>
      <SettleList
        rows={settle.rows}
        members={settle.members}
        expenses={settle.expenses}
        open={settle.open}
        people={settle.people}
        settled={settle.settled}
        offline={settle.offline}
        kinds={settle.kinds}
        myKinds={settle.myKinds}
        canRemind={settle.canRemind}
        reminding={settle.reminding}
        onKind={settle.onKind}
        onNudge={settle.onNudge}
        onRow={settle.onRow}
        onRemind={settle.onRemind}
      />
    </WalletGuideProvider>
  );
}
