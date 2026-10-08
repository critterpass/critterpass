import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { LocalFirstGate } from '@/features/explore';
import { deviceSearchServices } from '@/features/explore/search/data/device-search-services';
import { SearchServicesProvider } from '@/features/explore/search/data/search-services';
import { LinkScreen } from '@/features/explore/search/link-screen';

import { getOcr } from '../../../../../modules/cp-ocr';

/** Add from a link (7d-3): `/{tripId}/search/link?url=…` or `?screenshot=1`, a sheet over search. */
export default function SearchLinkRoute() {
  const params = useLocalSearchParams<{ tripId: string; url?: string; screenshot?: string }>();
  const services = useMemo(() => deviceSearchServices(getOcr()), []);
  return (
    <LocalFirstGate>
      <SearchServicesProvider services={services}>
        <LinkScreen
          tripId={params.tripId ?? ''}
          url={params.url ?? null}
          screenshot={params.screenshot === '1'}
        />
      </SearchServicesProvider>
    </LocalFirstGate>
  );
}
