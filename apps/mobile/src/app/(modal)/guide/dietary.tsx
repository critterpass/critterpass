import { DietaryScreen } from '@/features/guide/dietary/dietary-screen';
import { deviceDietary } from '@/features/guide/dietary/device-dietary';

/** Food and access needs: from the guide sheet's "+", trip setup and You settings. */
export default function DietaryRoute() {
  return <DietaryScreen services={deviceDietary} />;
}
