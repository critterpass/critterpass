import { useLocalSearchParams } from 'expo-router';

import { ShowdownScreen } from '@/features/vote/final/showdown-screen';

export default function ShowdownRoute() {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  return <ShowdownScreen pollId={pollId} />;
}
