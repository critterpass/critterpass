import { PremiumSavePage } from '@/features/onboarding/premium/save/PremiumSavePage';
import { SaveScreen } from '@/features/onboarding/save/SaveScreen';
import { premiumRoute } from '@/lib/premium-ui';

export default premiumRoute({ premium: PremiumSavePage, legacy: SaveScreen });
