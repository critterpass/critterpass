import { HelpScreen } from '@/features/safety/help/help-screen';
import { HelpPremium } from '@/features/safety/premium/HelpPremium';
import { premiumRoute } from '@/lib/premium-ui';

/** Help (3k-6, 6.16): numbers, words, the nearest facility and a one-hour share with the crew. */
export default premiumRoute({ premium: HelpPremium, legacy: HelpScreen });
