import { Redirect } from 'expo-router';

import { readDraft } from '@/features/onboarding/flow-controller/draft-store';
import { resumeRoute } from '@/features/onboarding/flow-controller/steps';
import { SplashScreen } from '@/features/onboarding/splash/SplashScreen';

/** 3a-1, or straight back to the step a relaunch left off at. */
export default function OnboardingIndex() {
  const draft = readDraft();
  const started = draft !== null && (draft.step !== 'name' || draft.given_name.length > 0);
  if (draft !== null && started) return <Redirect href={resumeRoute(draft)} />;
  return <SplashScreen />;
}
