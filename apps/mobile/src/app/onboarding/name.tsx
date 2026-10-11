import { NameScreen } from '@/features/onboarding/name/NameScreen';
import { PremiumNamePage } from '@/features/onboarding/premium/name/PremiumNamePage';
import { premiumRoute } from '@/lib/premium-ui';

export default premiumRoute({ premium: PremiumNamePage, legacy: NameScreen });
