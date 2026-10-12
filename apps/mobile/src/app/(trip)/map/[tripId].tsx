import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { deviceLiveMapServices } from '@/features/crew/live-map/data/device-services';
import { LiveMapServicesProvider } from '@/features/crew/live-map/data/services';
import { LiveMapScreen } from '@/features/crew/live-map/screen';
import { CrewMapPremium } from '@/features/crew/live-map/premium/CrewMapPremium';
import { usePremiumUi } from '@/lib/premium-ui';

import { getLocationNative, hasNativeSession } from '../../../../modules/cp-location';

/** Crew live map for one trip (`/map/{tripId}`, `?from=chat` when opened from the crew chat; 6.10–6.13). */
export default function LiveMapRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const premium = usePremiumUi();
  const services = useMemo(
    () =>
      deviceLiveMapServices({
        isLowPowerMode: () => (hasNativeSession() ? getLocationNative().isLowPowerMode() : false),
      }),
    [],
  );
  if (!premium) return <LiveMapScreen services={services} />;
  return (
    <LiveMapServicesProvider services={services}>
      <CrewMapPremium tripId={tripId} />
    </LiveMapServicesProvider>
  );
}
