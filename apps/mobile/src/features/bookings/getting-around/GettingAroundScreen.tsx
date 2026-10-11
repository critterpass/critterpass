/**
 * Getting around (its day, ride quote and journey are `useGettingAroundScreen`), with the driver
 * set for today at the top.
 */
import { RideBackCard } from '@/features/drivers';

import { GettingAroundView } from './GettingAroundView';
import { useGettingAroundScreen } from './use-getting-around-screen';

export function GettingAroundScreen(props: {
  readonly ask: { readonly tripId?: string; readonly to?: string; readonly from?: string };
}) {
  const { tripId, today, ...view } = useGettingAroundScreen(props);
  return (
    <GettingAroundView
      {...view}
      top={tripId === null ? null : <RideBackCard tripId={tripId} date={today} />}
    />
  );
}
