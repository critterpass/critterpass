import { router } from 'expo-router';

// A route path, never copy.
// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path.
const HOME_TAB = '/(tabs)';

/**
 * Done goes back to the Home already under this screen rather than stacking another Home on top
 * (a Home that could go "back" into the finished form); opened cold, it replaces this screen.
 */
export function returnHome(): void {
  router.dismissTo(HOME_TAB);
}
