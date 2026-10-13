import { deviceDietary } from '@/features/guide/dietary/device-dietary';
import { PremiumDietaryScreen } from '@/features/guide/premium/dietary/dietary-screen';

/** Food and access needs: from the guide sheet's quick actions, trip setup and You settings. */
export default function DietaryRoute() {
  return <PremiumDietaryScreen services={deviceDietary} />;
}
