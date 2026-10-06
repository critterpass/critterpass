import { useLocalSearchParams } from 'expo-router';

import { HomeScreen } from '@/features/home/home-screen';
import { useLinkNotice } from '@/features/home/link-notice';
import { registerHomeScreens } from '@/features/home/routes';

registerHomeScreens();

/**
 * The HOME tab (3b-1, 3b-2, 3b-6); `?crewId=` shows a crew a link handed off to and `?notice=`
 * says once why a link ended up here.
 */
export default function HomeRoute() {
  const params = useLocalSearchParams<{ crewId?: string; notice?: string }>();
  useLinkNotice(typeof params.notice === 'string' ? params.notice : null);
  return <HomeScreen crewId={typeof params.crewId === 'string' ? params.crewId : null} />;
}
