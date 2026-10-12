import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { StatusBar } from 'react-native';

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
 *
 * The status bar follows the premium ground wherever the stack shows, dark content on the light
 * ground and light on the dark one, also where the current UI set its own (the Developer tools
 * demo while the premium switch is off); it returns to that UI's style when the stack goes.
 */
export function PremiumStack({ children }: PremiumStackProps) {
  const { color, scheme } = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  return (
    <>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} animated />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.ground },
          ...(reduced ? { animation: 'fade', animationDuration: REDUCED_FADE_MS } : {}),
        }}
      >
        {children}
      </Stack>
    </>
  );
}

/** Re-exported so area layouts declare premium screens without importing the router twice. */
export const PremiumStackScreen = Stack.Screen;
