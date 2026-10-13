import { getSubjectLift } from '../../../modules/cp-subject-lift';

import { devicePhotoServices } from '@/features/onboarding/photo/device-photos';
import { AvatarScreen } from '@/features/you/avatar/avatar-screen';
import { AvatarPremiumScreen } from '@/features/you/premium/avatar/avatar-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

function PremiumAvatarRoute() {
  return <AvatarPremiumScreen photos={devicePhotoServices(getSubjectLift())} />;
}

function AvatarRoute() {
  return <AvatarScreen photos={devicePhotoServices(getSubjectLift())} />;
}

/** The avatar picker (3n-4), with the phone's photo picker and on-device cut-out. */
export default premiumRoute({ premium: PremiumAvatarRoute, legacy: AvatarRoute });
