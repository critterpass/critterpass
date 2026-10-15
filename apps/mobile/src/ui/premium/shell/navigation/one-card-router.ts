/**
 * The premium stacks' router: the navigator's own, with the one-card rule
 * (`oneCardRoutes` in `lib/navigation/presentation.ts`) applied to every action that opens a
 * route. Applied in the router, the sheet under a route leaves in the same native update that
 * brings the route in, instead of the route first rising as a second card over it. A link to a tab
 * from a page over the tabs goes back to the tabs already in the stack instead of stacking a
 * second copy of them (`TABS`).
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

/** The tab navigator's group: one copy of it in the root stack, never two. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a route name, never copy.
const TABS = '(tabs)';

/**
 * A second copy of the tabs pushed over a page on top of them (a link to `/wallet` from the inbox)
 * goes back to the first instead, taking the new route's params so the tabs show what the link
 * asked for: on iOS the copy rose as a card with the first one's corners showing behind it, and
 * the tab bar read the wrong copy.
 */
export function reuseTabs(before: StackState, next: StackState): StackState | null {
  const top = next.routes.at(-1);
  if (top?.name !== TABS) return null;
  const at = before.routes.findIndex((route) => route.name === TABS);
  if (at < 0 || before.routes[at]?.key === top.key) return null;
  const tabs = before.routes[at];
  if (tabs === undefined) return null;
  const routes = [
    ...before.routes.slice(0, at),
    {
      ...tabs,
      ...(top.params === undefined ? {} : { params: top.params }),
      ...(top.state === undefined ? {} : { state: mergeTabs(tabs.state, top.state) }),
    },
  ];
  return { ...next, routes, index: routes.length - 1 };
}

type NestedState = NonNullable<StackRoute['state']>;

/**
 * The link's tab laid into the tabs' own state: the other tabs keep theirs (Home's scroll and
 * stack), the linked tab takes the link's, and it becomes the focused one.
 */
function mergeTabs(own: StackRoute['state'], linked: NestedState): NestedState {
  const target = linked.routes[linked.index ?? linked.routes.length - 1];
  if (own === undefined || target === undefined) return linked;
  const at = own.routes.findIndex((route) => route.name === target.name);
  const routes =
    at < 0
      ? [...own.routes, target]
      : own.routes.map((route, i) => (i === at ? { ...target, key: route.key } : route));
  return { ...own, routes, index: at < 0 ? routes.length - 1 : at } as NestedState;
}

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
        const tabs = reuseTabs(state, next);
        if (tabs !== null) return { ...result, state: tabs };
        const cards = oneCardRoutes(next.routes, presentationOfRoute);
        if (cards.length === next.routes.length) return result;
        return { ...result, state: { ...next, routes: [...cards], index: cards.length - 1 } };
      },
    };
  };
}
