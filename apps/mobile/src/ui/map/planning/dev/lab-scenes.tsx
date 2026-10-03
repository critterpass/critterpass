import type { ReactNode } from 'react';

import { PlanningKitScene } from '../../../planning/dev/kit-scene';
import { PlanningMapPerfScene } from './perf-scene';
import { TripMapScene } from './trip-map-scene';

/** The planning map lab's map scenes, by name (the kit's component scenes join them in the lab). */
export const PLANNING_MAP_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'trip-map': () => <TripMapScene />,
  perf: () => <PlanningMapPerfScene />,
  kit: () => <PlanningKitScene />,
};
