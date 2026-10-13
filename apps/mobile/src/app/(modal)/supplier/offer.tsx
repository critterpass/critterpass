import { useLocalSearchParams } from 'expo-router';

import { SupplierOffersPremium } from '@/features/bookings/premium/supplier/supplier-sheets';
import { OffersScreen } from '@/features/bookings/supplier/OffersScreen';
import { premiumRoute } from '@/lib/premium-ui';

type Params = {
  tripId?: string;
  name?: string;
  date?: string;
  destinationRef?: string;
  currency?: string;
  stableId?: string;
};

function Premium() {
  return <SupplierOffersPremium params={useLocalSearchParams<Params>()} />;
}

function Legacy() {
  const params = useLocalSearchParams<Params>();
  return (
    <OffersScreen
      params={{
        tripId: params.tripId ?? '',
        name: params.name ?? '',
        date: params.date,
        destinationRef: params.destinationRef,
        currency: params.currency,
        stableId: params.stableId,
      }}
    />
  );
}

/** Where to book one activity: live supplier offers, or partner links while those are off. */
export default premiumRoute({ premium: Premium, legacy: Legacy });
