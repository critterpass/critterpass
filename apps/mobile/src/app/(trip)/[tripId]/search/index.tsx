import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { FindScreen } from '@/features/explore/premium/search/find-screen';
import { SearchScreen } from '@/features/explore/search/search-screen';
import { deviceSearchServices } from '@/features/explore/search/data/device-search-services';
import { SearchServicesProvider } from '@/features/explore/search/data/search-services';
import { scopeOf } from '@/features/explore/search/routes';
import { usePremiumUi } from '@/lib/premium-ui';

import { getOcr } from '../../../../../modules/cp-ocr';

/** Search (7d-1): `/{tripId}/search?scope=map|day|place|explore&day_id&poi_id&near&q`. */
export default function SearchRoute() {
  const params = useLocalSearchParams<{
    tripId: string;
    scope?: string;
    day_id?: string;
    poi_id?: string;
    near?: string;
    q?: string;
  }>();
  const services = useMemo(() => deviceSearchServices(getOcr()), []);
  // Find (4.30) in the premium look; both read the same search controller.
  const Screen = usePremiumUi() ? FindScreen : SearchScreen;
  return (
    <SearchServicesProvider services={services}>
      <Screen
        tripId={params.tripId ?? ''}
        scope={scopeOf(params.scope)}
        dayId={params.day_id}
        poiId={params.poi_id}
        near={params.near}
        q={params.q}
      />
    </SearchServicesProvider>
  );
}
