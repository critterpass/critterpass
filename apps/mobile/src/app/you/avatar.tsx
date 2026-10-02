import { getSubjectLift } from '../../../modules/cp-subject-lift';

import { devicePhotoServices } from '@/features/onboarding/photo/device-photos';
import { AvatarScreen } from '@/features/you/avatar/avatar-screen';
import { LocalFirstGate } from '@/features/you/local-first-gate';

/** The avatar picker (3n-4), with the phone's photo picker and on-device cut-out. */
export default function AvatarRoute() {
  return (
    <LocalFirstGate>
      <AvatarScreen photos={devicePhotoServices(getSubjectLift())} />
    </LocalFirstGate>
  );
}
