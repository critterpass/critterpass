import { useLocalSearchParams } from 'expo-router';

import { LocalFirstGate } from '@/features/you/local-first-gate';
import { ProfileScreen } from '@/features/you/profile/profile-screen';

/** The profile (3n-1). */
export default function ProfileRoute() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  return (
    <LocalFirstGate>
      <ProfileScreen from={from === 'pass' ? 'pass' : 'home'} />
    </LocalFirstGate>
  );
}
