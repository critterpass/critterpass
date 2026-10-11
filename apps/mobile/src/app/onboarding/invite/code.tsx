import { CodeScreen } from '@/features/onboarding/invited/CodeScreen';
import { PremiumCodePage } from '@/features/onboarding/premium/invite/PremiumCodePage';
import { premiumRoute } from '@/lib/premium-ui';

export default premiumRoute({ premium: PremiumCodePage, legacy: CodeScreen });
