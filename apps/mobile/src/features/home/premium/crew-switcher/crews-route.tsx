import { router, useNavigation } from 'expo-router';
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
 * It goes back to the tabs already under it, so this page leaves the stack instead of staying
 * mounted under the pages opened after it (where a remount, when a sheet over them closed, asked
 * for the switcher again and sent the page on top Home).
 */
export function PremiumCrewsRoute() {
  const navigation = useNavigation();
  useEffect(() => {
    const state = navigation.getState();
    const routeKey = state?.routes[state.index]?.key ?? '';
    if (answered.has(routeKey)) return;
    answered.add(routeKey);
    requestCrewSwitcher();
    router.dismissTo(HOME_TAB);
    // Once, as the page arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
