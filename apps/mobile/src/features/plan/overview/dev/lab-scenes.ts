/** Every plan views lab scene by name, for the (dev) plan views lab and its screenshot flows. */
import type { ReactNode } from 'react';

import { OVERLAY_SCENES } from '../../overlay/dev/overlay-scenes';
import { REVIEW_SCENES } from '../../review/dev/review-scenes';
import { VIEWS_SCENES } from '../../views/dev/views-scenes';
import { OVERVIEW_SCENES } from './overview-scenes';

export const PLAN_VIEWS_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...OVERVIEW_SCENES,
  ...OVERLAY_SCENES,
  ...VIEWS_SCENES,
  ...REVIEW_SCENES,
};

export const PLAN_VIEWS_SCENE_NAMES: readonly string[] = Object.keys(PLAN_VIEWS_SCENES);
