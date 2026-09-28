import { useLocalSearchParams } from 'expo-router';

import { HomeScreen } from '@/features/home/home-screen';
import { registerHomeScreens } from '@/features/home/routes';

registerHomeScreens();

/** The HOME tab (3b-1, 3b-2, 3b-6); `?crewId=` shows a crew a link handed off to. */
export default function HomeRoute() {
  const params = useLocalSearchParams<{ crewId?: string }>();
  return <HomeScreen crewId={typeof params.crewId === 'string' ? params.crewId : null} />;
}
