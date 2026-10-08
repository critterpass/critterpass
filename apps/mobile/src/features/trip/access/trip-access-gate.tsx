/**
 * Holds a trip's screens in the TRIPS tab to a trip this phone can read. A link or a stale card to
 * a trip the person left, or one that was deleted, gets the "not here" page with the way back to
 * the trip list, instead of a hub that waits for a row that never comes. Until the phone has heard
 * from the server the screens keep their own loading states, and a trip already here opens at once.
 */
import { useLingui } from '@lingui/react/macro';
import { useContext, type ReactNode } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { ScreenMissing } from '@/ui/states/ScreenMissing';

import { TRIPS_TAB } from '../hub/routes';
import { isTripId } from './trip-access';
import { useTripAccess } from './use-trip-access';

function TripMissing() {
  const { t } = useLingui();
  return (
    <ScreenMissing
      backLabel={t({ id: 'trip.missing.back', message: 'Trips' })}
      fallback={TRIPS_TAB}
      title={t({ id: 'trip.missing.title', message: 'This trip isn’t here' })}
      line={t({
        id: 'trip.missing.line',
        message: 'It may have been deleted, or you are no longer on it.',
      })}
      testID="trip-missing"
    />
  );
}

function Checked({ tripId, children }: { readonly tripId: string; readonly children: ReactNode }) {
  return useTripAccess(tripId) === 'missing' ? <TripMissing /> : children;
}

export function TripAccessGate(props: {
  readonly tripId: string | undefined;
  readonly children: ReactNode;
}) {
  const localFirst = useContext(LocalFirstContext);
  if (!isTripId(props.tripId)) return <TripMissing />;
  // Before the local database is open the screens draw their own waiting state.
  if (localFirst === null) return props.children;
  return <Checked tripId={props.tripId}>{props.children}</Checked>;
}
