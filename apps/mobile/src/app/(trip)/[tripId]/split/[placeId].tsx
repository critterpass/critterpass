import { useLocalSearchParams } from 'expo-router';

import { SplitPage } from '@/features/explore/premium/split/split-page';
import { SplitScreen } from '@/features/explore/split/split-screen';
import { usePremiumUi } from '@/lib/premium-ui';

/** Crew can't agree on a place (7e-3; 4.38 in the premium look). */
export default function SplitRoute() {
  const { tripId, placeId } = useLocalSearchParams<{ tripId: string; placeId: string }>();
  const Screen = usePremiumUi() ? SplitPage : SplitScreen;
  return <Screen tripId={tripId} placeId={placeId} />;
}
