import { Stack } from 'expo-router';
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { useCallback, type ReactNode } from 'react';
import { StatusBar } from 'react-native';

import { REDUCED_FADE_MS, usePremiumReducedMotion, usePremiumTheme } from '../..';
import { freezeOptions, type StackState } from './freeze-behind';
import { presentedScreenOptions } from './presentation-options';

export interface PremiumStackProps {
  /**
   * The navigator's path under `app/` (`crew`, `(trip)/[tripId]`): its sheet and modal screens
   * then rise the way `lib/navigation/presentation.ts` lists them, with no options of their own.
   */
  readonly navigator?: string;
  /** `Stack.Screen` entries with options of their own. */
  readonly children?: ReactNode;
}

interface StackRoute {
  readonly key?: string | undefined;
  readonly name: string;
}

/**
 * A native stack inside the premium UI (a tab's own stack, an area's stack): no header unless a
 * screen scaffold asks for one, the premium ground behind every page, and Reduce Motion as a
 * 150 ms cross-fade; pages hidden under two or more pages freeze. On iOS a root screen of a tab's stack gets the native large title and glass
 * toolbar from `RootScreen`.
 *
 * The status bar follows the premium ground wherever the stack shows, dark content on the light
 * ground and light on the dark one, also where the current UI set its own (the Developer tools
 * demo while the premium switch is off); it returns to that UI's style when the stack goes.
 */
export function PremiumStack({ navigator, children }: PremiumStackProps) {
  const { color, scheme } = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const screenOptions = useCallback(
    ({
      route,
      navigation,
    }: {
      readonly route: StackRoute;
      readonly navigation: { readonly getState: () => StackState<StackRoute> };
    }): NativeStackNavigationOptions => {
      const presentedOf = (of: StackRoute) =>
        navigator === undefined ? {} : presentedScreenOptions(`${navigator}/${of.name}`);
      const presented = presentedOf(route);
      return {
        headerShown: false,
        contentStyle: { backgroundColor: color.ground },
        ...presented,
        ...freezeOptions(route, navigation.getState(), (above) => presentedOf(above).presentation),
        ...(reduced && presented.animation !== 'none'
          ? { animation: 'fade', animationDuration: REDUCED_FADE_MS }
          : {}),
      };
    },
    [color.ground, navigator, reduced],
  );
  return (
    <>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} animated />
      <Stack screenOptions={screenOptions}>{children}</Stack>
    </>
  );
}

/** Re-exported so area layouts declare premium screens without importing the router twice. */
export const PremiumStackScreen = Stack.Screen;
