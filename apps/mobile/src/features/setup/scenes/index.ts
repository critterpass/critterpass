/**
 * Every fixed setup scene, step by step, for `(dev)/setup` and the screenshot flows. Each step
 * renders its real view over the Kyoto six (./fixtures.ts), with no database or network.
 */
import { BUDGET_SCENES } from '../budget/scenes';
import { CALENDAR_SCENES } from '../calendar/scenes';
import { MUST_DOS_SCENES } from '../must-dos/scenes';
import { ROOMS_SCENES } from '../rooms/scenes';
import { WHEN_SCENES } from '../when/scenes';
import type { SetupScene } from './types';

export type { SetupScene } from './types';

export const SETUP_SCENES: readonly SetupScene[] = [
  ...WHEN_SCENES,
  ...CALENDAR_SCENES,
  ...BUDGET_SCENES,
  ...ROOMS_SCENES,
  ...MUST_DOS_SCENES,
];
