import { useLocalSearchParams } from 'expo-router';

import { SetScreen } from '@/features/critters/dex/set-screen';

/** One place set (3l-8). */
export default function CritterSetRoute() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  return <SetScreen setId={typeof setId === 'string' ? setId : ''} />;
}
