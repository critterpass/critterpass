/**
 * The premium stacks' router: the navigator's own, with the one-card rule
 * (`oneCardRoutes` in `lib/navigation/presentation.ts`) applied to every action that opens a
 * route. Applied in the router, the sheet under a route leaves in the same native update that
 * brings the route in, instead of the route first rising as a second card over it.
 */
import type {
  NavigationAction,
  ParamListBase,
  Router,
  StackNavigationState,
} from 'expo-router/react-navigation';

import { oneCardRoutes, type ScreenPresentation } from '@/lib/navigation/presentation';

type StackState = StackNavigationState<ParamListBase>;
type StackRoute = StackState['routes'][number];

/** Wraps a stack router so a route opened over a sheet replaces that sheet. */
export function oneCardRouter(
  presentationOfRoute: (route: StackRoute) => ScreenPresentation | undefined,
) {
  return function wrap<Action extends NavigationAction>(
    original: Router<StackState, Action>,
  ): Partial<Router<StackState, Action>> {
    return {
      getStateForAction(state, action, options) {
        const result = original.getStateForAction(state, action, options);
        if (result === null) return result;
        const next = result.state;
        if (next === state || next.routes.length <= state.routes.length) return result;
        const top = next.routes.at(-1);
        if (top === undefined || state.routes.some((route) => route.key === top.key)) {
          return result;
        }
        const kept = oneCardRoutes(next.routes, presentationOfRoute);
        if (kept.length === next.routes.length) return result;
        return { ...result, state: { ...next, routes: [...kept], index: kept.length - 1 } };
      },
    };
  };
}
