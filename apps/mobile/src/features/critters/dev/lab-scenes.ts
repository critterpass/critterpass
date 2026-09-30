/** Every critters lab scene by name, for the (dev) critters lab and its screenshot flows. */
import type { ReactNode } from 'react';

import { DETAIL_SCENES } from './detail-scenes';
import { DEX_SCENES } from './dex-scenes';

export const CRITTER_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...DEX_SCENES,
  ...DETAIL_SCENES,
};

export const CRITTER_SCENE_NAMES: readonly string[] = Object.keys(CRITTER_SCENES);
