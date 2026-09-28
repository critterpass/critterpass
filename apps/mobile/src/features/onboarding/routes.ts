/**
 * Onboarding's navigation wiring, imported once by the root: its screens join the registry by
 * design id (3a-1 … 3a-9), and the session gate holds tabs and trips behind onboarding until it
 * completes.
 */
import { provideSessionGate } from '@/lib/navigation/gates';
import { registerScreens } from '@/lib/navigation/screen-registry';

import { useOnboardingGate } from './flow-controller/completion';
import { ONBOARDING_SCREENS } from './flow-controller/steps';

registerScreens(ONBOARDING_SCREENS);
provideSessionGate(useOnboardingGate);
