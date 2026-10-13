/**
 * Navigator options for the premium presentations (`lib/navigation/presentation.ts`): what the
 * root stack gives a group opened on a sheet or modal route, and what a group's own stack gives
 * the same route when it opens over one of the group's pages.
 *
 * Area layouts: `presentedScreenOptions('vote/new-poll')` is the one call for a sheet or modal
 * screen's options, so the root and the area never disagree on how a route rises.
 */
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { Platform } from 'react-native';

import {
  openedPath,
  presentationOf,
  type OpenedRoute,
  type ScreenPresentation,
} from '@/lib/navigation/presentation';

import { sheetRouteOptions } from '../screens/sheet-screen';

/**
 * A screen that animates itself as a sheet (the current UI's `Sheet`, a premium page that slides
 * itself in) is presented at once and see-through, so its own rise plays over the page that
 * opened it.
 */
export const SELF_ANIMATED_SHEET = {
  presentation: 'transparentModal',
  animation: 'none',
  contentStyle: { backgroundColor: 'transparent' },
} as const satisfies NativeStackNavigationOptions;

/**
 * A group presented as a sheet holds a whole stack, which can't size itself to its content: a
 * `fit` sheet opens at half height and drags to full.
 */
const GROUP_FIT_DETENTS = [0.5, 1];

/** Android's native sheet can't hold a nested stack: the group rises as a page instead. */
const ANDROID_RISE = {
  presentation: 'modal',
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a navigator option, never copy.
  animation: 'slide_from_bottom',
} as const;

function sheetOptions(
  detents: ScreenPresentation & { kind: 'sheet' },
  group: boolean,
): NativeStackNavigationOptions {
  if (group && Platform.OS !== 'ios') return ANDROID_RISE;
  const allowed = detents.detents;
  if (allowed === 'fit') {
    return group
      ? { ...sheetRouteOptions('full'), sheetAllowedDetents: GROUP_FIT_DETENTS }
      : sheetRouteOptions('fit');
  }
  return { ...sheetRouteOptions('full'), sheetAllowedDetents: [...allowed] };
}

/**
 * Options for one presentation. `group` is true where the root stack presents a whole group
 * opened on this route.
 */
export function presentationOptions(
  presentation: ScreenPresentation,
  group: boolean,
): NativeStackNavigationOptions {
  switch (presentation.kind) {
    case 'sheet':
      return sheetOptions(presentation, group);
    case 'modal':
      // The page sheet: swipe down dismisses; Android rises a page.
      return Platform.OS === 'ios' ? { presentation: 'modal' } : ANDROID_RISE;
    case 'cover':
      return {
        presentation: 'fullScreenModal',
        gestureEnabled: false,
        ...(presentation.fade === true
          ? { animation: 'fade' }
          : Platform.OS === 'ios'
            ? {}
            : // eslint-disable-next-line lingui/no-unlocalized-strings -- a navigator option.
              { animation: 'slide_from_bottom' }),
      };
    case 'drawn':
      return SELF_ANIMATED_SHEET;
  }
}

/**
 * A sheet or modal screen's options in its own area's stack, by its path under `app/`
 * (`crew/[crewId]/invite`); a pushed page gets none.
 */
export function presentedScreenOptions(path: string): NativeStackNavigationOptions {
  const presentation = presentationOf(path);
  return presentation === undefined ? {} : presentationOptions(presentation, false);
}

/**
 * The root stack's options for any route: a group opened on a sheet or modal route is presented
 * the way that route is; everything else pushes.
 */
export function rootRouteOptions(route: OpenedRoute): NativeStackNavigationOptions {
  const presentation = presentationOf(openedPath(route));
  return presentation === undefined ? {} : presentationOptions(presentation, true);
}
