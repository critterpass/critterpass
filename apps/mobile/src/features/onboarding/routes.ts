/**
 * Onboarding's navigation wiring, imported once by the root: its screens join the registry by
 * design id (3a-1 … 3a-9, and the invited path's 3a-10 … 3a-13), and the session gate holds tabs and trips behind onboarding until it
 * completes.
 */
import { provideSessionGate } from '@/lib/navigation/gates';
import { registerScreens } from '@/lib/navigation/screen-registry';

import { useOnboardingGate } from './flow-controller/completion';
import { ONBOARDING_SCREENS } from './flow-controller/steps';
import { INVITED_SCREENS } from './invited/routes';

registerScreens(ONBOARDING_SCREENS);
registerScreens(INVITED_SCREENS);
provideSessionGate(useOnboardingGate);
