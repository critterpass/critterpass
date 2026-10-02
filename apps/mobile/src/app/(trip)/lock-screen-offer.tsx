import { useLocalSearchParams } from 'expo-router';

import { LockScreenOfferScreen } from '@/features/trip/live-activities/lock-screen-offer/screen';

/** "Put this on the lock screen" from the crew map: the crew-live offer, or its confirmation. */
export default function LockScreenOfferRoute() {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  if (typeof tripId !== 'string' || tripId === '') return null;
  return <LockScreenOfferScreen tripId={tripId} />;
}
