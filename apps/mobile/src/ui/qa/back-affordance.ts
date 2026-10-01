import { router, useNavigationContainerRef, usePathname, useSegments } from 'expo-router';
import { useIsRouteFocused } from 'expo-router/build/react-navigation/core/useIsFocused';
import { useEffect } from 'react';

import { reportUiQa, UI_QA_ENABLED } from './ui-qa';

/* eslint-disable lingui/no-unlocalized-strings -- route names and report subjects, never shown */

/** Long enough for a push animation and a first data render to finish. */
export const BACK_SETTLE_MS = 2500;
/** How long after a first miss the screen is looked at again before it is reported. */
export const BACK_RECHECK_MS = 5000;

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
 * For a pushed screen the design draws without a back or close control on purpose, such as the
 * issued pass (3a-6): onboarding is finished and is not re-entered. It counts like a control, so the
 * guard stays quiet for that screen only.
 */
export function useNoBackByDesign(): void {
  useBackAffordance();
}

/** The part of a navigation state the tab-root check reads (full or partial state). */
export interface NavState {
  readonly type?: string;
  readonly index?: number;
  readonly routes: readonly { readonly name: string; readonly state?: NavState }[];
}

/**
 * True when the focused screen is a tab's root: it sits directly in the tab navigator, or it is
 * the first screen of the stack a tab holds. Back from there switches tabs (tab history), so the
 * tab bar is its way around and the screen draws no back control.
 */
export function isTabRoot(state: NavState | undefined): boolean {
  let parent: NavState | undefined;
  let node = state;
  while (node !== undefined) {
    const route = node.routes[node.index ?? node.routes.length - 1];
    if (route === undefined) return false;
    if (route.state === undefined) {
      if (node.type === 'tab') return true;
      return parent?.type === 'tab' && route.name === node.routes[0]?.name;
    }
    parent = node;
    node = route.state;
  }
  return false;
}

/**
 * True when a settled screen is missing its way back: navigation can go back, the screen is one a
 * user reaches (not a developer tool or a tab root) and it shows no back or close control.
 */
export function missingBackAffordance(input: {
  readonly canGoBack: boolean;
  readonly developerTool: boolean;
  readonly tabRoot: boolean;
  readonly affordances: number;
}): boolean {
  return input.canGoBack && !input.developerTool && !input.tabRoot && input.affordances === 0;
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
  const navigation = useNavigationContainerRef();
  useEffect(() => {
    if (!UI_QA_ENABLED) return undefined;
    const missing = () =>
      missingBackAffordance({
        canGoBack: router.canGoBack(),
        developerTool,
        tabRoot: isTabRoot(navigation.isReady() ? navigation.getRootState() : undefined),
        affordances: focusedBackAffordances(),
      });
    // A screen can still be behind its session gate or first sync when it settles (a cold start
    // restored to it draws nothing for a while): only one still missing its way back on a second
    // look is reported.
    let second: ReturnType<typeof setTimeout> | undefined;
    const first = setTimeout(() => {
      if (!missing()) return;
      second = setTimeout(() => {
        if (missing()) reportUiQa('NO_BACK_AFFORDANCE', pathname);
      }, BACK_RECHECK_MS);
    }, BACK_SETTLE_MS);
    return () => {
      clearTimeout(first);
      if (second !== undefined) clearTimeout(second);
    };
  }, [pathname, developerTool, navigation]);
}
