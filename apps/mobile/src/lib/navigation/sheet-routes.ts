/**
 * Sheets and rises that are routes outside the `(modal)` group, by the navigator that holds them
 * (its path under `app/`). One list, read three ways:
 *
 * - the navigator's layout marks these screens modal (`sheetScreens`), so one opened from a page of
 *   the same navigator rises over that page;
 * - the root layout makes the group's own card see-through while one of them is in the group's
 *   stack (`sheetGroupOptions`), so one opened from another navigator rises over the screen that
 *   opened it instead of over an empty card, and that screen stays behind it while a page of the
 *   group slides over the sheet. The root reads one level down: a sheet two navigators deep (a
 *   trip's "add to plan") still needs its opener inside the same trip stack;
 * - a cold start never restores one (`restore-filter.ts`).
 *
 * Every other screen of these navigators is an ordinary pushed page.
 */
import type { StackNavigationOptions } from 'expo-router/js-stack';
import { getFocusedRouteNameFromRoute } from 'expo-router/react-navigation';

import { modalGroupOptions } from './transitions';

const SHEET_SCREENS = {
  crew: ['index'],
  // The winner reveal is no sheet, but it bursts in by itself, takes no back gesture and leaves by
  // its own action, so its card appears and goes at once like one.
  vote: ['new-poll', 'pitch', '[pollId]/reveal'],
  places: ['search'],
  explore: ['why-sponsored'],
  '(trip)': ['lock-screen-offer'],
  '(trip)/[tripId]': ['add/[placeId]', 'search/link', 'check/gap', 'drivers/pick'],
  '(trip)/[tripId]/draft': ['change-day', 'last-redraft'],
  '(trip)/[tripId]/setup': ['must-dos/add', 'ask/[askId]'],
} as const satisfies Record<string, readonly string[]>;

export type SheetNavigator = keyof typeof SHEET_SCREENS;

/** The sheet screens of one navigator, as its layout names them. */
export function sheetScreens(navigator: SheetNavigator): readonly string[] {
  return SHEET_SCREENS[navigator];
}

/** Every sheet route outside `(modal)`, as its path under `app/`. */
export const SHEET_ROUTES: ReadonlySet<string> = new Set(
  Object.entries(SHEET_SCREENS).flatMap(([navigator, names]) =>
    names.map((name) => `${navigator}/${name}`),
  ),
);

/** The root groups with a sheet route of their own. */
export const SHEET_GROUPS: readonly string[] = Object.keys(SHEET_SCREENS).filter(
  (navigator) => !navigator.includes('/'),
);

/** A group's own stack, as far as the card decision reads it. */
interface GroupStack {
  readonly routes: readonly { readonly name: string }[];
}

type GroupRoute = Parameters<typeof getFocusedRouteNameFromRoute>[0] & { readonly name: string };

/**
 * The group's own stack as of this render. The navigator hands it to an options callback only on
 * the route, under the symbol `getFocusedRouteNameFromRoute` reads the focused name from; the
 * callback's `navigation.getState()` and the app's root state are both still the state before
 * this render, so a sheet replaced by a page would count as still there.
 */
function groupStack(route: GroupRoute): GroupStack | undefined {
  const held = Object.getOwnPropertySymbols(route).find(
    (symbol) => symbol.description === 'CHILD_STATE',
  );
  if (held === undefined) return undefined;
  const stack = (route as unknown as Record<symbol, Partial<GroupStack> | undefined>)[held];
  return Array.isArray(stack?.routes) ? { routes: stack.routes } : undefined;
}

/**
 * The screens in the group's own stack. Before the group's navigator has rendered there is no
 * stack to read, only the screen the route was opened on.
 */
function groupScreens(route: GroupRoute): readonly string[] {
  const stack = groupStack(route);
  if (stack !== undefined) return stack.routes.map((screen) => screen.name);
  const opened = getFocusedRouteNameFromRoute(route);
  return opened === undefined ? [] : [opened];
}

/**
 * Root-stack options for a group that holds sheet routes. While one of its sheets is in the
 * group's stack, the group's card is see-through and appears and goes at once (the sheet animates
 * itself over the screen that opened it, and a page pushed from the sheet slides over both); with
 * only pages in its stack it is a pushed card like every other. Read from the route itself until
 * the group has a stack, so the card is right from its first frame.
 */
export function sheetGroupOptions({
  route,
}: {
  readonly route: GroupRoute;
}): StackNavigationOptions {
  return groupScreens(route).some((screen) => SHEET_ROUTES.has(`${route.name}/${screen}`))
    ? modalGroupOptions()
    : {};
}
