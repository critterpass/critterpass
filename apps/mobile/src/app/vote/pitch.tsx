import { useLocalSearchParams } from 'expo-router';

import { PitchSheet } from '@/features/vote/board/pitch-sheet';

export default function PitchRoute() {
  const { crewId, placeId } = useLocalSearchParams<{ crewId: string; placeId?: string }>();
  return <PitchSheet crewId={crewId} placeId={placeId} />;
}
