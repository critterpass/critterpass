import { useLocalSearchParams } from 'expo-router';

import { LockScreenOfferPremium } from '@/features/trip/premium/lock-screen-offer/LockScreenOfferPremium';
import { PresentedState } from '@/ui/premium/shell';

function useTripId(): string | null {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  return typeof tripId === 'string' && tripId !== '' ? tripId : null;
}

function PremiumOffer() {
  const tripId = useTripId();
  // A link without its trip: the sheet says so and closes, never opens blank.
  return tripId === null ? (
    <PresentedState state={{ kind: 'missing' }} testID="lock-screen-offer-missing" />
  ) : (
    <LockScreenOfferPremium tripId={tripId} />
  );
}

/** "Put this on the lock screen" from the crew map: the crew-live offer, or its confirmation. */
export default PremiumOffer;
