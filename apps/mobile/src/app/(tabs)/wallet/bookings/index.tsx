import { WalletBookingsScreen } from '@/features/bookings/premium/WalletBookingsScreen';
import { WalletScreen } from '@/features/bookings/stack/WalletScreen';
import { premiumRoute } from '@/lib/premium-ui';

/** Bookings (3h-1, 7.01, 7.02): the trip's wallet. */
export default premiumRoute({ premium: WalletBookingsScreen, legacy: WalletScreen });
