import { NotificationsPremium } from '@/features/you/premium/notifications/NotificationsPremium';
import { PingSettingsScreen } from '@/features/you/ping-settings/ping-settings-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** How much we ping (5b-4, 6.38). */
export default premiumRoute({ premium: NotificationsPremium, legacy: PingSettingsScreen });
