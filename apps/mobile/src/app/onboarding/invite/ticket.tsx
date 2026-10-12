import { TicketScreen } from '@/features/onboarding/invited/TicketScreen';
import { PremiumTicketPage } from '@/features/onboarding/premium/invite/PremiumTicketPage';
import { premiumRoute } from '@/lib/premium-ui';

export default premiumRoute({ premium: PremiumTicketPage, legacy: TicketScreen });
