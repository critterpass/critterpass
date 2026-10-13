import { LanguageScreen } from '@/features/you/language/language-screen';
import { LanguagePremiumScreen } from '@/features/you/premium/language/language-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** Settings › Language and currency (3n-8). */
export default premiumRoute({ premium: LanguagePremiumScreen, legacy: LanguageScreen });
