import { useLocalSearchParams } from 'expo-router';

import { PitchSheet } from '@/features/vote/board/pitch-sheet';
import { PremiumPitchSheet } from '@/features/vote/premium/pitch/pitch-sheet';
import { premiumRoute } from '@/lib/premium-ui';

function usePitchParams() {
  const { crewId, placeId } = useLocalSearchParams<{ crewId: string; placeId?: string }>();
  return { crewId, placeId };
}

function CurrentPitchRoute() {
  return <PitchSheet {...usePitchParams()} />;
}

/** Pitch a place as a native sheet over the page that opened it. */
function PremiumPitchRoute() {
  return <PremiumPitchSheet {...usePitchParams()} />;
}

export default premiumRoute({ premium: PremiumPitchRoute, legacy: CurrentPitchRoute });
