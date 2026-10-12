import { ArchivePremium } from '@/features/bookings/premium/ArchivePremium';
import { ArchiveScreen } from '@/features/bookings/stack/ArchiveView';
import { premiumRoute } from '@/lib/premium-ui';

/** Past bookings (7.14). */
export default premiumRoute({ premium: ArchivePremium, legacy: ArchiveScreen });
