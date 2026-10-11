import { InboxScreen } from '@/features/home/inbox/inbox-screen';
import { InboxPremiumScreen } from '@/features/home/premium/inbox/inbox-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** The inbox (3b-4, 3b-5; premium 3.17, 3.18), opened from Home's bell and from notifications. */
export default premiumRoute({ premium: InboxPremiumScreen, legacy: InboxScreen });
