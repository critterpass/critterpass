import { useLocalSearchParams } from 'expo-router';

import { PremiumSetScreen } from '@/features/critters/premium/set/set-screen';

function useSetId(): string {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  return typeof setId === 'string' ? setId : '';
}

/** One place set (3l-8). */
export default function SetRoute() {
  return <PremiumSetScreen setId={useSetId()} />;
}
