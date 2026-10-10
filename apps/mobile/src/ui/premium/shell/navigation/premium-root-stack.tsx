import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { getFocusedRouteNameFromRoute } from 'expo-router/react-navigation';
import { useMemo } from 'react';

import { SHEET_GROUPS, SHEET_ROUTES } from '@/lib/navigation/sheet-routes';
import type { PremiumPalette, PremiumScheme } from '@cp/design-tokens';

import { REDUCED_FADE_MS, usePremiumReducedMotion, usePremiumTheme } from '../..';

type GroupRoute = Parameters<typeof getFocusedRouteNameFromRoute>[0] & { readonly name: string };

/**
 * A screen of the current UI that animates itself as a sheet (`ui/sheet`) is presented at once and
 * see-through, so its own rise plays over the page that opened it.
 */
export const SELF_ANIMATED_SHEET = {
  presentation: 'transparentModal',
  animation: 'none',
  contentStyle: { backgroundColor: 'transparent' },
} as const satisfies NativeStackNavigationOptions;

/** A group holding sheet routes: opened on one of its sheets, it is presented like `(modal)`. */
function sheetGroupOptions({
  route,
}: {
  readonly route: GroupRoute;
}): NativeStackNavigationOptions {
  const opened = getFocusedRouteNameFromRoute(route);
  return opened !== undefined && SHEET_ROUTES.has(`${route.name}/${opened}`)
    ? SELF_ANIMATED_SHEET
    : {};
}

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
 * the push. Screens draw their own header through the shell's screen scaffolds; Reduce Motion
 * turns every push into a 150 ms cross-fade.
 */
export function PremiumRootStack() {
  const { scheme, color } = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const theme = useMemo(() => navigationTheme(scheme, color), [scheme, color]);
  return (
    <NavigationThemeProvider value={theme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.ground },
          ...(reduced ? { animation: 'fade', animationDuration: REDUCED_FADE_MS } : {}),
        }}
      >
        {/* eslint-disable-next-line lingui/no-unlocalized-strings -- a route group name, not copy */}
        <Stack.Screen name="(modal)" options={SELF_ANIMATED_SHEET} />
        {SHEET_GROUPS.map((name) => (
          <Stack.Screen key={name} name={name} options={sheetGroupOptions} />
        ))}
      </Stack>
    </NavigationThemeProvider>
  );
}
