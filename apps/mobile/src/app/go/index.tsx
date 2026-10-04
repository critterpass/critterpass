import { useLocalSearchParams } from 'expo-router';

import { targetFromParams } from '@/features/go/data/go-place';
import { GoScreen } from '@/features/go/go-screen';

/** GO: the route from here to a place, then directions in the maps app. */
export default function GoRoute() {
  const params = useLocalSearchParams<{ poi?: string; trip?: string; leaveBy?: string }>();
  return <GoScreen target={targetFromParams(params)} />;
}
