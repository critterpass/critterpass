import { router, useIsFocused, useNavigation } from 'expo-router';
import { useEffect } from 'react';

import { requestCrewSwitcher } from './open-request';

// A route path, never copy.
// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path.
const HOME_TAB = '/(tabs)';

/** The crews links already answered, by route key: a remounted page asks nothing a second time. */
const answered = new Set<string>();

/**
 * The crews link in the premium UI: the crews live in Home's switcher (3.07), so the link goes back
 * to Home and opens it there. Nothing is drawn here.
 *
 * It answers only once it is the page in front. A link handled while the app runs can leave this
 * route in the stack under the pages opened after it, drawn for the first time only when a sheet
 * over them closes; answering then opened the switcher and sent the page on top Home. In front, it
 * goes back to the tabs already under it, so it leaves the stack.
 */
export function PremiumCrewsRoute() {
  const navigation = useNavigation();
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    const state = navigation.getState();
    const routeKey = state?.routes[state.index]?.key ?? '';
    if (answered.has(routeKey)) return;
    answered.add(routeKey);
    requestCrewSwitcher();
    router.dismissTo(HOME_TAB);
  }, [focused, navigation]);
  return null;
}
