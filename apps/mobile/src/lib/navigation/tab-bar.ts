/**
 * When the tab bar shows. A tab's root pages show it; a page pushed inside a tab's stack (a
 * booking, adding one, the budget) hides it, as every push does (foundations-spec §1: "Tab bar
 * hides"). The tab stacks' sheets rise over whatever is under them, so they change nothing.
 * Pure data and pure functions: the shell's tab bar reads the navigation state through them, and
 * the tab layouts take their sheet options from `TAB_SHEETS`.
 */

/** A tab-stack sheet's height: half, full or as tall as its content. */
export type TabSheetDetent = 'half' | 'full' | 'fit';

/** The sheets inside the tab stacks, by their path under `app/(tabs)/`. */
export const TAB_SHEETS = {
  'wallet/bookings/add-sheet': 'half',
  'wallet/bookings/paste': 'fit',
  'wallet/bookings/link-code': 'fit',
  'wallet/bookings/mailbox': 'full',
  'wallet/bookings/pass/[id]': 'full',
  'wallet/money/currency': 'half',
  'wallet/money/trip': 'half',
  'pass/retake': 'full',
} as const satisfies Readonly<Record<string, TabSheetDetent>>;

export type TabSheetPath = keyof typeof TAB_SHEETS;

/**
 * The tabs' root pages, by path under `app/(tabs)/`. The Wallet's two halves swap in place
 * (BOOKINGS | MONEY), so whichever is on top is still the tab's root page. A group whose stack has
 * not mounted yet (its first frame) opens on its root, so it counts as one.
 */
const TAB_ROOTS: ReadonlySet<string> = new Set([
  'trips',
  'wallet',
  'wallet/bookings',
  'pass',
  'index',
  'trips/index',
  'wallet/money/index',
  'wallet/bookings/index',
  'pass/index',
]);

/** The tab group's route on the root stack. */
const TABS = '(tabs)';

/** Expo Router's own navigator above the root layout. */
const ROUTER_ROOT = '__root';

interface StateRoute {
  readonly name: string;
  readonly state?: NavState | undefined;
}

interface NavState {
  readonly index?: number | undefined;
  readonly routes: readonly StateRoute[];
}

function isSheet(path: string): boolean {
  return Object.hasOwn(TAB_SHEETS, path);
}

/** A page in these routes (up to each stack's focused one) that is not a tab root. */
function holdsPush(prefix: string, level: NavState): boolean {
  const focused = level.index ?? level.routes.length - 1;
  return level.routes.some((route, position) => {
    if (position > focused) return false;
    const path = prefix === '' ? route.name : `${prefix}/${route.name}`;
    if (isSheet(path)) return false;
    return route.state === undefined ? !TAB_ROOTS.has(path) : holdsPush(path, route.state);
  });
}

/**
 * Whether the focused tab shows a page pushed in its stack, read from the root navigation state:
 * any page on the focused tab's stacks that is neither one of its roots nor a sheet is a push,
 * also one a link opened as the first page of its stack.
 */
export function tabBarHidden(
  root: { readonly routes?: readonly StateRoute[] | undefined } | undefined,
): boolean {
  const tab = focusedTab(root);
  if (tab === undefined) return false;
  return holdsPush('', { index: 0, routes: [tab] });
}

/** The focused tab's route, read through the router's own root route. */
function focusedTab(
  root: { readonly routes?: readonly StateRoute[] | undefined } | undefined,
): StateRoute | undefined {
  // Before the container has state (the first frame) there is no tab yet. The router's own root
  // route holds the app's root stack.
  const top = root?.routes;
  const app = top?.length === 1 && top[0]?.name === ROUTER_ROOT ? top[0].state?.routes : top;
  const tabs = app?.find((route) => route.name === TABS)?.state;
  return tabs?.routes[tabs.index ?? 0];
}

/**
 * Whether the focused tab's top page is one of its sheets. Android's drawn tab bar floats over the
 * tab's pages in the same window as its native sheets, so it drew on top of a sheet's lower half;
 * it steps away while one is up (the iPhone's system bar sits under its sheets by itself).
 */
export function tabSheetUp(
  root: { readonly routes?: readonly StateRoute[] | undefined } | undefined,
): boolean {
  let route = focusedTab(root);
  let path = route?.name ?? '';
  while (route?.state !== undefined) {
    const level: NavState = route.state;
    route = level.routes[level.index ?? level.routes.length - 1];
    if (route === undefined) return false;
    path = `${path}/${route.name}`;
    if (isSheet(path)) return true;
  }
  return false;
}
