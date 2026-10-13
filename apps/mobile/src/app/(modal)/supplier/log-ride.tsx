import { useLocalSearchParams } from 'expo-router';

import { LogRideSheetPremium } from '@/features/bookings/premium/supplier/supplier-sheets';
import { LogRideRouteSheet } from '@/features/bookings/supplier/sheets';
import { premiumRoute } from '@/lib/premium-ui';

function Premium() {
  return <LogRideSheetPremium params={useLocalSearchParams()} />;
}

function Legacy() {
  return <LogRideRouteSheet params={useLocalSearchParams()} />;
}

/** LOG IT: the ride on its leg and, with an amount, a split crew expense. */
export default premiumRoute({ premium: Premium, legacy: Legacy });
