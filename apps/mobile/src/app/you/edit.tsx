import { EditProfileScreen } from '@/features/you/edit-profile/edit-profile-screen';
import { EditProfilePremiumScreen } from '@/features/you/premium/edit/edit-profile-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** Edit profile (3n-3; premium 9.02). */
export default premiumRoute({ premium: EditProfilePremiumScreen, legacy: EditProfileScreen });
