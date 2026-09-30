/**
 * The guide area's registrations into other areas, imported once by the root layout: the guide
 * sheet (3j-1) in the navigation registry, which the guide button opens.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';

export const guideRoutes = {
  sheet: (params: { threadId?: string; tripId?: string; mode?: string } = {}): Href => ({
    pathname: '/guide/[threadId]',
    params: {
      threadId: params.threadId ?? 'new',
      ...(params.tripId === undefined ? {} : { tripId: params.tripId }),
      ...(params.mode === undefined ? {} : { mode: params.mode }),
    },
  }),
};

registerScreens({
  '3j-1': (params) =>
    guideRoutes.sheet({
      ...(params['threadId'] === undefined ? {} : { threadId: params['threadId'] }),
      ...(params['tripId'] === undefined ? {} : { tripId: params['tripId'] }),
      ...(params['mode'] === undefined ? {} : { mode: params['mode'] }),
    }),
});
