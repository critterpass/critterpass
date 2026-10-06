import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { AddDriverScreen } from '@/features/drivers/intake/AddDriverScreen';

import { getOcr } from '../../../../../modules/cp-ocr';

/** Add a driver (6c-1): `/{tripId}/drivers/add?days=`. */
export default function AddDriverRoute() {
  const { tripId, days } = useLocalSearchParams<{ tripId: string; days?: string }>();
  const ocr = useMemo(() => getOcr(), []);
  return <AddDriverScreen tripId={tripId ?? ''} ocr={ocr} {...(days ? { days } : {})} />;
}
