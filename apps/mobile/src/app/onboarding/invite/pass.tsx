import { PassScreen } from '@/features/onboarding/invited/PassScreen';
import { PremiumInvitePassPage } from '@/features/onboarding/premium/invite/PremiumInvitePassPage';
import { premiumRoute } from '@/lib/premium-ui';

export default premiumRoute({ premium: PremiumInvitePassPage, legacy: PassScreen });
