import { ReferralPremium } from '@/features/crew/premium/referral-screen';
import { ReferralScreen } from '@/features/crew/referral/ReferralScreen';
import { premiumRoute } from '@/lib/premium-ui';

/** Invite friends (3.11). */
export default premiumRoute({ premium: ReferralPremium, legacy: ReferralScreen });
