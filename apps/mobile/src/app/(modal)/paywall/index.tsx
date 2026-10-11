import { PaywallScreen } from '@/features/monetize/paywall/paywall-screen';
import { PaywallPremium } from '@/features/monetize/premium/paywall-premium';
import { premiumRoute } from '@/lib/premium-ui';

/** The paywall (4e-1; premium 9.10). */
export default premiumRoute({ premium: PaywallPremium, legacy: PaywallScreen });
