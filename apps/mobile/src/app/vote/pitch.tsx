import { useLocalSearchParams } from 'expo-router';

import { PremiumPitchSheet } from '@/features/vote/premium/pitch/pitch-sheet';

function usePitchParams() {
  const { crewId, placeId } = useLocalSearchParams<{ crewId: string; placeId?: string }>();
  return { crewId, placeId };
}

/** Pitch a place as a native sheet over the page that opened it. */
export default function PitchRoute() {
  return <PremiumPitchSheet {...usePitchParams()} />;
}
