import { useLocalSearchParams } from 'expo-router';

import { SupplierOffersPremium } from '@/features/bookings/premium/supplier/supplier-sheets';

type Params = {
  tripId?: string;
  name?: string;
  date?: string;
  destinationRef?: string;
  currency?: string;
  stableId?: string;
};

function SupplierRoute() {
  return <SupplierOffersPremium params={useLocalSearchParams<Params>()} />;
}

/** Where to book one activity: live supplier offers, or partner links while those are off. */
export default SupplierRoute;
