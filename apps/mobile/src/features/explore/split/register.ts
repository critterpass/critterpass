/** Crew can't agree joins the screen registry as `7e-3`: a trip's split on one place. */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and params, never copy. */
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';

registerScreens({
  '7e-3': (params): Href => ({
    pathname: '/[tripId]/split/[placeId]',
    params: { tripId: params['tripId'] ?? '', placeId: params['placeId'] ?? '' },
  }),
});
