import { EditProfileScreen } from '@/features/you/edit-profile/edit-profile-screen';
import { LocalFirstGate } from '@/features/you/local-first-gate';

/** Edit profile (3n-3). */
export default function EditProfileRoute() {
  return (
    <LocalFirstGate>
      <EditProfileScreen />
    </LocalFirstGate>
  );
}
