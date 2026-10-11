import { SosPremium } from '@/features/safety/premium/SosPremium';
import { SosScreen } from '@/features/safety/sos/sos-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** Crew SOS (3k-10, 6.17): the takeover a crewmate sees, and the sender's own status. */
export default premiumRoute({ premium: SosPremium, legacy: SosScreen });
