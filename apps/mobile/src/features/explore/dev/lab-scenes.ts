/**
 * Every Explore lab scene by name, for the (dev) Explore lab and its screenshot flows, in the
 * order the flows visit them (they scroll the list downwards only).
 */
import type { ReactNode } from 'react';

import { DESTINATION_SCENES } from './destination-scenes';
import { MAP_SCENES } from './map-scenes';
import { PLACE_DETAIL_SCENES } from '../place-detail/dev/place-detail-scenes';
import { PLACES_SCENES } from '../places/dev/places-scenes';
import { SPLIT_SCENES } from '../split/dev/split-scenes';
import { PLACE_SCENES } from './place-scenes';
import { SAVED_SCENES } from './saved-scenes';
import { SWIPE_SCENES } from './swipe-scenes';

export const EXPLORE_LAB_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...DESTINATION_SCENES,
  ...PLACE_SCENES,
  ...PLACE_DETAIL_SCENES,
  ...SPLIT_SCENES,
  ...SAVED_SCENES,
  ...MAP_SCENES,
  ...PLACES_SCENES,
  ...SWIPE_SCENES,
};

export const EXPLORE_LAB_SCENE_NAMES: readonly string[] = Object.keys(EXPLORE_LAB_SCENES);
