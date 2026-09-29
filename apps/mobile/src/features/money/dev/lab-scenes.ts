/** Every money lab scene by name, for the (dev) money lab and its screenshot flows. */
import type { ReactNode } from 'react';

import { BUDGET_SCENES } from './lab-scenes-budget';
import { HOME_SCENES } from './lab-scenes-home';
import { SCAN_SCENES } from './lab-scenes-scan';
import { SETTLE_SCENES } from './lab-scenes-settle';

export const MONEY_LAB_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...HOME_SCENES,
  ...SCAN_SCENES,
  ...SETTLE_SCENES,
  ...BUDGET_SCENES,
};

export const MONEY_LAB_SCENE_NAMES: readonly string[] = Object.keys(MONEY_LAB_SCENES);
