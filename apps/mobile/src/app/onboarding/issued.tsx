import { IssuedScreen } from '@/features/onboarding/issued/IssuedScreen';
import { PremiumIssuedPage } from '@/features/onboarding/premium/issued/PremiumIssuedPage';
import { premiumRoute } from '@/lib/premium-ui';

export default premiumRoute({ premium: PremiumIssuedPage, legacy: IssuedScreen });
