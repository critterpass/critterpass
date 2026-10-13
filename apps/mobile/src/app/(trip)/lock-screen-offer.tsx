import { useLocalSearchParams } from 'expo-router';

import { LockScreenOfferScreen } from '@/features/trip/live-activities/lock-screen-offer/screen';
import { LockScreenOfferPremium } from '@/features/trip/premium/lock-screen-offer/LockScreenOfferPremium';
import { premiumRoute } from '@/lib/premium-ui';

function useTripId(): string | null {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  return typeof tripId === 'string' && tripId !== '' ? tripId : null;
}

function PremiumOffer() {
  const tripId = useTripId();
  return tripId === null ? null : <LockScreenOfferPremium tripId={tripId} />;
}

function LegacyOffer() {
  const tripId = useTripId();
  return tripId === null ? null : <LockScreenOfferScreen tripId={tripId} />;
}

/** "Put this on the lock screen" from the crew map: the crew-live offer, or its confirmation. */
export default premiumRoute({ premium: PremiumOffer, legacy: LegacyOffer });
