/** The crew area's navigation wiring, imported once by the root: 3g-3 joins the screen registry. */
import { registerScreens } from '@/lib/navigation/screen-registry';

import { CREW_SCREENS } from './crews-sheet/routes';

registerScreens(CREW_SCREENS);
