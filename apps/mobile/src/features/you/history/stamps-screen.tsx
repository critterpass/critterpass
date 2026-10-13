/** The stamps list over synced rows, with this phone's unsynced past trips on top. */
import { router } from 'expo-router';
import { useMemo, useState, type ComponentType } from 'react';

import { goBackOr } from '@/lib/navigation/back';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { STAMPS_SQL, STAMPS_TABLES, type StampRow } from '../profile/profile-queries';
import { YOU_ROUTES } from '../routes';
import { usePastTrips } from './past-trips';
import { orderStamps, type ProfileStamp } from './stamp-book';
import { StampsView, type StampsViewProps } from './stamps-view';
import { localToday } from './use-travel-history';

/* eslint-disable-next-line lingui/no-unlocalized-strings -- a design screen id, never copy. */
const RECAP_SCREEN = '3m-1';

export function StampsScreen({
  now = () => new Date(),
  View = StampsView,
}: {
  readonly now?: () => Date;
  /** The page drawn over this logic (the premium UI passes its own). */
  readonly View?: ComponentType<StampsViewProps>;
}) {
  const uid = useOwnerUid();
  const stamps = useLiveRows<StampRow>(STAMPS_SQL, uid === null ? null : [uid], STAMPS_TABLES);
  const pastTrips = usePastTrips();
  const [year, setYear] = useState<number | null>(null);
  const today = localToday(now());
  const ordered = useMemo(
    () =>
      stamps.loaded && pastTrips.loaded ? orderStamps(stamps.rows, pastTrips.rows, today) : null,
    [stamps.loaded, stamps.rows, pastTrips.loaded, pastTrips.rows, today],
  );
  const openerFor = (stamp: ProfileStamp) => {
    if (stamp.kind === 'self') {
      return () => router.push({ pathname: YOU_ROUTES.pastTrip, params: { id: stamp.id } });
    }
    if (stamp.kind !== 'trip' || stamp.tripId === null) return undefined;
    const recap = hrefFor(RECAP_SCREEN, { tripId: stamp.tripId });
    return recap === undefined ? undefined : () => router.push(recap);
  };
  return (
    <View
      stamps={ordered}
      year={year}
      onYear={setYear}
      onBack={() => goBackOr(YOU_ROUTES.profile)}
      onAddPastTrip={() => router.push(YOU_ROUTES.pastTrip)}
      openerFor={openerFor}
    />
  );
}
