import { BoostScreen } from '@/features/monetize/boost/boost-screen';
import { BoostPremium } from '@/features/monetize/premium/boost-premium';
import { premiumRoute } from '@/lib/premium-ui';

/** Boost a trip (4b-3; premium 9.12, with 9.22 when a crewmate is paying). */
export default premiumRoute({ premium: BoostPremium, legacy: BoostScreen });
