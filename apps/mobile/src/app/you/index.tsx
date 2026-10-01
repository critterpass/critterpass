import { LocalFirstGate } from '@/features/you/local-first-gate';
import { ProfileScreen } from '@/features/you/profile/profile-screen';

/** The profile (3n-1). */
export default function ProfileRoute() {
  return (
    <LocalFirstGate>
      <ProfileScreen />
    </LocalFirstGate>
  );
}
