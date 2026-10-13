import { useLocalSearchParams } from 'expo-router';

import { LockScreenOfferPremium } from '@/features/trip/premium/lock-screen-offer/LockScreenOfferPremium';

function useTripId(): string | null {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  return typeof tripId === 'string' && tripId !== '' ? tripId : null;
}

function PremiumOffer() {
  const tripId = useTripId();
  return tripId === null ? null : <LockScreenOfferPremium tripId={tripId} />;
}

/** "Put this on the lock screen" from the crew map: the crew-live offer, or its confirmation. */
export default PremiumOffer;
