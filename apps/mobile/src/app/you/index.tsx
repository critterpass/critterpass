import { useLocalSearchParams } from 'expo-router';

import { ProfileScreen } from '@/features/you/profile/profile-screen';

/** The profile (3n-1). */
export default function ProfileRoute() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  return <ProfileScreen from={from === 'pass' ? 'pass' : 'home'} />;
}
