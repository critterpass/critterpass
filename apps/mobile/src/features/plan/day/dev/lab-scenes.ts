/** Every plan editing lab scene by name, for the (dev) plan editing lab and its screenshot flows. */
import type { ReactNode } from 'react';

import { COLLAB_SCENES } from '../../collab/dev/lab-scenes-collab';
import { TIMELINE_SCENES } from '../../timeline/dev/lab-scenes-timeline';
import { DAY_SCENES } from './lab-scenes-day';

export const PLAN_EDIT_LAB_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...DAY_SCENES,
  ...TIMELINE_SCENES,
  ...COLLAB_SCENES,
};

export const PLAN_EDIT_LAB_SCENE_NAMES: readonly string[] = Object.keys(PLAN_EDIT_LAB_SCENES);
