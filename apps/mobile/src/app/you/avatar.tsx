import { getSubjectLift } from '../../../modules/cp-subject-lift';

import { devicePhotoServices } from '@/features/onboarding/photo/device-photos';
import { AvatarPremiumScreen } from '@/features/you/premium/avatar/avatar-premium-screen';

/** The avatar picker (3n-4), with the phone's photo picker and on-device cut-out. */
export default function AvatarRoute() {
  return <AvatarPremiumScreen photos={devicePhotoServices(getSubjectLift())} />;
}
