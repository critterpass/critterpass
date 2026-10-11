import { HomeScreen } from '@/features/onboarding/home/HomeScreen';
import { PremiumHomePage } from '@/features/onboarding/premium/home/PremiumHomePage';
import { premiumRoute } from '@/lib/premium-ui';

export default premiumRoute({ premium: PremiumHomePage, legacy: HomeScreen });
