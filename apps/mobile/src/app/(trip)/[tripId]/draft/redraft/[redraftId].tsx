import { useLocalSearchParams } from 'expo-router';

import { RedraftDiffScreen } from '@/features/plan/draft';
import { PremiumRedraftView } from '@/features/plan/premium/draft/redraft-view';

/** One redraft: the thinking beat, then its diff (`/{tripId}/draft/redraft/{redraftId}`). */
export default function RedraftRoute() {
  const { tripId, redraftId, day } = useLocalSearchParams<{
    tripId: string;
    redraftId: string;
    day?: string;
  }>();
  return (
    <RedraftDiffScreen
      tripId={tripId}
      redraftId={redraftId}
      day={day === undefined ? null : Number(day) || null}
      View={PremiumRedraftView}
    />
  );
}
