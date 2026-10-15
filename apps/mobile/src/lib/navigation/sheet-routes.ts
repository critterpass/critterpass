/**
 * Sheets and rises that are routes outside the `(modal)` group, by the navigator that holds them
 * (its path under `app/`). One list, read two ways:
 *
 * - the navigator's layout presents these screens as sheets (`sheetScreens`), so one opened from a
 *   page of the same navigator rises over that page;
 * - a cold start never restores one (`restore-filter.ts`).
 *
 * Every other screen of these navigators is an ordinary pushed page.
 */

const SHEET_SCREENS = {
  crew: ['index'],
  // The winner reveal is no sheet, but it bursts in by itself, takes no back gesture and leaves by
  // its own action, so its card appears and goes at once like one.
  vote: ['new-poll', 'pitch', '[pollId]/reveal'],
  places: ['search'],
  explore: ['why-sponsored'],
  '(trip)': ['lock-screen-offer'],
  '(trip)/[tripId]': ['add/[placeId]', 'search/link', 'check/gap', 'drivers/pick', 'drivers/share'],
  '(trip)/hub/[tripId]': ['alarm'],
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
