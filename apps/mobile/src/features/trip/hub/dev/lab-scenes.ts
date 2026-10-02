/** Every trip day lab scene by name, for the (dev) trip day lab and its screenshot flows. */
import type { ReactNode } from 'react';

import { DAY_OF_SCENES } from '../../day-of/dev/day-of-scenes';
import { LOCK_SCREEN_OFFER_SCENES } from '../../live-activities/lock-screen-offer/dev/offer-scenes';
import { OFFLINE_SCENES } from '../../offline/dev/offline-scenes';
import { HUB_SCENES } from './hub-scenes';

export const TRIP_DAY_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...HUB_SCENES,
  ...DAY_OF_SCENES,
  ...OFFLINE_SCENES,
  ...LOCK_SCREEN_OFFER_SCENES,
};

export const TRIP_DAY_SCENE_NAMES: readonly string[] = Object.keys(TRIP_DAY_SCENES);
