import { AppIconScreen } from '@/features/you/app-icon/app-icon-screen';
import { AppIconPremiumScreen } from '@/features/you/premium/app-icon/app-icon-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** Settings › App icon (3n-5; premium 9.03). */
export default premiumRoute({ premium: AppIconPremiumScreen, legacy: AppIconScreen });
