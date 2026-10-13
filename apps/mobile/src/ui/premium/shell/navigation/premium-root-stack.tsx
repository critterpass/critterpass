import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { useCallback, useMemo } from 'react';

import type { OpenedRoute } from '@/lib/navigation/presentation';
import type { PremiumPalette, PremiumScheme } from '@cp/design-tokens';

import { REDUCED_FADE_MS, usePremiumReducedMotion, usePremiumTheme } from '../..';
import { rootRouteOptions, SELF_ANIMATED_SHEET } from './presentation-options';

// Area layouts import it from here.
export { SELF_ANIMATED_SHEET };

/** The navigation library's colours for the premium palette, so no default white or grey flashes. */
function navigationTheme(scheme: PremiumScheme, color: PremiumPalette) {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: color.ground,
      card: color.ground,
      text: color.ink,
      primary: color.ink,
      border: color.hairline,
    },
  };
}

/**
 * The premium root navigator: the native stack (glass back, edge swipe, large titles, form sheets,
 * the zoom transition). Details push here above the tabs, so the tab bar leaves with the page under
 * the push. A group opened on one of its sheet or modal routes is presented natively the way that
 * route is (`lib/navigation/presentation.ts`): a form sheet with its detents and swipe down, the
 * page sheet, or a full-screen cover; screens that still draw their own entrance get a see-through
 * card. Screens draw their own header through the shell's screen scaffolds; Reduce Motion turns
 * every push and rise into a 150 ms cross-fade.
 */
export function PremiumRootStack() {
  const { scheme, color } = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const theme = useMemo(() => navigationTheme(scheme, color), [scheme, color]);
  const screenOptions = useCallback(
    ({ route }: { readonly route: OpenedRoute }): NativeStackNavigationOptions => {
      const presented = rootRouteOptions(route);
      const selfAnimated = presented.animation === 'none';
      return {
        headerShown: false,
        contentStyle: { backgroundColor: color.ground },
        ...presented,
        ...(reduced && !selfAnimated
          ? { animation: 'fade', animationDuration: REDUCED_FADE_MS }
          : {}),
      };
    },
    [color.ground, reduced],
  );
  return (
    <NavigationThemeProvider value={theme}>
      <Stack screenOptions={screenOptions} />
    </NavigationThemeProvider>
  );
}
