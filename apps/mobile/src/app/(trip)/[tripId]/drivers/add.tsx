import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { AddDriverScreen } from '@/features/drivers/intake/AddDriverScreen';
import { AddDriverPremium } from '@/features/drivers/premium/AddDriverPremium';
import { usePremiumUi } from '@/lib/premium-ui';

import { getOcr } from '../../../../../modules/cp-ocr';

/** Add a driver (6c-1): `/{tripId}/drivers/add?days=`. */
export default function AddDriverRoute() {
  const { tripId, days } = useLocalSearchParams<{ tripId: string; days?: string }>();
  const ocr = useMemo(() => getOcr(), []);
  const premium = usePremiumUi();
  const props = { tripId: tripId ?? '', ocr, ...(days ? { days } : {}) };
  return premium ? <AddDriverPremium {...props} /> : <AddDriverScreen {...props} />;
}
