import { useMemo } from 'react';

import { deviceLiveMapServices } from '@/features/crew/live-map/data/device-services';
import { LiveMapScreen } from '@/features/crew/live-map/screen';

import { getLocationNative, hasNativeSession } from '../../../../modules/cp-location';

/** Crew live map for one trip (`/map/{tripId}`, `?from=chat` when opened from the crew chat). */
export default function LiveMapRoute() {
  const services = useMemo(
    () =>
      deviceLiveMapServices({
        isLowPowerMode: () => (hasNativeSession() ? getLocationNative().isLowPowerMode() : false),
      }),
    [],
  );
  return <LiveMapScreen services={services} />;
}
