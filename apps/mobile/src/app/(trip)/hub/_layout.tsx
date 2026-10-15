import { useMemo } from 'react';

import { deviceTripDayServices } from '@/features/trip/bundle/device-services';
import { TripDayServicesProvider } from '@/features/trip/bundle/services';
import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';

/** The trip day pages over the tabs: the offline card (3k-4) and Settings > Offline storage. */
export default function TripDayPagesLayout() {
  const services = useMemo(() => deviceTripDayServices(), []);
  return (
    <TripDayServicesProvider services={services}>
      <PremiumStack />
    </TripDayServicesProvider>
  );
}
