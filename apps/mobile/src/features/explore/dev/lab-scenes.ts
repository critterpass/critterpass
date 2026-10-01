/**
 * Every Explore lab scene by name, for the (dev) Explore lab and its screenshot flows, in the
 * order the flows visit them (they scroll the list downwards only).
 */
import type { ReactNode } from 'react';

import { DESTINATION_SCENES } from './destination-scenes';
import { PLACE_SCENES } from './place-scenes';

export const EXPLORE_LAB_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...DESTINATION_SCENES,
  ...PLACE_SCENES,
};

export const EXPLORE_LAB_SCENE_NAMES: readonly string[] = Object.keys(EXPLORE_LAB_SCENES);
