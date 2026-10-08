import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { LocalFirstGate } from '@/features/explore';
import { SearchScreen } from '@/features/explore/search/search-screen';
import { deviceSearchServices } from '@/features/explore/search/data/device-search-services';
import { SearchServicesProvider } from '@/features/explore/search/data/search-services';
import { scopeOf } from '@/features/explore/search/routes';

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
  return (
    <LocalFirstGate>
      <SearchServicesProvider services={services}>
        <SearchScreen
          tripId={params.tripId ?? ''}
          scope={scopeOf(params.scope)}
          dayId={params.day_id}
          poiId={params.poi_id}
          near={params.near}
          q={params.q}
        />
      </SearchServicesProvider>
    </LocalFirstGate>
  );
}
