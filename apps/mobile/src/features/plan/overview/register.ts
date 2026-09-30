/** Joins the plan overview (3e-1) and review changes (3e-3) to the screen registry at startup. */
import { registerScreens } from '@/lib/navigation/screen-registry';

import { PLAN_SCREENS } from './routes';

registerScreens(PLAN_SCREENS);
