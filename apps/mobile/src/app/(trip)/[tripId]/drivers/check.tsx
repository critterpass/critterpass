import { useLocalSearchParams } from 'expo-router';

import { CheckCardScreen } from '@/features/drivers/intake/check/CheckCardScreen';

/** Check the card (6c-2) or couldn't read it (6c-3): `/{tripId}/drivers/check?intake|unread`. */
export default function CheckCardRoute() {
  const { tripId, intake, unread, days } = useLocalSearchParams<{
    tripId: string;
    intake?: string;
    unread?: string;
    days?: string;
  }>();
  return (
    <CheckCardScreen
      tripId={tripId ?? ''}
      unread={unread === '1'}
      {...(intake ? { intakeId: intake } : {})}
      {...(days ? { days } : {})}
    />
  );
}
