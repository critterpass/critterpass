import { BudgetScreen } from '@/features/money/budget/BudgetScreen';
import { BudgetPremium } from '@/features/money/premium/BudgetPremium';
import { premiumRoute } from '@/lib/premium-ui';

/** The trip budget (3i-6, 7.29): spent against the plan by category, with the forecast. */
export default premiumRoute({ premium: BudgetPremium, legacy: BudgetScreen });
