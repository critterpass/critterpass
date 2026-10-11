import { PlanScreen } from '@/features/monetize/plan/plan-screen';
import { PlanPremium } from '@/features/monetize/premium/plan-premium';
import { premiumRoute } from '@/lib/premium-ui';

/** Your plan (4d-1; premium 9.17). */
export default premiumRoute({ premium: PlanPremium, legacy: PlanScreen });
