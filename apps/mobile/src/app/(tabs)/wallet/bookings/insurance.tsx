import { InsuranceFormScreen } from '@/features/bookings/insurance/InsuranceFormScreen';
import { InsurancePremium } from '@/features/bookings/premium/InsurancePremium';
import { premiumRoute } from '@/lib/premium-ui';

/** The member's travel-insurance policy (7.13). */
export default premiumRoute({ premium: InsurancePremium, legacy: InsuranceFormScreen });
