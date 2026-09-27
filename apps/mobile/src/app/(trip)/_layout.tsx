import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/js-stack';

import { useGateDecision } from '@/lib/navigation/gates';

/** Trip-day stack (screens owned by the trip area); session-only, like the tabs. */
export default function TripLayout() {
  const decision = useGateDecision();

  if (decision.kind === 'wait') return null;
  if (decision.kind === 'redirect') return <Redirect href={decision.href} />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
