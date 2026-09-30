import { useLocalSearchParams } from 'expo-router';

import { OffersScreen } from '@/features/bookings/supplier/OffersScreen';

type Params = {
  tripId?: string;
  name?: string;
  date?: string;
  destinationRef?: string;
  currency?: string;
  stableId?: string;
};

/** Where to book one activity: live supplier offers, or partner links while those are off. */
export default function SupplierOfferRoute() {
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
