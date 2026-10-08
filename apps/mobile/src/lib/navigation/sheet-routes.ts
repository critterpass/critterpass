/**
 * Sheets and rises that are routes outside the `(modal)` group, by the navigator that holds them
 * (its path under `app/`). One list, read three ways:
 *
 * - the navigator's layout marks these screens modal (`sheetScreens`), so one opened from a page of
 *   the same navigator rises over that page;
 * - the root layout makes the group's own card see-through while one of them is the group's screen
 *   in front (`sheetGroupOptions`), so one opened from another navigator rises over the screen
 *   that opened it instead of over an empty card. The root reads one level down: a sheet two
 *   navigators deep (a trip's "add to plan") still needs its opener inside the same trip stack;
 * - a cold start never restores one (`restore-filter.ts`).
 *
 * Every other screen of these navigators is an ordinary pushed page.
 */
import type { StackNavigationOptions } from 'expo-router/js-stack';
import { getFocusedRouteNameFromRoute } from 'expo-router/react-navigation';

import { modalGroupOptions } from './transitions';

const SHEET_SCREENS = {
  crew: ['index'],
  vote: ['new-poll', 'pitch'],
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

/**
 * Root-stack options for a group that holds sheet routes. While one of its sheets is the group's
 * screen in front, the group's card is see-through and appears and goes at once (the sheet animates
 * itself over the screen that opened it); on any of its pages it is a pushed card like every other.
 * Read from the route itself, so the card is right from its first frame.
 */
export function sheetGroupOptions({
  route,
}: {
  readonly route: Parameters<typeof getFocusedRouteNameFromRoute>[0] & { readonly name: string };
}): StackNavigationOptions {
  const screen = getFocusedRouteNameFromRoute(route);
  return screen !== undefined && SHEET_ROUTES.has(`${route.name}/${screen}`)
    ? modalGroupOptions()
    : {};
}
