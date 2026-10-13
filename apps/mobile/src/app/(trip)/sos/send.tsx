import { SosSendPremium } from '@/features/safety/premium/SosSendPremium';
import { SosSendScreen } from '@/features/safety/sos/send-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** Sending an SOS: a few words, hold (or slide) to send, five seconds to cancel. */
export default premiumRoute({ premium: SosSendPremium, legacy: SosSendScreen });
