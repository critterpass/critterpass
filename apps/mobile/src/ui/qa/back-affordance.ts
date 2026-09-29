import { router, usePathname, useSegments } from 'expo-router';
import { useIsRouteFocused } from 'expo-router/build/react-navigation/core/useIsFocused';
import { useEffect } from 'react';

import { reportUiQa, UI_QA_ENABLED } from './ui-qa';

/* eslint-disable lingui/no-unlocalized-strings -- route names and report subjects, never shown */

/** Long enough for a push animation and a first data render to finish. */
export const BACK_SETTLE_MS = 2500;

let focusedAffordances = 0;

/** How many back or close controls the focused screen shows right now. */
export function focusedBackAffordances(): number {
  return focusedAffordances;
}

/**
 * Called by every back and close control (the back eyebrow, a sheet's ✕): while its screen is
 * focused, it counts as that screen's way back. Outside a navigator it counts as focused.
 */
export function useBackAffordance(): void {
  const focused = useIsRouteFocused(undefined);
  useEffect(() => {
    if (!UI_QA_ENABLED || !focused) return undefined;
    focusedAffordances += 1;
    return () => {
      focusedAffordances -= 1;
    };
  }, [focused]);
}

/**
 * True when a settled screen is missing its way back: navigation can go back, the screen is one a
 * user reaches (not a developer tool) and it shows no back or close control.
 */
export function missingBackAffordance(input: {
  readonly canGoBack: boolean;
  readonly developerTool: boolean;
  readonly affordances: number;
}): boolean {
  return input.canGoBack && !input.developerTool && input.affordances === 0;
}

/**
 * Mounted once at the root: after every navigation settles, reports NO_BACK_AFFORDANCE for a
 * pushed screen (one navigation can go back from) that shows no back or close control.
 * Development and e2e builds only.
 */
export function useNoBackAffordanceGuard(): void {
  const pathname = usePathname();
  const segments = useSegments();
  const developerTool = segments[0] === '(dev)';
  useEffect(() => {
    if (!UI_QA_ENABLED) return undefined;
    const timer = setTimeout(() => {
      const missing = missingBackAffordance({
        canGoBack: router.canGoBack(),
        developerTool,
        affordances: focusedBackAffordances(),
      });
      if (missing) reportUiQa('NO_BACK_AFFORDANCE', pathname);
    }, BACK_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [pathname, developerTool]);
}
