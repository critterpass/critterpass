import { DietaryScreen } from '@/features/guide/dietary/dietary-screen';
import { deviceDietary } from '@/features/guide/dietary/device-dietary';
import { PremiumDietaryScreen } from '@/features/guide/premium/dietary/dietary-screen';
import { premiumRoute } from '@/lib/premium-ui';

function CurrentDietaryRoute() {
  return <DietaryScreen services={deviceDietary} />;
}

function PremiumDietaryRoute() {
  return <PremiumDietaryScreen services={deviceDietary} />;
}

/** Food and access needs: from the guide sheet's quick actions, trip setup and You settings. */
export default premiumRoute({ premium: PremiumDietaryRoute, legacy: CurrentDietaryRoute });
