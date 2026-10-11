import { useLocalSearchParams } from 'expo-router';

import { GuestGuidePage } from '@/features/vote/places/guest-guide-page';
import { GuestGuide } from '@/features/vote/premium/places/guest-guide';
import { usePremiumUi } from '@/lib/premium-ui';

/** A place no live guide covers (3b-8; 4.03 in the premium look). */
export default function PlaceRoute() {
  const { placeId, crewId } = useLocalSearchParams<{ placeId: string; crewId?: string }>();
  const Screen = usePremiumUi() ? GuestGuide : GuestGuidePage;
  return <Screen placeId={placeId} crewId={crewId} />;
}
