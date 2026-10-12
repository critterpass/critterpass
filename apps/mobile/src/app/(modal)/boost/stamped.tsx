import { StampedScreen } from '@/features/monetize/boost/stamped-screen';
import { StampedPremium } from '@/features/monetize/premium/stamped-premium';
import { premiumRoute } from '@/lib/premium-ui';

/** Boosted (4b-5; premium 9.14). */
export default premiumRoute({ premium: StampedPremium, legacy: StampedScreen });
