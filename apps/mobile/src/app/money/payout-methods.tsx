import { PayoutMethodsPremium } from '@/features/money/premium/PayoutMethodsPremium';
import { PayoutMethodsScreen } from '@/features/money/settle/PayoutMethodsScreen';
import { premiumRoute } from '@/lib/premium-ui';

/** How people pay you (7.27): your payout methods, encrypted on the server. */
export default premiumRoute({ premium: PayoutMethodsPremium, legacy: PayoutMethodsScreen });
