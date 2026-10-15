import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { deviceSearchServices } from '@/features/explore/search/data/device-search-services';
import { SearchServicesProvider } from '@/features/explore/search/data/search-services';
import { PremiumLinkPaste, PremiumPickOne } from '@/features/explore/premium/search/link-paste';
import { PremiumLinkSheet } from '@/features/explore/premium/search/link-sheet';
import { LinkScreen } from '@/features/explore/search/link-screen';

import { getOcr } from '../../../../../modules/cp-ocr';

/** Add from a link (7d-3): `/{tripId}/search/link?url=…` or `?screenshot=1`, a sheet over search. */
export default function SearchLinkRoute() {
  const params = useLocalSearchParams<{ tripId: string; url?: string; screenshot?: string }>();
  const services = useMemo(() => deviceSearchServices(getOcr()), []);
  return (
    <SearchServicesProvider services={services}>
      <LinkScreen
        tripId={params.tripId ?? ''}
        url={params.url ?? null}
        screenshot={params.screenshot === '1'}
        Sheet={PremiumLinkSheet}
        Paste={PremiumLinkPaste}
        PickOne={PremiumPickOne}
      />
    </SearchServicesProvider>
  );
}
