import { BalancesScreen } from '@/features/money/balances/BalancesScreen';
import { MoneyHomeScreen } from '@/features/money/premium/MoneyHomeScreen';
import { premiumRoute } from '@/lib/premium-ui';

/** Money home (3i-1, 7.16, 7.17): balances, settle up, scan / add / budget and the latest expense. */
export default premiumRoute({ premium: MoneyHomeScreen, legacy: BalancesScreen });
