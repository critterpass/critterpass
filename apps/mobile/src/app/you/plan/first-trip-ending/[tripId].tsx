import { FtfEndingScreen } from '@/features/monetize/ftf-ending/ftf-ending-screen';
import { FtfEndingPremium } from '@/features/monetize/premium/ftf-ending-premium';
import { premiumRoute } from '@/lib/premium-ui';

/** The free first trip's last days: what stays, what pauses (9.21). */
export default premiumRoute({ premium: FtfEndingPremium, legacy: FtfEndingScreen });
