import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { useGateDecision } from '@/lib/navigation/gates';
import { tabTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';

import { useTheme } from '../theme';
import { TAB_ROUTES, TabBar } from './TabBar';

export interface ShellTabsProps {
  /** Session gate on (the app's tabs); off for the dev gallery's demo of the same shell. */
  readonly gated?: boolean;
}

/**
 * HOME · TRIPS · guide FAB · WALLET · PASS navigator: the custom bar, the `tab` transition (a
 * 200 ms cross-fade under reduced motion) and, when gated, the session redirect to onboarding.
 */
export function ShellTabs({ gated = true }: ShellTabsProps) {
  const decision = useGateDecision();
  const [motionMode] = useMotionMode();
  const { motion } = useTheme();

  if (gated && decision.kind === 'wait') return null;
  if (gated && decision.kind === 'redirect') return <Redirect href={decision.href} />;

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, ...tabTransition(motion, motionMode !== 'full') }}
    >
      {TAB_ROUTES.map((name) => (
        <Tabs.Screen key={name} name={name} />
      ))}
    </Tabs>
  );
}
