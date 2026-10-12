import { router } from 'expo-router';
import { useEffect } from 'react';

import { requestCrewSwitcher } from './open-request';

/**
 * The crews link in the premium UI: the crews live in Home's switcher (3.07), so the link goes back
 * to Home and opens it there. Nothing is drawn here.
 */
export function PremiumCrewsRoute() {
  useEffect(() => {
    requestCrewSwitcher();
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, never copy
    router.dismissTo('/');
  }, []);
  return null;
}
