import { HistoryScreen } from '@/features/money/history/HistoryScreen';
import { HistoryPremium } from '@/features/money/premium/HistoryPremium';
import { premiumRoute } from '@/lib/premium-ui';

/** Every expense of the trip, by day, with member and category filters (7.23). */
export default premiumRoute({ premium: HistoryPremium, legacy: HistoryScreen });
