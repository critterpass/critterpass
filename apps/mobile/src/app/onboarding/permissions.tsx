import { PermissionsStep } from '@/features/onboarding/permissions/PermissionsStep';
import { PremiumPermissionsPage } from '@/features/onboarding/premium/permissions/PremiumPermissionsPage';
import { premiumRoute } from '@/lib/premium-ui';

export default premiumRoute({ premium: PremiumPermissionsPage, legacy: PermissionsStep });
