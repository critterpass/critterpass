import { Redirect } from 'expo-router';

import { readDraft } from '@/features/onboarding/flow-controller/draft-store';
import { resumeRoute } from '@/features/onboarding/flow-controller/steps';
import { SplashScreen } from '@/features/onboarding/splash/SplashScreen';
import { isOnboardingComplete } from '@/lib/links/pending';

/**
 * 3a-1, or straight back to the step a relaunch left off at. Someone who already has a pass is
 * never walked through its pages again: they go Home.
 */
export default function OnboardingIndex() {
  if (isOnboardingComplete()) return <Redirect href="/" />;
  const draft = readDraft();
  const started = draft !== null && (draft.step !== 'name' || draft.given_name.length > 0);
  if (draft !== null && started) return <Redirect href={resumeRoute(draft)} />;
  return <SplashScreen />;
}
