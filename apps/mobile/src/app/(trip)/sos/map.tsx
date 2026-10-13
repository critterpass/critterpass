import { SessionMapPremium } from '@/features/safety/premium/SessionMapPremium';
import { SessionMapScreen } from '@/features/safety/session-map/session-map';
import { premiumRoute } from '@/lib/premium-ui';

/** The SOS session map: the sender, this phone and the way there on foot; free on any trip. */
export default premiumRoute({ premium: SessionMapPremium, legacy: SessionMapScreen });
