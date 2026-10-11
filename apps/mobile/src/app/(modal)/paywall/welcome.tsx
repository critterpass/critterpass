import { WelcomePremium } from '@/features/monetize/premium/welcome-premium';
import { WelcomeScreen } from '@/features/monetize/welcome/welcome-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** Welcome to Pass+ (4e-3; premium 9.15). */
export default premiumRoute({ premium: WelcomePremium, legacy: WelcomeScreen });
