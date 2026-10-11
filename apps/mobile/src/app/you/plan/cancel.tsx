import { CancelScreen } from '@/features/monetize/plan/cancel-screen';
import { CancelPremium } from '@/features/monetize/premium/cancel-premium';
import { premiumRoute } from '@/lib/premium-ui';

/** Before you go (4d-2; premium 9.23). */
export default premiumRoute({ premium: CancelPremium, legacy: CancelScreen });
