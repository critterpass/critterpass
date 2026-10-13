import { PhoneScreen } from '@/features/onboarding/phone/PhoneScreen';
import { PremiumPhonePage } from '@/features/onboarding/premium/phone/PremiumPhonePage';
import { premiumRoute } from '@/lib/premium-ui';

export default premiumRoute({ premium: PremiumPhonePage, legacy: PhoneScreen });
