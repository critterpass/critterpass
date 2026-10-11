import { PremiumTastePage } from '@/features/onboarding/premium/taste/PremiumTastePage';
import { TasteScreen } from '@/features/onboarding/taste/TasteScreen';
import { premiumRoute } from '@/lib/premium-ui';

export default premiumRoute({ premium: PremiumTastePage, legacy: TasteScreen });
