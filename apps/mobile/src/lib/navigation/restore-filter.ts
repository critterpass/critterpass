/**
 * What of the saved navigation is a place to come back to. A cold start reopens where the person
 * was, but never a sheet or a rise (its presenter and its moment are gone: a paywall, a checkout
 * hold, the hatch) and never a screen that happens once (the winner reveal, SOS send, an OAuth
 * return that would re-send a used code, a dead link's page). The saved stack is cut at the first
 * such screen: whatever was opened from it goes too, and the screens under it are kept.
 */
import { SHEET_ROUTES } from './sheet-routes';

/** The group whose every screen is a sheet or a rise. */
const MODAL_GROUP = '(modal)';

/** The wrapper route the router puts around the root layout; it is no part of a screen's path. */
const ROOT_WRAPPER = '__root';

/** Screens that are a moment, not a place, as their path under `app/`. */
export const ONE_SHOT_ROUTES: ReadonlySet<string> = new Set([
  'vote/[pollId]/reveal',
  '(trip)/sos/send',
  '(tabs)/wallet/mailbox/connected',
  'setup/calendar/connected',
  '+not-found',
  'account-closed',
]);

/** True for a screen (its path under `app/`) a cold start may reopen. */
export function isRestorablePath(path: string): boolean {
  return path !== MODAL_GROUP && !ONE_SHOT_ROUTES.has(path) && !SHEET_ROUTES.has(path);
}

interface SavedRoute {
  readonly name?: string;
  readonly state?: SavedState;
}

interface SavedState {
  readonly type?: string;
  readonly index?: number;
  readonly routes?: readonly SavedRoute[];
}

interface Pruned {
  /** What is left of the navigator; `undefined` when none of its screens may be restored. */
  readonly state: SavedState | undefined;
  /** `state` is not the navigator's state as it was saved. */
  readonly changed: boolean;
  /** A screen of this stack was cut, so nothing opened after it in the stacks above stays either. */
  readonly cut: boolean;
}

/**
 * Tabs sit side by side, so a tab is never cut away and a cut inside one says nothing about the
 * screens pushed over the tabs: a tab whose own stack was cut down to nothing reopens on its first
 * screen.
 */
function pruneTabs(state: SavedState, routes: readonly SavedRoute[], prefix: string): Pruned {
  let changed = false;
  const kept = routes.map((route) => {
    if (route.state === undefined || route.name === undefined) return route;
    const inner = prune(route.state, `${prefix}${route.name}/`);
    if (!inner.changed) return route;
    changed = true;
    const { state: _dropped, ...bare } = route;
    return inner.state === undefined ? bare : { ...route, state: inner.state };
  });
  return { state: changed ? { ...state, routes: kept } : state, changed, cut: false };
}

function prune(state: SavedState, prefix: string): Pruned {
  const routes = state.routes;
  if (routes === undefined) return { state, changed: false, cut: false };
  if (state.type === 'tab') return pruneTabs(state, routes, prefix);
  const kept: SavedRoute[] = [];
  let changed = false;
  let cut = false;
  for (const route of routes) {
    const wrapper = route.name === ROOT_WRAPPER;
    const path = `${prefix}${route.name ?? ''}`;
    if (!wrapper && (route.name === undefined || !isRestorablePath(path))) {
      cut = true;
      break;
    }
    if (route.state === undefined) {
      kept.push(route);
      continue;
    }
    const inner = prune(route.state, wrapper ? prefix : `${path}/`);
    changed ||= inner.changed;
    if (inner.state !== undefined)
      kept.push(inner.changed ? { ...route, state: inner.state } : route);
    if (inner.cut) {
      cut = true;
      break;
    }
  }
  if (!cut) return { state: changed ? { ...state, routes: kept } : state, changed, cut: false };
  if (kept.length === 0) return { state: undefined, changed: true, cut: true };
  return { state: { ...state, routes: kept, index: kept.length - 1 }, changed: true, cut: true };
}

/**
 * The saved root navigation state with everything from the first sheet or one-shot screen on cut
 * away; `undefined` when no screen is left to come back to (the app then opens on Home).
 */
export function restorableState<State extends object>(state: State): State | undefined {
  return prune(state, '').state as State | undefined;
}
