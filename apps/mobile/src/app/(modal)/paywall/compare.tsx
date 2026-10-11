import { CompareScreen } from '@/features/monetize/compare/compare-screen';
import { ComparePremium } from '@/features/monetize/premium/compare-premium';
import { premiumRoute } from '@/lib/premium-ui';

/** What is in each plan (4e-2; premium 9.11). */
export default premiumRoute({ premium: ComparePremium, legacy: CompareScreen });
