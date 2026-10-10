import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { REDUCED_FADE_MS, usePremiumReducedMotion, usePremiumTheme } from '../..';

export interface PremiumStackProps {
  /** `Stack.Screen` entries with options of their own. */
  readonly children?: ReactNode;
}

/**
 * A native stack inside the premium UI (a tab's own stack, an area's stack): no header unless a
 * screen scaffold asks for one, the premium ground behind every page, and Reduce Motion as a
 * 150 ms cross-fade. On iOS a root screen of a tab's stack gets the native large title and glass
 * toolbar from `RootScreen`.
 */
export function PremiumStack({ children }: PremiumStackProps) {
  const { color } = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.ground },
        ...(reduced ? { animation: 'fade', animationDuration: REDUCED_FADE_MS } : {}),
      }}
    >
      {children}
    </Stack>
  );
}

/** Re-exported so area layouts declare premium screens without importing the router twice. */
export const PremiumStackScreen = Stack.Screen;
