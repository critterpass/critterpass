import { useLocalSearchParams } from 'expo-router';

import { EstimateWhySheetPremium } from '@/features/bookings/premium/supplier/supplier-sheets';
import { EstimateWhySheet } from '@/features/bookings/supplier/sheets';
import { premiumRoute } from '@/lib/premium-ui';

function Premium() {
  return <EstimateWhySheetPremium params={useLocalSearchParams()} />;
}

function Legacy() {
  return <EstimateWhySheet params={useLocalSearchParams()} />;
}

/** Why a fare estimate says what it says: basis, sources, when checked, whether reviewed. */
export default premiumRoute({ premium: Premium, legacy: Legacy });
