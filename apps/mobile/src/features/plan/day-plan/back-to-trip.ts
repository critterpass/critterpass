/**
 * Where "←" on a day plan lands, and what it says. It goes back to where she came from: past the
 * plan's own views stacked on top (all days, another day, the day's open map) to the screen under
 * them, the trip map, the draft or another screen of the trip, or, when the day was opened from
 * outside the trip's stack (the trip's hub, today on the trip, a push), back out to it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route names, never copy. */
import { router, useNavigation } from 'expo-router';

import { goBackOr } from '@/lib/navigation/back';
import { useCallback } from 'react';

import { tripPlanRoutes } from '../hub/routes';

/** The routes of the trip's stack that show the trip map. */
const TRIP_MAP_ROUTES: readonly string[] = ['plan/index', 'plan/map'];
/** The plan's own views, which back passes over to reach the screen she came from. */
const PLAN_VIEWS = /^(day\/|plan\/days)/u;

export type BackTarget = 'tripMap' | 'draft' | 'today' | 'hub' | 'screen';

/**
 * How many screens to pop from the one at `index` to reach the nearest trip map under it; null
 * when there is none.
 */
export function popsToTripMap(routes: readonly string[], index: number): number | null {
  for (let at = index - 1; at >= 0; at -= 1) {
    if (TRIP_MAP_ROUTES.includes(routes[at] ?? '')) return index - at;
  }
  return null;
}

/**
 * The screen back lands on: the first one under the plan's views in this stack (`pops` to it), or,
 * with none, the one outside it (`outside`: the route the app was on before the trip's stack).
 */
export function backTargetOf(
  routes: readonly string[],
  index: number,
  outside: string | null,
): { readonly target: BackTarget; readonly pops: number | null } {
  for (let at = index - 1; at >= 0; at -= 1) {
    const name = routes[at] ?? '';
    if (PLAN_VIEWS.test(name)) continue;
    const target = TRIP_MAP_ROUTES.includes(name)
      ? 'tripMap'
      : name.startsWith('draft')
        ? 'draft'
        : 'screen';
    return { target, pops: index - at };
  }
  if (outside === null) return { target: 'hub', pops: null };
  return { target: outside.includes('day/[date]') ? 'today' : 'hub', pops: null };
}

interface NavState {
  readonly index?: number;
  readonly routes: readonly { readonly name: string; readonly state?: NavState }[];
}

interface Nav {
  getState(): unknown;
  getParent(): Nav | undefined;
}

/** A route by its name and the names of the screens it shows inside it ("(tabs)/trips/…"). */
function nameOf(route: NavState['routes'][number]): string {
  let name = route.name;
  let inner = route.state;
  while (inner !== undefined) {
    const next = inner.routes[inner.index ?? inner.routes.length - 1];
    if (next === undefined) break;
    name = `${name}/${next.name}`;
    inner = next.state;
  }
  return name;
}

/** What the app showed before the trip's stack: the screen under it in the nearest stack up. */
function cameFrom(navigation: Nav): string | null {
  for (let nav = navigation.getParent(); nav !== undefined; nav = nav.getParent()) {
    const state = nav.getState() as NavState | undefined;
    const index = state?.index ?? 0;
    const below = state?.routes[index - 1];
    if (below !== undefined) return nameOf(below);
  }
  return null;
}

export function useBackToTrip(tripId: string): {
  readonly onBack: () => void;
  readonly target: BackTarget;
} {
  const navigation = useNavigation();
  const state = navigation.getState() as NavState | undefined;
  const { target, pops } =
    state === undefined
      ? { target: 'hub' as const, pops: null }
      : backTargetOf(
          state.routes.map((route) => route.name),
          state.index ?? state.routes.length - 1,
          cameFrom(navigation),
        );
  const onBack = useCallback(() => {
    if (pops !== null) router.dismiss(pops);
    else goBackOr(tripPlanRoutes.map(tripId));
  }, [pops, tripId]);
  return { onBack, target };
}
