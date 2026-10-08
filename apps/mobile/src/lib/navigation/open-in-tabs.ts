/**
 * Opening a tab destination (Home, a trip, the wallet, the pass) from anywhere.
 *
 * A `router.push` of a tab route from a page outside the tabs (a disruption, Help, Settings, the
 * inbox, a chat) stacks a second copy of the whole tab navigator over that page, and back then walks
 * through the copy. `openInTabs(href)` first goes down to the tabs already under the page (or puts
 * them in its place when it was opened cold) and then navigates inside them; from a screen that is
 * already in the tabs it only navigates.
 *
 * Use `openInTabs(href)` whenever a pushed page sends the person to `/`, `/trips…`, `/wallet…` or
 * `/pass…`. Use `openLink(href)` for a link whose shape is not known in advance (a push tap, an
 * inbox row): it picks `openInTabs` for a tab destination and an ordinary push for anything else.
 */
import { router, type Href } from 'expo-router';
import { navigationRef } from 'expo-router/build/global-state/navigationRef';

/** The tab navigator's route group, as the root stack names it. */
const TABS_GROUP = '(tabs)';
const TABS: Href = '/(tabs)';

/** The first path segment of every tab but Home, which is `/` itself. */
const TAB_ROOTS = ['/trips', '/wallet', '/pass'] as const;

/** True for an in-app path the tab navigator owns: `/`, `/trips…`, `/wallet…`, `/pass…`. */
export function isTabHref(href: string): boolean {
  const path = (href.split(/[?#]/)[0] ?? '').replace(`/${TABS_GROUP}`, '') || '/';
  return path === '/' || TAB_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

/** The part of the root navigation state the check reads. */
export interface RootRoutes {
  readonly index?: number | undefined;
  readonly routes: readonly { readonly name: string }[];
}

/** True when the screen in front is one of the tab navigator's (a tab root or a page pushed in a tab). */
export function insideTabs(state: RootRoutes | undefined): boolean {
  if (state === undefined) return false;
  return state.routes[state.index ?? state.routes.length - 1]?.name === TABS_GROUP;
}

function rootState(): RootRoutes | undefined {
  return navigationRef.isReady() ? navigationRef.getRootState() : undefined;
}

/** Opens a tab destination without stacking a second tab navigator over the current page. */
export function openInTabs(href: Href): void {
  if (!insideTabs(rootState())) router.dismissTo(TABS);
  router.navigate(href);
}

/** Opens an in-app link of any shape: a tab destination inside the tabs, anything else as a push. */
export function openLink(href: string): void {
  if (isTabHref(href)) openInTabs(href);
  else router.push(href);
}
