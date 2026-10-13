import { SoundPremiumScreen } from '@/features/you/premium/sound/sound-premium-screen';
import { SoundScreen } from '@/features/you/sound/sound-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** Settings › Sound (3n-7). */
export default premiumRoute({ premium: SoundPremiumScreen, legacy: SoundScreen });
