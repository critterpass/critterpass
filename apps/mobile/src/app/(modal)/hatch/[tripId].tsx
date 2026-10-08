import { useLocalSearchParams } from 'expo-router';

import { HatchScreen } from '@/features/critters/hatch/hatch-screen';

/** The egg hatch (3l-1), over whatever was on screen when the egg hatched. */
export default function HatchRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <HatchScreen tripId={typeof tripId === 'string' ? tripId : ''} />;
}
