/** Every plan ideas lab scene by name (7f-1, 7f-2, 7h-6, 7h-7), for the (dev) lab and its flows. */
import type { ReactNode } from 'react';

import { ADD_SCENES } from '../../add/dev/add-scenes';
import { CHECK_SCENES } from '../../check/dev/check-scenes';
import { CHANGES_SCENES } from '../../review/dev/changes-scenes';
import { IDEAS_SCENES } from './ideas-scenes';

export const PLAN_IDEAS_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...ADD_SCENES,
  ...IDEAS_SCENES,
  ...CHANGES_SCENES,
  ...CHECK_SCENES,
};

export const PLAN_IDEAS_SCENE_NAMES: readonly string[] = Object.keys(PLAN_IDEAS_SCENES);
