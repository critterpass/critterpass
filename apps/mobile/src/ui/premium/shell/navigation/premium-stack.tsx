import { Stack } from 'expo-router';
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { useCallback, useContext, useMemo, type ReactNode } from 'react';
import { StatusBar } from 'react-native';

import { presentationOf } from '@/lib/navigation/presentation';
import { ScreenPresentationContext } from '@/lib/navigation/router-internals';

import { REDUCED_FADE_MS, usePremiumReducedMotion, usePremiumTheme } from '../..';
import { freezeOptions, type StackState } from './freeze-behind';
import { oneCardRouter } from './one-card-router';
import { presentedScreenOptions } from './presentation-options';
import { presentedLayoutFor } from './presented-insets';
import {
  childPresentations,
  childrenInsideCard,
  holdsItsSheets,
  InsideCardContext,
  pushedInsideCard,
} from './stack-cards';
import { fromNative } from './use-screen-placement';

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
  // Shown as a sheet itself (iOS): its sheets push inside it (`stack-cards.ts`).
  const outerCard = useContext(InsideCardContext);
  const ownCard = holdsItsSheets(useContext(ScreenPresentationContext));
  const insideCard = outerCard || ownCard;
  const ownPresentations = useMemo(() => childPresentations(children), [children]);
  const screens = useMemo(
    () => (insideCard ? childrenInsideCard(children) : children),
    [children, insideCard],
  );
  const screenOptions = useCallback(
    ({
      route,
      navigation,
    }: {
      readonly route: StackRoute;
      readonly navigation: { readonly getState: () => StackState<StackRoute> };
    }): NativeStackNavigationOptions => {
      const presentedOf = (of: StackRoute) => {
        const listed =
          navigator === undefined ? {} : presentedScreenOptions(`${navigator}/${of.name}`);
        return insideCard ? pushedInsideCard(listed) : listed;
      };
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
    [color.ground, navigator, reduced, insideCard],
  );
  // A page pushed after one of this stack's sheets shows inside it (iOS).
  const screenLayout = useMemo(
    () =>
      presentedLayoutFor((route) => {
        if (insideCard) return undefined;
        const name = route.name ?? '';
        return (
          ownPresentations.get(name) ??
          (navigator === undefined
            ? undefined
            : presentedScreenOptions(`${navigator}/${name}`).presentation)
        );
      }),
    [insideCard, navigator, ownPresentations],
  );
  // A page or sheet opened over one of this stack's sheets replaces it (`oneCardRoutes`).
  const router = useMemo(
    () =>
      oneCardRouter((route) => {
        if (insideCard) return undefined;
        const own = ownPresentations.get(route.name);
        if (own !== undefined) return fromNative(own);
        return navigator === undefined ? undefined : presentationOf(`${navigator}/${route.name}`);
      }),
    [insideCard, navigator, ownPresentations],
  );
  return (
    <>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} animated />
      <InsideCardContext value={insideCard}>
        <Stack screenOptions={screenOptions} screenLayout={screenLayout} UNSTABLE_router={router}>
          {screens}
        </Stack>
      </InsideCardContext>
    </>
  );
}

/** Re-exported so area layouts declare premium screens without importing the router twice. */
export const PremiumStackScreen = Stack.Screen;
