/** Every plan views lab scene by name, for the (dev) plan views lab and its screenshot flows. */
import type { ReactNode } from 'react';

import { REVIEW_SCENES } from '../../review/dev/review-scenes';
import { VIEWS_SCENES } from '../../views/dev/views-scenes';
import { PLAN_SCREENS_SCENES } from '../../trip-map/dev/plan-screens-scenes';
import { DRIVER_SHARE_SCENES } from './driver-share-scenes';

export const PLAN_VIEWS_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...VIEWS_SCENES,
  ...REVIEW_SCENES,
  ...PLAN_SCREENS_SCENES,
  ...DRIVER_SHARE_SCENES,
};

export const PLAN_VIEWS_SCENE_NAMES: readonly string[] = Object.keys(PLAN_VIEWS_SCENES);
