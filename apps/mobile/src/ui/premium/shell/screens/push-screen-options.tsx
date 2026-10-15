import { useMemo } from 'react';

import { HeaderTitle } from './header-bar';

/**
 * The push screen's native-stack options: the transparent native bar with the centred title (and
 * its muted line) when the system draws the bar, or no native bar, with no title left mounted
 * under the status bar, when the page draws its own.
 */
export function usePushScreenOptions(
  native: boolean,
  { title, subtitle, back, ink }: { title: string; subtitle?: string; back: boolean; ink: string },
) {
  return useMemo(
    () =>
      native
        ? {
            headerShown: true,
            title,
            headerTitle: () => <HeaderTitle title={title} subtitle={subtitle} />,
            headerTitleAlign: 'center' as const,
            headerTransparent: true,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal' as const,
            headerBackVisible: back,
            headerTintColor: ink,
          }
        : { headerShown: false, title, headerTitle: () => null },
    [native, title, subtitle, back, ink],
  );
}
